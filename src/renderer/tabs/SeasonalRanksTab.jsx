import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRankTiers, useSeasonNames, useSeasonOrder } from '../rankData.js';
import { supabase } from '../supabaseClient.js';
import CollapsibleCard from '../CollapsibleCard.jsx';

// Poll de rafraîchissement pendant que l'onglet est ouvert : le backfill
// d'historique tourne en arrière-plan côté main.js (petits lots réguliers,
// voir pollActHistoryBackfill), donc rouvrir/laisser l'onglet ouvert suffit
// à voir la liste se compléter progressivement sans action de l'utilisateur.
const REFRESH_MS = 10000;

// Mêmes exclusions que excludeDeathmatch (valorantStats.js) : Combat à mort,
// partie perso, Escalade — pas de vraies équipes/rounds/K-D comparables.
const EXCLUDED_QUEUE_IDS = new Set(['deathmatch', 'custom', '', 'ggteam']);

// Rang par acte : tout vient de l'API LOCALE du client Riot (jamais
// HenrikDev pour cet onglet — plafonné à 40 matchs, largement insuffisant
// pour couvrir plusieurs actes en arrière). Le rang vient de
// valorant:get-seasonal-ranks, les games/K-D/agent principal viennent de
// valorant:get-act-history (résumé par match, backfillé en tâche de fond).
// Toujours le compte lié (myId), jamais un profil consulté.
function SeasonalRanksTab({ myId }) {
  const { t } = useTranslation();
  const rankTiers = useRankTiers();
  const seasonNames = useSeasonNames();
  const seasonOrder = useSeasonOrder();

  const [seasonalRanks, setSeasonalRanks] = useState([]);
  const [actHistory, setActHistory] = useState([]);
  const [reloading, setReloading] = useState(false);
  const [reloadStatus, setReloadStatus] = useState(null); // { addedRows, remaining } | null

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      window.electronAPI.getSeasonalRanks().then((v) => !cancelled && setSeasonalRanks(v));
      window.electronAPI.getActHistory().then((v) => !cancelled && setActHistory(v));
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Lance plusieurs lots d'affilée côté main.js (au lieu d'attendre le tick
  // de fond toutes les 8s) puis relit le cache — utile pour un vieil acte
  // (ex. Épisode 3) que le backfill n'a pas encore atteint en suivant
  // l'ordre chronologique inverse depuis l'acte en cours.
  const handleReload = async () => {
    setReloading(true);
    setReloadStatus(null);
    try {
      const result = await window.electronAPI.backfillActHistoryNow();
      const [ranks, history] = await Promise.all([
        window.electronAPI.getSeasonalRanks(),
        window.electronAPI.getActHistory(),
      ]);
      setSeasonalRanks(ranks);
      setActHistory(history);
      setReloadStatus(result);
    } finally {
      setReloading(false);
    }
  };

  const actAggregates = useMemo(() => {
    const map = new Map();
    actHistory.forEach((row) => {
      if (!row.season_id) return;
      // Mêmes modes exclus que excludeDeathmatch (valorantStats.js) : pas de
      // vraies équipes/K-D pour ceux-là — sinon un Combat à mort à 25 kills
      // fausse le K/D et peut même passer "agent principal" par erreur.
      if (EXCLUDED_QUEUE_IDS.has(row.queue_id)) return;
      if (!map.has(row.season_id)) {
        map.set(row.season_id, { games: 0, kills: 0, deaths: 0, agentCounts: new Map() });
      }
      const g = map.get(row.season_id);
      g.games += 1;
      g.kills += row.kills ?? 0;
      g.deaths += row.deaths ?? 0;
      if (row.agent) g.agentCounts.set(row.agent, (g.agentCounts.get(row.agent) ?? 0) + 1);
    });
    return map;
  }, [actHistory]);

  const acts = useMemo(() => {
    const seasonIds = new Set([...actAggregates.keys(), ...seasonalRanks.map((s) => s.seasonId)]);
    return [...seasonIds]
      .map((seasonId) => {
        const g = actAggregates.get(seasonId);
        const rankEntry = seasonalRanks.find((s) => s.seasonId === seasonId);
        const topAgent = g ? [...g.agentCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null : null;

        return {
          seasonId,
          label: seasonNames.get(seasonId) ?? seasonId,
          order: seasonOrder.get(seasonId) ?? 0,
          tier: rankEntry?.CompetitiveTier ?? 0,
          rr: rankEntry?.RankedRating ?? null,
          games: g?.games ?? 0,
          kd: g && g.deaths > 0 ? g.kills / g.deaths : null,
          kills: g?.kills ?? 0,
          topAgent,
        };
      })
      .sort((a, b) => b.order - a.order);
  }, [actAggregates, seasonalRanks, seasonNames, seasonOrder]);

  // Synchro vers Supabase (résumé par acte uniquement — jamais les matchs
  // bruts, voir l'incident matchSync.js coupé le 2026-09-02) : prépare la
  // donnée pour un futur client mobile, qui n'a pas accès à l'API locale du
  // client Riot (donc pas à cet historique autrement). Échec silencieux (RLS
  // pas encore posée côté Supabase, hors-ligne...) — ne doit jamais bloquer
  // ni polluer l'affichage local, qui reste la source de vérité ici.
  useEffect(() => {
    if (!myId || acts.length === 0) return;
    const rows = acts
      .filter((act) => act.games > 0 || act.tier > 0)
      .map((act) => ({
        user_id: myId,
        season_id: act.seasonId,
        tier: act.tier,
        games: act.games,
        kills: act.kills,
        kd: act.kd,
        top_agent: act.topAgent,
        updated_at: new Date().toISOString(),
      }));
    if (rows.length === 0) return;
    supabase
      .from('seasonal_ranks')
      .upsert(rows, { onConflict: 'user_id,season_id' })
      .then(({ error }) => {
        if (error) console.error('[seasonal-ranks] synchro Supabase échouée :', error.message);
      });
  }, [acts, myId]);

  const reloadButton = (
    <button type="button" className="refresh" onClick={handleReload} disabled={reloading}>
      {reloading ? t('seasonalRanks.reloading') : t('seasonalRanks.reload')}
    </button>
  );

  const reloadStatusText = reloadStatus
    ? reloadStatus.remaining > 0
      ? t('seasonalRanks.reloadPartial', { added: reloadStatus.addedRows, remaining: reloadStatus.remaining })
      : reloadStatus.addedRows > 0
        ? t('seasonalRanks.reloadDone', { added: reloadStatus.addedRows })
        : t('seasonalRanks.reloadNothingMore')
    : null;

  if (acts.length === 0) {
    return (
      <CollapsibleCard id="seasonalRanks.title" title={t('seasonalRanks.title')} headerExtra={reloadButton}>
        <p className="label">{t('seasonalRanks.empty')}</p>
        {reloadStatusText && <p className="label">{reloadStatusText}</p>}
      </CollapsibleCard>
    );
  }

  const [current, ...past] = acts;
  const currentTier = current ? rankTiers.get(current.tier) : null;

  return (
    <CollapsibleCard id="seasonalRanks.title" title={t('seasonalRanks.title')} headerExtra={reloadButton}>
      {reloadStatusText && <p className="label">{reloadStatusText}</p>}

      {current && (
        <div className="rank-hero" style={{ '--rank-color': currentTier?.color ?? 'var(--text-dim)' }}>
          <div className="rank-hero-glow" aria-hidden="true" />
          {currentTier?.icon ? (
            <img src={currentTier.icon} alt={currentTier.name} className="rank-hero-icon" />
          ) : (
            <div className="rank-hero-icon rank-hero-icon-empty">?</div>
          )}
          <div className="rank-hero-tier">{currentTier?.name ?? t('seasonalRanks.unranked')}</div>
          {current.tier > 0 && current.rr !== null && (
            <>
              <div className="rank-hero-rr-track">
                <div className="rank-hero-rr-fill" style={{ width: `${Math.min(current.rr, 100)}%` }} />
              </div>
              <span className="label">{current.rr} RR</span>
            </>
          )}
          <div className="rank-hero-act label">{current.label}</div>
        </div>
      )}

      {past.length > 0 && (
        <>
          <p className="label rank-grid-heading">{t('seasonalRanks.pastActs')}</p>
          <div className="rank-grid">
            {past.map((act) => {
              const tier = rankTiers.get(act.tier);
              return (
                <div
                  key={act.seasonId}
                  className={`rank-grid-card ${tier?.color ? 'rank-glow' : ''}`}
                  style={{ '--rank-color': tier?.color }}
                >
                  {tier?.icon ? (
                    <img src={tier.icon} alt={tier.name} className="rank-grid-icon" />
                  ) : (
                    <div className="rank-grid-icon rank-grid-icon-empty">?</div>
                  )}
                  <div className="rank-grid-tier">{tier?.name ?? t('seasonalRanks.unranked')}</div>
                  <div className="rank-grid-act label">{act.label}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </CollapsibleCard>
  );
}

export default SeasonalRanksTab;
