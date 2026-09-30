import { buttonLabel } from './controllerBrand.js';

// Schéma générique de manette (pas un rendu de DualSense/Xbox précis —
// volontairement neutre, une seule silhouette pour toutes les marques,
// seules les ÉTIQUETTES changent selon `brand`, voir controllerBrand.js) :
// sert à repérer où se trouve chaque bouton pendant la réassignation (voir
// GamepadRemap.jsx). `highlight` colore le(s) bouton(s) liés à une action.
const DPAD_CENTER = { x: 150, y: 150 };
const FACE_CENTER = { x: 300, y: 104 };
const FACE_R = 26;

// Disposition « Xbox » (stick gauche en haut, croix directionnelle en bas) : la
// plus répandue, et les étiquettes suivent la marque détectée (controllerBrand.js).
const POSITIONS = {
  L2: { x: 58, y: 6, w: 84, h: 26, rx: 12 },
  R2: { x: 258, y: 6, w: 84, h: 26, rx: 12 },
  L1: { x: 50, y: 36, w: 96, h: 16, rx: 8 },
  R1: { x: 254, y: 36, w: 96, h: 16, rx: 8 },
  Select: { x: 152, y: 98, w: 46, h: 15, rx: 7.5 },
  Start: { x: 204, y: 98, w: 46, h: 15, rx: 7.5 },
  DpadUp: { cx: DPAD_CENTER.x, cy: DPAD_CENTER.y - 21, r: 12 },
  DpadDown: { cx: DPAD_CENTER.x, cy: DPAD_CENTER.y + 21, r: 12 },
  DpadLeft: { cx: DPAD_CENTER.x - 21, cy: DPAD_CENTER.y, r: 12 },
  DpadRight: { cx: DPAD_CENTER.x + 21, cy: DPAD_CENTER.y, r: 12 },
  Y: { cx: FACE_CENTER.x, cy: FACE_CENTER.y - FACE_R, r: 13 },
  A: { cx: FACE_CENTER.x, cy: FACE_CENTER.y + FACE_R, r: 13 },
  X: { cx: FACE_CENTER.x - FACE_R, cy: FACE_CENTER.y, r: 13 },
  B: { cx: FACE_CENTER.x + FACE_R, cy: FACE_CENTER.y, r: 13 },
  L3: { cx: 104, cy: 104, r: 25 },
  R3: { cx: 252, cy: 152, r: 25 },
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
    <svg viewBox="0 0 400 250" className="gp-diagram" role="img" aria-label="Schéma de manette">
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

      {/* Silhouette : corps large, deux poignées qui descendent vers le bas et une
          échancrure au centre — reconnaissable comme une manette sans copier un modèle précis. */}
      <path
        d="M 76 60
           C 100 50 140 48 170 52
           L 230 52
           C 260 48 300 50 324 60
           C 350 70 368 118 372 172
           C 376 218 358 240 334 236
           C 312 232 302 208 288 192
           C 278 182 266 180 254 180
           L 146 180
           C 134 180 122 182 112 192
           C 98 208 88 232 66 236
           C 42 240 24 218 28 172
           C 32 118 50 70 76 60 Z"
        className="gp-diagram-body"
      />
      <path d="M 90 66 C 120 58 150 58 176 62 L 224 62 C 250 58 280 58 310 66" className="gp-diagram-sheen" />

      {/* Gâchettes et pare-chocs : dessinés derrière le corps pour qu'ils en dépassent. */}
      <rect x={POSITIONS.L2.x - 6} y={POSITIONS.L2.y + 10} width={POSITIONS.L2.w + 12} height={26} rx={10} className="gp-diagram-shoulder" />
      <rect x={POSITIONS.R2.x - 6} y={POSITIONS.R2.y + 10} width={POSITIONS.R2.w + 12} height={26} rx={10} className="gp-diagram-shoulder" />

      {/* Croix directionnelle : la forme en plus derrière les quatre boutons. */}
      <path
        d={`M ${DPAD_CENTER.x - 10} ${DPAD_CENTER.y - 33} h 20 v 23 h 23 v 20 h -23 v 23 h -20 v -23 h -23 v -20 h 23 Z`}
        className="gp-diagram-dpad-plate"
      />
      <circle cx={200} cy={78} r={9} className="gp-diagram-home" />

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
