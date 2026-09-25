import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import Icon from './Icon.jsx';
import { useRankTiers } from './rankData.js';
import CollapsibleCard from './CollapsibleCard.jsx';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 20;
const HEIGHT = 250;
const PAD = { top: 26, right: 16, bottom: 24, left: 14 };
// Zone des barres de RR gagné/perdu, sous la courbe.
const BARS_H = 56;
const BARS_GAP = 14;
// Écart horizontal minimum (px) entre deux libellés de jour sous le graphique.
const DAY_LABEL_GAP = 52;
// Au-delà d'Immortal 1 (tier 24) le RR ne repart plus de 0 à chaque rang : la
// grille « 100 points par rang » n'a plus de sens, on n'affiche alors que la courbe.
const FIRST_UNBANDED_ELO = 2100;
const MIN_SPAN = 60;
// Même garde-fou que côté process principal (MMR_HISTORY_MIN_REFRESH_MS) : le
// bouton est grisé une minute après un clic plutôt que de laisser croire qu'un
// deuxième clic ferait quelque chose.
const REFRESH_COOLDOWN_MS = 60 * 1000;

// Valeur continue qui monte à chaque point de RR gagné, même quand on change de
// rang : `elo` renvoyé par HenrikDev quand il est là, sinon reconstitué.
function eloOf(entry) {
  return entry.elo ?? (entry.tierId - 3) * 100 + entry.rr;
}

function formatDay(ts, locale) {
  return new Date(ts).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

// Progression du RR sur les 20 derniers jours, une position par partie : les
// bandes colorées en fond sont les rangs traversés, les icônes marquent une
// montée ou une descente de rang, et les barres du bas montrent le RR gagné
// (vert) ou perdu (rouge) à chaque partie.
function RankHistoryCard() {
  const { t, i18n } = useTranslation();
  const rankTiers = useRankTiers();
  const [state, setState] = useState({ loading: true, history: [], error: null });
  const [hovered, setHovered] = useState(null);
  // Référence par état (pas useRef) : le bloc disparaît quand la carte est repliée
  // puis revient, l'observateur doit se rebrancher sur le nouvel élément.
  const [wrapEl, setWrapEl] = useState(null);
  const [width, setWidth] = useState(520);
  const [refreshing, setRefreshing] = useState(false);
  const [cooling, setCooling] = useState(false);
  const mountedRef = useRef(true);
  const coolTimer = useRef(null);

  // `force` : contourne le cache de 15 min du process principal (voir
  // get-mmr-history dans main.js). Les anciennes données restent affichées
  // pendant le rechargement — seule l'icône du bouton tourne.
  const load = useCallback((force) => {
    setRefreshing(true);
    return window.electronAPI
      .getMmrHistory({ force })
      .then((result) => {
        if (!mountedRef.current) return;
        setState({ loading: false, history: result?.history ?? [], error: result?.error ?? null });
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setState((prev) => ({ loading: false, history: prev.history, error: err.message }));
      })
      .finally(() => {
        if (mountedRef.current) setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    // Remis à vrai ici (pas seulement à l'initialisation) : en développement
    // React monte, démonte puis remonte chaque composant (StrictMode).
    mountedRef.current = true;
    load(false);
    return () => {
      mountedRef.current = false;
      clearTimeout(coolTimer.current);
    };
  }, [load]);

  const handleRefresh = () => {
    setCooling(true);
    clearTimeout(coolTimer.current);
    coolTimer.current = setTimeout(() => setCooling(false), REFRESH_COOLDOWN_MS);
    load(true);
  };

  useEffect(() => {
    if (!wrapEl) return undefined;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(wrapEl);
    return () => observer.disconnect();
  }, [wrapEl]);

  const entries = useMemo(() => {
    const since = Date.now() - WINDOW_DAYS * DAY_MS;
    return state.history
      .map((entry) => ({ ...entry, ts: new Date(entry.date).getTime() }))
      .filter((entry) => Number.isFinite(entry.ts) && entry.ts >= since)
      .sort((a, b) => a.ts - b.ts);
  }, [state.history]);

  const chart = useMemo(() => {
    const n = entries.length;
    if (n < 2) return null;

    const values = entries.map(eloOf);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (max - min < MIN_SPAN) {
      const mid = (max + min) / 2;
      min = mid - MIN_SPAN / 2;
      max = mid + MIN_SPAN / 2;
    }
    const pad = (max - min) * 0.12;
    min -= pad;
    max += pad;

    const t0 = entries[0].ts;
    const t1 = entries[n - 1].ts;
    const innerW = width - PAD.left - PAD.right;
    // Zones verticales : la courbe en haut, les barres de RR gagné/perdu dessous.
    const curveTop = PAD.top;
    const curveBottom = HEIGHT - PAD.bottom - BARS_H - BARS_GAP;
    const barsMid = curveBottom + BARS_GAP + BARS_H / 2;
    // Une position par PARTIE (pas par instant) : plusieurs parties le même soir
    // ne se tassent plus en paquet, et chaque barre reste alignée sous son point.
    const step = innerW / (n - 1);
    const xOf = (i) => PAD.left + i * step;
    const yOf = (value) => curveTop + (1 - (value - min) / (max - min)) * (curveBottom - curveTop);

    const points = entries.map((entry, i) => ({ ...entry, x: xOf(i), y: yOf(values[i]) }));

    // Nom lisible d'un rang : celui renvoyé par l'historique en priorité (déjà
    // « Platinum 1 »), sinon celui de valorant-api.com.
    const nameById = new Map();
    entries.forEach((entry) => nameById.set(entry.tierId, entry.tierName));

    const bands = [];
    if (max < FIRST_UNBANDED_ELO) {
      for (let tierId = Math.floor(min / 100) + 3; tierId <= Math.floor(max / 100) + 3; tierId += 1) {
        const bottom = Math.max((tierId - 3) * 100, min);
        const top = Math.min((tierId - 2) * 100, max);
        if (top <= bottom) continue;
        bands.push({
          tierId,
          y: yOf(top),
          height: yOf(bottom) - yOf(top),
          color: rankTiers.get(tierId)?.color ?? 'var(--text-muted)',
          name: nameById.get(tierId) ?? rankTiers.get(tierId)?.name ?? '',
        });
      }
    }

    // Barres : hauteur proportionnelle au RR gagné (vert, vers le haut) ou perdu
    // (rouge, vers le bas), échelle commune à toutes les parties.
    const maxChange = Math.max(10, ...entries.map((entry) => Math.abs(entry.change ?? 0)));
    const barScale = (BARS_H / 2 - 2) / maxChange;
    const barW = Math.max(3, Math.min(16, step * 0.55));
    const bars = points.map((p) => {
      const change = p.change ?? 0;
      const h = change === 0 ? 0 : Math.max(2, Math.abs(change) * barScale);
      return { x: p.x - barW / 2, y: change >= 0 ? barsMid - h : barsMid, h, up: change >= 0 };
    });

    // Changement de rang entre deux parties consécutives : montée ou descente.
    const tierChanges = points
      .map((p, i) => (i > 0 && p.tierId !== points[i - 1].tierId ? { ...p, promoted: p.tierId > points[i - 1].tierId } : null))
      .filter(Boolean);

    // Un repère de jour à chaque changement de date, en gardant un écart minimum
    // entre deux libellés pour qu'ils ne se chevauchent pas.
    const dayLabels = [];
    let lastX = -Infinity;
    points.forEach((p, i) => {
      const isNewDay = i === 0 || new Date(p.ts).toDateString() !== new Date(points[i - 1].ts).toDateString();
      if (isNewDay && p.x - lastX >= DAY_LABEL_GAP) {
        dayLabels.push({ ts: p.ts, x: Math.min(Math.max(p.x, PAD.left + 14), width - PAD.right - 14) });
        lastX = p.x;
      }
    });

    const last = points[n - 1];
    const lineColor = rankTiers.get(last.tierId)?.color ?? '#ff4655';
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = `${linePath} L ${last.x} ${curveBottom} L ${points[0].x} ${curveBottom} Z`;

    return { points, bands, bars, tierChanges, dayLabels, lineColor, linePath, areaPath, t0, t1, step, innerW, curveTop, curveBottom, barsMid };
  }, [entries, width, rankTiers]);

  const title = t('rankHistory.title');
  const refreshButton = (
    <button
      type="button"
      className={refreshing ? 'rank-history-refresh spinning' : 'rank-history-refresh'}
      onClick={handleRefresh}
      disabled={refreshing || cooling}
      title={cooling && !refreshing ? t('rankHistory.refreshCooldown') : t('rankHistory.refresh')}
      aria-label={t('rankHistory.refresh')}
    >
      <Icon icon={RefreshCw} size={14} />
    </button>
  );

  if (state.loading) {
    return (
      <CollapsibleCard id="stats.rankHistory" title={title} className="gs-card rank-history-card" headerExtra={refreshButton}>
        <p className="label">{t('rankHistory.loading')}</p>
      </CollapsibleCard>
    );
  }

  if (!chart) {
    return (
      <CollapsibleCard id="stats.rankHistory" title={title} className="gs-card rank-history-card" headerExtra={refreshButton}>
        <p className="label">{state.error ? t('rankHistory.unavailable') : t('rankHistory.notEnough')}</p>
      </CollapsibleCard>
    );
  }

  const { points, bands, bars, tierChanges, dayLabels, lineColor, linePath, areaPath, t0, t1, step, innerW, curveTop, curveBottom, barsMid } = chart;
  const gradientId = `rank-history-gradient-${lineColor.replace('#', '')}`;
  const hoveredPoint = hovered !== null ? points[hovered] : null;
  const current = points[points.length - 1];
  const netChange = entries.reduce((sum, entry) => sum + (entry.change ?? 0), 0);
  // Une icône de montée/descente de rang posée AU-DESSUS de son point, près du
  // haut du graphique et du bord droit, recouvrirait le libellé du rang actuel :
  // dans ce cas, le libellé passe à gauche (là où il n'y a rien en haut).
  const labelClash = tierChanges.some((p) => p.y - 22 >= 12 && p.y - 22 - 11 < 18 && p.x > PAD.left + innerW - 140);
  const days = Math.max(1, Math.ceil((t1 - t0) / DAY_MS));
  // Chiffres du bandeau au-dessus du graphique (même langage que « Stats
  // globales ») : tout vient de la fenêtre déjà affichée, aucun appel de plus.
  const changes = entries.map((entry) => entry.change).filter((value) => value !== null && value !== undefined);
  const bestGain = changes.length > 0 ? Math.max(...changes) : null;
  const worstLoss = changes.length > 0 ? Math.min(...changes) : null;

  // Survol sur toute la surface du graphique : on sélectionne la partie la plus
  // proche du curseur au lieu d'exiger de viser un point de 7 pixels.
  const handleMove = (event) => {
    const rect = event.currentTarget.ownerSVGElement.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    const index = Math.round((px - PAD.left) / step);
    setHovered(Math.min(points.length - 1, Math.max(0, index)));
  };

  return (
    <CollapsibleCard
      id="stats.rankHistory"
      title={title}
      className="gs-card rank-history-card"
      headerExtra={refreshButton}
    >
      <div className="gs-figures rh-figures">
        <div className="gs-figure">
          <span className="gs-figure-label">{t('rankHistory.netRr')}</span>
          <span className={netChange >= 0 ? 'gs-figure-value up' : 'gs-figure-value down'}>
            {netChange >= 0 ? '+' : '−'}
            {Math.abs(netChange)}
          </span>
          <span className="gs-figure-sub">{t('rankHistory.netSub', { days })}</span>
        </div>
        <div className="gs-figure">
          <span className="gs-figure-label">{t('rankHistory.bestGain')}</span>
          <span className="gs-figure-value up">{bestGain !== null && bestGain > 0 ? `+${bestGain}` : '—'}</span>
          <span className="gs-figure-sub">
            {worstLoss !== null && worstLoss < 0 ? t('rankHistory.worstLoss', { value: Math.abs(worstLoss) }) : ' '}
          </span>
        </div>
      </div>

      <div className="rh-panel">
      <div className="line-chart-wrap" ref={setWrapEl}>
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} className="rank-history-chart">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.28" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
            <clipPath id="rank-history-clip">
              <rect x={PAD.left} y={curveTop} width={innerW} height={curveBottom - curveTop} />
            </clipPath>
          </defs>

          <g clipPath="url(#rank-history-clip)">
            {bands.map((band) => (
              <g key={band.tierId}>
                <rect x={PAD.left} y={band.y} width={innerW} height={band.height} fill={band.color} opacity="0.09" />
                <line x1={PAD.left} x2={PAD.left + innerW} y1={band.y} y2={band.y} stroke={band.color} strokeOpacity="0.25" strokeDasharray="3 4" />
              </g>
            ))}
          </g>
          {bands.map(
            (band) =>
              band.height > 16 && (
                <text key={`l-${band.tierId}`} x={PAD.left + 6} y={band.y + 12} className="rank-history-band-label" style={{ fill: band.color }}>
                  {band.name}
                </text>
              ),
          )}

          {hoveredPoint && (
            <rect
              x={hoveredPoint.x - step / 2}
              y={curveTop}
              width={step}
              height={HEIGHT - PAD.bottom - curveTop}
              fill="var(--text)"
              opacity="0.05"
            />
          )}

          <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
          <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />

          {points.map((p, i) => (
            <circle
              key={p.date}
              cx={p.x}
              cy={p.y}
              r={hovered === i ? 5.5 : 3.5}
              fill={p.change === null || p.change >= 0 ? '#3ddc84' : '#ff4655'}
              stroke="var(--surface)"
              strokeWidth="1.5"
            />
          ))}

          {tierChanges.map((p) => {
            const above = p.y - 22 >= 12;
            const cy = above ? p.y - 22 : p.y + 22;
            const color = p.promoted ? '#3ddc84' : '#ff4655';
            return (
              <g key={`tc-${p.date}`}>
                <circle cx={p.x} cy={cy} r="11" fill="var(--surface)" stroke={color} strokeWidth="1.5" />
                {rankTiers.get(p.tierId)?.icon && (
                  <image href={rankTiers.get(p.tierId).icon} x={p.x - 8} y={cy - 8} width="16" height="16" />
                )}
              </g>
            );
          })}

          {/* Rang actuel, lisible sans survol ; laisse la place au survol quand il est actif. */}
          {hovered === null && (
            <text x={labelClash ? PAD.left + 6 : PAD.left + innerW} y={14} textAnchor={labelClash ? 'start' : 'end'} className="rank-history-current" style={{ fill: lineColor }}>
              {current.tierName} · {current.rr} RR
            </text>
          )}

          <line x1={PAD.left} x2={PAD.left + innerW} y1={barsMid} y2={barsMid} stroke="var(--border-strong)" strokeWidth="1" />
          {bars.map((bar, i) => (
            <rect
              key={points[i].date}
              x={bar.x}
              y={bar.y}
              width={Math.max(3, Math.min(16, step * 0.55))}
              height={bar.h}
              rx="1.5"
              fill={bar.up ? '#3ddc84' : '#ff4655'}
              opacity={hovered === null || hovered === i ? 0.9 : 0.45}
            />
          ))}

          {dayLabels.map((label) => (
            <text key={label.ts} x={label.x} y={HEIGHT - 8} textAnchor="middle" className="line-chart-axis">
              {formatDay(label.ts, i18n.language)}
            </text>
          ))}

          {hoveredPoint && (
            <line x1={hoveredPoint.x} x2={hoveredPoint.x} y1={curveTop} y2={HEIGHT - PAD.bottom} className="line-chart-hover-line" />
          )}

          <rect
            x="0"
            y="0"
            width={width}
            height={HEIGHT - PAD.bottom}
            fill="transparent"
            style={{ cursor: 'crosshair' }}
            onMouseMove={handleMove}
            onMouseLeave={() => setHovered(null)}
          />
        </svg>

        {hoveredPoint && (
          <div
            className="line-chart-tooltip"
            style={{ left: `${Math.min(Math.max(hoveredPoint.x, 78), width - 78)}px`, top: `${hoveredPoint.y}px` }}
          >
            <strong style={{ color: rankTiers.get(hoveredPoint.tierId)?.color }}>
              {hoveredPoint.tierName} — {hoveredPoint.rr} RR
            </strong>
            {hoveredPoint.change !== null && (
              <span className={hoveredPoint.change >= 0 ? 'rank-history-delta up' : 'rank-history-delta down'}>
                {hoveredPoint.change >= 0 ? '+' : '−'}
                {Math.abs(hoveredPoint.change)} RR
              </span>
            )}
            <span>
              {formatDay(hoveredPoint.ts, i18n.language)}
              {hoveredPoint.map ? ` · ${hoveredPoint.map}` : ''}
            </span>
          </div>
        )}
      </div>
      </div>

      <p className="label rank-history-foot">{t('rankHistory.foot', { count: entries.length, days })}</p>
    </CollapsibleCard>
  );
}

export default RankHistoryCard;
