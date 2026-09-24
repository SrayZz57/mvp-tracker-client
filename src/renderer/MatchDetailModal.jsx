import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { findMe, weaponKillsFor, isRedBlueMatch, rankedTeamGroups, resultLabel, resultLabelKey } from './valorantStats.js';
import { useMapImages } from './mapImages.js';
import { useWeaponIcons } from './weaponIcons.js';

const byScore = (a, b) => (b.stats?.score ?? 0) - (a.stats?.score ?? 0);

function TeamColumn({ title, players, agentIcons, className, meId }) {
  const { t } = useTranslation();
  return (
    <div className={`md-team ${className}`}>
      <h4>{title}</h4>
      {[...players].sort(byScore).map((p) => (
        <div key={p.puuid} className={`md-player ${p.puuid === meId ? 'md-player-me' : ''}`}>
          {agentIcons.get(p.character) ? (
            <img src={agentIcons.get(p.character)} alt="" className="md-player-agent" />
          ) : (
            <span className="md-player-agent" />
          )}
          <span className="md-player-name">
            {p.name}
            <span className="md-player-tag">#{p.tag}</span>
          </span>
          <span className="md-player-kda">
            {p.stats?.kills ?? '?'} / {p.stats?.deaths ?? '?'} / {p.stats?.assists ?? '?'}
          </span>
          <span className="md-player-score">
            {p.stats?.score ?? '?'} <small>{t('detail.pointsAbbr')}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function MatchDetailModal({ match, settings, agentIcons, onClose }) {
  const { t } = useTranslation();
  const mapImages = useMapImages();
  const weaponIcons = useWeaponIcons();
  const [showRounds, setShowRounds] = useState(false);
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
  const weaponList = [...weaponCounts.entries()].sort((a, b) => b[1] - a[1]);
  const weaponMax = weaponList[0]?.[1] ?? 1;

  const rounds = (match?.rounds || []).map((round) => {
    const myRoundStats = round.player_stats?.find((p) => p.player_puuid === me?.puuid);
    const won = Boolean(me?.team && round.winning_team === me.team);
    const died = me
      ? Boolean(round.player_stats?.some((p) => p.kill_events?.some((k) => k.victim_puuid === me.puuid)))
      : false;
    return { round, myRoundStats, won, died };
  });
  const roundsWon = rounds.filter((r) => r.won).length;
  const roundsLost = rounds.length - roundsWon;

  const label = me ? resultLabel(match, me) : null;
  const tone = label === 'Victoire' ? 'win' : label === 'Défaite' ? 'loss' : 'draw';
  const mapSplash = mapImages.get(match?.metadata?.map);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card md-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>{t('detail.close')}</button>

        <div className="md-banner">
          {mapSplash && <img src={mapSplash} alt="" className="md-banner-art" />}
          <div className="md-banner-text">
            <span className="md-banner-mode">{match?.metadata?.mode ?? '?'}</span>
            <h2>{match?.metadata?.map ?? '?'}</h2>
          </div>
          {me && (
            <div className="md-banner-result">
              <span className={`md-result-label ${tone}`}>
                {label && resultLabelKey(label) ? t(resultLabelKey(label)) : label}
              </span>
              {rounds.length > 0 && (
                <span className="md-result-score">
                  {roundsWon} <i>—</i> {roundsLost}
                </span>
              )}
              <span className="md-result-me">
                {agentIcons.get(me.character) && <img src={agentIcons.get(me.character)} alt="" />}
                {me.character} · {me.stats?.kills ?? '?'} / {me.stats?.deaths ?? '?'} / {me.stats?.assists ?? '?'}
              </span>
            </div>
          )}
        </div>

        {rounds.length > 0 && (
          <div className="md-strip" aria-hidden="true">
            {rounds.map((r, index) => (
              <span key={index} className={`md-strip-cell ${r.won ? 'win' : 'loss'}`} title={`${index + 1}`} />
            ))}
          </div>
        )}

        <section className="md-panel">
          <h3>{t('detail.players')}</h3>
          <div className="md-teams">
            {redBlue ? (
              <>
                <TeamColumn title={t('detail.redTeam')} players={redTeam} agentIcons={agentIcons} className="md-team-red" meId={me?.puuid} />
                <TeamColumn title={t('detail.blueTeam')} players={blueTeam} agentIcons={agentIcons} className="md-team-blue" meId={me?.puuid} />
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
                    className={mine ? 'md-team-mine' : 'md-team-other'}
                    meId={me?.puuid}
                  />
                );
              })
            )}
          </div>
        </section>

        <section className="md-panel">
          <h3>{t('detail.myKillsByWeapon')}</h3>
          {weaponList.length === 0 ? (
            <p className="md-empty">{t('detail.noKillsRecorded')}</p>
          ) : (
            <div className="md-weapons">
              {weaponList.map(([weapon, count]) => (
                <div key={weapon} className="md-weapon">
                  <span className="md-weapon-icon">
                    {weaponIcons.get(weapon) && <img src={weaponIcons.get(weapon)} alt="" />}
                  </span>
                  <span className="md-weapon-name">{weapon}</span>
                  <span className="md-weapon-bar"><span style={{ width: `${(count / weaponMax) * 100}%` }} /></span>
                  <span className="md-weapon-count">{t('detail.killsCount', { count })}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="md-panel">
          <button type="button" className="md-rounds-toggle" onClick={() => setShowRounds((v) => !v)}>
            <h3>{t('detail.roundByRound')}</h3>
            <span>{showRounds ? t('detail.hideRounds') : t('detail.showRounds', { count: rounds.length })}</span>
          </button>
          {showRounds && (
            <div className="md-table-wrap">
              <table className="md-table">
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
                  {rounds.map(({ round, myRoundStats, won, died }, index) => (
                    <tr key={index} className={won ? 'md-row-win' : ''}>
                      <td className="md-round-num">{index + 1}</td>
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default MatchDetailModal;
