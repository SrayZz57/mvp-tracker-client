import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSeason, listRewards } from './catalog.js';
import { setKnownCosmetic } from './playerCosmetics.jsx';
import { levelFromXp } from './levels.js';
import { awardXp, claimReward, equipCosmetic, loadAllMyClaims, loadCurrentSeason, loadMyChallenges, loadMyEquipped, loadMyXp } from './api.js';

// Toutes les données du battle pass pour l'utilisateur connecté, au même endroit.
//
// status :
//   'signed-out'   pas de compte connecté
//   'loading'      premier chargement
//   'ready'        saison en cours et données chargées
//   'no-season'    entre deux saisons (on peut annoncer la prochaine)
//   'outdated'     le serveur a une saison que cette version de l'app ne connaît pas
//   'unavailable'  migration serveur non appliquée : fonctionnalité éteinte,
//                  et AUCUN verrou sur les skins (l'app se comporte comme avant)
//   'error'        problème réseau : on réessaie sur demande
//
// La possession des skins est mise en cache localement : le Vestiaire s'ouvre
// instantanément et reste correct hors ligne.

const cacheKey = (userId) => `mvptracker-bp-owned-${userId}`;

function readOwnedCache(userId) {
  if (!userId) return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(cacheKey(userId)) ?? '[]'));
  } catch {
    return new Set();
  }
}

function writeOwnedCache(userId, ids) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify([...ids]));
  } catch {
    // stockage plein ou indisponible : sans conséquence, on rechargera.
  }
}

export default function useBattlePass(userId) {
  const [status, setStatus] = useState(userId ? 'loading' : 'signed-out');
  const [season, setSeason] = useState(null);
  const [xp, setXp] = useState(0);
  const [claimedIds, setClaimedIds] = useState(() => new Set()); // saison en cours
  const [ownedRewardIds, setOwnedRewardIds] = useState(() => readOwnedCache(userId)); // toutes saisons
  const [challenges, setChallenges] = useState([]);
  const [equipped, setEquipped] = useState({});
  const [lastAward, setLastAward] = useState(null);
  const [busy, setBusy] = useState(() => new Set());
  const [claimError, setClaimError] = useState(null); // { rewardId, code } | null
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!userId) {
      setStatus('signed-out');
      return;
    }
    const current = await loadCurrentSeason();
    if (!alive.current) return;

    if (current.status === 'unavailable') return setStatus('unavailable');
    if (current.status === 'error') return setStatus((s) => (s === 'ready' ? s : 'error'));

    // Possessions (toutes saisons) et cosmétiques équipés : chargés même entre
    // deux saisons, pour que le Casier reste utilisable.
    const [claims, mine] = await Promise.all([loadAllMyClaims(), loadMyEquipped(userId)]);
    if (!alive.current) return;
    if (claims) {
      const ids = new Set(claims.map((c) => c.reward_id));
      setOwnedRewardIds(ids);
      writeOwnedCache(userId, ids);
    }
    setEquipped(mine);
    setKnownCosmetic(userId, 'title', mine.title_id);
    setKnownCosmetic(userId, 'card', mine.card_id);

    if (current.status === 'none') {
      setSeason(null);
      return setStatus('no-season');
    }

    const catalogSeason = getSeason(current.season.id);
    if (!catalogSeason) return setStatus('outdated');

    // Attribue d'abord l'XP en attente (sessions récentes, défis remplis) :
    // les lectures qui suivent voient ainsi un état à jour.
    const award = await awardXp(catalogSeason.id);
    if (!alive.current) return;
    if (award?.status === 'ok' && award.xp_gained > 0) setLastAward(award);

    const [totalXp, myChallenges] = await Promise.all([loadMyXp(catalogSeason.id), loadMyChallenges(catalogSeason.id)]);
    if (!alive.current) return;

    setSeason({ ...catalogSeason, endsAt: current.season.ends_at, startsAt: current.season.starts_at });
    setXp(totalXp);
    setChallenges(myChallenges);
    setClaimedIds(new Set(claims ? claims.filter((c) => c.season_id === catalogSeason.id).map((c) => c.reward_id) : []));
    setStatus('ready');
  }, [userId]);

  useEffect(() => {
    setOwnedRewardIds(readOwnedCache(userId));
    setStatus(userId ? 'loading' : 'signed-out');
    load();
  }, [userId, load]);

  const levelState = useMemo(() => (season ? levelFromXp(season, xp) : null), [season, xp]);

  // Récompenses de la saison, avec leur état.
  const rewards = useMemo(() => {
    if (!season || !levelState) return [];
    return listRewards(season).map((reward) => ({
      ...reward,
      claimed: claimedIds.has(reward.id),
      claimable: reward.level <= levelState.level && !claimedIds.has(reward.id),
    }));
  }, [season, levelState, claimedIds]);

  const claimableCount = rewards.filter((r) => r.claimable).length;

  const withBusy = async (id, work) => {
    setBusy((prev) => new Set(prev).add(id));
    try {
      return await work();
    } finally {
      if (alive.current) {
        setBusy((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }
  };

  const claim = useCallback(
    (rewardId) =>
      withBusy(rewardId, async () => {
        const result = await claimReward(season.id, rewardId);
        if (!alive.current) return false;
        if (!result.ok) {
          setClaimError({ rewardId, code: result.code });
          return false;
        }
        setClaimError(null);
        setClaimedIds((prev) => new Set(prev).add(rewardId));
        setOwnedRewardIds((prev) => {
          const next = new Set(prev).add(rewardId);
          writeOwnedCache(userId, next);
          return next;
        });
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [season, userId],
  );

  const claimAll = useCallback(async () => {
    for (const reward of rewards.filter((r) => r.claimable)) {
      // Séquentiel : un échec (niveau, réseau) s'arrête là plutôt que d'enchaîner des erreurs.
      // eslint-disable-next-line no-await-in-loop
      if (!(await claim(reward.id))) break;
    }
  }, [rewards, claim]);

  // kind : 'title' | 'card' ; rewardId = null pour retirer.
  const equip = useCallback(
    (kind, rewardId) =>
      withBusy(`equip:${kind}`, async () => {
        const ok = await equipCosmetic(kind, rewardId);
        if (ok && alive.current) setEquipped((prev) => ({ ...prev, [`${kind}_id`]: rewardId }));
        if (ok) setKnownCosmetic(userId, kind, rewardId);
        return ok;
      }),
    [userId],
  );

  return {
    status,
    season,
    xp,
    levelState,
    rewards,
    claimableCount,
    challenges,
    equipped,
    ownedRewardIds,
    lastAward,
    busy,
    claimError,
    dismissClaimError: () => setClaimError(null),
    claim,
    claimAll,
    equip,
    refresh: load,
  };
}
