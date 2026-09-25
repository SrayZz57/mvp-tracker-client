import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Swords, Scale, RefreshCw, Target, Info } from 'lucide-react';
import { computePlayerProfile } from './playerProfile.js';
import CollapsibleCard from './CollapsibleCard.jsx';
import Icon from './Icon.jsx';

const SCORE_ICONS = {
  aggression: Swords,
  stability: Scale,
  versatility: RefreshCw,
  clutch: Target,
};

function scoreColor(value) {
  if (value === null) return 'var(--text-muted)';
  if (value >= 66) return '#3ddc84';
  if (value >= 34) return 'var(--warning)';
  return 'var(--accent)';
}

// Radar des quatre scores : un losange dont chaque pointe est un score (haut,
// droite, bas, gauche, dans l'ordre de SCORE_ICONS). Rayon 44 dans un viewBox
// de -60 à 60 : la marge sert aux icônes posées autour, en HTML.
const RADAR_R = 44;
const RADAR_KEYS = Object.keys(SCORE_ICONS);
const AXES = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const diamond = (r) => AXES.map(([x, y]) => `${x * r},${y * r}`).join(' ');

function ScoreRadar({ scores }) {
  const points = RADAR_KEYS.map((key, i) => {
    const r = (RADAR_R * Math.max(scores[key] ?? 0, 4)) / 100;
    return { x: AXES[i][0] * r, y: AXES[i][1] * r, color: scoreColor(scores[key]) };
  });
  return (
    <span className="pa-radar" aria-hidden="true">
      <svg viewBox="-60 -60 120 120">
        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <polygon key={ratio} points={diamond(RADAR_R * ratio)} className="pa-radar-grid" />
        ))}
        {AXES.map(([x, y]) => (
          <line key={`${x}${y}`} x1="0" y1="0" x2={x * RADAR_R} y2={y * RADAR_R} className="pa-radar-grid" />
        ))}
        <polygon points={points.map((p) => `${p.x},${p.y}`).join(' ')} className="pa-radar-shape" />
        {points.map((p, i) => (
          <circle key={RADAR_KEYS[i]} cx={p.x} cy={p.y} r="2.6" fill={p.color} />
        ))}
      </svg>
      {RADAR_KEYS.map((key, i) => (
        <span key={key} className={`pa-radar-icon pa-radar-icon-${i}`}>
          <Icon icon={SCORE_ICONS[key]} size={13} />
        </span>
      ))}
    </span>
  );
}

// Même langage visuel que GlobalStatsCard / AgentStatsCard : panneaux à angles
// coupés, libellés en capitales espacées, gros chiffres. L'archétype (le
// résumé du joueur) prend la place du grand panneau de gauche, avec le radar
// des scores en guise d'image ; les quatre scores deviennent des tuiles avec
// leur jauge inclinée.
function PlayerProfileCard({ settings, matches }) {
  const { t } = useTranslation();
  const profile = useMemo(
    () => computePlayerProfile(matches, settings.name, settings.tag),
    [matches, settings.name, settings.tag],
  );

  if (!profile.ready) {
    return (
      <CollapsibleCard id="profile.adn" title={t('profile.cardTitle')} className="gs-card profile-adn-card">
        <p className="label">
          {t('profile.notReady', { count: profile.minMatches - profile.matchesAnalyzed })}
        </p>
      </CollapsibleCard>
    );
  }

  const archetypeTitle = t(`profile.archetypes.${profile.archetype}.title`);

  return (
    <CollapsibleCard id="profile.adn" title={t('profile.cardTitle')} className="gs-card profile-adn-card">
      <div className="gs-layout pa-layout">
        <div className="gs-agent gs-agent-static pa-hero">
          <span className="gs-agent-text">
            <span className="gs-eyebrow">{t('profile.archetypeLabel')}</span>
            <span className="gs-agent-name">{archetypeTitle}</span>
            <span className="gs-agent-meta pa-text">{t(`profile.archetypes.${profile.archetype}.text`)}</span>
          </span>
          <ScoreRadar scores={profile.scores} />
        </div>

        <div className="gs-figures pa-figures">
          {Object.entries(SCORE_ICONS).map(([key, icon]) => {
            const value = profile.scores[key];
            const infoParams = {
              aggression: {
                count: profile.initiativeRounds,
                rounds: profile.roundsAnalyzed,
                percent: profile.openingWinrate === null ? '?' : profile.openingWinrate.toFixed(0),
              },
              stability: { count: profile.afterLossGames },
              versatility: { count: profile.masteredAgents, total: profile.distinctAgents },
              clutch: { count: profile.clutchAttempts },
            }[key];
            return (
              <div key={key} className="gs-figure pa-figure">
                <button type="button" className="pa-info" aria-label={t('profile.infoLabel')}>
                  <Icon icon={Info} size={14} />
                </button>
                <span className="pa-info-text" role="tooltip">
                  {t(`profile.scoreInfo.${key}`, infoParams)}
                </span>
                <span className="gs-figure-label pa-label">
                  <Icon icon={icon} size={14} /> {t(`profile.scores.${key}`)}
                </span>
                <span className="gs-figure-value">{value === null ? '—' : value.toFixed(0)}</span>
                <span className="pa-bar" aria-hidden="true">
                  <span style={{ width: `${value ?? 4}%`, background: scoreColor(value) }} />
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="label profile-adn-meta">
        {t('profile.basedOn', {
          matches: profile.matchesAnalyzed,
          agents: profile.distinctAgents,
          firstBloods: profile.firstBloods,
          clutches: profile.clutchAttempts,
        })}
      </p>
    </CollapsibleCard>
  );
}

export default PlayerProfileCard;
