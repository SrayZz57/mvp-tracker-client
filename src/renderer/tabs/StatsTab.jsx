import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown } from 'lucide-react';
import Icon from '../Icon.jsx';
import {
  findMe,
  resultLabel,
  resultLabelKey,
  matchScore,
  hitStats,
  weaponKillsFor,
  groupStats,
  excludeDeathmatch,
  weaponKillsForAgent,
  agentTotalKills,
  kastStats,
} from '../valorantStats.js';
import { useAgentIcons, useAgentPortraits, useAgentRoles } from '../agentIcons.js';
import { useMapImages } from '../mapImages.js';
import { useWeaponIcons } from '../weaponIcons.js';
import { useRankTiers, usePlayerCardArt, useSeasonNames } from '../rankData.js';
import PlayerProfileCard from '../PlayerProfileCard.jsx';
import PlatformFilterToggle from '../PlatformFilterToggle.jsx';
import usePlatformFilter from '../usePlatformFilter.js';
import CollapsibleCard from '../CollapsibleCard.jsx';
import RankMomentumCard from '../RankMomentumCard.jsx';
import MatchDetailModal from '../MatchDetailModal.jsx';
import MapDetailModal from '../MapDetailModal.jsx';
import AgentDetailModal from '../AgentDetailModal.jsx';
import WeaponDetailModal from '../WeaponDetailModal.jsx';
import LineChart from '../charts/LineChart.jsx';
import CountUp from '../CountUp.jsx';
import LoadingState from '../LoadingState.jsx';

const MATCH_HISTORY_PAGE_SIZE = 10;

// `id` reste la vraie valeur de filtrage (comparée à match.metadata.mode_id),
// seul le libellé affiché passe par la traduction (voir `labelKey`).
const SCOPE_OPTIONS = [
  { id: '', labelKey: 'stats.scope.all' },
  { id: 'competitive', labelKey: 'stats.scope.ranked' },
  { id: 'unrated', labelKey: 'stats.scope.unrated' },
];

// Fonction utilitaire (pas un composant) : reçoit `t` en paramètre plutôt que
// d'appeler useTranslation() elle-même.
function renderModeStats(t, id, title, rows, icons) {
  return (
    <CollapsibleCard id={id} title={title}>
      {rows.length === 0 ? (
        <p>{t('stats.noDataYet')}</p>
      ) : (
        rows.map((row) => (
          <div key={row.key} className="stat-bar-row">
            <span className="stat-bar-label">
              {icons?.get(row.key) && <img src={icons.get(row.key)} alt="" className="stat-bar-icon" />}
              {row.key}
            </span>
            <span className="stat-bar-track">
              <span
                className={`stat-bar-fill ${row.winrate === null ? '' : row.winrate >= 50 ? 'good' : 'bad'}`}
                style={{ width: `${row.winrate ?? 4}%` }}
              />
            </span>
            <span className="stat-bar-value">{row.winrate === null ? '?' : `${row.winrate.toFixed(0)}%`}</span>
            <span className="stat-bar-meta">
              {t('stats.gamesCount', { count: row.games })} — K/D/A {row.avgKills.toFixed(1)}/{row.avgDeaths.toFixed(1)}/{row.avgAssists.toFixed(1)}
            </span>
          </div>
        ))
      )}
    </CollapsibleCard>
  );
}

const AGENT_CARDS_PAGE_SIZE = 5;

function AgentCards({ rows, portraits, icons, matches, settings, onRowClick }) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const visibleRows = showAll ? rows : rows.slice(0, AGENT_CARDS_PAGE_SIZE);

  return (
    <CollapsibleCard id="stats.statsByAgent" title={t('stats.statsByAgent')}>
      <div className="map-card-list">
        {visibleRows.map((row) => {
          const image = portraits.get(row.key);
          const icon = icons.get(row.key);
          const topWeapon = weaponKillsForAgent(matches, settings.name, settings.tag, row.key)[0];
          const kills = agentTotalKills(matches, settings.name, settings.tag, row.key);
          const isGood = row.winrate !== null && row.winrate >= 50;
          return (
            <div
              key={row.key}
              className={`agent-card ${row.winrate === null ? '' : isGood ? 'win' : 'loss'}`}
              onClick={() => onRowClick(row.key)}
            >
              <div className={`agent-card-badge ${row.winrate === null ? '' : isGood ? 'win' : 'loss'}`}>
                <div className="agent-card-badge-value">
                  {row.winrate === null ? '?' : `${row.winrate.toFixed(0)}%`}
                </div>
                <div className="agent-card-badge-label">{t('stats.winrateLabel')}</div>
              </div>
              <div className="agent-card-info">
                <div className="agent-card-title-row">
                  {icon && <img src={icon} alt="" className="agent-card-icon" />}
                  <span className="agent-card-title">{row.key}</span>
                </div>
                <div className="agent-card-stats">
                  <span className="label">{t('stats.gamesCount', { count: row.games })}</span>
                  <span className="label">K/D/A {row.avgKills.toFixed(1)}/{row.avgDeaths.toFixed(1)}/{row.avgAssists.toFixed(1)}</span>
                  <span className="label">{t('stats.killsCount', { count: kills })}</span>
                  {topWeapon && <span className="label">{t('stats.favoriteWeapon', { weapon: topWeapon[0] })}</span>}
                </div>
              </div>
              <div
                className="agent-card-portrait"
                style={image ? { backgroundImage: `url(${image})` } : undefined}
              />
            </div>
          );
        })}
      </div>
      {rows.length > AGENT_CARDS_PAGE_SIZE && (
        <button className="show-more-btn" onClick={() => setShowAll(!showAll)}>
          {showAll ? t('stats.showLess') : t('stats.showMore', { count: rows.length - AGENT_CARDS_PAGE_SIZE })}
        </button>
      )}
    </CollapsibleCard>
  );
}

const MAP_CARDS_PAGE_SIZE = 5;

function MapCards({ rows, mapImages, onRowClick }) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const visibleRows = showAll ? rows : rows.slice(0, MAP_CARDS_PAGE_SIZE);

  return (
    <CollapsibleCard id="stats.statsByMap" title={t('stats.statsByMap')}>
      <div className="map-card-list">
        {visibleRows.map((row) => {
          const image = mapImages.get(row.key);
          return (
            <div
              key={row.key}
              className="map-card"
              style={image ? { backgroundImage: `url(${image})` } : undefined}
              onClick={() => onRowClick(row.key)}
            >
              <div className="map-card-overlay">
                <div className="map-card-title">{row.key}</div>
                <div className="map-card-stats">
                  {t('stats.gamesCount', { count: row.games })} — {row.winrate === null ? '?' : `${row.winrate.toFixed(0)}%`} {t('stats.winrateLabel')} — K/D/A{' '}
                  {row.avgKills.toFixed(1)}/{row.avgDeaths.toFixed(1)}/{row.avgAssists.toFixed(1)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {rows.length > MAP_CARDS_PAGE_SIZE && (
        <button className="show-more-btn" onClick={() => setShowAll(!showAll)}>
          {showAll ? t('stats.showLess') : t('stats.showMore', { count: rows.length - MAP_CARDS_PAGE_SIZE })}
        </button>
      )}
    </CollapsibleCard>
  );
}

function StatsTab({ settings, matches, rank, loading }) {
  const { t } = useTranslation();
  const agentIcons = useAgentIcons();
  const agentPortraits = useAgentPortraits();
  const agentRoles = useAgentRoles();
  const mapImages = useMapImages();
  const weaponIcons = useWeaponIcons();
  const rankTiers = useRankTiers();
  const playerCardArt = usePlayerCardArt(rank?.cardUuid);
  const seasonNames = useSeasonNames();
  const currentTier = rank ? rankTiers.get(rank.tierId) : null;
  const peakTier = rank ? rankTiers.get(rank.peakTierId) : null;
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [selectedMap, setSelectedMap] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedWeapon, setSelectedWeapon] = useState(null);
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [modeFilter, setModeFilter] = useState('');
  const [scope, setScope] = useState('');
  const [actFilter, setActFilter] = useState('');

  // Filtre PC/Console local à cet onglet — n'affiche un choix que si le
  // compte a réellement de l'historique sur les deux (voir usePlatformFilter.js).
  const { platforms, platform, setPlatform, filteredMatches: platformMatches } = usePlatformFilter(matches);

  // Actes réellement présents dans l'historique en cache, du plus récent au
  // plus ancien (basé sur la dernière game jouée dans chacun) — jamais une
  // liste figée qui proposerait un acte jamais joué.
  const availableActs = useMemo(() => {
    const latestByAct = new Map(); // season_id -> game_start le plus récent
    platformMatches.forEach((match) => {
      const seasonId = match.metadata?.season_id;
      const gameStart = match.metadata?.game_start ?? 0;
      if (!seasonId) return;
      if (!latestByAct.has(seasonId) || gameStart > latestByAct.get(seasonId)) {
        latestByAct.set(seasonId, gameStart);
      }
    });
    return [...latestByAct.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([seasonId]) => ({ id: seasonId, label: seasonNames.get(seasonId) ?? seasonId }));
  }, [platformMatches, seasonNames]);

  // Filtre global de la page : "Tout" (comme avant), "Classé" (competitive
  // uniquement) ou "Non classé" (unrated uniquement), croisé avec un acte
  // précis si choisi — s'applique à toutes les stats de l'onglet, pas juste
  // à la liste de matchs en bas.
  const scopedMatches = useMemo(() => {
    let result = platformMatches;
    if (scope) result = result.filter((match) => match.metadata?.mode_id === scope);
    if (actFilter) result = result.filter((match) => match.metadata?.season_id === actFilter);
    return result;
  }, [platformMatches, scope, actFilter]);

  const globalStats = useMemo(() => {
    let totalHeadshots = 0;
    let totalBodyshots = 0;
    let totalLegshots = 0;
    const weaponCounts = new Map();

    scopedMatches.forEach((match) => {
      const me = findMe(match, settings.name, settings.tag);
      if (!me) return;

      const { headshots, bodyshots, legshots } = hitStats(me);
      totalHeadshots += headshots;
      totalBodyshots += bodyshots;
      totalLegshots += legshots;

      weaponKillsFor(match, me.puuid).forEach((weapon) => {
        weaponCounts.set(weapon, (weaponCounts.get(weapon) || 0) + 1);
      });
    });

    const totalShots = totalHeadshots + totalBodyshots + totalLegshots;

    return {
      hsPercent: totalShots > 0 ? (totalHeadshots / totalShots) * 100 : null,
      bsPercent: totalShots > 0 ? (totalBodyshots / totalShots) * 100 : null,
      lsPercent: totalShots > 0 ? (totalLegshots / totalShots) * 100 : null,
      kast: kastStats(scopedMatches, settings.name, settings.tag),
      weaponRanking: [...weaponCounts.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [scopedMatches, settings.name, settings.tag]);

  const agentStats = useMemo(
    () => groupStats(excludeDeathmatch(scopedMatches), settings.name, settings.tag, (match, me) => me.character),
    [scopedMatches, settings.name, settings.tag],
  );

  const roleStats = useMemo(
    () =>
      groupStats(
        excludeDeathmatch(scopedMatches),
        settings.name,
        settings.tag,
        (match, me) => agentRoles.get(me.character)?.roleName,
      ),
    [scopedMatches, settings.name, settings.tag, agentRoles],
  );

  const roleIcons = useMemo(
    () => new Map([...agentRoles.values()].filter((r) => r.roleName).map((r) => [r.roleName, r.roleIcon])),
    [agentRoles],
  );

  const mapStats = useMemo(
    () => groupStats(excludeDeathmatch(scopedMatches), settings.name, settings.tag, (match) => match.metadata?.map),
    [scopedMatches, settings.name, settings.tag],
  );

  const modeStats = useMemo(
    () => groupStats(scopedMatches, settings.name, settings.tag, (match) => match.metadata?.mode),
    [scopedMatches, settings.name, settings.tag],
  );

  const kdProgression = useMemo(() => {
    return excludeDeathmatch(scopedMatches)
      .slice(0, 20)
      .map((match) => {
        const me = findMe(match, settings.name, settings.tag);
        if (!me) return null;
        const kills = me.stats?.kills ?? 0;
        const deaths = me.stats?.deaths ?? 0;
        return { label: match.metadata?.map ?? '?', value: deaths > 0 ? kills / deaths : kills };
      })
      .filter(Boolean)
      .reverse();
  }, [scopedMatches, settings.name, settings.tag]);

  const kdStats = useMemo(() => {
    if (kdProgression.length === 0) return null;
    const values = kdProgression.map((d) => d.value);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const best = Math.max(...values);
    const worst = Math.min(...values);
    const half = Math.floor(values.length / 2);
    const firstHalfAvg = half > 0 ? values.slice(0, half).reduce((a, b) => a + b, 0) / half : avg;
    const secondHalfAvg =
      values.length - half > 0 ? values.slice(half).reduce((a, b) => a + b, 0) / (values.length - half) : avg;
    return { avg, best, worst, trend: secondHalfAvg - firstHalfAvg };
  }, [kdProgression]);

  // Même fenêtre de matchs que le graphique de K/D, pour un bilan V/D à côté.
  const periodResults = useMemo(() => {
    const results = excludeDeathmatch(scopedMatches)
      .slice(0, 20)
      .map((match) => {
        const me = findMe(match, settings.name, settings.tag);
        if (!me) return null;
        return { id: match.metadata?.matchid, map: match.metadata?.map, label: resultLabel(match, me) };
      })
      .filter(Boolean)
      .reverse();
    const wins = results.filter((r) => r.label === 'Victoire').length;
    const losses = results.filter((r) => r.label === 'Défaite').length;
    const draws = results.length - wins - losses;
    const winrate = results.length > 0 ? (wins / results.length) * 100 : null;
    return { results, wins, losses, draws, winrate };
  }, [scopedMatches, settings.name, settings.tag]);

  // Modes réellement présents dans le scope actuel — pas de liste figée, pour
  // ne jamais proposer un mode que le joueur n'a pas joué (ou hors du scope).
  const availableModes = useMemo(() => {
    const modes = new Map();
    scopedMatches.forEach((match) => {
      if (match.metadata?.mode_id) modes.set(match.metadata.mode_id, match.metadata.mode ?? match.metadata.mode_id);
    });
    return [...modes.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [scopedMatches]);

  const filteredMatches = useMemo(
    () => (modeFilter ? scopedMatches.filter((match) => match.metadata?.mode_id === modeFilter) : scopedMatches),
    [scopedMatches, modeFilter],
  );

  if (matches.length === 0) {
    if (loading) return <LoadingState />;
    return <p>{t('stats.noMatchesYet')}</p>;
  }

  return (
    <div>
      <PlatformFilterToggle platforms={platforms} platform={platform} onChange={setPlatform} />

      <div className="card stats-scope-card">
        <span className="stats-scope-label">{t('stats.scopeLabel')}</span>
        <div className="strategy-tool-group">
          {SCOPE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={opt.id === scope ? 'strategy-tool active' : 'strategy-tool'}
              onClick={() => {
                setScope(opt.id);
                setModeFilter('');
                setShowAllMatches(false);
              }}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
        {availableActs.length > 0 && (
          <select
            value={actFilter}
            onChange={(e) => {
              setActFilter(e.target.value);
              setShowAllMatches(false);
            }}
            className="stats-scope-act-select"
          >
            <option value="">{t('stats.allActs')}</option>
            {availableActs.map((act) => (
              <option key={act.id} value={act.id}>
                {act.label}
              </option>
            ))}
          </select>
        )}
        {(scope || actFilter) && (
          <span className="label">
            {t('stats.matchesCount', { count: scopedMatches.length })}
            {scope ? ` ${t(SCOPE_OPTIONS.find((o) => o.id === scope)?.labelKey).toLowerCase()}` : ''}
            {actFilter ? ` — ${availableActs.find((a) => a.id === actFilter)?.label}` : ''}
          </span>
        )}
      </div>

      <div
        className={`card profile-header-card ${currentTier?.color ? 'rank-glow' : ''}`}
        style={{
          backgroundImage: playerCardArt.banner ? `url(${playerCardArt.banner})` : undefined,
          borderColor: currentTier?.color,
          '--rank-color': currentTier?.color,
        }}
      >
        <div className="profile-header-overlay">
          {playerCardArt.icon && <img src={playerCardArt.icon} alt="" className="profile-card-icon" />}

          <div className="profile-header-info">
            <h2>
              {settings.name}
              <span className="profile-tag">#{settings.tag}</span>
            </h2>

            {rank ? (
              <div className="profile-rank-block">
                <div className="profile-rank-row">
                  {currentTier?.icon && (
                    <img src={currentTier.icon} alt={rank.tierName} className="profile-rank-icon" />
                  )}
                  <div className="profile-rank-details">
                    <span className="profile-rank-name" style={{ color: currentTier?.color }}>
                      {rank.tierName}
                    </span>
                    <div className="profile-rr-track">
                      <div
                        className="profile-rr-fill"
                        style={{ width: `${Math.min(rank.rr, 100)}%`, background: currentTier?.color }}
                      />
                    </div>
                    <span className="label">{rank.rr} RR</span>
                  </div>
                </div>

                {rank.peakTierName && (
                  <div className="profile-peak-badge">
                    {peakTier?.icon && <img src={peakTier.icon} alt={rank.peakTierName} />}
                    <span>
                      {t('stats.peak', { tier: rank.peakTierName })}
                      {seasonNames.get(rank.peakSeasonUuid) ? ` — ${seasonNames.get(rank.peakSeasonUuid)}` : ''}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="label">{t('nav.rankUnavailable')}</p>
            )}
          </div>
        </div>
      </div>

      <PlayerProfileCard settings={settings} matches={scopedMatches} />
      <RankMomentumCard settings={settings} matches={scopedMatches} />

      <CollapsibleCard id="stats.kdProgression" title={t('stats.kdProgressionTitle', { count: kdProgression.length })}>
        {kdStats && (
          <div className="stat-tiles">
            <div className="stat-tile">
              <div className="value"><CountUp value={kdStats.avg} decimals={2} /></div>
              <div className="label">{t('stats.kdAvg')}</div>
            </div>
            <div className="stat-tile">
              <div className="value"><CountUp value={kdStats.best} decimals={2} /></div>
              <div className="label">{t('stats.bestMatch')}</div>
            </div>
            <div className="stat-tile">
              <div className="value"><CountUp value={kdStats.worst} decimals={2} /></div>
              <div className="label">{t('stats.worstMatch')}</div>
            </div>
            <div className="stat-tile">
              <div className="value" style={{ color: kdStats.trend >= 0 ? '#3ddc84' : 'var(--accent)' }}>
                <Icon icon={kdStats.trend >= 0 ? TrendingUp : TrendingDown} size={16} /> {Math.abs(kdStats.trend).toFixed(2)}
              </div>
              <div className="label">{t('stats.trend')}</div>
            </div>
          </div>
        )}
        <div className="kd-chart-row">
          <div className="kd-chart-col">
            <LineChart data={kdProgression} color="#ff4655" />
          </div>
          <div className="kd-period-panel">
            <h4>{t('stats.periodRecap')}</h4>
            <div className="kd-period-score">
              <span className="kd-period-wins">{periodResults.wins}V</span>
              <span className="kd-period-sep">—</span>
              <span className="kd-period-losses">{periodResults.losses}D</span>
              {periodResults.draws > 0 && (
                <span className="label">{t('stats.draws', { count: periodResults.draws })}</span>
              )}
            </div>
            <p className="label">
              {t('stats.winPercentage', {
                percent: periodResults.winrate === null ? '?' : `${periodResults.winrate.toFixed(0)}%`,
              })}
            </p>
            <div className="streak-dots">
              {periodResults.results.map((r) => (
                <span
                  key={r.id}
                  className={`streak-dot ${r.label === 'Victoire' ? 'win' : r.label === 'Défaite' ? 'loss' : 'neutral'}`}
                  title={`${r.map ?? '?'} — ${resultLabelKey(r.label) ? t(resultLabelKey(r.label)) : r.label}`}
                />
              ))}
            </div>
            <p className="label kd-period-hint">{t('stats.periodHint')}</p>
          </div>
        </div>
      </CollapsibleCard>

      <CollapsibleCard id="stats.globalStats" title={t('stats.globalStatsTitle', { count: scopedMatches.length })}>
        <div className="stat-tiles">
          <div className="stat-tile">
            <div className="value">{globalStats.hsPercent === null ? '?' : `${globalStats.hsPercent.toFixed(1)}%`}</div>
            <div className="label">{t('stats.head')}</div>
          </div>
          <div className="stat-tile">
            <div className="value">{globalStats.bsPercent === null ? '?' : `${globalStats.bsPercent.toFixed(1)}%`}</div>
            <div className="label">{t('stats.body')}</div>
          </div>
          <div className="stat-tile">
            <div className="value">{globalStats.lsPercent === null ? '?' : `${globalStats.lsPercent.toFixed(1)}%`}</div>
            <div className="label">{t('stats.legs')}</div>
          </div>
          <div className="stat-tile">
            <div className="value">{globalStats.kast === null ? '?' : `${globalStats.kast.toFixed(0)}%`}</div>
            <div className="label">{t('stats.kast')}</div>
          </div>
        </div>

        <h3 style={{ marginTop: '1.25rem' }}>{t('stats.topWeapons')}</h3>
        {globalStats.weaponRanking.length === 0 ? (
          <p>{t('stats.noWeaponData')}</p>
        ) : (
          (() => {
            const maxCount = globalStats.weaponRanking[0][1];
            return globalStats.weaponRanking.map(([weapon, count]) => (
              <div key={weapon} className="weapon-bar-row clickable" onClick={() => setSelectedWeapon(weapon)}>
                <span className="name">
                  {weaponIcons.get(weapon) && <img src={weaponIcons.get(weapon)} alt="" className="weapon-icon" />}
                  {weapon}
                </span>
                <span className="weapon-bar-track">
                  <span className="weapon-bar-fill" style={{ width: `${(count / maxCount) * 100}%` }} />
                </span>
                <span className="weapon-bar-count">{t('stats.killsCount', { count })}</span>
              </div>
            ));
          })()
        )}
      </CollapsibleCard>

      <AgentCards
        rows={agentStats}
        portraits={agentPortraits}
        icons={agentIcons}
        matches={scopedMatches}
        settings={settings}
        onRowClick={(name) => setSelectedAgent(name)}
      />
      <MapCards rows={mapStats} mapImages={mapImages} onRowClick={(mapName) => setSelectedMap(mapName)} />
      {renderModeStats(t, 'stats.statsByRole', t('stats.statsByRole'), roleStats, roleIcons)}
      {renderModeStats(t, 'stats.statsByMode', t('stats.statsByMode'), modeStats)}

      <CollapsibleCard id="stats.matchHistory" title={t('stats.matchHistory', { count: filteredMatches.length })}>
        <div className="filter-bar">
          <select
            value={modeFilter}
            onChange={(e) => {
              setModeFilter(e.target.value);
              setShowAllMatches(false);
            }}
          >
            <option value="">{t('stats.allModes')}</option>
            {availableModes.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>
        <div className="match-list">
          {(showAllMatches ? filteredMatches : filteredMatches.slice(0, MATCH_HISTORY_PAGE_SIZE)).map((match) => {
            const me = findMe(match, settings.name, settings.tag);
            const { hsPercent, bsPercent, lsPercent } = hitStats(me);
            const label = resultLabel(match, me);
            const displayLabel = resultLabelKey(label) ? t(resultLabelKey(label)) : label;
            const score = matchScore(match, me);
            const resultClass = label === 'Victoire' ? 'match-win' : label === 'Défaite' ? 'match-loss' : '';
            return (
              <div
                key={match.metadata?.matchid}
                className={`match-row ${resultClass} clickable`}
                onClick={() => setSelectedMatch(match)}
              >
                <span className="match-info">
                  {match.metadata?.mode ?? '?'} — {match.metadata?.map ?? '?'} — {' '}
                  {me?.character && agentIcons.get(me.character) && (
                    <img src={agentIcons.get(me.character)} alt="" className="agent-icon" />
                  )}
                  {me?.character ?? '?'} — {' '}
                  {me?.stats?.kills ?? '?'}/{me?.stats?.deaths ?? '?'}/{me?.stats?.assists ?? '?'}
                  {hsPercent !== null &&
                    t('stats.hitBreakdown', { hs: hsPercent.toFixed(0), bs: bsPercent.toFixed(0), ls: lsPercent.toFixed(0) })}
                </span>
                <span className={`result-badge ${resultClass}`}>
                  {displayLabel}
                  {score && ` (${score})`}
                </span>
              </div>
            );
          })}
        </div>
        {filteredMatches.length > MATCH_HISTORY_PAGE_SIZE && (
          <button className="show-more-btn" onClick={() => setShowAllMatches(!showAllMatches)}>
            {showAllMatches ? t('stats.showLess') : t('stats.showMore', { count: filteredMatches.length - MATCH_HISTORY_PAGE_SIZE })}
          </button>
        )}
      </CollapsibleCard>

      {selectedMatch && (
        <MatchDetailModal
          match={selectedMatch}
          settings={settings}
          agentIcons={agentIcons}
          onClose={() => setSelectedMatch(null)}
        />
      )}

      {selectedMap && (
        <MapDetailModal
          mapName={selectedMap}
          matches={scopedMatches}
          settings={settings}
          agentIcons={agentIcons}
          onClose={() => setSelectedMap(null)}
        />
      )}

      {selectedAgent && (
        <AgentDetailModal
          character={selectedAgent}
          matches={scopedMatches}
          settings={settings}
          onClose={() => setSelectedAgent(null)}
        />
      )}

      {selectedWeapon && (
        <WeaponDetailModal
          weapon={selectedWeapon}
          weaponIcon={weaponIcons.get(selectedWeapon)}
          matches={scopedMatches}
          settings={settings}
          onClose={() => setSelectedWeapon(null)}
        />
      )}
    </div>
  );
}

export default StatsTab;
