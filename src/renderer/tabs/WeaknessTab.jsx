import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Dumbbell, Flag, Gamepad2, HelpCircle } from 'lucide-react';
import Icon from '../Icon.jsx';
import { computePlayerProfile, WEAKNESS_RECOMMENDATIONS } from '../playerProfile.js';
import { deathTimingStats, overallHsPercent, excludeDeathmatch } from '../valorantStats.js';
import CollapsibleCard from '../CollapsibleCard.jsx';

// Page « Points à travailler » (Mon compte). Pas de conseils génériques : pour
// chaque axe du Profil ADN elle montre le vrai chiffre du joueur, l'objectif
// suivant, la tendance (20 derniers matchs comparés aux 20 précédents) et un
// plan en trois temps — s'entraîner, en partie, objectif mesurable.
//
// L'ordre est celui des vrais scores, sans le mélange journalier de
// getWeaknesses() : un plan de progression doit rester stable d'un jour à l'autre.
// settings/matches viennent toujours du compte lié (mySettings/myMatches).

const WEAK_BELOW = 50;
const STRONG_FROM = 66;
const TREND_WINDOW = 20;
const TREND_DEAD_ZONE = 5; // écart (en points de score) en dessous duquel on parle de « stable »

const round = (value) => Math.round(value);

// Valeur réelle affichée pour chaque axe, et prochain palier à viser.
const AXIS_METRICS = {
  aim: { target: (v) => Math.min(40, round(v) + 4) },
  positioning: { target: (v) => Math.max(15, round(v) - 4) },
  aggression: { target: (v) => Math.min(40, round(v) + 5) },
  stability: { target: () => 70 },
  versatility: { target: (v) => v + 1 },
  clutch: { target: (v) => Math.min(60, round(v) + 5) },
};

function axisStatus(score) {
  if (score >= STRONG_FROM) return 'strong';
  if (score >= WEAK_BELOW) return 'ok';
  return 'weak';
}

function TrendChip({ delta, t }) {
  if (delta === null) {
    return (
      <span className="wk-trend wk-trend-none" title={t('profile.plan.trendNone')}>
        —
      </span>
    );
  }
  if (delta >= TREND_DEAD_ZONE) {
    return (
      <span className="wk-trend wk-trend-up">
        <Icon icon={ArrowUpRight} size={14} /> {t('profile.plan.trendUp', { value: round(delta) })}
      </span>
    );
  }
  if (delta <= -TREND_DEAD_ZONE) {
    return (
      <span className="wk-trend wk-trend-down">
        <Icon icon={ArrowDownRight} size={14} /> {t('profile.plan.trendDown', { value: round(Math.abs(delta)) })}
      </span>
    );
  }
  return (
    <span className="wk-trend wk-trend-flat">
      <Icon icon={ArrowRight} size={14} /> {t('profile.plan.trendFlat')}
    </span>
  );
}

function ScoreBar({ score }) {
  return (
    <span className="wk-bar" aria-hidden="true">
      <span className={`wk-bar-fill ${axisStatus(score)}`} style={{ width: `${Math.max(3, Math.min(100, score))}%` }} />
      <span className="wk-bar-tick" style={{ left: '34%' }} />
      <span className="wk-bar-tick" style={{ left: '66%' }} />
    </span>
  );
}

// Les trois temps du plan d'un axe. `priority` agrandit le bloc (axe n°1).
function PlanSteps({ axis, onNavigate, t }) {
  const key = axis.dimension;
  const tips = t(`profile.plan.dims.${key}.tips`, { returnObjects: true });
  const rec = WEAKNESS_RECOMMENDATIONS[key];
  return (
    <div className="wk-steps">
      <div className="wk-step">
        <span className="wk-step-label"><Icon icon={Dumbbell} size={14} /> {t('profile.plan.stepTrain')}</span>
        <p>{t(`profile.plan.dims.${key}.train`)}</p>
        <button type="button" className="refresh" onClick={() => onNavigate(rec.tab, rec.mode)}>
          {t(`profile.weakness.${key}.action`)}
        </button>
      </div>
      <div className="wk-step">
        <span className="wk-step-label"><Icon icon={Gamepad2} size={14} /> {t('profile.plan.stepPlay')}</span>
        <ul>
          {(Array.isArray(tips) ? tips : []).map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>
      <div className="wk-step">
        <span className="wk-step-label"><Icon icon={Flag} size={14} /> {t('profile.plan.stepGoal')}</span>
        <p className="wk-goal">
          {t(`profile.plan.dims.${key}.goal`, { current: axis.metricLabel, target: axis.targetLabel })}
        </p>
      </div>
    </div>
  );
}

function WeaknessTab({ settings, matches, onNavigate }) {
  const { t } = useTranslation();
  const [openInfo, setOpenInfo] = useState(null); // axe dont l'explication est ouverte

  const analysis = useMemo(() => {
    const profile = computePlayerProfile(matches, settings.name, settings.tag);
    if (!profile.ready) return { profile };

    const ranked = excludeDeathmatch(matches);
    const hs = overallHsPercent(ranked, settings.name, settings.tag);
    const timing = deathTimingStats(ranked, settings.name, settings.tag);
    const early = timing.buckets.find((b) => b.id === 'early')?.percent ?? null;
    const initiative = profile.roundsAnalyzed > 0 ? (profile.initiativeRounds / profile.roundsAnalyzed) * 100 : null;

    // Chiffres réellement utilisés par chaque explication (« ? » de la vue d'ensemble).
    const infoParams = {
      aim: { value: hs === null ? '—' : round(hs) },
      positioning: { value: early === null ? '—' : round(early), count: timing.total },
      aggression: {
        count: profile.initiativeRounds,
        rounds: profile.roundsAnalyzed,
        percent: profile.openingWinrate === null || profile.openingWinrate === undefined ? '—' : round(profile.openingWinrate),
      },
      stability: { count: profile.afterLossGames },
      versatility: { count: profile.masteredAgents, total: profile.distinctAgents },
      clutch: { count: profile.clutchAttempts },
    };

    const metricValues = {
      aim: hs,
      positioning: early,
      aggression: initiative,
      stability: profile.scores.stability,
      versatility: profile.masteredAgents,
      clutch: profile.scores.clutch,
    };

    // Tendance : les 20 derniers matchs comparés aux 20 précédents (les parties
    // sont classées de la plus récente à la plus ancienne).
    const recent = computePlayerProfile(matches.slice(0, TREND_WINDOW), settings.name, settings.tag);
    const previous = computePlayerProfile(matches.slice(TREND_WINDOW, TREND_WINDOW * 2), settings.name, settings.tag);
    const canCompare = recent.ready && previous.ready;

    const axes = Object.entries(profile.scores)
      .filter(([, score]) => score !== null)
      .map(([dimension, score]) => {
        const metric = metricValues[dimension];
        const spec = AXIS_METRICS[dimension];
        const usable = metric !== null && metric !== undefined;
        const delta =
          canCompare && recent.scores[dimension] !== null && previous.scores[dimension] !== null
            ? recent.scores[dimension] - previous.scores[dimension]
            : null;
        return {
          dimension,
          score: round(score),
          status: axisStatus(score),
          metricLabel: usable ? String(round(metric)) : '—',
          targetLabel: usable ? String(spec.target(metric)) : '—',
          delta,
          infoParams: infoParams[dimension],
        };
      })
      .sort((a, b) => a.score - b.score);

    return { profile, axes };
  }, [matches, settings.name, settings.tag]);

  if (!analysis.profile.ready) {
    return (
      <CollapsibleCard id="profile.weaknessTab" title={t('profile.weakness.title')} className="gs-card">
        <p className="label">
          {t('profile.notReady', { count: analysis.profile.minMatches - analysis.profile.matchesAnalyzed })}
        </p>
      </CollapsibleCard>
    );
  }

  const { axes } = analysis;
  const weakAxes = axes.filter((a) => a.status === 'weak');
  const priority = axes[0];
  const otherWeak = weakAxes.filter((a) => a.dimension !== priority?.dimension).slice(0, 3);
  const strongAxes = axes.filter((a) => a.status === 'strong');

  if (!priority) return null;

  return (
    <div className="wk-page">
      <div className={`card gs-card wk-hero wk-${priority.status}`}>
        <span className="gs-eyebrow">
          {priority.status === 'weak' ? t('profile.plan.priorityLabel') : t('profile.plan.nextStepLabel')}
        </span>
        <div className="wk-hero-head">
          <div>
            <h2 className="wk-hero-title">{t(`profile.plan.dims.${priority.dimension}.name`)}</h2>
            <p className="wk-hero-text">{t(`profile.plan.dims.${priority.dimension}.measures`)}</p>
          </div>
          <div className="wk-hero-score">
            <span className="wk-score-value">{priority.score}<small>/100</small></span>
            <ScoreBar score={priority.score} />
            <TrendChip delta={priority.delta} t={t} />
          </div>
        </div>
        <PlanSteps axis={priority} onNavigate={onNavigate} t={t} />
      </div>

      {otherWeak.length > 0 && (
        <CollapsibleCard id="profile.weakness.others" title={t('profile.plan.otherWeak')} className="gs-card">
          <div className="wk-others">
            {otherWeak.map((axis) => (
              <div key={axis.dimension} className="wk-other">
                <div className="wk-other-head">
                  <h3>{t(`profile.plan.dims.${axis.dimension}.name`)}</h3>
                  <span className="wk-other-score">{axis.score}/100</span>
                  <TrendChip delta={axis.delta} t={t} />
                </div>
                <p className="wk-hero-text">{t(`profile.plan.dims.${axis.dimension}.measures`)}</p>
                <PlanSteps axis={axis} onNavigate={onNavigate} t={t} />
              </div>
            ))}
          </div>
        </CollapsibleCard>
      )}

      <CollapsibleCard id="profile.weakness.overview" title={t('profile.plan.allAxes')} className="gs-card">
        <div className="wk-axes">
          {axes.map((axis) => {
            const isOpen = openInfo === axis.dimension;
            return (
              <div key={axis.dimension} className="wk-axis-wrap">
                <div className="wk-axis">
                  <span className="wk-axis-name">
                    {t(`profile.plan.dims.${axis.dimension}.name`)}
                    <button
                      type="button"
                      className={isOpen ? 'wk-help active' : 'wk-help'}
                      aria-expanded={isOpen}
                      aria-label={t('profile.plan.infoButton')}
                      title={t('profile.plan.infoButton')}
                      onClick={() => setOpenInfo(isOpen ? null : axis.dimension)}
                    >
                      <Icon icon={HelpCircle} size={14} />
                    </button>
                  </span>
                  <ScoreBar score={axis.score} />
                  <span className="wk-axis-score">{axis.score}</span>
                  <TrendChip delta={axis.delta} t={t} />
                  <span className={`wk-status wk-status-${axis.status}`}>{t(`profile.plan.status.${axis.status}`)}</span>
                </div>
                {isOpen && (
                  <div className="wk-info">
                    <div>
                      <span className="wk-step-label">{t('profile.plan.measuresLabel')}</span>
                      <p>{t(`profile.plan.dims.${axis.dimension}.measures`)}</p>
                    </div>
                    <div>
                      <span className="wk-step-label">{t('profile.plan.howLabel')}</span>
                      <p>{t(`profile.plan.dims.${axis.dimension}.how`, axis.infoParams)}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="label wk-note">
          {axes.some((a) => a.delta !== null) ? t('profile.plan.trendNote', { count: TREND_WINDOW }) : t('profile.plan.trendNeedsMore', { count: TREND_WINDOW * 2 })}
        </p>
        {strongAxes.length > 0 && (
          <p className="label wk-note">
            {t('profile.plan.strengths', {
              axes: strongAxes.map((a) => t(`profile.plan.dims.${a.dimension}.name`)).join(', '),
            })}
          </p>
        )}
      </CollapsibleCard>
    </div>
  );
}

export default WeaknessTab;
