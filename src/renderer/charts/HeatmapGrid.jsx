import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import Icon from '../Icon.jsx';
import { PERIODS } from '../performanceCharts.js';
import { dayLabelKey } from '../valorantStats.js';

function sequentialColor(value) {
  // Vert au-dessus de 50 %, rouge Valorant en dessous : l'intensité grandit
  // avec l'écart à 50 %.
  const gap = Math.min(50, Math.abs(value - 50)) / 50;
  const alpha = 0.25 + gap * 0.6;
  return value >= 50 ? `rgba(61, 220, 132, ${alpha})` : `rgba(255, 70, 85, ${alpha})`;
}

const MIN_GAMES_FOR_PEAK = 3;

function HeatmapGrid({ grid }) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Met en avant le créneau avec le meilleur winrate, à condition d'avoir un
  // minimum d'échantillon — sinon un 100% sur 1 seule partie ressortirait
  // comme "meilleur créneau" de façon trompeuse.
  let peakId = null;
  let peakWinrate = -1;
  grid.forEach((row) =>
    row.periods.forEach((cell) => {
      if (cell.games >= MIN_GAMES_FOR_PEAK && cell.winrate > peakWinrate) {
        peakWinrate = cell.winrate;
        peakId = `${row.day}-${cell.id}`;
      }
    }),
  );

  return (
    <div className="heatmap-grid-chart">
      <div className="heatmap-grid-row heatmap-grid-header">
        <span className="heatmap-grid-row-label" />
        {PERIODS.map((p) => (
          <span key={p.id} className="heatmap-grid-col-label">
            <Icon icon={p.icon} size={14} /> {t(`heatmap.periods.${p.id}`)}
          </span>
        ))}
      </div>
      {grid.map((row, rowIndex) => (
        <div key={row.day} className="heatmap-grid-row">
          <span className="heatmap-grid-row-label">{t(dayLabelKey(row.day))}</span>
          {row.periods.map((cell, colIndex) => {
            const delay = (rowIndex * PERIODS.length + colIndex) * 22;
            const isPeak = `${row.day}-${cell.id}` === peakId;
            const tooltip =
              cell.games > 0
                ? t('heatmap.grid.gamesCount', { count: cell.games }) +
                  t('heatmap.grid.winrateSuffix', { percent: cell.winrate.toFixed(0) }) +
                  (isPeak ? t('heatmap.grid.peakSuffix') : '')
                : t('heatmap.grid.noData');
            return (
              <div
                key={cell.id}
                className={`heatmap-grid-cell ${cell.games === 0 ? 'empty' : ''} ${isPeak ? 'peak' : ''}`}
                style={{
                  background: cell.winrate === null ? undefined : sequentialColor(cell.winrate),
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? 'scale(1)' : 'scale(0.8)',
                  transitionDelay: `${delay}ms`,
                }}
                title={tooltip}
              >
                {isPeak && <span className="heatmap-grid-cell-star"><Icon icon={Star} size={12} /></span>}
                {cell.winrate !== null ? `${cell.winrate.toFixed(0)}%` : '–'}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default HeatmapGrid;
