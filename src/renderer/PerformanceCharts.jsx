import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gamepad2, Trophy, Swords, Target } from 'lucide-react';
import { excludeDeathmatch, findMe, formStats, overallWinrate, overallHsPercent } from './valorantStats.js';
import { computeMapWinrates, computeDayPeriodGrid, computeRoleDistribution, computeTrend } from './performanceCharts.js';
import { useAgentRoles } from './agentIcons.js';
import KpiTile from './charts/KpiTile.jsx';
import AnimatedBarList from './charts/AnimatedBarList.jsx';
import HeatmapGrid from './charts/HeatmapGrid.jsx';
import RoleStackedBar from './charts/RoleStackedBar.jsx';
import LineChart from './charts/LineChart.jsx';
import LoadingState from './LoadingState.jsx';
import PlatformFilterToggle from './PlatformFilterToggle.jsx';
import usePlatformFilter from './usePlatformFilter.js';
import CollapsibleCard from './CollapsibleCard.jsx';

function PerformanceCharts({ settings, matches, loading }) {
  const { t } = useTranslation();
  const agentRoles = useAgentRoles();
  const { platforms, platform, setPlatform, filteredMatches } = usePlatformFilter(matches);
  const ranked = useMemo(() => excludeDeathmatch(filteredMatches), [filteredMatches]);

  // Filtre par mode de jeu, propre au graphique "Winrate par map" (demandé
  // sur Discord) — n'affecte que ce graphique, pas les autres cartes de
  // l'onglet, qui restent sur l'ensemble des modes classés.
  const [mapModeFilter, setMapModeFilter] = useState('');
  const availableMapModes = useMemo(() => {
    const modes = new Map();
    ranked.forEach((match) => {
      if (match.metadata?.mode_id) modes.set(match.metadata.mode_id, match.metadata.mode ?? match.metadata.mode_id);
    });
    return [...modes.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [ranked]);
  const mapModeMatches = useMemo(
    () => (mapModeFilter ? filteredMatches.filter((match) => match.metadata?.mode_id === mapModeFilter) : filteredMatches),
    [filteredMatches, mapModeFilter],
  );

  const kpis = useMemo(() => {
    const form = formStats(ranked, settings.name, settings.tag);
    return {
      games: ranked.length,
      winrate: overallWinrate(ranked, settings.name, settings.tag),
      kd: form.overallKd,
      hsPercent: overallHsPercent(ranked, settings.name, settings.tag),
    };
  }, [ranked, settings.name, settings.tag]);

  const mapWinrates = useMemo(
    () => computeMapWinrates(mapModeMatches, settings.name, settings.tag).map((r) => ({ key: r.key, value: r.winrate, meta: t('charts.gamesCount', { count: r.games }) })),
    [mapModeMatches, settings.name, settings.tag, t],
  );

  const dayPeriodGrid = useMemo(
    () => computeDayPeriodGrid(filteredMatches, settings.name, settings.tag),
    [filteredMatches, settings.name, settings.tag],
  );

  const roleDistribution = useMemo(
    () => computeRoleDistribution(filteredMatches, settings.name, settings.tag, agentRoles),
    [filteredMatches, settings.name, settings.tag, agentRoles],
  );

  // Filtres propres aux graphiques K/D et Winrate glissant (demandé sur
  // Discord — pouvoir trier par mode ET par agent) — indépendants du filtre
  // mode de "Winrate par map" ci-dessus, chaque graphique garde son propre
  // contexte de lecture.
  const [trendModeFilter, setTrendModeFilter] = useState('');
  const [trendAgentFilter, setTrendAgentFilter] = useState('');
  const availableTrendModes = useMemo(() => {
    const modes = new Map();
    ranked.forEach((match) => {
      if (match.metadata?.mode_id) modes.set(match.metadata.mode_id, match.metadata.mode ?? match.metadata.mode_id);
    });
    return [...modes.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [ranked]);
  const availableTrendAgents = useMemo(() => {
    const agents = new Set();
    ranked.forEach((match) => {
      const character = findMe(match, settings.name, settings.tag)?.character;
      if (character) agents.add(character);
    });
    return [...agents].sort((a, b) => a.localeCompare(b));
  }, [ranked, settings.name, settings.tag]);
  const trendMatches = useMemo(() => {
    let result = filteredMatches;
    if (trendModeFilter) result = result.filter((match) => match.metadata?.mode_id === trendModeFilter);
    if (trendAgentFilter) {
      result = result.filter((match) => findMe(match, settings.name, settings.tag)?.character === trendAgentFilter);
    }
    return result;
  }, [filteredMatches, trendModeFilter, trendAgentFilter, settings.name, settings.tag]);

  const trend = useMemo(
    () => computeTrend(t, trendMatches, settings.name, settings.tag, 20),
    [t, trendMatches, settings.name, settings.tag],
  );

  if (matches.length === 0) {
    if (loading) return <LoadingState />;
    return <p>{t('charts.noMatchesYet')}</p>;
  }

  return (
    <div>
      <PlatformFilterToggle platforms={platforms} platform={platform} onChange={setPlatform} />

      <CollapsibleCard id="charts.kpis" title={t('charts.title')} className="gs-card">
        <p className="label">{t('charts.description')}</p>
        <div className="gs-figures fm-figures fm-figures-4" style={{ marginTop: '0.8rem' }}>
          <KpiTile icon={Gamepad2} label={t('charts.rankedMatches')} value={kpis.games} />
          <KpiTile icon={Trophy} label={t('charts.globalWinrate')} value={kpis.winrate} suffix="%" />
          <KpiTile icon={Swords} label={t('charts.avgKd')} value={kpis.kd} decimals={2} />
          <KpiTile icon={Target} label={t('charts.hsAccuracy')} value={kpis.hsPercent} suffix="%" />
        </div>
      </CollapsibleCard>

      <CollapsibleCard id="charts.dayPeriod" title={t('charts.dayPeriodTitle')} className="gs-card">
        <p className="label">{t('charts.dayPeriodHint')}</p>
        <HeatmapGrid grid={dayPeriodGrid} />
      </CollapsibleCard>

      {(availableTrendModes.length > 1 || availableTrendAgents.length > 1) && (
        <div className="filter-bar">
          {availableTrendModes.length > 1 && (
            <select value={trendModeFilter} onChange={(e) => setTrendModeFilter(e.target.value)}>
              <option value="">{t('stats.allModes')}</option>
              {availableTrendModes.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          )}
          {availableTrendAgents.length > 1 && (
            <select value={trendAgentFilter} onChange={(e) => setTrendAgentFilter(e.target.value)}>
              <option value="">{t('charts.allAgents')}</option>
              {availableTrendAgents.map((agent) => (
                <option key={agent} value={agent}>{agent}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="chart-grid-2">
        <CollapsibleCard id="charts.kdTrend" title={t('charts.kdTrendTitle')} className="gs-card">
          <LineChart data={trend.kd} color="#ff4655" />
        </CollapsibleCard>
        <CollapsibleCard id="charts.winrateTrend" title={t('charts.winrateTrendTitle')} className="gs-card">
          <LineChart data={trend.winrateRolling} color="#3ddc84" unit="%" />
        </CollapsibleCard>
      </div>

      <CollapsibleCard id="charts.mapWinrate" title={t('charts.mapWinrateTitle')} className="gs-card">
        {availableMapModes.length > 1 && (
          <div className="filter-bar">
            <select value={mapModeFilter} onChange={(e) => setMapModeFilter(e.target.value)}>
              <option value="">{t('stats.allModes')}</option>
              {availableMapModes.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>
        )}
        <AnimatedBarList rows={mapWinrates} />
      </CollapsibleCard>

      <CollapsibleCard id="charts.roleDistribution" title={t('charts.roleDistributionTitle')} className="gs-card">
        <RoleStackedBar rows={roleDistribution} />
      </CollapsibleCard>
    </div>
  );
}

export default PerformanceCharts;
