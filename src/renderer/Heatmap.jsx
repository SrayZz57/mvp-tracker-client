import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCw } from 'lucide-react';
import Icon from './Icon.jsx';
import { useMapMinimaps, useMapCoordinates } from './mapImages.js';
import { deathLocationsOnMap } from './valorantStats.js';
import { useWeaponCosts } from './weaponIcons.js';
import PlatformFilterToggle from './PlatformFilterToggle.jsx';
import usePlatformFilter from './usePlatformFilter.js';
import CollapsibleCard from './CollapsibleCard.jsx';

const CANVAS_SIZE = 640;
const POINT_RADIUS = 26;

const MODES = [
  { id: 'deaths', labelKey: 'heatmap.modes.deaths' },
  { id: 'kills', labelKey: 'heatmap.modes.kills' },
];

const SIDES = [
  { id: 'all', labelKey: 'heatmap.sides.all' },
  { id: 'attack', labelKey: 'heatmap.sides.attack' },
  { id: 'defense', labelKey: 'heatmap.sides.defense' },
];

// Pistol rounds : 1er, 2e, 13e et 14e round d'une partie (indices 0/1/12/13,
// avant/après le changement de camp au round 13 dans le format 24 rounds).
const GUN_ROUND_INDICES = new Set([0, 1, 12, 13]);
const FULL_BUY_THRESHOLD = 2500;

const ROUND_TYPES = [
  { id: 'all', labelKey: 'heatmap.roundTypes.all' },
  { id: 'gun', labelKey: 'heatmap.roundTypes.gun' },
  { id: 'full', labelKey: 'heatmap.roundTypes.full' },
  { id: 'eco', labelKey: 'heatmap.roundTypes.eco' },
];

// Un pistol round reste un pistol round peu importe le prix de l'arme —
// vérifié avant l'économie. Sinon classé par le coût de MON arme ce
// round-là (voir myWeaponId dans deathLocationsOnMap) ; `null` si l'arme
// n'est pas reconnue dans le référentiel valorant-api.com (couteau/arme
// retirée), pour ne compter ce point dans aucun des deux camps plutôt que
// de deviner.
function classifyRound(point, weaponCosts) {
  if (GUN_ROUND_INDICES.has(point.roundIndex)) return 'gun';
  const cost = point.myWeaponId ? weaponCosts.get(point.myWeaponId) : undefined;
  if (cost === undefined) return null;
  return cost > FULL_BUY_THRESHOLD ? 'full' : 'eco';
}

function Heatmap({ settings, matches }) {
  const { t } = useTranslation();
  const { platforms, platform, setPlatform, filteredMatches } = usePlatformFilter(matches);
  const minimaps = useMapMinimaps();
  const mapCoordinates = useMapCoordinates();
  const weaponCosts = useWeaponCosts();
  const [selectedMap, setSelectedMap] = useState('');
  const [mode, setMode] = useState('deaths');
  const [side, setSide] = useState('all');
  const [roundType, setRoundType] = useState('all');
  const [weapon, setWeapon] = useState('');
  const [rotation, setRotation] = useState(0); // 0 | 90 | 180 | 270
  const canvasRef = useRef(null);

  const mapNames = useMemo(() => [...minimaps.keys()].sort(), [minimaps]);

  useEffect(() => {
    if (!selectedMap && mapNames.length > 0) {
      setSelectedMap(mapNames[0]);
    }
  }, [mapNames, selectedMap]);

  useEffect(() => {
    setWeapon('');
  }, [selectedMap, mode, side, roundType]);

  const allPoints = useMemo(
    () => (selectedMap ? deathLocationsOnMap(filteredMatches, settings.name, settings.tag, selectedMap, mode) : []),
    [filteredMatches, settings.name, settings.tag, selectedMap, mode],
  );

  const sideFilteredPoints = useMemo(
    () => (side === 'all' ? allPoints : allPoints.filter((p) => p.side === side)),
    [allPoints, side],
  );

  const roundTypeFilteredPoints = useMemo(
    () =>
      roundType === 'all'
        ? sideFilteredPoints
        : sideFilteredPoints.filter((p) => classifyRound(p, weaponCosts) === roundType),
    [sideFilteredPoints, roundType, weaponCosts],
  );

  const weaponNames = useMemo(
    () => [...new Set(roundTypeFilteredPoints.map((p) => p.weapon).filter(Boolean))].sort(),
    [roundTypeFilteredPoints],
  );

  const points = useMemo(
    () => (weapon === '' ? roundTypeFilteredPoints : roundTypeFilteredPoints.filter((p) => p.weapon === weapon)),
    [roundTypeFilteredPoints, weapon],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const imageUrl = minimaps.get(selectedMap);
    const coords = mapCoordinates.get(selectedMap);
    if (!canvas || !imageUrl || !coords) return;

    let cancelled = false;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      // Rotation appliquée au repère du canvas AVANT de dessiner quoi que ce
      // soit : la carte et les points suivent alors la même rotation sans
      // avoir à recalculer les coordonnées des points séparément.
      ctx.save();
      ctx.translate(CANVAS_SIZE / 2, CANVAS_SIZE / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-CANVAS_SIZE / 2, -CANVAS_SIZE / 2);

      ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

      const color = mode === 'kills' ? '61, 220, 132' : '255, 70, 85';
      ctx.globalCompositeOperation = 'lighter';
      points.forEach((p) => {
        const fx = coords.xMultiplier * p.y + coords.xScalarToAdd;
        const fy = coords.yMultiplier * p.x + coords.yScalarToAdd;
        const px = fx * CANVAS_SIZE;
        const py = fy * CANVAS_SIZE;
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, POINT_RADIUS);
        gradient.addColorStop(0, `rgba(${color}, 0.35)`);
        gradient.addColorStop(1, `rgba(${color}, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, POINT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    };
    img.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [selectedMap, minimaps, mapCoordinates, points, mode, rotation]);

  return (
    <div>
      <PlatformFilterToggle platforms={platforms} platform={platform} onChange={setPlatform} />

      <CollapsibleCard id="heatmap" title={t('heatmap.title')} className="gs-card">
        <p className="label">{t('heatmap.description')}</p>

        <div className="filter-bar">
          <select value={selectedMap} onChange={(e) => setSelectedMap(e.target.value)}>
            {mapNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {MODES.map((m) => (
            <button
              key={m.id}
              className={m.id === mode ? 'strategy-tool active' : 'strategy-tool'}
              onClick={() => setMode(m.id)}
            >
              {t(m.labelKey)}
            </button>
          ))}
        </div>

        <div className="filter-bar">
          {SIDES.map((s) => (
            <button
              key={s.id}
              className={s.id === side ? 'strategy-tool active' : 'strategy-tool'}
              onClick={() => setSide(s.id)}
            >
              {t(s.labelKey)}
            </button>
          ))}
          {ROUND_TYPES.map((rt) => (
            <button
              key={rt.id}
              className={rt.id === roundType ? 'strategy-tool active' : 'strategy-tool'}
              onClick={() => setRoundType(rt.id)}
            >
              {t(rt.labelKey)}
            </button>
          ))}
          <select value={weapon} onChange={(e) => setWeapon(e.target.value)}>
            <option value="">{t('heatmap.allWeapons')}</option>
            {weaponNames.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
          <span className="heatmap-point-count">{t('heatmap.pointsAnalyzed', { count: points.length })}</span>
          <button
            className="strategy-tool"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            title={t('heatmap.rotate')}
          >
            <Icon icon={RotateCw} size={16} /> {t('heatmap.rotate')}
          </button>
          <div className="heatmap-legend">
            <span>{t('heatmap.legendLow')}</span>
            <span className={`heatmap-legend-bar ${mode}`} />
            <span>{t('heatmap.legendHigh')}</span>
          </div>
        </div>

        <div className="heatmap-canvas-wrap">
          <canvas ref={canvasRef} />
        </div>
      </CollapsibleCard>
    </div>
  );
}

export default Heatmap;
