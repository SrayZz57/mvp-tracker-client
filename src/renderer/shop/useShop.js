import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { SHOP_ITEM_BY_ID } from './catalog.js';

// Boutique et monnaie du joueur connecté.
//
// status :
//   'signed-out'   pas de compte
//   'loading'      premier chargement
//   'ready'        boutique chargée (offres éventuellement vides entre deux saisons)
//   'unavailable'  migration serveur non appliquée : boutique masquée, et AUCUN
//                  verrou sur les objets de la boutique (l'app reste comme avant)
//   'error'        problème réseau
//
// Le solde vient toujours du serveur, et démarre à 0 : le bonus de bienvenue
// n'est PAS crédité automatiquement, `welcomeClaimed` dit si le joueur l'a déjà
// réclamé (fenêtre affichée par le hub tant que ce n'est pas le cas).
// La possession est mise en cache localement, comme pour le Battle Pass, pour
// un Vestiaire instantané.

// Pack (permanent) d'abord, puis la vedette, puis les offres du jour.
const KIND_ORDER = { bundle: 0, daily: 1 };

const cacheKey = (userId) => `mvptracker-shop-owned-${userId}`;
const isMissingFunction = (error) =>
  error?.code === 'PGRST202' || error?.code === '42883' || error?.code === '42P01' || /could not find|does not exist/i.test(error?.message ?? '');

function readCache(userId) {
  if (!userId) return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(cacheKey(userId)) ?? '[]'));
  } catch {
    return new Set();
  }
}

function writeCache(userId, ids) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify([...ids]));
  } catch {
    // stockage indisponible : on relira depuis le serveur.
  }
}

// Jours de connexion déjà réclamés (60 derniers). null si la lecture échoue
// (migration absente...) : l'appelant garde alors ce qu'il avait.
async function readDailyDays() {
  const { data, error } = await supabase.from('shop_ledger').select('ref').eq('source', 'daily').order('created_at', { ascending: false }).limit(60);
  return error ? null : new Set((data ?? []).map((row) => row.ref));
}

export default function useShop(userId) {
  const [status, setStatus] = useState(userId ? 'loading' : 'signed-out');
  const [balance, setBalance] = useState(0);
  const [lastGain, setLastGain] = useState(0);
  const [dailyDays, setDailyDays] = useState(() => new Set()); // jours UTC déjà réclamés
  const [claimingDaily, setClaimingDaily] = useState(false);
  const [offers, setOffers] = useState([]);
  const [ownedIds, setOwnedIds] = useState(() => readCache(userId));
  const [buying, setBuying] = useState(null);
  const [welcomeClaimed, setWelcomeClaimed] = useState(true); // true par défaut : pas de fenêtre tant que le statut réel n'est pas connu
  const [claimingWelcome, setClaimingWelcome] = useState(false);
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
    // Crédite d'abord ce qui est dû (MVP Points réclamés dans le pass, PAS le
    // bonus de bienvenue) : les lectures suivantes voient le solde à jour.
    const award = await supabase.rpc('shop_award');
    if (!alive.current) return;
    if (award.error) {
      if (isMissingFunction(award.error)) return setStatus('unavailable');
      console.error(`[shop] shop_award : ${award.error.message}`);
      return setStatus((s) => (s === 'ready' ? s : 'error'));
    }
    setBalance(award.data?.balance ?? 0);
    if (award.data?.gained > 0) setLastGain(award.data.gained);

    const nowIso = new Date().toISOString();
    const [offersRes, purchasesRes, welcomeRes, dailyRes] = await Promise.all([
      supabase.from('shop_offers').select('id, item_id, kind, price, starts_at, ends_at').lte('starts_at', nowIso).gt('ends_at', nowIso),
      supabase.from('shop_purchases').select('item_id'),
      supabase.from('shop_ledger').select('id').eq('source', 'welcome').limit(1),
      readDailyDays(),
    ]);
    if (!alive.current) return;
    if (dailyRes) setDailyDays(dailyRes);
    if (offersRes.error || purchasesRes.error) {
      console.error(`[shop] lecture : ${(offersRes.error ?? purchasesRes.error).message}`);
      return setStatus((s) => (s === 'ready' ? s : 'error'));
    }
    // Une erreur ici (peu probable, même migration que le reste) ne doit pas
    // bloquer l'affichage de la boutique : la fenêtre reste juste masquée.
    if (!welcomeRes.error) setWelcomeClaimed((welcomeRes.data?.length ?? 0) > 0);
    // Une offre dont l'objet n'est pas connu de cette version de l'app est ignorée.
    setOffers(
      (offersRes.data ?? [])
        .map((o) => ({ ...o, item: SHOP_ITEM_BY_ID.get(o.item_id) }))
        .filter((o) => o.item)
        .sort((a, b) => (a.kind === b.kind ? a.price - b.price : KIND_ORDER[a.kind] - KIND_ORDER[b.kind])),
    );
    const ids = new Set((purchasesRes.data ?? []).map((p) => p.item_id));
    setOwnedIds(ids);
    writeCache(userId, ids);
    setStatus('ready');
  }, [userId]);

  useEffect(() => {
    setOwnedIds(readCache(userId));
    setStatus(userId ? 'loading' : 'signed-out');
    load();
  }, [userId, load]);

  // Connexion quotidienne : le joueur vient la réclamer lui-même (page dédiée).
  // Renvoie ok | already (déjà réclamée aujourd'hui) | unavailable | error.
  const claimDaily = useCallback(async () => {
    setClaimingDaily(true);
    try {
      const { data, error } = await supabase.rpc('shop_claim_daily');
      if (error) {
        if (isMissingFunction(error)) return 'unavailable';
        console.error(`[shop] shop_claim_daily : ${error.message}`);
        return 'error';
      }
      if (!alive.current) return data?.claimed ? 'ok' : 'already';
      if (typeof data?.balance === 'number') setBalance(data.balance);
      const days = await readDailyDays();
      if (alive.current && days) setDailyDays(days);
      return data?.claimed ? 'ok' : 'already';
    } finally {
      if (alive.current) setClaimingDaily(false);
    }
  }, []);

  // Renvoie le statut serveur : ok | owned | insufficient | unavailable | error.
  const buy = useCallback(
    async (offer) => {
      setBuying(offer.id);
      try {
        const { data, error } = await supabase.rpc('shop_buy', { p_offer: offer.id });
        if (error) {
          console.error(`[shop] shop_buy : ${error.message}`);
          return 'error';
        }
        if (!alive.current) return data?.status ?? 'error';
        if (typeof data?.balance === 'number') setBalance(data.balance);
        if (data?.status === 'ok' || data?.status === 'owned') {
          setOwnedIds((prev) => {
            const next = new Set(prev).add(offer.item_id);
            writeCache(userId, next);
            return next;
          });
        }
        if (data?.status === 'unavailable') load();
        return data?.status ?? 'error';
      } finally {
        if (alive.current) setBuying(null);
      }
    },
    [userId, load],
  );

  // Réclame le bonus de bienvenue (bouton « Obtenir » de la fenêtre du hub).
  // Idempotent côté serveur : un appel après réclamation ne recrédite rien.
  const claimWelcome = useCallback(async () => {
    setClaimingWelcome(true);
    try {
      const { data, error } = await supabase.rpc('shop_claim_welcome');
      if (error) {
        console.error(`[shop] shop_claim_welcome : ${error.message}`);
        return false;
      }
      if (!alive.current) return data?.claimed ?? false;
      if (typeof data?.balance === 'number') setBalance(data.balance);
      setWelcomeClaimed(true);
      return data?.claimed ?? false;
    } finally {
      if (alive.current) setClaimingWelcome(false);
    }
  }, []);

  return { status, balance, lastGain, dailyDays, claimingDaily, claimDaily, offers, ownedIds, buying, buy, welcomeClaimed, claimingWelcome, claimWelcome, refresh: load };
}
