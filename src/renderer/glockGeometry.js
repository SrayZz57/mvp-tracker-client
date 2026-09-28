import * as THREE from 'three';

// Gabarit du Glock partagé par le modèle (glockModel.js) et par les skins, pour
// que décors et textures suivent la forme de la carcasse. Repère : millimètres,
// x vers la bouche (arrière de culasse à 0), y vers le haut (bas de culasse à
// 0), z vers le flanc droit.
//
// Proportions d'un Glock 17 : culasse de 186 mm, poignée d'environ 104 mm sous
// la culasse, inclinée d'environ 22° à 27°, dos et face presque parallèles,
// ondulations pour les doigts et léger renflement de paume.

export const GRIP_BOTTOM = -103.5;
export const GRIP_HALF_WIDTH = 14.5;
export const FRAME_HALF_WIDTH = 13.5;

// Face avant de la poignée : segment qui porte les trois ondulations des doigts.
const FRONT_TOP = new THREE.Vector2(62, -50);
const FRONT_BOTTOM = new THREE.Vector2(39, -99);

function fingerGrooves(samples = 30) {
  const pts = [];
  const dir = FRONT_BOTTOM.clone().sub(FRONT_TOP);
  const normal = new THREE.Vector2(-dir.y, dir.x).normalize();
  if (normal.x < 0) normal.negate();
  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples;
    const bump = 1.5 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2 * 3)) * Math.sin(t * Math.PI);
    pts.push(FRONT_TOP.clone().lerp(FRONT_BOTTOM, t).addScaledVector(normal, bump));
  }
  return pts;
}

// Profil de la poignée (extrudé à part, plus large et plus arrondi que la
// carcasse, comme sur le vrai). Son haut chevauche la carcasse.
export function gripShape() {
  const s = new THREE.Shape();
  s.moveTo(-4, -29);
  s.lineTo(67, -29);
  s.lineTo(71, -37);
  s.quadraticCurveTo(64, -44, FRONT_TOP.x, FRONT_TOP.y);
  fingerGrooves().forEach((p) => s.lineTo(p.x, p.y));
  s.quadraticCurveTo(40, GRIP_BOTTOM, 34, GRIP_BOTTOM);
  s.lineTo(-10, GRIP_BOTTOM);
  s.quadraticCurveTo(-16, GRIP_BOTTOM, -16, -98);
  // Dos de poignée avec renflement de paume.
  s.quadraticCurveTo(-22, -62, -6, -30);
  s.closePath();
  return s;
}

// Carcasse : cache-poussière avec rail, pontet évidé, queue de castor. La
// poignée est une pièce à part (gripShape).
export function frameShape() {
  const s = new THREE.Shape();
  s.moveTo(8, -0.6);
  s.lineTo(166, -0.6);
  s.quadraticCurveTo(172, -0.6, 172, -6);
  s.lineTo(172, -14.5);
  s.lineTo(117, -14.5);
  // Pontet : face avant presque droite, crochet bas.
  s.quadraticCurveTo(114, -15.5, 113.5, -20);
  s.lineTo(112.8, -38);
  s.quadraticCurveTo(112, -44, 105.5, -44);
  s.lineTo(83, -44);
  s.quadraticCurveTo(75, -44, 72, -37.5);
  s.lineTo(68, -30);
  s.lineTo(-2, -30);
  // Queue de castor, discrète.
  s.lineTo(-4, -26);
  s.quadraticCurveTo(-8, -19, -12, -15);
  s.quadraticCurveTo(-15, -10.5, -9, -7.5);
  s.quadraticCurveTo(2, -3, 8, -0.6);

  const hole = new THREE.Path();
  hole.moveTo(107.8, -19);
  hole.lineTo(106.8, -37);
  hole.quadraticCurveTo(106.3, -40.3, 102, -40.3);
  hole.lineTo(84, -40.3);
  hole.quadraticCurveTo(79, -40.3, 77.5, -35.5);
  hole.lineTo(75.5, -24);
  hole.quadraticCurveTo(75.5, -19, 80, -19);
  hole.closePath();
  s.holes.push(hole);
  return s;
}

// Contours simplifiés (polygones) pour découper les textures des skins.
export const GRIP_OUTLINE = [
  [-6, -26], [66, -26], [71, -37], [62, -50], [39, -99], [34, GRIP_BOTTOM], [-10, GRIP_BOTTOM], [-16, -98], [-19, -65], [-6, -30],
];
export const FRAME_OUTLINE = [
  [-14, -4], [174, -4], [174, -16], [114, -16], [112, -44], [72, -44], [68, -30], [-6, -30],
];

// Trace le contour de la poignée dans un contexte canvas (repère en mm).
export function traceGrip(ctx) {
  ctx.beginPath();
  GRIP_OUTLINE.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

// Convertit un point placé sur l'ancienne poignée (haut y = -40, bas y = -122,
// dos x ≈ -6 → -8, face x ≈ 62 → 33) vers la même position relative sur la
// nouvelle (haut -38, bas -100, dos -7 → -15, face 68 → 39). Au-dessus de
// y = -30 rien ne change ; entre -30 et -40 on passe progressivement.
export function remapGrip(x, y) {
  if (y >= -30) return [x, y];
  const t = (y + 40) / -82;
  const backOld = -6 - 2 * t;
  const frontOld = 62 - 29 * t;
  const u = (x - backOld) / (frontOld - backOld);
  const backNew = -7 - 8 * t;
  const frontNew = 68 - 29 * t;
  const nx = backNew + u * (frontNew - backNew);
  const ny = -38 - 62 * t;
  const w = Math.min(1, (-30 - y) / 10);
  return [x + (nx - x) * w, y + (ny - y) * w];
}

// Décalage latéral des décors posés sur les flancs de la poignée (elle est
// 1 mm plus large de chaque côté que l'ancienne).
export function gripZ(z) {
  return Math.abs(z) >= 12 ? z + Math.sign(z) : z;
}

// Point de l'ancienne poignée converti en Vector3 (z ajusté).
export function gripPoint(x, y, z = 0) {
  const [nx, ny] = remapGrip(x, y);
  return new THREE.Vector3(nx, ny, y < -30 ? gripZ(z) : z);
}
