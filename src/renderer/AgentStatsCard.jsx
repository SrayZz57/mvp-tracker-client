import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CollapsibleCard from './CollapsibleCard.jsx';
import { weaponKillsForAgent, agentTotalKills } from './valorantStats.js';

const PODIUM_SIZE = 3;
const LIST_PREVIEW = 10;

const kdaText = (row) => `${row.avgKills.toFixed(1)} / ${row.avgDeaths.toFixed(1)} / ${row.avgAssists.toFixed(1)}`;
const toneOf = (winrate) => (winrate === null ? '' : winrate >= 50 ? 'good' : 'bad');

// Même langage visuel que WeaponStatsCard / GlobalStatsCard : podium des trois
// agents les plus joués avec leur portrait, puis les autres en liste compacte.
function AgentStatsCard({ title, rows, portraits, icons, matches, settings, onAgentClick }) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);

  const podium = rows.slice(0, PODIUM_SIZE);
  const rest = rows.slice(PODIUM_SIZE);
  const visibleRest = showAll ? rest : rest.slice(0, LIST_PREVIEW);

  const podiumExtras = useMemo(
    () =>
      podium.map((row) => ({
        kills: agentTotalKills(matches, settings.name, settings.tag, row.key),
        topWeapon: weaponKillsForAgent(matches, settings.name, settings.tag, row.key)[0]?.[0] ?? null,
      })),
    // `podium` change à chaque rendu : ses clés suffisent à savoir s'il faut recalculer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matches, settings.name, settings.tag, podium.map((row) => row.key).join('|')],
  );

  if (rows.length === 0) {
    return (
      <CollapsibleCard id="stats.statsByAgent" title={title}>
        <p>{t('stats.noDataYet')}</p>
      </CollapsibleCard>
    );
  }

  return (
    <CollapsibleCard id="stats.statsByAgent" title={title} className="ws-card">
      <div className="ws-podium">
        {podium.map((row, i) => (
          <button key={row.key} type="button" className="ws-top as-top" onClick={() => onAgentClick(row.key)}>
            <span className="ws-top-rank" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            {portraits.get(row.key) && <img src={portraits.get(row.key)} alt="" className="as-top-art" />}
            <span className="ws-top-info as-top-info">
              <span className="ws-top-name as-top-name">
                {icons.get(row.key) && <img src={icons.get(row.key)} alt="" className="as-top-icon" />}
                {row.key}
              </span>
              <span className={`ws-top-count as-top-winrate ${toneOf(row.winrate)}`}>
                {row.winrate === null ? '?' : `${row.winrate.toFixed(0)} %`}
              </span>
              <span className="ws-top-sub">{t('stats.globalWins')}</span>
              <span className="as-top-lines">
                <span>{t('stats.gamesCount', { count: row.games })}</span>
                <span>K/D/A {kdaText(row)}</span>
                <span>{t('stats.killsCount', { count: podiumExtras[i].kills })}</span>
                {podiumExtras[i].topWeapon && (
                  <span>{t('stats.favoriteWeapon', { weapon: podiumExtras[i].topWeapon })}</span>
                )}
              </span>
            </span>
          </button>
        ))}
      </div>

      {rest.length > 0 && (
        <>
          <div className="ws-list">
            {visibleRest.map((row, i) => (
              <button key={row.key} type="button" className="ws-row as-row" onClick={() => onAgentClick(row.key)}>
                <span className="ws-row-rank">{PODIUM_SIZE + i + 1}</span>
                <span className="ws-row-icon">{icons.get(row.key) && <img src={icons.get(row.key)} alt="" />}</span>
                <span className="ws-row-name">{row.key}</span>
                <span className={`ws-bar ws-row-bar as-row-bar ${toneOf(row.winrate)}`}>
                  <span style={{ width: `${row.winrate ?? 4}%` }} />
                </span>
                <span className="as-row-winrate">{row.winrate === null ? '?' : `${row.winrate.toFixed(0)} %`}</span>
                <span className="ws-row-count">{t('stats.gamesCount', { count: row.games })}</span>
              </button>
            ))}
          </div>
          {rest.length > LIST_PREVIEW && (
            <button type="button" className="ws-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? t('stats.agentShowLess') : t('stats.agentShowAll', { count: rest.length - LIST_PREVIEW })}
            </button>
          )}
        </>
      )}
    </CollapsibleCard>
  );
}

export default AgentStatsCard;
