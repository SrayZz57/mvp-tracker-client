import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Eye, Moon } from 'lucide-react';
import Icon from '../Icon.jsx';
import { findMe, resultLabel, resultLabelKey, tiltFrequency, excludeDeathmatch } from '../valorantStats.js';
import { computeTiltSignals } from '../tiltSignals.js';
import CountUp from '../CountUp.jsx';
import LoadingState from '../LoadingState.jsx';
import PlatformFilterToggle from '../PlatformFilterToggle.jsx';
import usePlatformFilter from '../usePlatformFilter.js';
import CollapsibleCard from '../CollapsibleCard.jsx';

const STREAK_DOTS_COUNT = 10;
const LEVEL_ICONS = { calm: CheckCircle2, watch: Eye, strong: AlertTriangle, idle: Moon };

function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${minutes} min`;
}

// « 25 min », « 3 h 10 », « 2 jours » : depuis combien de temps tu n'as pas joué.
function formatAgo(ms, t) {
  if (ms >= 48 * 3600000) return t('tilt.agoDays', { count: Math.floor(ms / (24 * 3600000)) });
  return formatDuration(ms);
}

// Valeur et référence affichées pour chaque signal — la mesure observée, puis ce
// à quoi on la compare. Un signal « na » n'a pas assez de données pour conclure.
function describeSignal(signal, t) {
  if (signal.status === 'na') {
    return { value: '?', reference: signal.id === 'session' ? t('tilt.noSession') : t('tilt.notEnough') };
  }
  const usual = (text) => `${t('tilt.refUsual', { value: text })}${signal.lowReference ? ' *' : ''}`;
  const pct = (v) => `${Math.round(v)}%`;
  switch (signal.id) {
    case 'lossStreak':
      return { value: String(signal.value), reference: t('tilt.refThreshold', { count: signal.reference }) };
    case 'kd':
      return { value: signal.value.toFixed(2), reference: usual(signal.reference.toFixed(2)) };
    case 'firstDeaths':
      return { value: pct(signal.value * 100), reference: usual(pct(signal.reference * 100)) };
    case 'hs':
    case 'winrate':
      return { value: pct(signal.value), reference: usual(pct(signal.reference)) };
    default:
      return { value: formatDuration(signal.value), reference: t('tilt.refSession', { count: signal.session.games }) };
  }
}

function TiltTab({ settings, matches, loading }) {
  const { t } = useTranslation();
  const { platforms, platform, setPlatform, filteredMatches } = usePlatformFilter(matches);

  const analysis = useMemo(
    () => computeTiltSignals(filteredMatches, settings.name, settings.tag),
    [filteredMatches, settings.name, settings.tag],
  );

  const recentResults = useMemo(
    () =>
      excludeDeathmatch(filteredMatches)
        .slice(0, STREAK_DOTS_COUNT)
        .map((match) => {
          const me = findMe(match, settings.name, settings.tag);
          return { id: match.metadata?.matchid, label: resultLabel(match, me), map: match.metadata?.map };
        }),
    [filteredMatches, settings.name, settings.tag],
  );

  const frequency = useMemo(
    () => tiltFrequency(filteredMatches, settings.name, settings.tag),
    [filteredMatches, settings.name, settings.tag],
  );

  if (matches.length === 0) {
    if (loading) return <LoadingState />;
    return <p>{t('tilt.noMatchesYet')}</p>;
  }

  const lit = analysis.signals.filter((s) => s.status === 'alert' || s.status === 'watch');
  const ago = analysis.idle ? formatAgo(analysis.idleMs, t) : null;
  const anyLowReference = analysis.signals.some((s) => s.lowReference && s.status !== 'na');

  return (
    <div>
      <PlatformFilterToggle platforms={platforms} platform={platform} onChange={setPlatform} />

      <div className={`card tilt-card ${analysis.level === 'calm' || analysis.level === 'idle' ? 'calm' : ''}`} data-level={analysis.level}>
        <div className="tilt-card-header">
          <span className="tilt-card-badge"><Icon icon={LEVEL_ICONS[analysis.level]} /></span>
          <div>
            <h3>{t(`tilt.level.${analysis.level}.title`)}</h3>
            <p className={analysis.level === 'strong' ? 'warning' : ''}>{t(`tilt.level.${analysis.level}.text`, { ago })}</p>
            {lit.length > 0 && (
              <p className="tilt-lit">
                {t(analysis.idle ? 'tilt.litSignalsIdle' : 'tilt.litSignals')} {lit.map((s) => t(`tilt.signals.${s.id}.label`)).join(' · ')}
              </p>
            )}
            <p className="tilt-disclaimer">{t('tilt.disclaimer')}</p>
          </div>
        </div>
      </div>

      <CollapsibleCard id="tilt.signals" title={t('tilt.signalsTitle')} className="gs-card">
        <p className="label">{analysis.idle ? t('tilt.signalsIntroIdle', { ago }) : t('tilt.signalsIntro')}</p>
        <div className="tilt-signals">
          {analysis.signals.map((signal) => {
            const { value, reference } = describeSignal(signal, t);
            return (
              <div key={signal.id} className="tilt-signal" data-status={signal.status}>
                <span className="tilt-signal-dot" aria-hidden="true" />
                <div className="tilt-signal-main">
                  <b>{t(`tilt.signals.${signal.id}.label`)}</b>
                  <small>{t(`tilt.signals.${signal.id}.hint`)}</small>
                </div>
                <div className="tilt-signal-values">
                  <strong>{value}</strong>
                  <small>{reference}</small>
                </div>
                <span className="tilt-signal-status">{t(`tilt.status.${signal.status}`)}</span>
              </div>
            );
          })}
        </div>
        {analysis.lowData && <p className="tilt-note">{t('tilt.lowDataNote', { count: analysis.matchCount })}</p>}
        {anyLowReference && <p className="tilt-note">{t('tilt.lowReferenceNote')}</p>}
      </CollapsibleCard>

      <CollapsibleCard id="tilt.recentResults" title={t('tilt.recentResults')} className="gs-card">
        <div className="streak-dots">
          {recentResults.map((r) => (
            <span
              key={r.id}
              className={`streak-dot ${r.label === 'Victoire' ? 'win' : r.label === 'Défaite' ? 'loss' : 'neutral'}`}
              title={`${r.map ?? '?'} — ${resultLabelKey(r.label) ? t(resultLabelKey(r.label)) : r.label}`}
            />
          ))}
        </div>
        <p className="label" style={{ marginTop: '0.5rem' }}>
          {t('tilt.dotsHint')}
        </p>
      </CollapsibleCard>

      <CollapsibleCard id="tilt.frequency" title={t('tilt.frequencyTitle')} className="gs-card">
        {frequency.total === 0 ? (
          <p className="label">{t('tilt.notEnoughMatches')}</p>
        ) : (
          <>
            <div className="gs-figures fm-figures fm-figures-3">
              <div className="gs-figure">
                <span className="gs-figure-label">{t('tilt.tiltedMatchesPercent')}</span>
                <span className={`gs-figure-value ${frequency.percent >= 20 ? 'down' : ''}`}>
                  <CountUp value={frequency.percent} decimals={1} suffix="%" />
                </span>
              </div>
              <div className="gs-figure">
                <span className="gs-figure-label">{t('tilt.matchesInTiltStreak')}</span>
                <span className="gs-figure-value"><CountUp value={frequency.tiltedCount} /></span>
              </div>
              <div className="gs-figure">
                <span className="gs-figure-label">{t('tilt.totalMatchesAnalyzed')}</span>
                <span className="gs-figure-value"><CountUp value={frequency.total} /></span>
              </div>
            </div>
            <p className="label" style={{ marginTop: '0.75rem' }}>
              {t('tilt.frequencyHint')}
            </p>
          </>
        )}
      </CollapsibleCard>
    </div>
  );
}

export default TiltTab;
