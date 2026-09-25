import { useTranslation } from 'react-i18next';
import {
  weaponKillsForAgent,
  mapStatsForAgent,
  agentPlaytimeSeconds,
  agentTotalKills,
  groupStats,
  excludeDeathmatch,
} from './valorantStats.js';
import { useAgentIcons, useAgentRoles, useAgentPortraits } from './agentIcons.js';
import { useWeaponIcons } from './weaponIcons.js';
import { useMapMinimaps } from './mapImages.js';

function formatPlaytime(seconds) {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
}

function AgentDetailModal({ character, matches, settings, onClose }) {
  const { t } = useTranslation();
  const icons = useAgentIcons();
  const icon = icons.get(character);
  const portrait = useAgentPortraits().get(character);
  const roles = useAgentRoles();
  const role = roles.get(character);
  const weaponIcons = useWeaponIcons();
  const minimaps = useMapMinimaps();

  const weaponKills = weaponKillsForAgent(matches, settings.name, settings.tag, character);
  const mapStats = mapStatsForAgent(matches, settings.name, settings.tag, character);
  const playtimeSeconds = agentPlaytimeSeconds(matches, settings.name, settings.tag, character);
  const totalKills = agentTotalKills(matches, settings.name, settings.tag, character);

  const overall = groupStats(
    excludeDeathmatch(matches),
    settings.name,
    settings.tag,
    (match, me) => (me.character === character ? character : null),
  )[0];

  const maxWeaponCount = weaponKills[0]?.[1] ?? 0;
  const winrate = overall?.winrate ?? null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card detail-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>{t('detail.close')}</button>

        <div className="dm-hero dm-hero-agent">
          {portrait && <img src={portrait} alt="" className="dm-hero-art" />}
          <div className="dm-hero-text">
            {role?.roleName && (
              <span className="gs-eyebrow dm-hero-role">
                {role.roleIcon && <img src={role.roleIcon} alt="" />}
                {role.roleName}
              </span>
            )}
            <h2 className="dm-hero-name">
              {icon && <img src={icon} alt="" className="dm-hero-icon" />}
              {character}
            </h2>
          </div>
        </div>

        <div className="card gs-card">
          <div className="gs-figures fm-figures fm-figures-4">
            <div className="gs-figure">
              <span className="gs-figure-label">{t('detail.gamesPlayed')}</span>
              <span className="gs-figure-value">{overall?.games ?? 0}</span>
            </div>
            <div className="gs-figure">
              <span className="gs-figure-label">{t('detail.winrate')}</span>
              <span className={`gs-figure-value ${winrate === null ? '' : winrate >= 50 ? 'up' : 'down'}`}>
                {winrate === null ? '?' : `${winrate.toFixed(0)}%`}
              </span>
            </div>
            <div className="gs-figure">
              <span className="gs-figure-label">{t('detail.avgKda')}</span>
              <span className="gs-figure-value">
                {overall ? `${overall.avgKills.toFixed(1)}/${overall.avgDeaths.toFixed(1)}/${overall.avgAssists.toFixed(1)}` : '?'}
              </span>
            </div>
            <div className="gs-figure">
              <span className="gs-figure-label">{t('detail.playtimeKills', { count: totalKills })}</span>
              <span className="gs-figure-value">{formatPlaytime(playtimeSeconds)}</span>
            </div>
          </div>
        </div>

        <div className="card gs-card">
          <h3 className="dm-title">{t('detail.mostUsedWeapons')}</h3>
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

        <div className="card gs-card">
          <h3 className="dm-title">{t('detail.winrateByMap')}</h3>
          {mapStats.length === 0 ? (
            <p>{t('detail.noData')}</p>
          ) : (
            <div className="fm-rows">
              {mapStats.map((row) => (
                <div key={row.key} className="fm-row dm-row">
                  <span className="fm-row-label">
                    {minimaps.get(row.key) && <img src={minimaps.get(row.key)} alt="" className="stat-bar-icon" />}
                    {row.key}
                  </span>
                  <span className="fm-row-track" aria-hidden="true">
                    <span
                      className={`fm-row-fill ${row.winrate === null ? '' : row.winrate >= 50 ? 'good' : 'bad'}`}
                      style={{ width: `${row.winrate ?? 4}%` }}
                    />
                  </span>
                  <span className="fm-row-value">{row.winrate === null ? '?' : `${row.winrate.toFixed(0)}%`}</span>
                  <span className="fm-row-meta">
                    {t('detail.gamesKda', {
                      count: row.games,
                      k: row.avgKills.toFixed(1),
                      d: row.avgDeaths.toFixed(1),
                      a: row.avgAssists.toFixed(1),
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="label">{t('detail.assistNote')}</p>
      </div>
    </div>
  );
}

export default AgentDetailModal;
