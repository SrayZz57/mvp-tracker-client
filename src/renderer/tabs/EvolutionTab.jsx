import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, Clock, Crown, Flag, Flame, Gamepad2, Medal, Star, TrendingDown, TrendingUp, UserPlus } from 'lucide-react';
import Icon from '../Icon.jsx';
import { computeEvolution } from '../evolution.js';
import { useAgentIcons } from '../agentIcons.js';
import { useRankTiers } from '../rankData.js';
import LoadingState from '../LoadingState.jsx';
import CollapsibleCard from '../CollapsibleCard.jsx';

// « Mon évolution » : toute ta progression depuis le début du suivi — est-ce que
// tu progresses vraiment ? Calculs dans evolution.js ; ici, l'affichage.

const METRICS = ['winrate', 'kd', 'hs'];
const CHART_HEIGHT = 190;
const formatMetric = (metric, value) => {
  if (value === null || value === undefined) return '?';
  if (metric === 'kills') return String(Math.round(value));
  return metric === 'kd' ? value.toFixed(2) : `${value.toFixed(0)}%`;
};

function formatDuration(ms) {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${minutes} min`;
}

// Largeur réelle d'un élément, suivie quand la fenêtre change : le graphique est
// dessiné à cette taille exacte (texte net, hauteur fixe) au lieu d'être étiré.
function useWidth() {
  const [node, setNode] = useState(null);
  const [width, setWidth] = useState(0);
  const observer = useRef(null);
  useEffect(() => {
    if (!node) return undefined;
    setWidth(node.getBoundingClientRect().width);
    observer.current = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.current.observe(node);
    return () => observer.current?.disconnect();
  }, [node]);
  return [setNode, width];
}

// Courbe SVG simple : temps en abscisse, valeur en ordonnée, survol pour lire un point.
function LineChart({ points, yFormat, locale, color = 'var(--accent)' }) {
  const [hover, setHover] = useState(null);
  const [ref, measured] = useWidth();
  const W = Math.max(280, Math.floor(measured));
  const H = CHART_HEIGHT;

  const drawable = points.length >= 2 && measured > 0;
  const pad = { l: 58, r: 12, t: 12, b: 24 };
  const xMin = points[0]?.x ?? 0;
  const xMax = points[points.length - 1]?.x ?? 1;
  const ys = points.map((p) => p.y);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  const margin = (yMax - yMin || 1) * 0.15;
  yMin -= margin;
  yMax += margin;

  const sx = (x) => pad.l + ((x - xMin) / (xMax - xMin || 1)) * (W - pad.l - pad.r);
  const sy = (y) => pad.t + (1 - (y - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
  const dateOf = (ms) => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: '2-digit' });

  const onMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const target = xMin + ((event.clientX - rect.left - pad.l) / (W - pad.l - pad.r)) * (xMax - xMin);
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.x - target) < Math.abs(points[best].x - target)) best = i;
    });
    setHover(best);
  };
  const hovered = hover !== null ? points[hover] : null;

  let content = null;
  if (drawable) {
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    const area = `${path} L${sx(xMax).toFixed(1)},${H - pad.b} L${sx(xMin).toFixed(1)},${H - pad.b} Z`;
    const grid = [0, 1, 2].map((k) => yMin + ((yMax - yMin) * k) / 2);
    const labelCount = W < 520 ? 3 : 5;
    const labels = Array.from({ length: labelCount }, (_, k) => xMin + ((xMax - xMin) * k) / (labelCount - 1));
    content = (
      <svg width={W} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img">
        {grid.map((value) => (
          <g key={value}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(value)} y2={sy(value)} className="ev-grid" />
            <text x={pad.l - 8} y={sy(value) + 4} textAnchor="end" className="ev-axis">
              {yFormat(value)}
            </text>
          </g>
        ))}
        {labels.map((ms, k) => (
          <text key={ms} x={sx(ms)} y={H - 6} textAnchor={k === 0 ? 'start' : k === labelCount - 1 ? 'end' : 'middle'} className="ev-axis">
            {dateOf(ms)}
          </text>
        ))}
        <path d={area} fill={color} opacity="0.12" />
        <path d={path} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {hovered && (
          <g>
            <line x1={sx(hovered.x)} x2={sx(hovered.x)} y1={pad.t} y2={H - pad.b} className="ev-cursor" />
            <circle cx={sx(hovered.x)} cy={sy(hovered.y)} r="4.5" fill={color} stroke="#fff" strokeWidth="1.5" />
          </g>
        )}
      </svg>
    );
  }

  return (
    <div className="ev-chart" ref={ref} style={{ height: H }}>
      {content}
      {hovered && drawable && (
        <div className="ev-tip">
          <b>{hovered.label ?? yFormat(hovered.y)}</b>
          <small>{dateOf(hovered.x)}</small>
        </div>
      )}
    </div>
  );
}

function Delta({ value, unit = '', digits = 0 }) {
  if (value === null || value === undefined || Math.abs(value) < 10 ** -(digits + 1)) return null;
  const up = value > 0;
  return (
    <span className="wrapped-delta" data-up={up ? 'true' : 'false'}>
      <Icon icon={up ? TrendingUp : TrendingDown} size={11} />
      {up ? '+' : ''}
      {value.toFixed(digits)}
      {unit}
    </span>
  );
}

const MILESTONE_ICONS = { first: Flag, games: Gamepad2, streak: Flame, agent: UserPlus, record: Star, rankUp: Crown };

function EvolutionTab({ settings, matches, loading }) {
  const { t, i18n } = useTranslation();
  const agentIcons = useAgentIcons();
  const rankTiers = useRankTiers();
  const [snapshots, setSnapshots] = useState([]);
  const [metric, setMetric] = useState('kd');

  // L'historique de rang se met à jour à chaque synchro : on le relit quand le nombre de parties change.
  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      .getRankSnapshots()
      .then((rows) => !cancelled && setSnapshots(rows ?? []))
      .catch(() => !cancelled && setSnapshots([]));
    return () => {
      cancelled = true;
    };
  }, [matches?.length]);

  const evo = useMemo(() => computeEvolution(matches, snapshots, settings.name, settings.tag), [matches, snapshots, settings.name, settings.tag]);

  if (!matches || matches.length === 0) {
    if (loading) return <LoadingState />;
    return <p>{t('evolution.noMatchesYet')}</p>;
  }
  if (!evo) return <p>{t('evolution.noMatchesYet')}</p>;

  const locale = i18n.language;
  const date = (ms, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => new Date(ms).toLocaleDateString(locale, opts);
  const tierName = (elo) => rankTiers.get(Math.floor(elo / 100) + 3)?.tierName ?? '';
  const chartPoints = evo.rolling.filter((p) => p[metric] !== null).map((p) => ({ x: p.at, y: p[metric] }));
  const rankPoints = evo.rank ? evo.rank.points.map((p) => ({ x: p.at, y: p.elo, label: `${p.tierName ?? tierName(p.elo)} · ${p.rr} RR` })) : [];
  const currentTier = evo.rank ? rankTiers.get(evo.rank.current.tierId) : null;

  const recordText = (r) =>
    t(`evolution.milestone.record.${r.metric}`, { value: formatMetric(r.metric, r.value), agent: r.agent ?? '?', map: r.map ?? '?' });
  const milestoneText = (m) => {
    switch (m.type) {
      case 'first':
        return t('evolution.milestone.first');
      case 'games':
        return t('evolution.milestone.games', { count: m.count });
      case 'streak':
        return t('evolution.milestone.streak', { count: m.length });
      case 'agent':
        return t('evolution.milestone.agent', { agent: m.agent, count: m.games });
      case 'rankUp':
        return t('evolution.milestone.rankUp', { tier: m.tierName });
      default:
        return recordText(m);
    }
  };

  return (
    <div className="ev-page">
      <div className="card ev-hero">
        <span className="ev-eyebrow">{t('evolution.eyebrow')}</span>
        <h3>{t('evolution.title')}</h3>
        <p>{t('evolution.since', { date: date(evo.firstAt), count: evo.totalGames, days: evo.spanDays })}</p>
      </div>

      <div className="ev-cols">
        <div className="ev-col">
          <CollapsibleCard id="evolution.verdict" title={t('evolution.verdictTitle')} className="gs-card">
          {!evo.comparison ? (
            <p className="label">{t('evolution.notEnough', { count: evo.totalGames })}</p>
          ) : (
            <>
              <p className="ev-verdict" data-tone={evo.comparison.overall}>
                <Icon icon={evo.comparison.overall === 'decline' ? TrendingDown : evo.comparison.overall === 'progress' ? TrendingUp : Medal} size={18} />
                {t(`evolution.verdict.${evo.comparison.overall}`)}
              </p>
              <p className="label">{t('evolution.compareIntro', { count: evo.comparison.window, date: date(evo.comparison.startsAt) })}</p>
              <div className="ev-compare">
                {METRICS.map((key) => {
                  const m = evo.comparison.metrics[key];
                  return (
                    <div key={key} className="ev-compare-card" data-verdict={m.verdict}>
                      <small>{t(`evolution.metric.${key}`)}</small>
                      <div className="ev-compare-values">
                        <span>{formatMetric(key, m.start)}</span>
                        <em>→</em>
                        <b>{formatMetric(key, m.now)}</b>
                      </div>
                      <Delta value={m.delta} digits={key === 'kd' ? 2 : 0} unit={key === 'kd' ? '' : ' pts'} />
                    </div>
                  );
                })}
              </div>
              <p className="ev-note">{t('evolution.verdictNote')}</p>
            </>
          )}
        </CollapsibleCard>

          <CollapsibleCard id="evolution.rank" title={t('evolution.rankTitle')} className="gs-card">
          {!evo.rank ? (
            <p className="label">{t('evolution.rankNone')}</p>
          ) : (
            <>
              <div className="ev-rank-now">
                {currentTier?.icon && <img src={currentTier.icon} alt="" />}
                <div>
                  <b>{evo.rank.current.tierName ?? tierName(evo.rank.current.elo)}</b>
                  <small>{evo.rank.current.rr} RR</small>
                </div>
                <div>
                  <small>{t('evolution.rankPeak')}</small>
                  <b>{evo.rank.peak.tierName ?? tierName(evo.rank.peak.elo)} · {evo.rank.peak.rr} RR</b>
                </div>
              </div>
              {rankPoints.length >= 2 ? (
                <LineChart points={rankPoints} yFormat={tierName} locale={locale} color="#7fe3ff" />
              ) : (
                <p className="label">{t('evolution.rankFirst')}</p>
              )}
              <p className="ev-note">{t('evolution.rankTracked', { date: date(evo.rank.trackedSince) })}</p>
              {evo.rank.changes.length > 0 && (
                <ul className="ev-changes">
                  {[...evo.rank.changes].reverse().slice(0, 5).map((c) => (
                    <li key={c.at} data-type={c.type}>
                      <Icon icon={c.type === 'promotion' ? TrendingUp : TrendingDown} size={14} />
                      <span>{t(`evolution.rankChange.${c.type}`, { from: c.fromName ?? '?', to: c.tierName ?? '?' })}</span>
                      <small>{date(c.at)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CollapsibleCard>

          <CollapsibleCard id="evolution.agents" title={t('evolution.agentsTitle')} className="gs-card">
          <div className="ev-table">
            {evo.agents.slice(0, 8).map((a) => (
              <div key={a.key} className="ev-row">
                <span className="ev-row-name">
                  {agentIcons.get(a.key) && <img src={agentIcons.get(a.key)} alt="" />}
                  <b>{a.key}</b>
                </span>
                <span>{t('evolution.gamesCount', { count: a.games })}</span>
                <span>{a.winrate === null ? '?' : `${a.winrate.toFixed(0)}%`}</span>
                <span>{a.kd === null ? '?' : a.kd.toFixed(2)}</span>
                <small>{t('evolution.firstPlayed', { date: date(a.firstAt, { day: 'numeric', month: 'short', year: '2-digit' }) })}</small>
              </div>
            ))}
          </div>
        </CollapsibleCard>

          <CollapsibleCard id="evolution.records" title={t('evolution.recordsTitle')} className="gs-card">
          {evo.records.length === 0 ? (
            <p className="label">{t('evolution.recordsNone')}</p>
          ) : (
            <ul className="ev-records">
              {evo.records.slice(0, 8).map((r) => (
                <li key={`${r.metric}-${r.at}`}>
                  <Icon icon={Award} size={15} />
                  <span>{recordText(r)}</span>
                  <small>{date(r.at)}</small>
                </li>
              ))}
            </ul>
          )}
        </CollapsibleCard>
        </div>
        <div className="ev-col">
          <CollapsibleCard id="evolution.trend" title={t('evolution.trendTitle')} className="gs-card">
          <div className="filter-bar">
            {METRICS.map((key) => (
              <button key={key} className={key === metric ? 'strategy-tool active' : 'strategy-tool'} onClick={() => setMetric(key)}>
                {t(`evolution.metric.${key}`)}
              </button>
            ))}
          </div>
          {chartPoints.length < 2 ? (
            <p className="label">{t('evolution.trendNotEnough')}</p>
          ) : (
            <>
              <LineChart points={chartPoints} yFormat={(v) => formatMetric(metric, v)} locale={locale} />
              <p className="ev-note">{t('evolution.trendHint')}</p>
            </>
          )}
        </CollapsibleCard>

          <CollapsibleCard id="evolution.sessions" title={t('evolution.sessionsTitle')} className="gs-card">
          {evo.sessions && (
            <>
              <div className="ev-tiles">
                <div>
                  <b>{evo.sessions.count}</b>
                  <small>{t('evolution.sessionsCount')}</small>
                </div>
                <div>
                  <b>{evo.sessions.avgGames.toFixed(1)}</b>
                  <small>{t('evolution.avgGames')}</small>
                </div>
                <div>
                  <b>{formatDuration(evo.sessions.avgDurationMs)}</b>
                  <small>{t('evolution.avgDuration')}</small>
                </div>
                <div>
                  <b>{formatDuration(evo.sessions.longest.endedAt - evo.sessions.longest.startedAt)}</b>
                  <small>{t('evolution.longestSession', { count: evo.sessions.longest.games })}</small>
                </div>
                <div>
                  <b>{Math.round(evo.sessions.playtimeMs / 3600000)} h</b>
                  <small>{t('evolution.playtime')}</small>
                </div>
              </div>
              {evo.sessionsPerPeriod.length > 1 && (
                <div className="ev-bars" aria-label={t('evolution.sessionsPerPeriod')}>
                  {(() => {
                    const max = Math.max(...evo.sessionsPerPeriod.map((p) => p.count));
                    return evo.sessionsPerPeriod.map((p) => (
                      <div key={p.start} className="ev-bar" title={`${date(p.start, { month: 'long', year: 'numeric', day: evo.granularity === 'week' ? 'numeric' : undefined })} · ${p.count}`}>
                        <span style={{ height: `${(p.count / max) * 100}%` }} />
                      </div>
                    ));
                  })()}
                </div>
              )}
              <p className="ev-note">{t(`evolution.sessionsHint.${evo.granularity}`)}</p>
            </>
          )}
        </CollapsibleCard>

          <CollapsibleCard id="evolution.maps" title={t('evolution.mapsTitle')} className="gs-card">
          <div className="ev-table">
            {evo.maps.slice(0, 8).map((m) => (
              <div key={m.key} className="ev-row">
                <span className="ev-row-name">
                  <b>{m.key}</b>
                </span>
                <span>{t('evolution.gamesCount', { count: m.games })}</span>
                <span>{m.winrate === null ? '?' : `${m.winrate.toFixed(0)}%`}</span>
                <span>{m.kd === null ? '?' : m.kd.toFixed(2)}</span>
                <small>{t('evolution.firstPlayed', { date: date(m.firstAt, { day: 'numeric', month: 'short', year: '2-digit' }) })}</small>
              </div>
            ))}
          </div>
        </CollapsibleCard>

          <CollapsibleCard id="evolution.milestones" title={t('evolution.milestonesTitle')} className="gs-card">
          <ol className="ev-timeline">
            {evo.milestones.slice(0, 14).map((m, i) => (
              <li key={`${m.type}-${m.at}-${i}`} data-type={m.type}>
                <span className="ev-dot"><Icon icon={MILESTONE_ICONS[m.type] ?? Clock} size={13} /></span>
                <div>
                  <b>{milestoneText(m)}</b>
                  <small>{date(m.at)}</small>
                </div>
              </li>
            ))}
          </ol>
        </CollapsibleCard>
        </div>
      </div>
    </div>
  );
}

export default EvolutionTab;
