import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MM, seeded, tiledTexture, softDotTexture, springStep, anchorAt, particleSystem, meshBurst, extrude, roundedShape } from './weaponKit.js';
import { LIVERY, livery, tracePolygon, magazineOutline, alongMagazine } from './vandalSkins.js';
import { captureParts, placePart, restorePart, shockRings, liveCanvas, easeOutCubic, easeOutBack, easeInOut, clamp01 } from './transcendentKit.js';

// MVP TRACKER — skin signature de l'app, seul skin du palier « Unique » (au-dessus
// de Transcendant). Céramique blanche, laque noire et aluminium anodisé rouge,
// comme une vraie ligne premium du jeu :
//  - la « courbe MVP » : un filet lumineux qui part du talon de la crosse et
//    remonte en zigzag (une courbe de stats qui progresse) jusqu'à une pointe de
//    flèche à l'avant du garde-main, parcourue d'impulsions de données ;
//  - l'emblème de l'app (croix directionnelle + flèche montante) en 3D, en
//    lévitation dans l'évidement de la crosse, tenu par trois projecteurs ;
//  - un écran de stats en direct sur le flanc gauche (celui que voit le joueur) :
//    compteur de tirs, série, courbe qui monte à chaque balle ;
//  - un compensateur en pointe de flèche autour d'un noyau d'énergie, des bobines
//    qui s'allument en cascade sur le canon nu.
// Apparition en quatre temps : l'emblème se forge au centre, rejoint la crosse,
// l'arme s'assemble pièce par pièce dans son plan holographique au passage d'un
// balayage, puis tout s'allume.
//
// Repère : x vers la bouche (crosse à 0), axe du canon y = 0, flanc gauche (vu
// par le joueur) vers -z. Rien au-dessus du couvercle (y > 35) : ligne de mire.
// Les textes et logos sont des décalcomanies séparées sur chaque flanc : la
// livrée est partagée par les deux flancs, un texte y serait lu à l'envers d'un
// côté.

const INTRO = 2.1;
const SCAN_FROM = 0.62;
const SCAN_TO = 1.5;
const FLY = 0.34;
const EMBLEM_AT = new THREE.Vector3(92, -20, 0);
const FORGE_AT = new THREE.Vector3(470, -4, 0);
const EMBLEM_S = 15;
const W = LIVERY.maxX - LIVERY.minX;
const H = LIVERY.maxY - LIVERY.minY;

// --- Logo de l'app, en unités (±1 = demi-envergure de la croix) -----------------

const ARM = 0.38;
const CHAMFER = 0.13;
const ZIGZAG = [[-0.98, -0.8], [-0.26, -0.03], [0.03, -0.31], [0.72, 0.5]];
const STROKE = 0.12;

// Croix directionnelle à bouts chanfreinés, décalée vers l'intérieur de `d` :
// insetter un chanfrein à 45° le raccourcit de d·(2 − √2).
function crossOutline(d = 0) {
  const s = 1 - d;
  const a = ARM - d;
  const c = CHAMFER - d * (2 - Math.SQRT2);
  return [
    [s, -a + c], [s, a - c], [s - c, a], [a, a], [a, s - c], [a - c, s], [-a + c, s], [-a, s - c],
    [-a, a], [-s + c, a], [-s, a - c], [-s, -a + c], [-s + c, -a], [-a, -a], [-a, -s + c], [-a + c, -s],
    [a - c, -s], [a, -s + c], [a, -a], [s - c, -a],
  ];
}

// Triangles des quatre directions, pointe vers l'extérieur (haut, droite, bas, gauche).
function dpadTriangles() {
  return [0, 1, 2, 3].map((k) => {
    const ang = Math.PI / 2 - (k * Math.PI) / 2;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return [[0.84, 0], [0.62, 0.14], [0.62, -0.14]].map(([x, y]) => [x * c - y * s, x * s + y * c]);
  });
}

// Flèche montante : polyligne épaisse (raccords en onglet) terminée par sa pointe,
// d'un seul contour pour pouvoir l'extruder sans faces qui se chevauchent.
function arrowOutline(grow = 0) {
  const hw = STROKE + grow;
  const pts = ZIGZAG.map(([x, y]) => new THREE.Vector2(x, y));
  const left = [];
  const right = [];
  const perp = (d) => new THREE.Vector2(-d.y, d.x);
  pts.forEach((p, i) => {
    const d0 = i > 0 ? p.clone().sub(pts[i - 1]).normalize() : null;
    const d1 = i < pts.length - 1 ? pts[i + 1].clone().sub(p).normalize() : null;
    let n;
    let len = hw;
    if (!d0) n = perp(d1);
    else if (!d1) n = perp(d0);
    else {
      const n0 = perp(d0);
      n = n0.clone().add(perp(d1)).normalize();
      len = hw / Math.max(0.3, n.dot(n0));
    }
    left.push(p.clone().addScaledVector(n, len));
    right.push(p.clone().addScaledVector(n, -len));
  });
  // Pointe : base perpendiculaire au dernier segment, à la fin du trait.
  const end = pts[pts.length - 1];
  const dir = end.clone().sub(pts[pts.length - 2]).normalize();
  const n = perp(dir);
  const half = 0.27 + grow * 1.6;
  const tip = end.clone().addScaledVector(dir, 0.5 + grow * 2.2);
  const head = [end.clone().addScaledVector(n, half), tip, end.clone().addScaledVector(n, -half)];
  return [...left, ...head, ...right.reverse()].map((v) => [v.x, v.y]);
}

const LOGO = {
  cross: crossOutline(),
  frame: crossOutline(0.1),
  frameHole: crossOutline(0.155),
  triangles: dpadTriangles(),
  arrow: arrowOutline(),
  halo: arrowOutline(0.075),
};

function unitPath(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

// Dessine le logo sur un canevas 2D (y vers le bas), centré en (cx, cy), demi-
// envergure `s` px. `knockout` : couleur du liseré qui détache la flèche de la
// croix, ou null pour le découper (transparent, laisse voir la surface).
function drawLogo(ctx, cx, cy, s, { cross = '#e01a33', line = '#ffffff', tri = '#ffffff', arrow = '#ff2a48', knockout = null, glow = 0 } = {}) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, -s);
  if (glow) {
    ctx.shadowColor = cross;
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = cross;
  unitPath(ctx, LOGO.cross);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = line;
  ctx.beginPath();
  LOGO.frame.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  [...LOGO.frameHole].reverse().forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill('evenodd');
  ctx.fillStyle = tri;
  LOGO.triangles.forEach((t) => {
    unitPath(ctx, t);
    ctx.fill();
  });
  if (knockout) {
    ctx.fillStyle = knockout;
    unitPath(ctx, LOGO.halo);
    ctx.fill();
  } else {
    ctx.globalCompositeOperation = 'destination-out';
    unitPath(ctx, LOGO.halo);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.fillStyle = arrow;
  unitPath(ctx, LOGO.arrow);
  ctx.fill();
  ctx.restore();
}

// --- Police vectorielle --------------------------------------------------------
// Lettres anguleuses à coins coupés, dans l'esprit du logotype de l'app, tracées
// en polylignes sur une grille 4 × 6 : aucune police à charger, rendu identique
// partout (les textures sont dessinées une seule fois, avant le chargement des
// polices web).

const O_SHAPE = [[1.2, 0], [0, 1.2], [0, 4.8], [1.2, 6], [2.8, 6], [4, 4.8], [4, 1.2], [2.8, 0], [1.2, 0]];
const P_SHAPE = [[0, 0], [0, 6], [3, 6], [4, 5], [4, 3.8], [3, 2.8], [0, 2.8]];
const GLYPHS = {
  A: [[[0, 0], [0, 4.5], [1.5, 6], [2.5, 6], [4, 4.5], [4, 0]], [[0, 2.6], [4, 2.6]]],
  C: [[[4, 6], [1.2, 6], [0, 4.8], [0, 1.2], [1.2, 0], [4, 0]]],
  D: [[[0, 0], [0, 6], [2.8, 6], [4, 4.8], [4, 1.2], [2.8, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[0.5, 0], [0.5, 6]]],
  K: [[[0, 0], [0, 6]], [[4, 6], [1.3, 3], [4, 0]], [[0, 3], [1.3, 3]]],
  L: [[[0, 6], [0, 0], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 3.2], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [O_SHAPE],
  P: [P_SHAPE],
  Q: [O_SHAPE, [[2.6, 1.4], [4.2, -0.4]]],
  R: [P_SHAPE, [[2, 2.8], [4, 0]]],
  S: [[[4, 6], [1, 6], [0, 5], [0, 4], [1, 3], [3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 1.2], [1.2, 0], [2.8, 0], [4, 1.2], [4, 6]]],
  V: [[[0, 6], [2, 0], [4, 6]]],
  0: [O_SHAPE, [[1.2, 1.8], [2.8, 4.2]]],
  1: [[[0.4, 4.8], [1.6, 6], [1.6, 0]]],
  2: [[[0, 4.8], [1.2, 6], [2.8, 6], [4, 4.8], [4, 3.8], [0, 0], [4, 0]]],
  3: [[[0, 6], [4, 6], [1.8, 3.6], [2.8, 3.6], [4, 2.5], [4, 1.1], [2.9, 0], [0, 0]]],
  4: [[[3, 0], [3, 6], [0, 2], [4, 2]]],
  5: [[[4, 6], [0, 6], [0, 3.6], [2.9, 3.6], [4, 2.5], [4, 1.1], [2.9, 0], [0, 0]]],
  6: [[[3.6, 6], [1.2, 6], [0, 4.8], [0, 1.2], [1.2, 0], [2.8, 0], [4, 1.2], [4, 2.4], [2.8, 3.6], [0, 3.6]]],
  7: [[[0, 6], [4, 6], [1.4, 0]]],
  8: [[[1.1, 3.2], [0, 4.3], [0, 4.9], [1.1, 6], [2.9, 6], [4, 4.9], [4, 4.3], [2.9, 3.2], [1.1, 3.2], [0, 2.1], [0, 1.1], [1.1, 0], [2.9, 0], [4, 1.1], [4, 2.1], [2.9, 3.2]]],
  9: [[[0.4, 0], [2.8, 0], [4, 1.2], [4, 4.8], [2.8, 6], [1.2, 6], [0, 4.8], [0, 3.6], [1.2, 2.4], [4, 2.4]]],
  '+': [[[2, 1], [2, 5]], [[0, 3], [4, 3]]],
  '-': [[[0.6, 3], [3.4, 3]]],
  '/': [[[0, 0], [3, 6]]],
  '·': [[[0.5, 2.7], [0.5, 3.3]]],
};
const GLYPH_W = { I: 1, 1: 2.4, '/': 3, '·': 1, ' ': 2.6 };
const glyphWidth = (ch) => GLYPH_W[ch] ?? 4;

function textWidth(text, h, gap = 1.5) {
  const k = h / 6;
  return [...text].reduce((sum, ch) => sum + glyphWidth(ch) * k, 0) + gap * k * Math.max(0, text.length - 1);
}

// `y` = ligne de base (canevas y vers le bas), `h` = hauteur des capitales en px.
function drawText(ctx, text, x, y, h, color, { gap = 1.5, weight = 0.95, glow = 0, align = 'left' } = {}) {
  const k = h / 6;
  const total = textWidth(text, h, gap);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = weight * k;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'square';
  ctx.miterLimit = 6;
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  [...text].forEach((ch) => {
    const w = glyphWidth(ch);
    const map = ([gx, gy]) => [cx + (weight / 2 + (gx * (w - weight)) / w) * k, y - (weight / 2 + (gy * (6 - weight)) / 6) * k];
    (GLYPHS[ch] ?? []).forEach((line) => {
      const closed = line.length > 2 && line[0][0] === line[line.length - 1][0] && line[0][1] === line[line.length - 1][1];
      const pts = closed ? line.slice(0, -1) : line;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [px, py] = map(p);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      if (closed) ctx.closePath();
      ctx.stroke();
    });
    cx += (w + gap) * k;
  });
  ctx.restore();
  return total;
}

// Décalcomanies : canevas dessinés une seule fois pour toute la durée de l'app.
const decalCache = new Map();
function decalTexture(key, width, height, draw) {
  if (!decalCache.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    decalCache.set(key, canvas);
  }
  const texture = new THREE.CanvasTexture(decalCache.get(key));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// --- Livrée ----------------------------------------------------------------------

const GRIP_OUTLINE = [[322, -20], [376, -20], [371, -46], [362, -60], [364, -74], [354, -88], [355, -102], [345, -118], [341, -136], [297, -141], [287, -127], [309, -52]];
const DUST_COVER = [[232, 19], [496, 19], [496, 30], [252, 35], [232, 29]];
const HANDGUARD_VENTS = [0, 1, 2, 3].map((i) => {
  const x0 = 532 + i * 40;
  return [[x0, 4], [x0 + 22, 4], [x0 + 13, -15], [x0 - 9, -15]];
});
const UPPER_VENTS = [0, 1, 2, 3, 4].map((i) => {
  const x0 = 548 + i * 26;
  return [[x0, 22], [x0 + 14, 22], [x0 + 14, 28], [x0, 28]];
});
// La « courbe MVP » : du talon à l'avant du garde-main, toujours plus haut.
const MVP_CURVE = [[34, -90], [102, -58], [166, -28], [212, -12], [254, -16], [330, -16], [368, -2], [398, -13], [472, -1], [506, 9], [682, 9]];
const MVP_HEAD = [[682, 15], [700, 9], [682, 3]];
const MUZZLE_CHEVRONS = [856, 866, 876];

// Teintes par canevas : couleur, et « ORM » (R = relief, G = rugosité, B = métal :
// une seule texture pour bumpMap, roughnessMap et metalnessMap).
const PAL = {
  color: { black: '#0b0c10', white: '#eceef2', red: '#c50f2c', inlay: '#ffd3da', print: '#f4f5f7' },
  orm: { black: 'rgb(200,50,84)', white: 'rgb(200,86,0)', red: 'rgb(200,70,232)', inlay: 'rgb(168,36,0)', print: 'rgb(196,70,0)' },
};

function outlinesOf(geo) {
  return {
    stock: geo.stockOutline.map(([x, y]) => [x, y]),
    stockHole: geo.stockHole.map(([x, y]) => [x, y]),
    handguard: geo.handguardOutline.map(([x, y]) => [x, y]),
    magazine: magazineOutline(geo.magazineCurve),
  };
}

function polyline(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
}

// Tissage de carbone 2/2 (sergé), en motif répété de 5 mm.
function twillPattern(ctx, light, dark) {
  const tile = document.createElement('canvas');
  tile.width = 16;
  tile.height = 16;
  const t = tile.getContext('2d');
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      const horizontal = (i + j) % 4 < 2;
      const g = horizontal ? t.createLinearGradient(0, j * 4, 0, j * 4 + 4) : t.createLinearGradient(i * 4, 0, i * 4 + 4, 0);
      g.addColorStop(0, dark);
      g.addColorStop(0.5, light);
      g.addColorStop(1, dark);
      t.fillStyle = g;
      t.fillRect(i * 4, j * 4, 4, 4);
    }
  }
  const pattern = ctx.createPattern(tile, 'repeat');
  pattern.setTransform(new DOMMatrix().scale(1 / 3.2));
  return pattern;
}

// Trame de triangles ton sur ton dans la céramique (le motif de la croix
// directionnelle), visible seulement de près, comme sur les céramiques du jeu.
function ceramicTrame(ctx) {
  ctx.save();
  ctx.strokeStyle = 'rgba(150,158,172,0.22)';
  ctx.lineWidth = 0.22;
  const step = 7;
  const h = step * Math.sin(Math.PI / 3);
  for (let k = -200; k < 200; k += 1) {
    [0, Math.PI / 3, (2 * Math.PI) / 3].forEach((a) => {
      const cx = 450 + Math.cos(a + Math.PI / 2) * k * h;
      const cy = -60 + Math.sin(a + Math.PI / 2) * k * h;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * 700, cy - Math.sin(a) * 700);
      ctx.lineTo(cx + Math.cos(a) * 700, cy + Math.sin(a) * 700);
      ctx.stroke();
    });
  }
  ctx.restore();
}

// Surfaces : céramique blanche en haut et sur la crosse, laque noire en bas,
// aluminium rouge pour le chargeur, le bras de crosse et les pièces d'avant.
function paintSurfaces(ctx, mode, o) {
  const P = PAL[mode];
  const isColor = mode === 'color';
  const fill = (pts, color) => {
    tracePolygon(ctx, pts);
    ctx.fillStyle = color;
    ctx.fill();
  };
  const groove = (pts, width = 0.7, close = false) => {
    if (isColor) return;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = 'rgb(70,255,255)';
    ctx.lineWidth = width;
    if (close) tracePolygon(ctx, pts);
    else polyline(ctx, pts);
    ctx.stroke();
    ctx.restore();
  };

  ctx.fillStyle = P.black;
  ctx.fillRect(LIVERY.minX, LIVERY.minY, W, H);

  // Carcasse et puits de chargeur : carbone sous la laque.
  ctx.save();
  ctx.fillStyle = isColor ? twillPattern(ctx, '#181a20', '#0b0c10') : twillPattern(ctx, 'rgb(214,46,84)', 'rgb(190,60,84)');
  ctx.fillRect(219, -46, 287, 69);
  ctx.restore();

  // Couvercle et garde-main supérieur : bande de céramique blanche continue.
  const topBand = DUST_COVER.map(([x, y]) => [x, y + (y > 20 ? 4 : -0.6)]);
  fill(topBand, P.white);
  ctx.fillStyle = P.white;
  ctx.fillRect(504, 16.6, 200, 24);
  if (isColor) {
    ctx.save();
    ctx.beginPath();
    topBand.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.rect(504, 16.6, 200, 24);
    ctx.clip();
    ceramicTrame(ctx);
    ctx.restore();
  }
  UPPER_VENTS.forEach((v) => groove(v, 1.2, true));
  groove([[232, 18.6], [496, 18.6]], 0.9);
  groove([[504, 16.6], [700, 16.6]], 0.9);

  // Crosse : céramique, talon noir, bras inférieur rouge (la flèche qui monte).
  ctx.save();
  ctx.beginPath();
  o.stock.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.clip();
  ctx.beginPath();
  ctx.rect(LIVERY.minX, LIVERY.minY, 219.5 - LIVERY.minX, H);
  ctx.clip();
  ctx.fillStyle = P.white;
  ctx.fillRect(LIVERY.minX, -140, 240, 200);
  if (isColor) ceramicTrame(ctx);
  fill([[38, -80], [66, -69], [219.5, 11], [219.5, -140], [30, -140]], P.red);
  fill([[-20, 40], [36, 40], [50, -112], [-20, -112]], P.black);
  groove([[66, -69], [219.5, 11]], 0.9);
  groove([[36, 40], [50, -112]], 0.9);
  ctx.restore();

  // Poignée : laque noire granitée.
  fill(GRIP_OUTLINE, P.black);
  if (!isColor) {
    ctx.save();
    tracePolygon(ctx, GRIP_OUTLINE);
    ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    const rand = seeded(5731);
    for (let i = 0; i < 9000; i += 1) {
      ctx.fillStyle = rand() < 0.5 ? 'rgb(120,200,255)' : 'rgb(170,230,255)';
      const sz = 0.35 + rand() * 0.3;
      ctx.fillRect(290 + rand() * 82, -140 + rand() * 112, sz, sz);
    }
    ctx.restore();
  }

  // Garde-main : laque noire, bloc rouge qui monte vers la bouche.
  ctx.save();
  ctx.beginPath();
  o.handguard.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.clip();
  ctx.beginPath();
  ctx.rect(503, -60, 220, 120);
  ctx.clip();
  ctx.fillStyle = P.black;
  ctx.fillRect(500, -40, 220, 58);
  fill([[566, -40], [720, -40], [720, -9], [690, -9], [676, -19.5], [604, -19.5]], P.red);
  groove([[604, -19.5], [676, -19.5], [690, -9], [720, -9]], 0.8);
  HANDGUARD_VENTS.forEach((v) => groove(v, 1.4, true));
  ctx.restore();

  // Bloc d'emprunt rouge à pied noir biseauté, compensateur noir.
  ctx.fillStyle = P.red;
  ctx.fillRect(706, -16, 48, 54);
  fill([[706, -16], [754, -16], [754, 2], [740, -6], [706, -6]], P.black);
  groove([[706, -6], [740, -6], [754, 2]], 0.8);
  groove([[706, 26], [754, 26]], 0.8);

  // Chargeur : aluminium rouge, semelle noire striée.
  ctx.save();
  tracePolygon(ctx, o.magazine);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(LIVERY.minX, LIVERY.minY, W, -42.5 - LIVERY.minY);
  ctx.clip();
  ctx.fillStyle = P.red;
  ctx.fillRect(400, -230, 200, 200);
  ctx.restore();
}

// Détails imprimés (couleur) et filets lumineux (couleur, ORM et lumière).
function paintDetails(ctx, mode, o, curve) {
  const isColor = mode === 'color';
  const isGlow = mode === 'glow';
  const P = PAL[mode];
  const stroke = (pts, width, color, close = false) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'miter';
    if (close) tracePolygon(ctx, pts);
    else polyline(ctx, pts);
    ctx.stroke();
  };
  // Filet lumineux : halo large et doux, puis cœur clair. Dans la livrée de
  // couleur, le même tracé devient une incrustation rose pâle (visible éteinte).
  const lightLine = (pts, core = 1, close = false, strength = 1) => {
    if (isGlow) {
      stroke(pts, core * 5.5, `rgba(255,30,60,${0.14 * strength})`, close);
      stroke(pts, core * 2.8, `rgba(255,40,72,${0.5 * strength})`, close);
      stroke(pts, core * 1.1, `rgba(255,214,222,${strength})`, close);
    } else {
      stroke(pts, core * 1.5, P.inlay, close);
    }
  };
  const fillPoly = (pts, color) => {
    tracePolygon(ctx, pts);
    ctx.fillStyle = color;
    ctx.fill();
  };

  // Courbe MVP et sa pointe de flèche.
  lightLine(MVP_CURVE, 1.2);
  if (isGlow) {
    ctx.save();
    ctx.shadowColor = 'rgba(255,40,72,1)';
    ctx.shadowBlur = 18;
    fillPoly(MVP_HEAD, 'rgba(255,200,210,1)');
    ctx.restore();
  } else {
    fillPoly(MVP_HEAD, P.inlay);
  }

  // Joint lumineux entre carcasse et couvercle.
  lightLine([[222, 20.3], [503, 20.3]], 0.7, false, 0.6);
  // Lumières du garde-main, cerclées de rouge.
  HANDGUARD_VENTS.forEach((v) => lightLine(v, 0.8, true, 0.85));
  UPPER_VENTS.forEach((v) => lightLine(v, 0.5, true, 0.45));
  // Liseré autour de l'évidement de la crosse, qui encadre l'emblème.
  ctx.save();
  tracePolygon(ctx, o.stock);
  ctx.clip();
  lightLine(o.stockHole, 1.4, true, 0.7);
  ctx.restore();
  // Chevrons du compensateur.
  MUZZLE_CHEVRONS.forEach((x) => lightLine([[x - 3, 9.5], [x + 3, 4], [x - 3, -1.5]], 1, false, 1));

  // Triangles des quatre directions sur le talon, montant vers le haut, et trois
  // flèches vers la bouche à l'arrière de la carcasse.
  const tri = isColor ? P.print : isGlow ? 'rgba(255,190,200,0.35)' : P.print;
  [-4, -15, -26].forEach((y) => fillPoly([[20, y + 7], [14, y], [26, y]], tri));
  [236, 246, 256].forEach((x) => fillPoly([[x + 7, 2], [x, 7], [x, -3]], tri));

  if (isGlow) {
    // Languette rouge du couvercle, qui luit doucement.
    ctx.fillStyle = 'rgba(255,40,70,0.35)';
    ctx.fillRect(238, 24, 20, 8);
    return;
  }

  // Impressions (couleur) / reliefs fins (ORM).
  ctx.fillStyle = P.red;
  ctx.fillRect(238, 24, 20, 8);
  ctx.fillStyle = isColor ? '#15161b' : P.black;
  ctx.fillRect(236, 22.2, 260, 0.7);
  // Réglette de graduations sur le couvercle et sous la carcasse (des barres de stats).
  ctx.fillStyle = isColor ? 'rgba(20,22,28,0.55)' : 'rgb(184,80,0)';
  for (let x = 270; x < 490; x += 6) ctx.fillRect(x, 25.5, 0.6, (x / 6) % 4 === 0 ? 3.4 : 1.8);
  ctx.fillStyle = isColor ? 'rgba(240,242,246,0.75)' : 'rgb(190,60,84)';
  for (let x = 226; x < 422; x += 4) ctx.fillRect(x, -22, 0.9, [3, 5, 2, 7, 4, 6, 3, 8][Math.floor(x / 4) % 8] * 0.55);
  // Code-barres de série près du puits.
  const rand = seeded(9901);
  for (let x = 476; x < 500; ) {
    const w = 0.4 + Math.floor(rand() * 3) * 0.45;
    ctx.fillRect(x, 8, w, 7);
    x += w + 0.5 + rand() * 0.8;
  }
  // Bloc d'emprunt : deux flèches blanches vers la bouche, filet clair.
  [714, 726].forEach((x) => fillPoly([[x + 8, 12], [x, 17], [x, 7]], P.print));
  ctx.fillStyle = isColor ? 'rgba(240,242,246,0.8)' : P.print;
  ctx.fillRect(708, 27.5, 44, 0.8);
  // Puits : cartouche blanc fin et étiquette rouge.
  ctx.strokeStyle = isColor ? 'rgba(240,242,246,0.6)' : 'rgb(184,60,84)';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(432, -37, 66, 12);
  ctx.fillStyle = P.red;
  ctx.fillRect(484, -35, 11, 4);
  // Poignée : flèche rouge vers le haut, filet blanc au dos.
  fillPoly([[338, -30], [331, -40], [345, -40]], P.red);
  stroke([[300, -128], [318, -56], [326, -30]], 0.8, isColor ? 'rgba(240,242,246,0.7)' : P.print);
  // Garde-main : filet blanc au-dessus du bloc rouge.
  stroke([[600, -22], [674, -22], [688, -12], [704, -12]], 0.6, P.print);
  // Chargeur : deux filets blancs le long du bord avant, semelle noire.
  ctx.save();
  tracePolygon(ctx, o.magazine);
  ctx.clip();
  const along = (t, across) => {
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const w = (64 - 6 * t) / 2;
    return [p.x - tan.y * (w - across), p.y + tan.x * (w - across)];
  };
  if (isColor) {
    // Brossage de l'aluminium, le long de la courbe du chargeur.
    const brush = seeded(4417);
    for (let a = 1; a < 62; a += 0.45) {
      const t0 = 0.05 + brush() * 0.3;
      stroke(Array.from({ length: 9 }, (_, i) => along(t0 + i * 0.07, a)), 0.12 + brush() * 0.15, brush() < 0.5 ? `rgba(255,255,255,${0.04 + brush() * 0.06})` : `rgba(40,0,6,${0.06 + brush() * 0.08})`);
    }
  }
  [4.5, 7].forEach((a) => stroke(Array.from({ length: 13 }, (_, i) => along(0.14 + i * 0.05, a)), 0.6, P.print));
  const cut = [along(0.8, -2), along(0.8, 66), along(1.2, 66), along(1.2, -2)];
  fillPoly(cut, P.black);
  if (!isColor) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 7; i += 1) {
      const t = 0.83 + i * 0.024;
      stroke([along(t, 4), along(t, 56)], 1, 'rgb(110,255,255)');
    }
    ctx.restore();
  }
  ctx.restore();
}

// Fait varier la lumière dans le shader : courbe qui « respire », impulsions de
// données qui filent vers la bouche, reflet de vitrine qui balaie l'arme de temps
// en temps, et front de balayage de l'apparition (seul ce qui est derrière le
// front est allumé).
function fxShader(material, uniforms, glsl) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const decl = Object.keys(uniforms).map((k) => `uniform float ${k};`).join('\n');
    shader.fragmentShader = `${decl}\n${shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${glsl}`)}`;
  };
  material.customProgramCacheKey = () => glsl;
  return material;
}

function mvpFinish(env, geo) {
  const u = geo.uniforms;
  const o = outlinesOf(geo);
  const fx = { uIgnite: { value: 5000 }, uScan: { value: 0 } };
  const color = livery('mvp-color', (ctx) => {
    paintSurfaces(ctx, 'color', o);
    paintDetails(ctx, 'color', o, geo.magazineCurve);
  }, { background: PAL.color.black, color: true });
  const orm = livery('mvp-orm', (ctx) => {
    paintSurfaces(ctx, 'orm', o);
    paintDetails(ctx, 'orm', o, geo.magazineCurve);
  }, { background: PAL.orm.black });
  const glow = livery('mvp-glow', (ctx) => paintDetails(ctx, 'glow', o, geo.magazineCurve), { background: '#000000', color: true });

  const face = fxShader(
    new THREE.MeshPhysicalMaterial({
      envMap: env,
      envMapIntensity: 1,
      map: color,
      roughness: 1,
      roughnessMap: orm,
      metalness: 1,
      metalnessMap: orm,
      bumpMap: orm,
      bumpScale: 1.1,
      clearcoat: 1,
      clearcoatRoughness: 0.07,
      emissive: 0xffffff,
      emissiveMap: glow,
      emissiveIntensity: 1.5,
    }),
    { uTime: u.uTime, uFlare: u.uFlare, ...fx },
    `
      vec2 pm = vEmissiveMapUv * vec2(${W}.0, ${H}.0) + vec2(${LIVERY.minX}.0, ${LIVERY.minY}.0);
      float lit = 1.0 - smoothstep(uIgnite - 10.0, uIgnite + 10.0, pm.x);
      float flow = pow(fract(pm.x * 0.0042 - uTime * 0.75), 16.0) + 0.6 * pow(fract(pm.x * 0.0042 - uTime * 0.75 + 0.5), 30.0);
      totalEmissiveRadiance *= lit * (0.72 + 0.2 * sin(uTime * 2.1) + flow * 2.6 + uFlare * 2.6);
      float s = pm.x + pm.y * 0.7;
      float sweep = mod(uTime * 320.0, 3400.0) - 260.0;
      float band = exp(-pow((s - sweep) / 20.0, 2.0)) + 0.6 * exp(-pow((s - sweep + 46.0) / 6.0, 2.0));
      totalEmissiveRadiance += diffuseColor.rgb * band * 0.32;
      float front = exp(-pow((pm.x - uIgnite) / 7.0, 2.0)) * uScan;
      totalEmissiveRadiance += vec3(1.0, 0.18, 0.28) * front * 2.2;
    `,
  );
  const coat = { envMap: env, clearcoat: 1, clearcoatRoughness: 0.08 };
  const blackWall = new THREE.MeshPhysicalMaterial({ ...coat, color: 0x0b0c10, metalness: 0.3, roughness: 0.22 });
  const whiteWall = new THREE.MeshPhysicalMaterial({ ...coat, color: 0xe2e5ea, metalness: 0, roughness: 0.34 });
  const redWall = new THREE.MeshPhysicalMaterial({ ...coat, color: 0xb20e27, metalness: 0.9, roughness: 0.28 });
  const titanium = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.1, color: 0x30333b, metalness: 1, roughness: 0.2 });
  const chrome = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.4, color: 0xe4e8ef, metalness: 1, roughness: 0.08 });
  const anodized = new THREE.MeshPhysicalMaterial({ ...coat, envMapIntensity: 1.3, color: 0xd2152f, metalness: 0.85, roughness: 0.22, clearcoatRoughness: 0.05 });
  const white = tiledTexture('mvp-white', 8, (ctx, size) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
  }, { color: true });
  // Énergie qui file dans le canon, vue à travers les lumières du garde-main.
  const barrel = fxShader(
    new THREE.MeshStandardMaterial({ envMap: env, color: 0x0c0d10, metalness: 0.9, roughness: 0.25, emissive: 0xff1c3c, emissiveMap: white }),
    { uTime: u.uTime, uFlare: u.uFlare },
    'totalEmissiveRadiance *= 0.04 + 2.6 * pow(fract(vEmissiveMapUv.y * 7.0 + uTime * 2.1), 14.0) + uFlare * 2.2;',
  );
  const receiver = [face, blackWall];
  const shellBody = new THREE.CylinderGeometry(5.6 * MM, 5.6 * MM, 24 * MM, 14);
  const shellBand = new THREE.CylinderGeometry(5.9 * MM, 5.9 * MM, 3 * MM, 14);
  const shellBandMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 0.25, 0.4) });
  return {
    receiver,
    dustCover: [face, whiteWall],
    magwell: [face, blackWall],
    gasBlock: [face, redWall],
    muzzle: [face, blackWall],
    stock: [face, whiteWall],
    grip: [face, blackWall],
    handguard: [face, blackWall],
    upperGuard: [face, whiteWall],
    magazine: [face, redWall],
    buttPad: [blackWall, blackWall],
    metal: titanium,
    barrel,
    dark: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9 }),
    sight: new THREE.MeshBasicMaterial({ color: 0xff3048 }),
    brass: titanium,
    flash: 'mvp',
    light: 0xff3a52,
    smoke: 0xffc8d0,
    glow: [],
    // Douille de laque noire cerclée d'un anneau rouge lumineux.
    makeShell: () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(shellBody, titanium));
      const band = new THREE.Mesh(shellBand, shellBandMat);
      band.position.y = 6 * MM;
      g.add(band);
      return g;
    },
    decorate: (ctx) => decorateMvp({ ...ctx, geo, env, fx, receiver, mats: { face, blackWall, whiteWall, redWall, titanium, chrome, anodized } }),
  };
}

// --- Emblème 3D -------------------------------------------------------------------

function unitShape(pts, s, holes = []) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * s, y * s)));
  holes.forEach((h) => shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x * s, y * s)))));
  return shape;
}

// Croix en aluminium anodisé, liseré lumineux, triangles qui s'allument tour à
// tour, flèche en avant détachée par un liseré clair. `doubleSided` : une face
// complète de chaque côté, chacune lisible dans le bon sens. La flèche de la
// face arrière dépasse de la croix à l'opposé de celle de devant : seule la face
// tournée vers la caméra est affichée (bascule quand l'emblème est vu par la
// tranche, donc invisible).
function buildEmblem(s, { anodized, arrowMat, lineMat, triMats }, { doubleSided = true } = {}) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(extrude(unitShape(LOGO.cross, s), s * 0.2, s * 0.045, { curveSegments: 2, bevelSegments: 3 }), anodized);
  group.add(base);
  const front = s * 0.1 + s * 0.045;
  const faceOf = () => {
    const f = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.ShapeGeometry(unitShape(LOGO.frame, s, [LOGO.frameHole])), lineMat);
    frame.position.z = front + 0.12;
    f.add(frame);
    const tris = LOGO.triangles.map((t, i) => {
      const m = new THREE.Mesh(new THREE.ShapeGeometry(unitShape(t, s)), triMats[i]);
      m.position.z = front + 0.16;
      f.add(m);
      return m;
    });
    const arrow = new THREE.Group();
    f.add(arrow);
    const halo = new THREE.Mesh(extrude(unitShape(LOGO.halo, s), s * 0.03, 0, { curveSegments: 1 }), lineMat);
    halo.position.z = front + s * 0.05;
    arrow.add(halo);
    const body = new THREE.Mesh(extrude(unitShape(LOGO.arrow, s), s * 0.09, s * 0.022, { curveSegments: 1, bevelSegments: 2 }), arrowMat);
    body.position.z = front + s * 0.12;
    arrow.add(body);
    return { group: f, tris, arrow };
  };
  const faces = [faceOf()];
  group.add(faces[0].group);
  if (doubleSided) {
    faces.push(faceOf());
    faces[1].group.rotation.y = Math.PI;
    group.add(faces[1].group);
    const eye = new THREE.Vector3();
    base.onBeforeRender = (renderer, scene, camera) => {
      eye.setFromMatrixPosition(camera.matrixWorld);
      base.worldToLocal(eye);
      faces[0].group.visible = eye.z >= 0;
      faces[1].group.visible = eye.z < 0;
    };
  }
  return { group, base, faces };
}

function emblemMaterials(env, anodized) {
  return {
    anodized,
    arrowMat: new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1.2, color: 0xff2440, metalness: 0.55, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04, emissive: 0xff1030, emissiveIntensity: 0.45 }),
    lineMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.25, 1.35) }),
    triMats: [0, 1, 2, 3].map(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1) })),
  };
}

// Anneau de données holographique (graduations, arcs, repères des quatre directions).
function dataRingTexture(key, inner, { ticks = 120, arcs = 4, marks = true } = {}) {
  return tiledTexture(key, 512, (ctx, size) => {
    const c = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    const r0 = c * inner;
    const span = c - r0;
    for (let i = 0; i < ticks; i += 1) {
      const a = (i / ticks) * Math.PI * 2;
      const long = i % 10 === 0;
      ctx.lineWidth = long ? 3 : 1.4;
      ctx.globalAlpha = long ? 1 : 0.55;
      const ra = r0 + span * (long ? 0.08 : 0.3);
      const rb = r0 + span * 0.62;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * ra, c + Math.sin(a) * ra);
      ctx.lineTo(c + Math.cos(a) * rb, c + Math.sin(a) * rb);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
    for (let i = 0; i < arcs; i += 1) {
      const a0 = (i / arcs) * Math.PI * 2 + 0.18;
      ctx.beginPath();
      ctx.arc(c, c, r0 + span * 0.82, a0, a0 + (Math.PI * 2) / arcs - 0.36);
      ctx.stroke();
    }
    if (marks) {
      [0, 1, 2, 3].forEach((k) => {
        const a = (k * Math.PI) / 2;
        ctx.save();
        ctx.translate(c + Math.cos(a) * (r0 + span * 0.82), c + Math.sin(a) * (r0 + span * 0.82));
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(span * 0.3, 0);
        ctx.lineTo(-span * 0.12, span * 0.26);
        ctx.lineTo(-span * 0.12, -span * 0.26);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });
    }
  }, { color: true });
}

// --- Écran de stats ------------------------------------------------------------

// Écran OLED du flanc gauche : compteur de tirs, série, courbe de performance qui
// monte à chaque balle, voyant « LIVE ». Redessiné à 30 i/s au plus.
function createHud() {
  const WD = 1040;
  const HT = 200;
  const { canvas, ctx, texture } = liveCanvas(WD, HT);
  const overlay = document.createElement('canvas');
  overlay.width = WD;
  overlay.height = HT;
  {
    const g = overlay.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.26)';
    for (let y = 0; y < HT; y += 4) g.fillRect(0, y, WD, 2);
    const v = g.createRadialGradient(WD / 2, HT / 2, HT * 0.4, WD / 2, HT / 2, WD * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = v;
    g.fillRect(0, 0, WD, HT);
  }
  const graph = Array.from({ length: 34 }, (_, i) => 0.2 + 0.36 * (i / 33) + 0.05 * Math.sin(i * 0.7) + 0.03 * Math.sin(i * 2.3));
  const st = { on: true, boot: -1, shots: 0, streak: 0, sinceShot: 9, pop: 0, clock: 0, push: 0, time: 0 };
  let acc = 1;

  const drawGraph = (x0, y0, w, h) => {
    ctx.strokeStyle = 'rgba(255,60,85,0.16)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x0, y0 + (h * i) / 4);
      ctx.lineTo(x0 + w, y0 + (h * i) / 4);
      ctx.stroke();
    }
    const pts = graph.map((v, i) => [x0 + (w * i) / (graph.length - 1), y0 + h - v * h]);
    const area = ctx.createLinearGradient(0, y0, 0, y0 + h);
    area.addColorStop(0, 'rgba(255,40,70,0.45)');
    area.addColorStop(1, 'rgba(255,40,70,0)');
    ctx.beginPath();
    ctx.moveTo(x0, y0 + h);
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(x0 + w, y0 + h);
    ctx.closePath();
    ctx.fillStyle = area;
    ctx.fill();
    ctx.save();
    ctx.shadowColor = '#ff2a48';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = '#ffd8de';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    const [lx, ly] = pts[pts.length - 1];
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(lx, ly, 7 + st.pop * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const drawMain = () => {
    ctx.strokeStyle = 'rgba(255,60,85,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < WD; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HT);
      ctx.stroke();
    }
    // Bloc du logo.
    ctx.fillStyle = 'rgba(255,30,60,0.1)';
    ctx.fillRect(14, 14, 172, 172);
    ctx.strokeStyle = 'rgba(255,60,85,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 14, 172, 172);
    drawLogo(ctx, 100, 100, 64 + st.pop * 4, { cross: '#ff2340', line: '#ffffff', tri: '#ffffff', arrow: '#ff4a62', knockout: '#14060a', glow: 18 });
    // Titre et voyant.
    drawText(ctx, 'MVP TRACKER', 214, 46, 24, '#ff3a55', { glow: 8 });
    const blink = Math.sin(st.time * 5) > -0.2;
    ctx.fillStyle = blink ? '#ff2a48' : '#4a0a14';
    ctx.beginPath();
    ctx.arc(930, 34, 8, 0, Math.PI * 2);
    ctx.fill();
    drawText(ctx, 'LIVE', 1022, 46, 20, '#ffd0d8', { align: 'right' });
    // Compteur de tirs.
    const digits = String(st.shots % 10000).padStart(4, '0');
    const flash = st.pop;
    const dw = drawText(ctx, digits, 214, 152, 80, flash > 0.05 ? `rgb(255,${Math.round(255 - flash * 120)},${Math.round(255 - flash * 100)})` : '#ffffff', { glow: 10 + flash * 20, weight: 1.05 });
    drawText(ctx, 'SHOTS', 214 + dw + 18, 152, 20, '#ff8a9a');
    if (st.pop > 0) {
      ctx.globalAlpha = st.pop;
      drawText(ctx, '+1', 214 + dw + 18, 110 - (1 - st.pop) * 26, 26, '#ff3a55', { glow: 10 });
      ctx.globalAlpha = 1;
    }
    // Série : jauge qui se remplit en rafale.
    const fillW = Math.min(1, st.streak / 25);
    ctx.fillStyle = 'rgba(255,60,85,0.18)';
    ctx.fillRect(214, 172, 380, 8);
    ctx.fillStyle = '#ff2a48';
    ctx.fillRect(214, 172, 380 * fillW, 8);
    drawText(ctx, 'STREAK', 600, 182, 14, '#ff8a9a');
    // Courbe de performance.
    drawGraph(640, 70, 380, 110);
  };

  const drawBoot = (b) => {
    if (b < 0.1) {
      ctx.fillStyle = `rgba(255,${Math.round(150 + b * 900)},${Math.round(160 + b * 900)},${1 - b * 6})`;
      ctx.fillRect(0, 0, WD, HT);
      return;
    }
    const k = easeOutBack(clamp01((b - 0.1) / 0.2));
    drawLogo(ctx, 360, 100, 70 * k, { cross: '#ff2340', line: '#ffffff', tri: '#ffffff', arrow: '#ff4a62', knockout: '#05060a', glow: 26 });
    if (b > 0.2) {
      ctx.globalAlpha = clamp01((b - 0.2) / 0.12);
      drawText(ctx, 'MVP', 460, 92, 54, '#ffffff', { glow: 14 });
      drawText(ctx, 'TRACKER', 460, 150, 34, '#ff3a55', { glow: 10 });
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(255,60,85,0.25)';
    ctx.fillRect(460, 172, 300, 6);
    ctx.fillStyle = '#ff2a48';
    ctx.fillRect(460, 172, 300 * clamp01((b - 0.1) / 0.4), 6);
  };

  const draw = () => {
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, WD, HT);
    if (st.on) {
      if (st.boot >= 0 && st.boot < 0.62) drawBoot(st.boot);
      else drawMain();
      // Petites déchirures horizontales pendant le démarrage et au tir.
      const tear = st.boot >= 0 && st.boot < 0.7 ? 1 : st.pop > 0.6 ? 0.4 : 0;
      for (let i = 0; i < tear * 5; i += 1) {
        const y = Math.random() * HT;
        const h = 4 + Math.random() * 14;
        ctx.drawImage(canvas, 0, y, WD, h, (Math.random() - 0.5) * 40, y, WD, h);
      }
      // Bande de rafraîchissement qui descend lentement.
      const band = ((st.time * 60) % (HT + 80)) - 40;
      const g = ctx.createLinearGradient(0, band - 30, 0, band + 30);
      g.addColorStop(0, 'rgba(255,90,110,0)');
      g.addColorStop(0.5, 'rgba(255,90,110,0.07)');
      g.addColorStop(1, 'rgba(255,90,110,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, band - 30, WD, 60);
    }
    ctx.drawImage(overlay, 0, 0);
    texture.needsUpdate = true;
  };

  return {
    texture,
    power(on) {
      st.on = on;
      st.boot = -1;
      draw();
    },
    boot() {
      st.on = true;
      st.boot = 0;
    },
    fire() {
      st.shots += 1;
      st.streak += 1;
      st.sinceShot = 0;
      st.pop = 1;
      // Chaque balle fait monter la courbe (avec un peu de bruit), comme une
      // partie qui tourne bien.
      const last = graph[graph.length - 1];
      graph.push(Math.min(0.97, last + 0.035 + Math.random() * 0.05 - (last > 0.85 ? 0.08 : 0)));
      graph.shift();
    },
    update(dt) {
      st.time += dt;
      st.sinceShot += dt;
      st.pop = Math.max(0, st.pop - dt * 3);
      if (st.boot >= 0) st.boot += dt;
      if (st.sinceShot > 0.6) st.streak = 0;
      // Au repos, la courbe défile doucement en revenant vers sa moyenne.
      st.push += dt;
      if (st.push > 0.45 && st.sinceShot > 0.5) {
        st.push = 0;
        const last = graph[graph.length - 1];
        graph.push(Math.min(0.95, Math.max(0.12, last + (0.5 - last) * 0.12 + (Math.random() - 0.5) * 0.12)));
        graph.shift();
      }
      acc += dt;
      if (acc >= 1 / 30) {
        acc = 0;
        draw();
      }
    },
  };
}

// --- Décor -------------------------------------------------------------------------

// Plan collé sur un flanc (side = 1 : droit, +z ; -1 : gauche, -z), lisible dans
// le bon sens de chaque côté. `angle` : pente dans le repère de l'arme vue de droite.
function decal(parent, material, w, h, x, y, z, side, angle = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.set(x, y, side * z);
  m.rotation.set(0, side < 0 ? Math.PI : 0, side < 0 ? -angle : angle);
  m.userData.noGhost = true;
  parent.add(m);
  return m;
}

function decalMaterial(map, extra = {}) {
  return new THREE.MeshPhysicalMaterial({ map, transparent: true, depthWrite: false, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, ...extra });
}

// Hologramme des pièces pendant l'apparition : bord lumineux (Fresnel) et lignes
// de balayage, en additif. Une instance par pièce (opacité propre), même programme.
function ghostMaterial(time) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uOpacity: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = -mv.xyz;
        vN = normalMatrix * normal;
        vP = position;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float scan = 0.55 + 0.45 * sin(vP.y * 1.4 - uTime * 18.0);
        float grid = step(0.9, fract(vP.x * 0.1)) * 0.5;
        float a = (0.1 + f * 1.3 + grid * 0.25) * scan * uOpacity;
        gl_FragColor = vec4(vec3(1.0, 0.16, 0.26) * a + vec3(1.0) * f * f * a * 0.4, 1.0);
      }
    `,
  });
}

function decorateMvp({ body, add, scene, parts, carrier, geo, env, fx, receiver, mats }) {
  const u = geo.uniforms;

  // Pièces d'origine remplacées : frein de bouche, rail de lunette (l'écran prend
  // sa place), âme. Retirées de la scène, pas seulement masquées : l'apparition
  // rend visibles toutes les pièces qu'elle déplace.
  body.remove(parts.muzzle, parts.rail, ...parts.railGrooves);
  body.children.filter((m) => m.geometry?.type === 'CircleGeometry' && m.position.x > 900).forEach((m) => body.remove(m));
  const receiverMesh = body.children.find((m) => m.material === receiver);
  const halo = softDotTexture('mvp-halo', 'rgba(255,90,110,1)', 'rgba(255,30,60,0)');

  // Bobines du canon nu : anneaux qui s'allument en cascade vers la bouche.
  const coils = body.children
    .filter((m) => m.geometry?.type === 'CylinderGeometry' && m.geometry.parameters.radiusTop === 10 && m.geometry.parameters.height === 4)
    .sort((a, b) => a.position.x - b.position.x)
    .map((m) => {
      m.material = new THREE.MeshStandardMaterial({ envMap: env, color: 0x1a1b20, metalness: 0.9, roughness: 0.25, emissive: 0xff1c3c, emissiveIntensity: 0.6 });
      return m;
    });

  // --- Écran de stats (flanc gauche, à la place du rail) ----------------------
  const hud = createHud();
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(132, 31, 2.6, 2, 0.9), mats.titanium);
  bezel.position.set(330, -1, -17.5);
  bezel.userData.noGhost = true;
  receiverMesh.add(bezel);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(124, 23.8),
    new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.7, color: 0x030305, metalness: 0, roughness: 0.12, emissive: 0xffffff, emissiveMap: hud.texture, emissiveIntensity: 1.25 }),
  );
  screen.position.set(330, -1, -18.85);
  screen.rotation.y = Math.PI;
  screen.userData.noGhost = true;
  receiverMesh.add(screen);

  // --- Décalcomanies --------------------------------------------------------------
  const wordmark = decalTexture('mvp-wordmark', 1060, 150, (ctx, w, h) => {
    drawLogo(ctx, 70, h / 2, 62, { cross: '#d4112d', line: '#ffffff', tri: '#ffffff', arrow: '#ff2a48' });
    const x = drawText(ctx, 'MVP', 160, 122, 96, '#111216', { weight: 1.1 });
    drawText(ctx, 'TRACKER', 160 + x + 44, 122, 96, '#c50f2c', { weight: 1.1 });
  });
  const wordMat = decalMaterial(wordmark);
  [1, -1].forEach((side) => decal(parts.stock, wordMat, 64, 9.06, 124, 16.8, 19.18, side, -0.022));

  const magLogo = decalTexture('mvp-maglogo', 512, 512, (ctx, w, h) => {
    drawLogo(ctx, w / 2, h / 2, 210, { cross: '#121318', line: '#ffffff', tri: '#ffffff', arrow: '#ffffff' });
  });
  const magGlow = decalTexture('mvp-maglogo-glow', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    drawLogo(ctx, w / 2, h / 2, 210, { cross: '#000000', line: '#ff6a80', tri: '#ffc0cc', arrow: '#c8606e', knockout: '#000000' });
  });
  const magMat = decalMaterial(magLogo, { emissive: 0xffffff, emissiveMap: magGlow, emissiveIntensity: 1 });
  const magAt = alongMagazine(geo.magazineCurve, 0.5, 0, 0);
  const magTan = geo.magazineCurve.getTangent(0.5);
  const magAngle = Math.atan2(magTan.x, -magTan.y);
  [1, -1].forEach((side) => decal(parts.magazine, magMat, 36, 36, magAt.position.x, magAt.position.y, 14.45, side, magAngle));

  const tag = decalTexture('mvp-tag', 980, 120, (ctx) => {
    const x = drawText(ctx, 'UNIQUE', 10, 100, 80, '#f4f5f7', { weight: 1 });
    drawText(ctx, '· 001/001', 10 + x + 30, 100, 80, '#ff3a55', { weight: 1 });
  });
  decal(receiverMesh, decalMaterial(tag, { emissive: 0xff2a48, emissiveIntensity: 0.15 }), 36.75, 4.5, 300, -9, 17.2, 1);

  // Badge 3D (flanc droit, côté éjection).
  const emblemMats = emblemMaterials(env, mats.anodized);
  const badge = buildEmblem(6.5, emblemMats, { doubleSided: false });
  badge.group.position.set(300, 3.5, 17.2 + 6.5 * 0.145);
  badge.group.traverse((n) => (n.userData.noGhost = true));
  receiverMesh.add(badge.group);

  // --- Compensateur « pointe de flèche » ----------------------------------------
  const muzzle = new THREE.Group();
  body.add(muzzle);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.8, 22, 32), mats.titanium);
  sleeve.rotation.z = Math.PI / 2;
  sleeve.position.set(842, 3, 0);
  muzzle.add(sleeve);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(10, 1.1, 10, 40), mats.chrome);
  trim.rotation.y = Math.PI / 2;
  trim.position.set(851, 3, 0);
  muzzle.add(trim);
  const jaws = new THREE.Mesh(
    extrude(roundedShape([[850, -11, 2], [886, -11, 3], [913, -1, 1.2], [906, 1.6, 1], [878, 0, 2], [878, 8, 2], [906, 6.4, 1], [913, 9, 1.2], [886, 19, 3], [850, 19, 2]]), 20, 1.2),
    [mats.face, mats.blackWall],
  );
  muzzle.add(jaws);
  const core = new THREE.Group();
  core.position.set(895, 4, 0);
  muzzle.add(core);
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.1, 1.25) });
  const coreBall = new THREE.Mesh(new THREE.SphereGeometry(2.6, 18, 12), coreMat);
  core.add(coreBall);
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: 0xff3a55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
  coreGlow.scale.set(30, 30, 1);
  core.add(coreGlow);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 0.35, 0.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.45, 8, 48), ringMat);
  muzzleRing.rotation.y = Math.PI / 2;
  muzzleRing.position.x = 22;
  core.add(muzzleRing);
  const orbitTri = new THREE.ShapeGeometry(unitShape([[1, 0], [-0.6, 0.7], [-0.6, -0.7]], 1.5));
  const orbiters = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(orbitTri, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.4, 1.5), side: THREE.DoubleSide }));
    core.add(m);
    return { m, phase: (i / 3) * Math.PI * 2 };
  });

  // --- Emblème en lévitation dans la crosse ---------------------------------------
  const holder = new THREE.Group();
  holder.position.copy(EMBLEM_AT);
  body.add(holder);
  const emblem = buildEmblem(EMBLEM_S, emblemMats);
  const spinner = new THREE.Group();
  spinner.add(emblem.group);
  holder.add(spinner);
  const back = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: 0xff2a48, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
  back.scale.set(62, 62, 1);
  holder.add(back);
  const ringInner = new THREE.Mesh(
    new THREE.RingGeometry(20.6, 23.4, 96, 1),
    new THREE.MeshBasicMaterial({ map: dataRingTexture('mvp-ring-a', 20.6 / 23.4), color: 0xff3350, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  const ringOuter = new THREE.Mesh(
    new THREE.RingGeometry(24.1, 25.1, 96, 1),
    new THREE.MeshBasicMaterial({ map: dataRingTexture('mvp-ring-b', 24.1 / 25.1, { ticks: 60, arcs: 6, marks: false }), color: 0xffb0bc, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  const rings = new THREE.Group();
  holder.add(rings);
  rings.add(ringInner, ringOuter);

  // Trois projecteurs sur les bords de l'évidement, reliés à l'emblème.
  const beams = new THREE.Group();
  body.add(beams);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xff3350, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
  const nodeGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 0.6, 0.75) });
  [
    [new THREE.Vector3(118, 9.4, 0), new THREE.Vector3(0, -1, 0)],
    [new THREE.Vector3(50.2, -27, 0), new THREE.Vector3(1, 0, 0)],
    [new THREE.Vector3(102.6, -50.6, 0), new THREE.Vector3(-0.462, 0.886, 0)],
  ].forEach(([at, normal]) => {
    const node = new THREE.Mesh(new THREE.SphereGeometry(3.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.chrome);
    node.position.copy(at);
    node.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    parts.stock.add(node);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 8), nodeGlow);
    lens.position.copy(at).addScaledVector(normal, 2.4);
    parts.stock.add(lens);
    const dir = EMBLEM_AT.clone().sub(at);
    const len = dir.length() - 21;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.1, len, 8, 1, true), beamMat);
    beam.position.copy(at).addScaledVector(dir.clone().normalize(), 2.4 + len / 2);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
    beams.add(beam);
  });

  // --- Effets -----------------------------------------------------------------------
  const sparks = particleSystem(scene, softDotTexture('mvp-spark', 'rgba(255,255,255,1)', 'rgba(255,40,70,0)'), { max: 160 });
  const chevronTex = tiledTexture('mvp-chevron', 64, (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    ctx.shadowColor = 'rgba(255,40,72,1)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(size / 2, 12);
    ctx.lineTo(size - 12, size - 16);
    ctx.lineTo(12, size - 16);
    ctx.closePath();
    ctx.fill();
  }, { color: true });
  const risers = particleSystem(scene, chevronTex, { max: 24 });
  const shards = meshBurst(scene, { max: 60 });
  const shardGeo = new THREE.ShapeGeometry(unitShape([[1, 0], [-0.6, 0.7], [-0.6, -0.7]], 2.8 * MM));
  const shardMats = [new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 0.25, 0.4), side: THREE.DoubleSide }), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 2, 2), side: THREE.DoubleSide })];
  const shock = shockRings(scene, { color: 0xff2a48, count: 10, thickness: 0.028 });
  const shockWhite = shockRings(scene, { color: 0xffe0e6, count: 6, thickness: 0.012 });
  const mouth = anchorAt(body, 916, 4, 0);
  const hudAnchor = anchorAt(body, 330, 12, -24);
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const spin = { x: 0, v: 0 };
  const corePulse = { x: 0, v: 0 };
  const ringBoost = { x: 0, v: 0 };
  let spinTarget = 0;
  let time = 0;
  let moteClock = 0;
  const MOUTH = new THREE.Vector3(916, 4, 0);
  const FACING = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  let coilFire = -10;
  // Sursaut de lumière propre au skin : vandalModel remet uFlare à sa valeur à
  // chaque image, on le relève ici tant que ce sursaut n'est pas retombé.
  let boost = 0;

  const burstSparks = (at, count, speed, tint = 0xff6a80, life = 520) => {
    for (let i = 0; i < count; i += 1) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      sparks.spawn(at, v, { life: life * (0.7 + Math.random() * 0.6), size: 0.0026 + Math.random() * 0.002, drag: 2.4, tint: Math.random() < 0.3 ? 0xffffff : tint });
    }
  };

  // --- Apparition ---------------------------------------------------------------------
  const blueprint = new THREE.Group();
  body.add(blueprint);
  const scanTex = tiledTexture('mvp-scan', 128, (ctx, size) => {
    const g = ctx.createLinearGradient(0, 0, size, 0);
    g.addColorStop(0, 'rgba(255,40,70,0)');
    g.addColorStop(0.5, 'rgba(255,60,90,0.8)');
    g.addColorStop(1, 'rgba(255,40,70,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(255,220,228,0.9)';
    for (let y = 0; y < size; y += 8) ctx.fillRect(size / 2 - 1, y, 2, 4);
  }, { color: true });
  const scanPlane = new THREE.Mesh(new THREE.PlaneGeometry(14, 320), new THREE.MeshBasicMaterial({ map: scanTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const scanSheet = new THREE.Group();
  scanSheet.add(scanPlane);
  const scanCross = scanPlane.clone();
  scanCross.rotation.y = Math.PI / 2;
  scanCross.scale.x = 8;
  scanSheet.add(scanCross);
  scanSheet.position.set(0, -75, 0);
  scanSheet.visible = false;
  body.add(scanSheet);

  const pieces = captureParts([body], [holder, beams, blueprint, scanSheet, carrier]);

  // Effets lancés pendant update() (apparition, particules d'ambiance) : dans le
  // repère de l'arme, en millimètres. Le Vestiaire laisse l'arme dans sa pose de
  // vue joueur pendant update() et ne la recentre qu'après : des effets en espace
  // monde y apparaîtraient décalés. Ceux du tir, lancés hors update(), restent en
  // espace monde (ils ne suivent pas le recul).
  const local = new THREE.Group();
  body.add(local);
  const localSparks = particleSystem(local, softDotTexture('mvp-spark', 'rgba(255,255,255,1)', 'rgba(255,40,70,0)'), { max: 140 });
  const localShock = shockRings(local, { color: 0xff2a48, count: 6, thickness: 0.028 });
  const localShockWhite = shockRings(local, { color: 0xffe0e6, count: 3, thickness: 0.012 });
  const localBurst = (at, count, speed, tint = 0xff6a80, life = 520) => {
    for (let i = 0; i < count; i += 1) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      localSparks.spawn(at, v, { life: life * (0.7 + Math.random() * 0.6), size: 2.6 + Math.random() * 2, drag: 2.4, tint: Math.random() < 0.3 ? 0xffffff : tint });
    }
  };
  const minX = Math.min(...pieces.map((p) => p.center.x));
  const maxX = Math.max(...pieces.map((p) => p.center.x));
  body.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(body.matrixWorld).invert();
  const shown = (n) => {
    for (let k = n; k && k !== body; k = k.parent) if (!k.visible || k.userData.noGhost) return false;
    return true;
  };
  pieces.forEach((p, i) => {
    p.lock = SCAN_FROM + ((p.center.x - minX) / (maxX - minX)) * (SCAN_TO - SCAN_FROM);
    p.ghost = ghostMaterial(u.uTime);
    p.object.traverse((n) => {
      if (!n.isMesh || !shown(n)) return;
      const g = new THREE.Mesh(n.geometry, p.ghost);
      g.matrixAutoUpdate = false;
      g.matrix.multiplyMatrices(inv, n.matrixWorld);
      blueprint.add(g);
    });
    // Vue éclatée : chaque pièce arrive de l'un ou l'autre flanc, en s'écartant
    // du centre de l'arme, et se verrouille au passage du balayage.
    const radial = new THREE.Vector3(p.center.x - 450, p.center.y + 30, 0).normalize().multiplyScalar(40 + (i % 3) * 18);
    p.offset = radial.add(new THREE.Vector3(0, 0, (i % 2 ? 1 : -1) * (90 + (i % 4) * 16)));
    p.axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    p.twist = 0.7 + Math.random() * 0.5;
    p.big = p.size > 140;
  });
  blueprint.visible = false;
  const ghostMats = [...new Set(pieces.map((p) => p.ghost))];

  let introT = -1;
  let ignited = false;
  const delta = new THREE.Vector3();
  const twist = new THREE.Quaternion();
  const ZERO = new THREE.Vector3();
  const ZERO_Q = new THREE.Quaternion();

  const finishIntro = () => {
    introT = -1;
    pieces.forEach((p) => {
      restorePart(p);
      p.object.visible = true;
    });
    carrier.visible = true;
    beams.visible = true;
    blueprint.visible = false;
    scanSheet.visible = false;
    fx.uIgnite.value = 5000;
    fx.uScan.value = 0;
    holder.position.copy(EMBLEM_AT);
    holder.scale.setScalar(1);
    rings.scale.setScalar(1);
    emblem.base.scale.setScalar(1);
    emblem.faces.forEach((f) => {
      f.arrow.position.set(0, 0, 0);
      f.tris.forEach((t) => t.position.set(0, 0, t.position.z));
    });
    coreBall.scale.setScalar(1);
  };

  const runIntro = (dt) => {
    introT += dt;
    const t = introT;

    // 1. L'emblème se forge au centre de l'arme : la croix s'ouvre, les triangles
    //    viennent se loger, la flèche la traverse en diagonale.
    const cross = easeOutBack(clamp01(t / 0.24));
    emblem.base.scale.set(Math.max(0.001, cross), Math.max(0.001, clamp01(t / 0.12) * 0.7 + cross * 0.3), 1);
    emblem.faces.forEach((f) => {
      f.tris.forEach((m, k) => {
        const s = easeOutCubic(clamp01((t - 0.08 - k * 0.035) / 0.18));
        const ang = Math.PI / 2 - (k * Math.PI) / 2;
        const far = (1 - s) * EMBLEM_S * 2.4;
        m.position.set(Math.cos(ang) * far, Math.sin(ang) * far, m.position.z);
        m.visible = s > 0;
      });
      const a = easeOutCubic(clamp01((t - 0.22) / 0.13));
      f.arrow.position.set(-(1 - a) * EMBLEM_S * 2.6, -(1 - a) * EMBLEM_S * 2.4, 0);
      f.arrow.visible = t > 0.2;
    });
    rings.scale.setScalar(Math.max(0.001, easeOutBack(clamp01((t - 0.3) / 0.2))));
    if (t >= 0.34 && t - dt < 0.34) {
      localShock.spawn(holder.position, FACING, { reach: 95, life: 320, from: 12, peak: 0.9 });
      localShockWhite.spawn(holder.position, FACING, { reach: 130, life: 420, from: 12, peak: 0.5, delay: 30 });
      localBurst(holder.position, 22, 520, 0xff4a62, 600);
    }

    // 2. Il rejoint la crosse en tournant sur lui-même.
    const fly = easeInOut(clamp01((t - 0.42) / 0.38));
    holder.position.lerpVectors(FORGE_AT, EMBLEM_AT, fly);
    holder.position.y += Math.sin(fly * Math.PI) * 46;
    holder.position.z += Math.sin(fly * Math.PI) * -30;
    holder.scale.setScalar(3 - 2 * fly);
    spinner.rotation.y = fly * Math.PI * 2 + Math.sin(time * 0.55) * 0.42 * fly;
    if (t > 0.42 && t < 0.8) {
      for (let i = 0; i < 2; i += 1) {
        localSparks.spawn(holder.position, tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(90), { life: 460, size: 4 + Math.random() * 3, drag: 3, tint: i ? 0xffffff : 0xff3a55 });
      }
    }

    // 3. Plan holographique, balayage et assemblage pièce par pièce.
    blueprint.visible = t > 0.4 && t < 1.95;
    const scanX = LIVERY.minX + clamp01((t - SCAN_FROM) / (SCAN_TO - SCAN_FROM)) * W;
    scanSheet.visible = t > SCAN_FROM - 0.05 && t < SCAN_TO + 0.1;
    scanSheet.position.x = scanX;
    fx.uIgnite.value = t < SCAN_FROM ? -200 : t < SCAN_TO ? scanX : 5000;
    fx.uScan.value = t < SCAN_TO + 0.15 ? clamp01((t - SCAN_FROM + 0.1) / 0.1) : Math.max(0, 1 - (t - SCAN_TO - 0.15) / 0.2);
    pieces.forEach((p) => {
      const appear = clamp01((t - 0.42 - ((p.center.x - minX) / (maxX - minX)) * 0.22) / 0.16);
      const flash = Math.exp(-(((t - p.lock) / 0.05) ** 2));
      const after = clamp01((t - p.lock - 0.04) / 0.28);
      p.ghost.uniforms.uOpacity.value = appear * 0.55 * (1 - after) + flash * 1.6;
      const s = clamp01((t - (p.lock - FLY)) / FLY);
      p.object.visible = s > 0;
      if (s <= 0) return;
      const e = easeOutBack(s);
      delta.copy(p.offset).multiplyScalar(1 - e);
      twist.setFromAxisAngle(p.axis, (1 - e) * p.twist);
      placePart(p, 1, s < 1 ? delta : ZERO, s < 1 ? twist : null);
      if (s >= 1 && !p.locked) {
        p.locked = true;
        if (p.big) localBurst(p.center, 7, 260, 0xff5a70, 380);
      }
    });
    carrier.visible = t > 1.3;

    // 4. Allumage : le noyau de la bouche se charge, l'écran démarre, onde finale.
    coreBall.scale.setScalar(t < 1.5 ? 0.001 : 1 + Math.max(0, Math.sin(clamp01((t - 1.5) / 0.25) * Math.PI)) * 1.4);
    if (t >= 1.52 && !ignited) {
      ignited = true;
      hud.boot();
    }
    if (t >= 1.72 && t - dt < 1.72) {
      boost = 1.2;
      localShock.spawn(MOUTH, ZERO_Q, { reach: 80, life: 340, from: 6, peak: 1 });
      localShockWhite.spawn(MOUTH, ZERO_Q, { reach: 115, life: 460, from: 6, peak: 0.6, delay: 30 });
      localBurst(MOUTH, 26, 720, 0xff3a55, 620);
      localShock.spawn(EMBLEM_AT, FACING, { reach: 70, life: 380, from: 14, peak: 0.8 });
      coilFire = time;
    }
    beams.visible = t > 1.62;
    if (t >= INTRO) finishIntro();
  };

  return {
    muzzleX: 916,
    introDuration: INTRO,
    replayIntro: () => {
      introT = 0;
      ignited = false;
      pieces.forEach((p) => (p.locked = false));
      ghostMats.forEach((m) => (m.uniforms.uOpacity.value = 0));
      hud.power(false);
      beams.visible = false;
      runIntro(0);
    },
    update: (dt) => {
      time += dt;
      if (introT >= 0) runIntro(dt);
      if (boost > 0) {
        boost = Math.max(0, boost - dt * 2.2);
        u.uFlare.value = Math.max(u.uFlare.value, Math.min(1, boost));
      }

      // Emblème : lévitation, balancement, tour complet à chaque tir.
      springStep(spin, spinTarget, 38, dt);
      if (introT < 0) {
        holder.position.y = EMBLEM_AT.y + Math.sin(time * 1.4) * 0.9;
        spinner.rotation.y = Math.sin(time * 0.55) * 0.42 + spin.x;
      }
      spinner.rotation.z = Math.sin(time * 0.9) * 0.04;
      // Les triangles des quatre directions s'allument tour à tour (haut, droite,
      // bas, gauche), comme une entrée à la croix directionnelle.
      const step = Math.floor(time * 2.6) % 4;
      emblemMats.triMats.forEach((m, k) => {
        const on = k === step ? 1 : 0;
        m.color.setScalar(0.75 + on * 1.6 + u.uFlare.value * 1.2);
      });
      emblemMats.lineMat.color.setRGB(1.9, 1.25, 1.35).multiplyScalar(0.85 + 0.15 * Math.sin(time * 2.1) + u.uFlare.value * 0.8);
      springStep(ringBoost, 0, 18, dt);
      ringInner.rotation.z += (0.45 + ringBoost.x * 6) * dt;
      ringOuter.rotation.z -= (0.7 + ringBoost.x * 9) * dt;
      back.material.opacity = 0.42 + 0.08 * Math.sin(time * 2) + u.uFlare.value * 0.4;
      beamMat.opacity = 0.3 + 0.08 * Math.sin(time * 23) * Math.sin(time * 7) + u.uFlare.value * 0.4;

      // Bouche : noyau qui pulse, anneau et triangles en orbite.
      springStep(corePulse, 0, 220, dt);
      if (introT < 0) coreBall.scale.setScalar(1 + corePulse.x * 0.8 + Math.sin(time * 6) * 0.06);
      coreGlow.material.opacity = 0.7 + corePulse.x * 0.8 + Math.sin(time * 6) * 0.1;
      muzzleRing.rotation.x += (2.2 + ringBoost.x * 18) * dt;
      muzzleRing.scale.setScalar(1 + corePulse.x * 0.5);
      orbiters.forEach((o, i) => {
        const a = time * 2.4 + o.phase;
        o.m.position.set(20, Math.cos(a) * 8, Math.sin(a) * 8);
        o.m.rotation.set(a, Math.PI / 2, 0);
        o.m.material.color.setRGB(1.8, 1.4, 1.5).multiplyScalar(0.8 + u.uFlare.value + (Math.floor(time * 2.6) % 3 === i ? 0.6 : 0));
      });
      // Bobines : vague lente au repos, cascade vers la bouche au tir.
      coils.forEach((c, i) => {
        const wave = 0.45 + 0.35 * Math.max(0, Math.sin(time * 3 - i * 1.1));
        const burst = Math.max(0, 1 - Math.abs(time - coilFire - i * 0.03) / 0.06);
        c.material.emissiveIntensity = wave + burst * 4 + u.uFlare.value;
      });

      // Particules de données qui montent des lumières du garde-main.
      moteClock += dt;
      if (moteClock > 0.18) {
        moteClock = 0;
        const v = Math.floor(Math.random() * 4);
        tmp.set(532 + v * 40 + Math.random() * 10, -6 + Math.random() * 8, (Math.random() < 0.5 ? -1 : 1) * 26);
        localSparks.spawn(tmp, tmp2.set((Math.random() - 0.5) * 3, 14, 0), { life: 1300, size: 1.6, drag: 0.2, tint: 0xff3a55, peak: 0.8 });
      }

      hud.update(dt);
      localSparks.update(dt);
      localShock.update();
      localShockWhite.update();
      sparks.update(dt);
      risers.update(dt);
      shards.update(dt);
      shock.update();
      shockWhite.update();
    },
    onFire: () => {
      spinTarget = Math.min(spinTarget + Math.PI * 2, spin.x + Math.PI * 4);
      corePulse.v += 26;
      ringBoost.v += 9;
      coilFire = time;
      hud.fire();
      mouth.getWorldPosition(tmp);
      body.getWorldQuaternion(quat);
      shock.spawn(tmp, quat, { reach: 0.045, life: 170, from: 0.006, peak: 0.95 });
      shockWhite.spawn(tmp, quat, { reach: 0.065, life: 260, from: 0.004, peak: 0.5, delay: 25 });
      // Éclats triangulaires (les triangles de la croix) projetés vers l'avant.
      for (let i = 0; i < 6; i += 1) {
        const m = new THREE.Mesh(shardGeo, shardMats[i % 3 === 0 ? 1 : 0]);
        const v = new THREE.Vector3(0.9 + Math.random() * 0.9, (Math.random() - 0.5) * 1.1, (Math.random() - 0.5) * 1.1).applyQuaternion(quat);
        shards.spawn(m, tmp, v, { life: 380 + Math.random() * 200, spin: 26, gravity: -2, drag: 3 });
      }
      burstSparks(tmp, 8, 0.55, 0xff3a55, 320);
      // Une flèche « stat en hausse » s'élève de l'écran.
      hudAnchor.position.set(280 + Math.random() * 100, 14, -24);
      hudAnchor.getWorldPosition(tmp);
      risers.spawn(tmp, tmp2.set(0, 0.07, 0).applyQuaternion(quat), { life: 700, size: 0.006, grow: 0.3, drag: 1.4, tint: 0xff4a62, peak: 0.9 });
    },
  };
}

export const VANDAL_MVP_TRACKER_SKIN = {
  mvptracker: { labelKey: 'aimTrainer.skinMvpTracker', build: mvpFinish },
};
