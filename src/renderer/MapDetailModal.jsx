import { useTranslation } from 'react-i18next';
import { agentUsageOnMap, weaponKillsOnMap, mapSideStats, excludeDeathmatch } from './valorantStats.js';
import { useMapImages } from './mapImages.js';
import { useWeaponIcons } from './weaponIcons.js';

const sideTone = (winrate) => (winrate === null ? '' : winrate >= 50 ? 'up' : 'down');

function MapDetailModal({ mapName, matches, settings, agentIcons, onClose }) {
  const { t } = useTranslation();
  const mapImages = useMapImages();
  const weaponIcons = useWeaponIcons();
  const mapSplash = mapImages.get(mapName);

  const rankedMatches = excludeDeathmatch(matches);
  const agentUsage = agentUsageOnMap(rankedMatches, settings.name, settings.tag, mapName);
  const weaponKills = weaponKillsOnMap(rankedMatches, settings.name, settings.tag, mapName);
  const sides = mapSideStats(matches, settings.name, settings.tag, mapName);

  const maxWeaponCount = weaponKills[0]?.[1] ?? 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card detail-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>{t('detail.close')}</button>

        <div className="dm-hero dm-hero-map" style={mapSplash ? { backgroundImage: `url(${mapSplash})` } : undefined}>
          <div className="dm-hero-text">
            <h2 className="dm-hero-name">{mapName}</h2>
          </div>
        </div>

        <div className="card gs-card">
          <h3 className="dm-title">{t('detail.attackDefense')}</h3>
          <div className="gs-figures fm-figures">
            <div className="gs-figure">
              <span className="gs-figure-label">{t('detail.attackWinrate', { count: sides.attackRounds })}</span>
              <span className={`gs-figure-value ${sideTone(sides.attackWinrate)}`}>
                {sides.attackWinrate === null ? '?' : `${sides.attackWinrate.toFixed(0)}%`}
              </span>
            </div>
            <div className="gs-figure">
              <span className="gs-figure-label">{t('detail.defenseWinrate', { count: sides.defenseRounds })}</span>
              <span className={`gs-figure-value ${sideTone(sides.defenseWinrate)}`}>
                {sides.defenseWinrate === null ? '?' : `${sides.defenseWinrate.toFixed(0)}%`}
              </span>
            </div>
          </div>
          {sides.unknownRounds > 0 && (
            <p className="label" style={{ marginTop: '0.5rem' }}>
              {t('detail.unknownRounds', { count: sides.unknownRounds })}
            </p>
          )}
        </div>

        <div className="card gs-card">
          <h3 className="dm-title">{t('detail.agentsOnMap')}</h3>
          {agentUsage.length === 0 ? (
            <p>{t('detail.noData')}</p>
          ) : (
            <div className="fm-rows">
              {agentUsage.map(({ character, count, percent }) => (
                <div key={character} className="fm-row dm-row">
                  <span className="fm-row-label">
                    {agentIcons.get(character) && <img src={agentIcons.get(character)} alt="" className="agent-icon" />}
                    {character}
                  </span>
                  <span className="fm-row-track" aria-hidden="true">
                    <span className="fm-row-fill" style={{ width: `${percent}%` }} />
                  </span>
                  <span className="fm-row-value">{percent.toFixed(0)}%</span>
                  <span className="fm-row-meta">{t('detail.agentUsageLine', { percent: percent.toFixed(0), count })}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card gs-card">
          <h3 className="dm-title">{t('detail.killsByWeaponOnMap')}</h3>
          {weaponKills.length === 0 ? (
            <p>{t('detail.noData')}</p>
          ) : (
            <div className="fm-rows">
              {weaponKills.map(([weapon, count]) => (
                <div key={weapon} className="fm-row dm-row">
                  <span className="fm-row-label">
                    {weaponIcons.get(weapon) && <img src={weaponIcons.get(weapon)} alt="" className="weapon-icon" />}
                    {weapon}
                  </span>
                  <span className="fm-row-track" aria-hidden="true">
                    <span className="fm-row-fill good" style={{ width: `${(count / maxWeaponCount) * 100}%` }} />
                  </span>
                  <span className="fm-row-value">{count}</span>
                  <span className="fm-row-meta">{t('detail.killsCount', { count })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MapDetailModal;
