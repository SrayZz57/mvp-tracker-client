import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Medal } from 'lucide-react';
import { computeTeammateSynergy, computeNemesis } from './socialStats.js';
import { useAgentIcons } from './agentIcons.js';
import { usePlayerCardArt, useRankTiers } from './rankData.js';
import LoadingState from './LoadingState.jsx';
import PlatformFilterToggle from './PlatformFilterToggle.jsx';
import usePlatformFilter from './usePlatformFilter.js';
import CollapsibleCard from './CollapsibleCard.jsx';

const GRAPH_SIZE = 480;
const CENTER = GRAPH_SIZE / 2;
const RADIUS = 180;
const MAX_NODES = 8;

function synergyColor(winrate) {
  if (winrate >= 60) return '#3ddc84';
  if (winrate >= 45) return 'var(--warning)';
  return 'var(--accent)';
}

function displayName(t, entry, myPuuid) {
  return entry.puuid === myPuuid ? t('social.you') : entry.name;
}

function SynergyGraph({ teammates, myPuuid, centerLabel, onNodeClick, t }) {
  const shown = teammates.slice(0, MAX_NODES);

  if (shown.length === 0) {
    return <p>{t('social.notEnoughSynergyData')}</p>;
  }

  const maxGames = Math.max(...shown.map((tm) => tm.games));

  return (
    <svg viewBox={`0 0 ${GRAPH_SIZE} ${GRAPH_SIZE}`} className="synergy-graph">
      <defs>
        <radialGradient id="synergy-you-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent-hover)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </radialGradient>
        {shown.map((tm) => (
          <radialGradient key={`grad-${tm.puuid}`} id={`synergy-node-${tm.puuid}`} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor={synergyColor(tm.winrate)} stopOpacity="1" />
            <stop offset="100%" stopColor={synergyColor(tm.winrate)} stopOpacity="0.72" />
          </radialGradient>
        ))}
      </defs>

      <circle cx={CENTER} cy={CENTER} r={RADIUS} className="synergy-ring" />
      <circle cx={CENTER} cy={CENTER} r={RADIUS * 0.55} className="synergy-ring synergy-ring-inner" />

      {shown.map((tm, i) => {
        const angle = (2 * Math.PI * i) / shown.length - Math.PI / 2;
        const x = CENTER + RADIUS * Math.cos(angle);
        const y = CENTER + RADIUS * Math.sin(angle);
        return (
          <line
            key={`line-${tm.puuid}`}
            x1={CENTER}
            y1={CENTER}
            x2={x}
            y2={y}
            stroke={synergyColor(tm.winrate)}
            strokeWidth={2 + (tm.games / maxGames) * 4}
            opacity={0.5}
            className="synergy-link"
          />
        );
      })}

      <circle cx={CENTER} cy={CENTER} r={28} fill="url(#synergy-you-glow)" className="synergy-node-you" />
      <User x={CENTER - 10} y={CENTER - 10} width={20} height={20} strokeWidth={1.75} className="synergy-label-you-emoji" />
      <text x={CENTER} y={CENTER + 48} textAnchor="middle" className="synergy-label synergy-label-you">
        {centerLabel}
      </text>

      {shown.map((tm, i) => {
        const angle = (2 * Math.PI * i) / shown.length - Math.PI / 2;
        const x = CENTER + RADIUS * Math.cos(angle);
        const y = CENTER + RADIUS * Math.sin(angle);
        const nodeRadius = 18 + (tm.games / maxGames) * 16;
        return (
          <g
            key={tm.puuid}
            className="synergy-node synergy-node-clickable"
            onClick={() => onNodeClick(tm)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onNodeClick(tm);
            }}
          >
            <title>{t('social.viewProfileOf', { name: displayName(t, tm, myPuuid) })}</title>
            <circle cx={x} cy={y} r={nodeRadius} fill={`url(#synergy-node-${tm.puuid})`} />
            <circle cx={x} cy={y} r={nodeRadius} className="synergy-node-outline" />
            <text x={x} y={y + 4} textAnchor="middle" className="synergy-label synergy-node-value">
              {tm.winrate.toFixed(0)}%
            </text>
            <text x={x} y={y + nodeRadius + 17} textAnchor="middle" className="synergy-label">
              {displayName(t, tm, myPuuid)}
            </text>
            <text x={x} y={y + nodeRadius + 31} textAnchor="middle" className="synergy-label synergy-label-meta">
              {t('social.gamesCount', { count: tm.games })}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Aperçu rapide d'un coéquipier au clic sur son nœud dans le graphe (demandé
// sur Discord : accéder direct au profil sortait carrément de l'onglet en
// cours — un petit aperçu sur place est moins intrusif). Deux appels
// séparés, non bloquants l'un envers l'autre (rang/photo arrivent souvent
// avant K/D récent) : previewRiotAccount ne persiste rien sur disque
// (contrairement à getMatches, qui écrase le "joueur suivi" de toute
// l'app) — un simple coup d'œil ne doit avoir aucun effet de bord.
function TeammateQuickViewModal({ name, tag, apiKey, onClose, onViewFullProfile, t }) {
  const rankTiers = useRankTiers();
  const [account, setAccount] = useState(undefined); // undefined = chargement, null = échec
  const [recentStats, setRecentStats] = useState(undefined);

  useEffect(() => {
    window.electronAPI.previewRiotAccount({ name, tag, apiKey }).then(setAccount).catch(() => setAccount(null));
    window.electronAPI.previewRecentStats({ name, tag, apiKey }).then(setRecentStats).catch(() => setRecentStats(null));
  }, [name, tag, apiKey]);

  const tier = account?.rank ? rankTiers.get(account.rank.tierId) : null;
  const avatarArt = usePlayerCardArt(account?.cardUuid);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card teammate-quickview-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>{t('detail.close')}</button>

        <div className="friend-summary-identity teammate-quickview-header">
          <div className="friend-summary-avatar">
            {avatarArt.icon ? <img src={avatarArt.icon} alt="" /> : <User size={28} strokeWidth={1.75} />}
          </div>
          <span className="friend-summary-name">{name}#{tag}</span>
        </div>

        {account === null ? (
          <p className="label">{t('friends.previewUnavailable')}</p>
        ) : (
          <div className="friend-summary-stats teammate-quickview-stats">
            <div className="friend-summary-stat">
              {tier?.icon && <img src={tier.icon} alt="" />}
              <div className="friend-summary-stat-text">
                <span className="value">{account === undefined ? '…' : (tier?.tierName ?? t('friends.unranked'))}</span>
                {account?.rank && <span className="label">{account.rank.rr} RR</span>}
              </div>
            </div>
            <div className="friend-summary-stat">
              <div className="friend-summary-stat-text">
                <span className="value">
                  {recentStats === undefined ? '…' : recentStats === null || recentStats.kd === null ? '—' : recentStats.kd.toFixed(2)}
                </span>
                <span className="label">{t('social.quickviewKd')}</span>
              </div>
            </div>
            <div className="friend-summary-stat">
              <div className="friend-summary-stat-text">
                <span className="value">
                  {recentStats === undefined
                    ? '…'
                    : recentStats === null || recentStats.winrate === null
                      ? '—'
                      : `${recentStats.winrate.toFixed(0)}%`}
                </span>
                <span className="label">{t('social.quickviewWinrate10')}</span>
              </div>
            </div>
          </div>
        )}

        <button className="refresh" onClick={onViewFullProfile} style={{ marginTop: '1rem' }}>
          {t('social.quickviewFullProfile')}
        </button>
      </div>
    </div>
  );
}

const RANK_TIERS = ['gold', 'silver', 'bronze'];

function RankBadge({ rank }) {
  const tier = RANK_TIERS[rank] ?? null;
  return (
    <span className={`rival-rank ${tier ? `medal ${tier}` : ''}`}>
      {tier ? <Medal size={16} strokeWidth={1.75} /> : `#${rank + 1}`}
    </span>
  );
}

function initials(name) {
  const base = (name || '?').replace(/#.*$/, '').trim();
  return base.slice(0, 2).toUpperCase();
}

function TeammatesRivals({ settings, matches, loading, myPuuid, onViewPlayer }) {
  const { t } = useTranslation();
  const agentIcons = useAgentIcons();
  const [quickView, setQuickView] = useState(null); // { name, tag } | null
  const { platforms, platform, setPlatform, filteredMatches } = usePlatformFilter(matches);
  const teammates = useMemo(
    () => computeTeammateSynergy(filteredMatches, settings.name, settings.tag),
    [filteredMatches, settings.name, settings.tag],
  );
  const nemesis = useMemo(
    () => computeNemesis(filteredMatches, settings.name, settings.tag),
    [filteredMatches, settings.name, settings.tag],
  );
  // Le centre du graphe représente le tracker actuellement consulté — "Toi"
  // seulement quand c'est vraiment le cas, sinon le pseudo de l'autre joueur.
  const centerLabel = settings.puuid === myPuuid ? t('social.you') : settings.name;

  if (matches.length === 0) {
    if (loading) return <LoadingState />;
    return <p>{t('social.noMatchesYet')}</p>;
  }

  return (
    <div>
      <PlatformFilterToggle platforms={platforms} platform={platform} onChange={setPlatform} />

      <CollapsibleCard id="social.synergy" title={t('social.synergyTitle')}>
        <p className="label">{t('social.synergyHint')}</p>
        <div className="synergy-graph-wrap">
          <SynergyGraph
            teammates={teammates}
            myPuuid={myPuuid}
            centerLabel={centerLabel}
            onNodeClick={(tm) => setQuickView({ name: tm.name, tag: tm.tag })}
            t={t}
          />
        </div>
      </CollapsibleCard>

      <div className="nemesis-columns">
        <CollapsibleCard id="social.agentNemesis" title={t('social.agentNemesisTitle')}>
          <p className="label">{t('social.agentNemesisHint')}</p>
          {nemesis.agents.length === 0 ? (
            <p>{t('social.notEnoughAgentDuels')}</p>
          ) : (
            nemesis.agents.slice(0, 8).map((n, i) => (
              <div key={n.agent} className="stat-bar-row rival-row">
                <RankBadge rank={i} />
                <span className="stat-bar-label">
                  {agentIcons.get(n.agent) && <img src={agentIcons.get(n.agent)} alt="" className="stat-bar-icon" />}
                  {n.agent}
                </span>
                <span className="stat-bar-track">
                  <span
                    className={`stat-bar-fill ${n.kd >= 1 ? 'good' : 'bad'}`}
                    style={{ width: `${Math.min(100, (n.kd / 2) * 100)}%` }}
                  />
                </span>
                <span className="stat-bar-value">{n.kd.toFixed(2)}</span>
                <span className="stat-bar-meta">{t('social.killsDeathsMeta', { kills: n.kills, deaths: n.deaths })}</span>
              </div>
            ))
          )}
        </CollapsibleCard>

        <CollapsibleCard id="social.playerNemesis" title={t('social.playerNemesisTitle')}>
          <p className="label">{t('social.playerNemesisHint')}</p>
          {nemesis.players.length === 0 ? (
            <p>{t('social.notEnoughRepeatOpponents')}</p>
          ) : (
            nemesis.players.slice(0, 8).map((n, i) => (
              <div key={n.puuid} className="stat-bar-row rival-row">
                <RankBadge rank={i} />
                <span className="rival-avatar">{initials(displayName(t, n, myPuuid))}</span>
                <span className="stat-bar-label rival-name">{displayName(t, n, myPuuid)}</span>
                <span className="stat-bar-track">
                  <span
                    className={`stat-bar-fill ${n.winrate >= 50 ? 'good' : 'bad'}`}
                    style={{ width: `${n.winrate}%` }}
                  />
                </span>
                <span className="stat-bar-value">{n.winrate.toFixed(0)}%</span>
                <span className="stat-bar-meta">{t('social.crossedMatches', { count: n.games })}</span>
              </div>
            ))
          )}
        </CollapsibleCard>
      </div>

      {quickView && (
        <TeammateQuickViewModal
          name={quickView.name}
          tag={quickView.tag}
          apiKey={settings?.apiKey}
          onClose={() => setQuickView(null)}
          onViewFullProfile={() => {
            onViewPlayer(quickView.name, quickView.tag);
            setQuickView(null);
          }}
          t={t}
        />
      )}
    </div>
  );
}

export default TeammatesRivals;
