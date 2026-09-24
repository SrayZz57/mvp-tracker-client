import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CollapsibleCard from './CollapsibleCard.jsx';

const PODIUM_SIZE = 3;
const LIST_PREVIEW = 10;

// Podium des trois armes les plus utilisées, puis le reste en liste compacte.
// Même langage visuel que GlobalStatsCard (panneaux chanfreinés, liseré rouge,
// barres inclinées).
function WeaponStatsCard({ title, ranking, icons, onWeaponClick }) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);

  if (ranking.length === 0) {
    return (
      <CollapsibleCard id="stats.weaponStats" title={title}>
        <p>{t('stats.noWeaponData')}</p>
      </CollapsibleCard>
    );
  }

  const total = ranking.reduce((sum, [, count]) => sum + count, 0);
  const max = ranking[0][1];
  const podium = ranking.slice(0, PODIUM_SIZE);
  const rest = ranking.slice(PODIUM_SIZE);
  const visibleRest = showAll ? rest : rest.slice(0, LIST_PREVIEW);
  const share = (count) => ((count / total) * 100).toFixed(count / total < 0.1 ? 1 : 0);

  return (
    <CollapsibleCard id="stats.weaponStats" title={title} className="ws-card">
      <div className="ws-podium">
        {podium.map(([weapon, count], i) => (
          <button key={weapon} type="button" className="ws-top" onClick={() => onWeaponClick(weapon)}>
            <span className="ws-top-rank" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            {icons.get(weapon) && <img src={icons.get(weapon)} alt="" className="ws-top-icon" />}
            <span className="ws-top-info">
              <span className="ws-top-name">{weapon}</span>
              <span className="ws-top-count">{count}</span>
              <span className="ws-top-sub">{t('stats.weaponShare', { percent: share(count) })}</span>
              <span className="ws-bar"><span style={{ width: `${(count / max) * 100}%` }} /></span>
            </span>
          </button>
        ))}
      </div>

      {rest.length > 0 && (
        <>
          <div className="ws-list">
            {visibleRest.map(([weapon, count], i) => (
              <button key={weapon} type="button" className="ws-row" onClick={() => onWeaponClick(weapon)}>
                <span className="ws-row-rank">{PODIUM_SIZE + i + 1}</span>
                <span className="ws-row-icon">{icons.get(weapon) && <img src={icons.get(weapon)} alt="" />}</span>
                <span className="ws-row-name">{weapon}</span>
                <span className="ws-bar ws-row-bar"><span style={{ width: `${(count / max) * 100}%` }} /></span>
                <span className="ws-row-count">{t('stats.killsCount', { count })}</span>
              </button>
            ))}
          </div>
          {rest.length > LIST_PREVIEW && (
            <button type="button" className="ws-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? t('stats.weaponShowLess') : t('stats.weaponShowAll', { count: rest.length })}
            </button>
          )}
        </>
      )}
    </CollapsibleCard>
  );
}

export default WeaponStatsCard;
