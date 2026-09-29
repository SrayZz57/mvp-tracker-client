import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bomb, ChevronDown, ChevronLeft, ChevronRight, Coins, Flame, Shield, Skull, Star } from 'lucide-react';
import Icon from './Icon.jsx';
import { useWeaponIcons } from './weaponIcons.js';
import { buildTimeline } from './roundTimeline.js';

// Timeline du match : le score écart round par round (barres), les pastilles de
// chaque round avec ses marqueurs, les moments marquants, puis le détail du round
// choisi (économie des deux équipes, chronologie des kills, spike). Les calculs
// sont dans roundTimeline.js ; ici, uniquement l'affichage.

const END_KEYS = {
  Eliminated: 'eliminated',
  'Bomb detonated': 'detonated',
  'Bomb defused': 'defused',
  'Round timer expired': 'timer',
  Surrendered: 'surrender',
};

const pad = (n) => String(n).padStart(2, '0');
function clock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

function momentLabel(moment, t) {
  const round = moment.round + 1;
  switch (moment.kind) {
    case 'streak':
      return t(moment.won ? 'detail.timeline.moment.streakWon' : 'detail.timeline.moment.streakLost', {
        count: moment.length,
        from: round,
        to: moment.round + moment.length,
      });
    case 'ace':
      return t('detail.timeline.moment.ace', { round });
    case 'multi':
      return t('detail.timeline.moment.multi', { count: moment.count, round });
    case 'clutch':
      return t(moment.won ? 'detail.timeline.moment.clutchWon' : 'detail.timeline.moment.clutchLost', { versus: moment.versus, round });
    default:
      return t('detail.timeline.moment.ecoWin', { round });
  }
}

const MOMENT_ICONS = { streak: Flame, ace: Skull, multi: Skull, clutch: Star, ecoWin: Coins };

function Player({ name, agent, agentIcons }) {
  const icon = agent ? agentIcons.get(agent) : null;
  return (
    <span className="tl-player">
      {icon && <img src={icon} alt="" title={agent} />}
      <b>{name || '?'}</b>
    </span>
  );
}

function RoundDetail({ round, agentIcons, weaponIcons, t }) {
  const endKey = END_KEYS[round.endType];
  const buyLabel = (buy) => (buy ? t(`detail.timeline.buy.${buy}`) : '?');
  const money = (value) => (value === null ? '?' : `${value.toLocaleString()} ¤`);

  return (
    <div className="tl-detail" data-won={round.won ? 'true' : 'false'}>
      <header>
        <div className="tl-detail-title">
          <b>{t('detail.timeline.round', { number: round.index + 1 })}</b>
          <span className="tl-chip" data-tone={round.won ? 'win' : 'loss'}>
            {round.won ? t('detail.won') : t('detail.lost')}
          </span>
          {round.side && <span className="tl-chip">{t(`heatmap.sides.${round.side}`)}</span>}
          <span className="tl-chip">{endKey ? t(`detail.timeline.end.${endKey}`) : round.endType ?? '?'}</span>
        </div>
        <span className="tl-detail-score">
          {round.score.me} <i>-</i> {round.score.enemy}
        </span>
      </header>

      <div className="tl-eco">
        <div>
          <small>{t('detail.timeline.yourTeam')}</small>
          <b>{money(round.economy.me)}</b>
          <em data-buy={round.economy.myBuy}>{buyLabel(round.economy.myBuy)}</em>
        </div>
        <div>
          <small>{t('detail.timeline.enemyTeam')}</small>
          <b>{money(round.economy.enemy)}</b>
          <em data-buy={round.economy.enemyBuy}>{buyLabel(round.economy.enemyBuy)}</em>
        </div>
        <div>
          <small>{t('detail.timeline.yourRound')}</small>
          <b>
            {round.kills} {t('detail.timeline.kills')} · {round.damage ?? '?'} {t('detail.timeline.damage')}
          </b>
          <em data-buy={round.died ? 'lost' : 'alive'}>{round.died ? t('detail.timeline.died') : t('detail.timeline.survived')}</em>
        </div>
      </div>

      <ol className="tl-feed">
        {round.events.length === 0 && <li className="tl-feed-empty">{t('detail.timeline.noEvents')}</li>}
        {round.events.map((event, i) => {
          if (event.type === 'kill') {
            const weaponIcon = event.weapon ? weaponIcons.get(event.weapon) : null;
            return (
              <li key={i} data-side={event.allyKill ? 'ally' : 'enemy'} data-me={event.byMe || event.onMe ? 'true' : 'false'}>
                <time>{clock(event.time)}</time>
                {event.self ? (
                  <span className="tl-self">{t('detail.timeline.selfKill')}</span>
                ) : (
                  <Player name={event.killerName} agent={event.killerAgent} agentIcons={agentIcons} />
                )}
                <span className="tl-weapon">{weaponIcon ? <img src={weaponIcon} alt={event.weapon} title={event.weapon} /> : <small>{event.weapon ?? ''}</small>}</span>
                <Player name={event.victimName} agent={event.victimAgent} agentIcons={agentIcons} />
              </li>
            );
          }
          return (
            <li key={i} className="tl-feed-spike" data-side={event.allyAction ? 'ally' : 'enemy'}>
              <time>{clock(event.time)}</time>
              <span className="tl-spike">
                <Icon icon={event.type === 'plant' ? Bomb : Shield} size={15} />
                {event.type === 'plant'
                  ? t('detail.timeline.plant', { name: event.by || '?', site: event.site ?? '?' })
                  : t('detail.timeline.defuse', { name: event.by || '?' })}
              </span>
            </li>
          );
        })}
      </ol>
      {round.halfAfter && <p className="tl-half-note">{t('detail.timeline.halfTime', { me: round.score.me, enemy: round.score.enemy })}</p>}
    </div>
  );
}

export default function MatchTimeline({ match, me, agentIcons }) {
  const { t } = useTranslation();
  const weaponIcons = useWeaponIcons();
  const timeline = useMemo(() => buildTimeline(match, me), [match, me]);
  const [selected, setSelected] = useState(() => timeline?.moments[0]?.round ?? 0);
  const [showMoments, setShowMoments] = useState(false);
  const momentsRef = useRef(null);

  // La liste des moments se ferme d'un clic à côté ou avec Échap.
  useEffect(() => {
    if (!showMoments) return undefined;
    const onDown = (e) => {
      if (momentsRef.current && !momentsRef.current.contains(e.target)) setShowMoments(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setShowMoments(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [showMoments]);

  if (!timeline) return null;
  const { rounds, moments } = timeline;
  const current = rounds[Math.min(selected, rounds.length - 1)];
  const maxGap = Math.max(1, ...rounds.map((r) => Math.abs(r.diff)));

  // Round marquant précédent / suivant celui affiché.
  const momentRounds = [...new Set(moments.map((m) => m.round))].sort((a, b) => a - b);
  const previousMoment = [...momentRounds].reverse().find((r) => r < current.index);
  const nextMoment = momentRounds.find((r) => r > current.index);

  return (
    <div className="tl">
      <div className="tl-scroll">
        <div className="tl-cols" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(28px, 1fr))` }}>
          {rounds.map((r) => (
            <button
              key={r.index}
              type="button"
              className="tl-col"
              data-selected={r.index === current.index ? 'true' : 'false'}
              data-half={r.halfAfter ? 'true' : 'false'}
              onClick={() => setSelected(r.index)}
              title={t('detail.timeline.round', { number: r.index + 1 })}
            >
              <span className="tl-gap" aria-hidden="true">
                <span
                  className="tl-gap-bar"
                  data-tone={r.diff >= 0 ? 'win' : 'loss'}
                  style={{ height: `${(Math.abs(r.diff) / maxGap) * 50}%`, [r.diff >= 0 ? 'bottom' : 'top']: '50%' }}
                />
              </span>
              <span className="tl-pill" data-tone={r.won ? 'win' : 'loss'}>
                {r.index + 1}
              </span>
              <span className="tl-side">{r.side ? t(`detail.timeline.sideShort.${r.side}`) : ''}</span>
              <span className="tl-marks">
                {r.clutch && (
                  <span title={t('detail.timeline.legendClutch')}>
                    <Icon icon={Star} size={12} />
                  </span>
                )}
                {(r.ace || r.multiKill > 0) && (
                  <span title={t('detail.timeline.legendMulti')}>
                    <Icon icon={Skull} size={12} />
                  </span>
                )}
                {r.ecoWin && (
                  <span title={t('detail.timeline.legendEco')}>
                    <Icon icon={Coins} size={12} />
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="tl-toolbar">
        <p className="tl-legend">
          <span>{t('detail.timeline.legendBars')}</span>
          <span><Icon icon={Star} size={12} /> {t('detail.timeline.legendClutch')}</span>
          <span><Icon icon={Skull} size={12} /> {t('detail.timeline.legendMulti')}</span>
          <span><Icon icon={Coins} size={12} /> {t('detail.timeline.legendEco')}</span>
        </p>

        {moments.length > 0 && (
          <div className="tl-moments" ref={momentsRef}>
            <button type="button" className="tl-step" disabled={previousMoment === undefined} onClick={() => setSelected(previousMoment)} title={t('detail.timeline.previousMoment')}>
              <Icon icon={ChevronLeft} size={16} />
            </button>
            <button type="button" className="tl-moments-btn" data-open={showMoments ? 'true' : 'false'} onClick={() => setShowMoments((v) => !v)}>
              <Icon icon={Flame} size={14} /> {t('detail.timeline.moments', { count: moments.length })}
              <Icon icon={ChevronDown} size={14} />
            </button>
            <button type="button" className="tl-step" disabled={nextMoment === undefined} onClick={() => setSelected(nextMoment)} title={t('detail.timeline.nextMoment')}>
              <Icon icon={ChevronRight} size={16} />
            </button>

            {showMoments && (
              <ul className="tl-moments-pop">
                {moments.map((moment, i) => (
                  <li key={`${moment.kind}-${moment.round}-${i}`}>
                    <button
                      type="button"
                      data-tone={moment.won === false ? 'loss' : 'win'}
                      data-active={moment.round === current.index ? 'true' : 'false'}
                      onClick={() => {
                        setSelected(moment.round);
                        setShowMoments(false);
                      }}
                    >
                      <Icon icon={MOMENT_ICONS[moment.kind]} size={14} />
                      <span>{momentLabel(moment, t)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <RoundDetail round={current} agentIcons={agentIcons} weaponIcons={weaponIcons} t={t} />
    </div>
  );
}
