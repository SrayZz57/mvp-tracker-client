// Construction à la première personne : pièces de la barre d'objets et calcul
// de l'emplacement d'une pièce d'après ce que vise le viseur. Donnée pure,
// sans three.js (testée dans buildMath.test.mjs).
//
// Coordonnées « terrain » : y = 0 au sol de l'arène (le moteur ajoute floorY).

export const GRID = 0.5;

// Tailles en mètres, pensées à l'échelle d'un agent (1,96 m) : un muret de
// 1,1 m couvre un joueur accroupi, un mur de 3 m cache un joueur debout.
export const PIECES = [
  { id: 'cube', w: 1, h: 1, d: 1 },
  { id: 'crate', w: 2, h: 2, d: 2 },
  { id: 'lowWall', w: 4, h: 1.1, d: 0.4 },
  { id: 'wall', w: 4, h: 3, d: 0.4 },
  { id: 'tallWall', w: 8, h: 6, d: 0.5 },
  { id: 'pillar', w: 0.6, h: 3, d: 0.6 },
  { id: 'platform', w: 4, h: 0.3, d: 4 },
  // Escalier : une seule pièce dans la barre, mais posée comme plusieurs
  // marches pleines (voir stairBoxes) — pas une pièce à un seul bloc comme
  // les autres, `d` est la profondeur TOTALE (toutes marches confondues).
  { id: 'stairs', w: 2, h: 2, d: 4, stairs: true },
  // Porte : un mur avec une ouverture prédécoupée (voir doorBoxes) — pareil,
  // pas un seul bloc : deux montants et un linteau au-dessus de l'ouverture.
  { id: 'door', w: 4, h: 3, d: 0.4, doorway: { w: 1.2, h: 2.2 }, door: true },
  { id: 'enemy' },
];

// Nombre de marches d'un escalier — profondeur et hauteur de chacune s'en
// déduisent (piece.d / STAIR_STEPS, piece.h / STAIR_STEPS).
export const STAIR_STEPS = 4;

// Emprise d'une pièce tournée d'un quart de tour `quarter` fois.
export function pieceDims(piece, quarter) {
  const odd = Math.abs(quarter) % 2 === 1;
  return { w: odd ? piece.d : piece.w, h: piece.h, d: odd ? piece.w : piece.d };
}

// Centre calé pour que les BORDS de la pièce tombent sur la grille (deux murs
// de 4 m posés côte à côte se touchent exactement).
export const snapCenter = (v, size) => Math.round((v - size / 2) / GRID) * GRID + size / 2;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Emplacement d'une pièce d'après le point visé.
 * @param hit     { point: {x,y,z}, normal: {x,y,z}, box?: {y} } — `box` = bloc
 *                visé (absent si c'est le sol) ; y en coordonnées terrain.
 * @param dims    emprise déjà tournée (voir pieceDims).
 * @param bounds  { halfW, halfD } : demi-taille de la salle.
 * @returns { x, y, z } — centre au sol (y = face du dessous), ou null.
 */
export function placeOnHit(hit, dims, bounds) {
  const { point, normal } = hit;
  let x;
  let z;
  let y;
  if (normal.y > 0.5) {
    // Sol ou dessus d'un bloc : on pose dessus, centré sous le viseur.
    x = snapCenter(point.x, dims.w);
    z = snapCenter(point.z, dims.d);
    y = point.y;
  } else if (normal.y < -0.5) {
    // Dessous d'un bloc (plafond) : rien à accrocher.
    return null;
  } else {
    // Face latérale : collée contre la face, alignée sur le bas du bloc visé
    // (poser des murs à la suite reste d'aplomb).
    const alongX = Math.abs(normal.x) > Math.abs(normal.z);
    x = alongX ? point.x + Math.sign(normal.x) * (dims.w / 2) : snapCenter(point.x, dims.w);
    z = alongX ? snapCenter(point.z, dims.d) : point.z + Math.sign(normal.z) * (dims.d / 2);
    y = hit.box ? hit.box.y : Math.max(0, Math.round((point.y - dims.h / 2) / GRID) * GRID);
  }
  return {
    x: clamp(x, -bounds.halfW + dims.w / 2, bounds.halfW - dims.w / 2),
    z: clamp(z, -bounds.halfD + dims.d / 2, bounds.halfD - dims.d / 2),
    y: Math.max(0, y),
  };
}

// Rotation exacte (sans trigo, donc sans imprécision) d'un décalage local par
// un nombre de quarts de tour — sert à orienter les marches d'un escalier
// dans le même sens que la pièce elle-même (voir pieceDims).
function rotateQuarterOffset(x, z, quarter) {
  switch (((quarter % 4) + 4) % 4) {
    case 1:
      return [-z, x];
    case 2:
      return [-x, -z];
    case 3:
      return [z, -x];
    default:
      return [x, z];
  }
}

// Décompose la pièce « escalier » en marches pleines empilées (du sol jusqu'à
// leur hauteur — pas des plaques flottantes, pour bloquer vue et tirs comme
// un vrai escalier). `center` = résultat de placeOnHit avec les dims tournées
// de la pièce ; chaque marche est tournée pareil, dans le même sens de
// montée que la pièce.
export function stairBoxes(center, piece, quarter) {
  const swapped = Math.abs(quarter) % 2 === 1;
  const stepDepth = piece.d / STAIR_STEPS;
  const stepRise = piece.h / STAIR_STEPS;
  return Array.from({ length: STAIR_STEPS }, (_, i) => {
    // i=0 (marche la plus basse) le plus près du joueur (+Z, voir la
    // convention de spawn dans arenaStore.js) : on monte en s'éloignant,
    // pas l'inverse.
    const localZ = piece.d / 2 - stepDepth * (i + 0.5);
    const [dx, dz] = rotateQuarterOffset(0, localZ, quarter);
    return {
      x: center.x + dx,
      z: center.z + dz,
      y: center.y,
      w: swapped ? stepDepth : piece.w,
      d: swapped ? piece.w : stepDepth,
      h: stepRise * (i + 1),
    };
  });
}

// Décompose la pièce « porte » en montants + linteau (une ouverture n'est
// pas un bloc percé, mais l'absence de bloc à cet endroit : deux piliers de
// part et d'autre, un bandeau plein au-dessus). `center` = résultat de
// placeOnHit avec les dims tournées de la pièce.
export function doorBoxes(center, piece, quarter) {
  const swapped = Math.abs(quarter) % 2 === 1;
  const { w: gapW, h: gapH } = piece.doorway;
  const sideW = (piece.w - gapW) / 2;
  const segments = [
    { localX: -(gapW / 2 + sideW / 2), width: sideW, y: 0, h: piece.h },
    { localX: gapW / 2 + sideW / 2, width: sideW, y: 0, h: piece.h },
    { localX: 0, width: gapW, y: gapH, h: piece.h - gapH },
  ].filter((s) => s.width > 0.01 && s.h > 0.01);
  return segments.map((s) => {
    const [dx, dz] = rotateQuarterOffset(s.localX, 0, quarter);
    return {
      x: center.x + dx,
      z: center.z + dz,
      y: center.y + s.y,
      w: swapped ? piece.d : s.width,
      d: swapped ? s.width : piece.d,
      h: s.h,
    };
  });
}

// Un ennemi se pose debout sur le sol ou sur le dessus d'un bloc.
export function placeEnemy(hit, bounds, margin = 0.4) {
  if (hit.normal.y <= 0.5) return null;
  const snap = (v) => Math.round(v / (GRID / 2)) * (GRID / 2);
  return {
    x: clamp(snap(hit.point.x), -bounds.halfW + margin, bounds.halfW - margin),
    z: clamp(snap(hit.point.z), -bounds.halfD + margin, bounds.halfD - margin),
    y: Math.max(0, hit.point.y),
  };
}
