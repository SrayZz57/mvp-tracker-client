import { useTranslation } from 'react-i18next';
import { findMe, weaponKillsFor, isRedBlueMatch, rankedTeamGroups } from './valorantStats.js';
import { useMapImages } from './mapImages.js';

function TeamColumn({ title, players, agentIcons, className }) {
  const { t } = useTranslation();
  return (
    <div className={`team-column ${className}`}>
      <h4>{title}</h4>
      {players.map((p) => (
        <div key={p.puuid} className="team-player">
          {agentIcons.get(p.character) && <img src={agentIcons.get(p.character)} alt="" className="agent-icon" />}
          <span className="team-player-name">{p.name}#{p.tag}</span>
          <span className="team-player-stats">
            {p.stats?.kills ?? '?'}/{p.stats?.deaths ?? '?'}/{p.stats?.assists ?? '?'} — {p.stats?.score ?? '?'} {t('detail.pointsAbbr')}
          </span>
        </div>
      ))}
    </div>
  );
}

function MatchDetailModal({ match, settings, agentIcons, onClose }) {
  const { t } = useTranslation();
  const mapImages = useMapImages();
  const me = findMe(match, settings.name, settings.tag);

  const allPlayers = match?.players?.all_players || [];
  const redTeam = allPlayers.filter((p) => p.team === 'Red');
  const blueTeam = allPlayers.filter((p) => p.team === 'Blue');
  // Modes à plus de deux équipes (ex. Gauntlet: Glitched, 8 duos) : équipes
  // classées plutôt que deux colonnes Rouge/Bleu qui resteraient vides.
  const redBlue = isRedBlueMatch(match);
  const teamGroups = redBlue ? [] : rankedTeamGroups(match);

  const weaponCounts = new Map();
  if (me) {
    weaponKillsFor(match, me.puuid).forEach((weapon) => {
      weaponCounts.set(weapon, (weaponCounts.get(weapon) || 0) + 1);
    });
  }

  const mapSplash = mapImages.get(match?.metadata?.map);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>{t('detail.close')}</button>

        <div className="modal-banner" style={mapSplash ? { backgroundImage: `url(${mapSplash})` } : undefined}>
          <div className="modal-banner-text">
            <h2>{match?.metadata?.map ?? '?'}</h2>
            <p>{match?.metadata?.mode ?? '?'}</p>
          </div>
        </div>

        <div className="card">
          <h3>{t('detail.players')}</h3>
          <div className="team-columns">
            {redBlue ? (
              <>
                <TeamColumn title={t('detail.redTeam')} players={redTeam} agentIcons={agentIcons} className="team-red" />
                <TeamColumn title={t('detail.blueTeam')} players={blueTeam} agentIcons={agentIcons} className="team-blue" />
              </>
            ) : (
              teamGroups.map((group, index) => {
                const mine = group.players.some((p) => p.puuid === me?.puuid);
                return (
                  <TeamColumn
                    key={group.team}
                    title={`${t('detail.rankedTeam', { rank: index + 1 })}${mine ? ` — ${t('detail.yourTeam')}` : ''}`}
                    players={group.players}
                    agentIcons={agentIcons}
                    className={`team-ranked${mine ? ' team-mine' : ''}`}
                  />
                );
              })
            )}
          </div>
        </div>

        <div className="card">
          <h3>{t('detail.myKillsByWeapon')}</h3>
          {weaponCounts.size === 0 ? (
            <p>{t('detail.noKillsRecorded')}</p>
          ) : (
            [...weaponCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([weapon, count]) => (
                <p key={weapon}>{weapon} — {t('detail.killsCount', { count })}</p>
              ))
          )}
        </div>

        <div className="card">
          <h3>{t('detail.roundByRound')}</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{t('detail.result')}</th>
                <th>{t('detail.end')}</th>
                <th>{t('detail.myKills')}</th>
                <th>{t('detail.damage')}</th>
                <th>{t('detail.score')}</th>
                <th>{t('detail.died')}</th>
                <th>{t('detail.myEconomy')}</th>
              </tr>
            </thead>
            <tbody>
              {(match?.rounds || []).map((round, index) => {
                const myRoundStats = round.player_stats?.find((p) => p.player_puuid === me?.puuid);
                const won = me?.team && round.winning_team === me.team;
                const died = me
                  ? round.player_stats?.some((p) =>
                      p.kill_events?.some((k) => k.victim_puuid === me.puuid),
                    )
                  : false;
                return (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td className={won ? 'result-win-text' : 'result-loss-text'}>
                      {won ? t('detail.won') : t('detail.lost')}
                    </td>
                    <td>{round.end_type ?? '?'}</td>
                    <td>{myRoundStats?.kills ?? '?'}</td>
                    <td>{myRoundStats?.damage ?? '?'}</td>
                    <td>{myRoundStats?.score ?? '?'}</td>
                    <td className={died ? 'result-loss-text' : 'result-win-text'}>{died ? t('detail.yes') : t('detail.no')}</td>
                    <td>
                      {myRoundStats?.economy
                        ? `${myRoundStats.economy.loadout_value}¤ (${myRoundStats.economy.weapon?.name ?? '?'})`
                        : '?'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default MatchDetailModal;
