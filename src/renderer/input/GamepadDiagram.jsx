import { buttonLabel } from './controllerBrand.js';

// Schéma générique de manette (pas un rendu de DualSense/Xbox précis —
// volontairement neutre, une seule silhouette pour toutes les marques,
// seules les ÉTIQUETTES changent selon `brand`, voir controllerBrand.js) :
// sert à repérer où se trouve chaque bouton pendant la réassignation (voir
// GamepadRemap.jsx). `highlight` colore le(s) bouton(s) liés à une action.
const DPAD_CENTER = { x: 128, y: 100 };
const FACE_CENTER = { x: 272, y: 100 };
const FACE_R = 28;

const POSITIONS = {
  L2: { x: 52, y: 6, w: 76, h: 20, rx: 9 },
  R2: { x: 272, y: 6, w: 76, h: 20, rx: 9 },
  L1: { x: 52, y: 30, w: 76, h: 16, rx: 7 },
  R1: { x: 272, y: 30, w: 76, h: 16, rx: 7 },
  Select: { x: 144, y: 56, w: 52, h: 16, rx: 7 },
  Start: { x: 204, y: 56, w: 52, h: 16, rx: 7 },
  DpadUp: { cx: DPAD_CENTER.x, cy: DPAD_CENTER.y - 20, r: 12 },
  DpadDown: { cx: DPAD_CENTER.x, cy: DPAD_CENTER.y + 20, r: 12 },
  DpadLeft: { cx: DPAD_CENTER.x - 20, cy: DPAD_CENTER.y, r: 12 },
  DpadRight: { cx: DPAD_CENTER.x + 20, cy: DPAD_CENTER.y, r: 12 },
  Y: { cx: FACE_CENTER.x, cy: FACE_CENTER.y - FACE_R, r: 14 },
  A: { cx: FACE_CENTER.x, cy: FACE_CENTER.y + FACE_R, r: 14 },
  X: { cx: FACE_CENTER.x - FACE_R, cy: FACE_CENTER.y, r: 14 },
  B: { cx: FACE_CENTER.x + FACE_R, cy: FACE_CENTER.y, r: 14 },
  L3: { cx: 118, cy: 176, r: 24 },
  R3: { cx: 282, cy: 176, r: 24 },
};

const STICK_CAP_RATIO = 0.62;

function ButtonShape({ name, pos, fill, stroke, textColor, label, onClick, skipLabel }) {
  const isCircle = 'r' in pos;
  const cx = isCircle ? pos.cx : pos.x + pos.w / 2;
  const cy = isCircle ? pos.cy : pos.y + pos.h / 2;
  const common = {
    fill,
    stroke,
    strokeWidth: 1.5,
    style: onClick ? { cursor: 'pointer' } : undefined,
    onClick: onClick ? () => onClick(name) : undefined,
  };
  return (
    <g className="gp-diagram-btn">
      {isCircle ? <circle cx={cx} cy={cy} r={pos.r} {...common} /> : <rect x={pos.x} y={pos.y} width={pos.w} height={pos.h} rx={pos.rx} {...common} />}
      {!skipLabel && (
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={isCircle ? (pos.r >= 20 ? 12 : pos.r < 13 ? 9 : 10.5) : 9} fontWeight={600} fill={textColor} pointerEvents="none">
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * @param brand 'playstation' | 'xbox' | 'generic' (voir controllerBrand.js)
 * @param highlight { [buttonName]: colorHex } — colore ces boutons (une
 *   action liée dessus).
 * @param onButtonClick optionnel — clic direct sur un bouton du schéma.
 */
export default function GamepadDiagram({ brand = 'generic', highlight = {}, onButtonClick }) {
  return (
    <svg viewBox="0 0 400 224" className="gp-diagram" role="img" aria-label="Schéma de manette">
      <defs>
        <linearGradient id="gpBodyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b303c" />
          <stop offset="100%" stopColor="#14161d" />
        </linearGradient>
        <radialGradient id="gpStickGrad" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#3a4050" />
          <stop offset="100%" stopColor="#181a22" />
        </radialGradient>
      </defs>

      {/* Silhouette générique (deux poignées reliées par une barre centrale) —
          pas la forme exacte d'une DualSense/Xbox, juste assez reconnaissable
          comme "une manette" pour situer les boutons. */}
      <path
        d="M 52 98
           C 52 54 84 30 128 30
           L 272 30
           C 316 30 348 54 348 98
           C 348 146 322 194 276 210
           C 240 222 216 202 206 178
           L 194 178
           C 184 202 160 222 124 210
           C 78 194 52 146 52 98 Z"
        className="gp-diagram-body"
      />

      {/* Anneaux des sticks (le cache/support, sous le bouton lui-même). */}
      <circle cx={POSITIONS.L3.cx} cy={POSITIONS.L3.cy} r={POSITIONS.L3.r + 6} className="gp-diagram-stick-well" />
      <circle cx={POSITIONS.R3.cx} cy={POSITIONS.R3.cy} r={POSITIONS.R3.r + 6} className="gp-diagram-stick-well" />

      {Object.entries(POSITIONS).map(([name, pos]) => {
        const highlighted = highlight[name];
        const isStick = name === 'L3' || name === 'R3';
        const textColor = highlighted ? '#0b0d12' : 'var(--gp-btn-text, rgba(255, 255, 255, 0.75))';
        return (
          <g key={name}>
            <ButtonShape
              name={name}
              pos={pos}
              fill={highlighted ?? (isStick ? 'url(#gpStickGrad)' : 'var(--gp-btn-fill, #1b1e27)')}
              stroke={highlighted ? 'rgba(0, 0, 0, 0.35)' : 'var(--gp-btn-stroke, rgba(255, 255, 255, 0.22))'}
              textColor={textColor}
              label={buttonLabel(brand, name)}
              onClick={onButtonClick}
              skipLabel={isStick && !highlighted}
            />
            {isStick && !highlighted && (
              <>
                <circle cx={pos.cx} cy={pos.cy} r={pos.r * STICK_CAP_RATIO} className="gp-diagram-stick-cap" pointerEvents="none" />
                <text x={pos.cx} y={pos.cy + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill={textColor} pointerEvents="none">
                  {buttonLabel(brand, name)}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
