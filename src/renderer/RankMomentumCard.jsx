import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { computeRankMomentum } from './rankMomentum.js';
import CollapsibleCard from './CollapsibleCard.jsx';

function fmt(value, suffix = '') {
  return value === null ? '?' : `${value.toFixed(value < 10 ? 2 : 0)}${suffix}`;
}

// Écart forme récente / habituel, avec sa flèche : c'est l'information utile
// de ces trois chiffres, pas seulement les deux valeurs côte à côte.
function Delta({ recent, baseline, suffix }) {
  if (recent === null || baseline === null) return null;
  const diff = recent - baseline;
  if (Math.abs(diff) < (suffix ? 0.5 : 0.005)) return null;
  const up = diff > 0;
  const text = `${up ? '+' : '−'}${Math.abs(diff).toFixed(suffix ? 0 : 2)}${suffix}`;
  return <span className={`mc-delta ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {text}</span>;
}

function MomentumFigure({ label, recent, baseline, suffix = '', vsLabel }) {
  return (
    <div className="gs-figure mc-figure">
      <span className="gs-figure-label">{label}</span>
      <span className="mc-figure-row">
        <span className="gs-figure-value">{fmt(recent, suffix)}</span>
        <Delta recent={recent} baseline={baseline} suffix={suffix} />
      </span>
      <span className="gs-figure-sub">{vsLabel}</span>
    </div>
  );
}

function RankMomentumCard({ settings, matches }) {
  const { t } = useTranslation();
  const momentum = useMemo(
    () => computeRankMomentum(matches, settings.name, settings.tag),
    [matches, settings.name, settings.tag],
  );

  if (!momentum.ready) {
    return (
      <CollapsibleCard id="rankMomentum" title={t('rankMomentum.title')}>
        <p className="label">
          {t('rankMomentum.notReady', { count: momentum.minGames - momentum.gamesAnalyzed })}
        </p>
      </CollapsibleCard>
    );
  }

  const { recentStats, baselineStats } = momentum;

  return (
    <CollapsibleCard id="rankMomentum" title={t('rankMomentum.title')}>
      <p className={`mc-verdict ${momentum.trending ? 'trending' : ''}`}>
        {momentum.trending ? t('rankMomentum.trending') : t('rankMomentum.stable')}
      </p>

      <div className="mc-grid">
        <MomentumFigure
          label={t('rankMomentum.kdVsUsual')}
          recent={recentStats.kd}
          baseline={baselineStats.kd}
          vsLabel={t('rankMomentum.vs', { value: fmt(baselineStats.kd) })}
        />
        <MomentumFigure
          label={t('rankMomentum.winrateVsUsual')}
          recent={recentStats.winrate}
          baseline={baselineStats.winrate}
          suffix="%"
          vsLabel={t('rankMomentum.vs', { value: fmt(baselineStats.winrate, '%') })}
        />
        <MomentumFigure
          label={t('rankMomentum.accuracyVsUsual')}
          recent={recentStats.hsPercent}
          baseline={baselineStats.hsPercent}
          suffix="%"
          vsLabel={t('rankMomentum.vs', { value: fmt(baselineStats.hsPercent, '%') })}
        />
      </div>

      <p className="label mc-hint">{t('rankMomentum.hint')}</p>
    </CollapsibleCard>
  );
}

export default RankMomentumCard;
