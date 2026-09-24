import { useTranslation } from 'react-i18next';
import CollapsibleCard from './CollapsibleCard.jsx';

const toneOf = (winrate) => (winrate === null ? 'none' : winrate >= 50 ? 'good' : 'bad');

// Blocs "Stats par rôle" et "Stats par mode" : peu de lignes, donc une grille de
// panneaux plutôt qu'un podium. Même langage que les autres blocs de stats
// (panneaux chanfreinés, liseré rouge, barres inclinées).
function GroupStatsCard({ id, title, rows, icons }) {
  const { t } = useTranslation();

  return (
    <CollapsibleCard id={id} title={title} className="ws-card">
      {rows.length === 0 ? (
        <p>{t('stats.noDataYet')}</p>
      ) : (
        <div className="gt-grid">
          {rows.map((row) => (
            <div key={row.key} className="ws-top gt-tile">
              <span className="ws-top-name gt-name">
                {icons?.get(row.key) && <img src={icons.get(row.key)} alt="" className="gt-icon" />}
                {row.key}
              </span>
              <span className={`ws-top-count as-top-winrate ${toneOf(row.winrate)}`}>
                {row.winrate === null ? '?' : `${row.winrate.toFixed(0)} %`}
              </span>
              <span className={`ws-bar as-row-bar ${toneOf(row.winrate)}`}>
                <span style={{ width: `${row.winrate ?? 4}%` }} />
              </span>
              <span className="as-top-lines">
                <span>{t('stats.gamesCount', { count: row.games })}</span>
                <span>
                  K/D/A {row.avgKills.toFixed(1)} / {row.avgDeaths.toFixed(1)} / {row.avgAssists.toFixed(1)}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}

export default GroupStatsCard;
