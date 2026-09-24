import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import CollapsibleCard from './CollapsibleCard.jsx';
import { excludeDeathmatch, findMe, formStats, resultLabel } from './valorantStats.js';

const pct = (value, digits = 0) => (value === null || value === undefined ? '—' : `${value.toFixed(digits)} %`);

// Bilan global du compte : l'agent le plus joué à gauche, les chiffres qui
// comptent à droite, puis la répartition des tirs. Les armes ont leur propre
// bloc (voir StatsTab) — celui-ci ne garde que ce qui résume le joueur.
function GlobalStatsCard({ title, matches, settings, globalStats, topAgent, portrait, icon, onAgentClick }) {
  const { t } = useTranslation();

  const summary = useMemo(() => {
    const played = excludeDeathmatch(matches);
    let wins = 0;
    let losses = 0;
    played.forEach((match) => {
      const me = findMe(match, settings.name, settings.tag);
      if (!me) return;
      const label = resultLabel(match, me);
      if (label === 'Victoire') wins += 1;
      else if (label === 'Défaite') losses += 1;
    });
    const decided = wins + losses;
    return {
      wins,
      losses,
      winrate: decided > 0 ? (wins / decided) * 100 : null,
      kd: formStats(played, settings.name, settings.tag).overallKd,
    };
  }, [matches, settings.name, settings.tag]);

  const { hsPercent, bsPercent, lsPercent, kast } = globalStats;
  const hasShots = hsPercent !== null;
  const decided = summary.wins + summary.losses;

  return (
    <CollapsibleCard id="stats.globalStats" title={title} className="gs-card">
      <div className="gs-layout">
        {topAgent ? (
          <button type="button" className="gs-agent" onClick={() => onAgentClick(topAgent.key)}>
            <span className="gs-agent-ghost" aria-hidden="true">{topAgent.key}</span>
            {portrait && <img src={portrait} alt="" className="gs-agent-art" />}
            <span className="gs-agent-text">
              <span className="gs-eyebrow">{t('stats.globalTopAgent')}</span>
              <span className="gs-agent-name">
                {icon && <img src={icon} alt="" className="gs-agent-icon" />}
                {topAgent.key}
              </span>
              <span className="gs-agent-meta">{t('stats.gamesCount', { count: topAgent.games })}</span>
              <span className="gs-agent-line">
                <strong>{pct(topAgent.winrate)}</strong> {t('stats.globalWins')}
              </span>
              <span className="gs-agent-line">
                <strong>{topAgent.avgDeaths > 0 ? (topAgent.avgKills / topAgent.avgDeaths).toFixed(2) : '—'}</strong> K/D
              </span>
            </span>
          </button>
        ) : (
          <div className="gs-agent gs-agent-empty">{t('stats.noDataYet')}</div>
        )}

        <div className="gs-figures">
          <div className="gs-figure gs-figure-wide">
            <span className="gs-figure-label">{t('stats.globalWins')}</span>
            <span className="gs-figure-value">{pct(summary.winrate)}</span>
            {decided > 0 && (
              <>
                <span className="gs-record" aria-hidden="true">
                  <span className="gs-record-win" style={{ width: `${(summary.wins / decided) * 100}%` }} />
                  <span className="gs-record-loss" style={{ width: `${(summary.losses / decided) * 100}%` }} />
                </span>
                <span className="gs-figure-sub">{t('stats.globalRecord', { wins: summary.wins, losses: summary.losses })}</span>
              </>
            )}
          </div>
          <div className="gs-figure">
            <span className="gs-figure-label">{t('stats.globalGames')}</span>
            <span className="gs-figure-value">{summary.wins + summary.losses}</span>
            <span className="gs-figure-sub">{t('stats.globalGamesSub')}</span>
          </div>
          <div className="gs-figure">
            <span className="gs-figure-label">K/D</span>
            <span className="gs-figure-value">{summary.kd === null ? '—' : summary.kd.toFixed(2)}</span>
          </div>
          <div className="gs-figure">
            <span className="gs-figure-label">{t('stats.kast')}</span>
            <span className="gs-figure-value">{pct(kast)}</span>
          </div>

          <div className="gs-shots">
            <span className="gs-figure-label">{t('stats.globalAccuracy')}</span>
            {hasShots ? (
              <>
                <span className="gs-shots-bar" aria-hidden="true">
                  <span className="gs-shots-head" style={{ width: `${hsPercent}%` }} />
                  <span className="gs-shots-body" style={{ width: `${bsPercent}%` }} />
                  <span className="gs-shots-legs" style={{ width: `${lsPercent}%` }} />
                </span>
                <span className="gs-shots-legend">
                  <span><i className="gs-shots-head" />{t('stats.head')} <strong>{pct(hsPercent, 1)}</strong></span>
                  <span><i className="gs-shots-body" />{t('stats.body')} <strong>{pct(bsPercent, 1)}</strong></span>
                  <span><i className="gs-shots-legs" />{t('stats.legs')} <strong>{pct(lsPercent, 1)}</strong></span>
                </span>
              </>
            ) : (
              <span className="gs-figure-sub">—</span>
            )}
          </div>
        </div>
      </div>
    </CollapsibleCard>
  );
}

export default GlobalStatsCard;
