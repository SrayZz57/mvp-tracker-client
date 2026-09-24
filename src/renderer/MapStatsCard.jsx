import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CollapsibleCard from './CollapsibleCard.jsx';

const PODIUM_SIZE = 3;
const LIST_PREVIEW = 10;

const kdaText = (row) => `${row.avgKills.toFixed(1)} / ${row.avgDeaths.toFixed(1)} / ${row.avgAssists.toFixed(1)}`;
const toneOf = (winrate) => (winrate === null ? '' : winrate >= 50 ? 'good' : 'bad');

// Même langage visuel que AgentStatsCard / WeaponStatsCard : podium des trois
// maps les plus jouées avec leur visuel, puis les autres en liste compacte.
function MapStatsCard({ title, rows, mapImages, onMapClick }) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);

  if (rows.length === 0) {
    return (
      <CollapsibleCard id="stats.statsByMap" title={title}>
        <p>{t('stats.noDataYet')}</p>
      </CollapsibleCard>
    );
  }

  const podium = rows.slice(0, PODIUM_SIZE);
  const rest = rows.slice(PODIUM_SIZE);
  const visibleRest = showAll ? rest : rest.slice(0, LIST_PREVIEW);

  return (
    <CollapsibleCard id="stats.statsByMap" title={title} className="ws-card">
      <div className="ws-podium">
        {podium.map((row, i) => (
          <button key={row.key} type="button" className="ws-top as-top ms-top" onClick={() => onMapClick(row.key)}>
            <span className="ws-top-rank" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            {mapImages.get(row.key) && <img src={mapImages.get(row.key)} alt="" className="ms-top-art" />}
            <span className="ws-top-info as-top-info">
              <span className="ws-top-name">{row.key}</span>
              <span className={`ws-top-count as-top-winrate ${toneOf(row.winrate)}`}>
                {row.winrate === null ? '?' : `${row.winrate.toFixed(0)} %`}
              </span>
              <span className="ws-top-sub">{t('stats.globalWins')}</span>
              <span className="as-top-lines">
                <span>{t('stats.gamesCount', { count: row.games })}</span>
                <span>K/D/A {kdaText(row)}</span>
              </span>
            </span>
          </button>
        ))}
      </div>

      {rest.length > 0 && (
        <>
          <div className="ws-list">
            {visibleRest.map((row, i) => (
              <button key={row.key} type="button" className="ws-row as-row ms-row" onClick={() => onMapClick(row.key)}>
                <span className="ws-row-rank">{PODIUM_SIZE + i + 1}</span>
                <span className="ms-row-thumb">
                  {mapImages.get(row.key) && <img src={mapImages.get(row.key)} alt="" />}
                </span>
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
              {showAll ? t('stats.mapShowLess') : t('stats.mapShowAll', { count: rest.length - LIST_PREVIEW })}
            </button>
          )}
        </>
      )}
    </CollapsibleCard>
  );
}

export default MapStatsCard;
