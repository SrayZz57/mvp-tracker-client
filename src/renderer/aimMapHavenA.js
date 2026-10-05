import * as THREE from 'three';
import { createMapKit, inRect, lightMap, subtract } from './mapKit.js';
import { plasterCanvas, sandstoneCanvas, copingCanvas, siteTilesCanvas, plywoodCrateCanvas, greenCrateCanvas, tarpCanvas } from './aimMapAscentATextures.js';
import { woodFloorCanvas } from './aimMapSunsetBTextures.js';

// Site A de Haven, pour les futurs modes avec déplacement. Même méthode que
// les autres cartes (voir aimMapAscentA.js) : plan au sol relevé
// automatiquement sur la minimap officielle (valorant-api.com, 13 cm par
// pixel), en rectangles [u0, v0, u1, v1[ (u vers l'est, v vers le sud ;
// défenseurs à l'ouest, attaquants à l'est).
//
// Niveaux : la minimap ne montre que la tour (A Tower / Heaven), son couloir
// et sa montée depuis A Link. Le reste vient de captures en jeu :
// - A Long et A Lobby sont plus bas que le site : une rampe monte de A Long
//   vers l'entrée du site ;
// - A Sewer : depuis A Lobby, le couloir descend vers l'ouest jusqu'à une salle
//   basse ; on tourne à droite et un tunnel couvert remonte jusqu'au site ;
// - la tour : fenêtre de Heaven dans un mur, au-dessus de la porte de Hell
//   (renfoncement fermé sous le plancher de Heaven).
// Toutes les hauteurs sont estimées sur ces captures : à confirmer.

export const HAVEN_MINIMAP_URL = 'https://media.valorant-api.com/maps/2bee0dc9-4ffe-519b-1cbd-7fbe763a6047/displayicon.png';
export const PX = 0.1302; // mètres par pixel de minimap
const U0 = 432; // origine monde : entrée du site côté A Long
const V0 = 150;

export const toWorld = (u, v) => ({ x: (u - U0) * PX, z: (v - V0) * PX });
export const toMinimap = (x, z) => ({ u: x / PX + U0, v: z / PX + V0 });

const HEAVEN = 3.6;
const LOW = -1.5; // A Long et A Lobby, en contrebas du site
const DEEP = -2.5; // salle d'A Sewer et bas du tunnel
const inside = (u, v, [u0, v0, u1, v1]) => u >= u0 && u < u1 && v >= v0 && v < v1;
const LONG_RAMP = [476, 124, 540, 157]; // montée d'A Long vers le site
// A Sewer, depuis A Lobby : le couloir descend vers l'ouest jusqu'à la salle
// basse, puis on tourne à droite et le tunnel remonte jusqu'au site.
const SEWER_CORRIDOR = [520, 372, 590, 414]; // descente, de LOW (est) à DEEP (ouest)
const SEWER_ROOM = [455, 341, 520, 440]; // au niveau DEEP
const SEWER = [474, 249, 504, 341]; // tunnel
const SEWER_ALCOVES = [455, 311, 510, 341]; // renfoncements de part et d'autre, en bas du tunnel
const SEWER_CLIMB = [474, 249, 504, 311]; // montée, de DEEP (sud) au site (nord)
const SITE_EAST = [473, 173, 536, 235];
// Niveau du sol rapporté ; null : pas de sol rapporté (fond de carte à DEEP, ou pente).
const levelAt = (u, v) => {
  if ([SEWER, SEWER_ALCOVES, LONG_RAMP, SEWER_CORRIDOR, SEWER_ROOM].some((rect) => inside(u, v, rect))) return null;
  // La partie est du site (jusqu'à u = 536) reste de plain-pied : sans ça, une marche de 1,5 m coupait le sol.
  if (inside(u, v, SITE_EAST)) return 0;
  return u >= 520 ? LOW : 0;
};
// Hell : sous le plancher de Heaven, ouvert sur le site par une porte.
const HELL = [300, 121, 336, 175];
const HELL_DOOR = [127, 169]; // en v, sur la façade est de la tour
const HEAVEN_WINDOW = [131, 165]; // 4,4 m de large, dont la moitié nord ouverte
export const HAVEN_A_ROI = [225, 60, 705, 440];
const parse = (s) => s.split(';').map((r) => r.split(',').map(Number));

// Masque praticable, emprise du niveau haut et zones couvertes (teintes sombres).
const WALKABLE = parse('336,88,473,249;543,88,605,158;300,104,336,187;295,120,300,187;473,123,543,157;267,133,295,187;225,158,267,187;544,158,606,160;545,160,607,162;546,162,608,163;547,163,608,165;608,164,609,342;548,165,608,167;609,165,610,342;549,167,608,168;610,167,611,342;550,168,608,170;611,169,612,432;551,170,608,172;552,172,608,173;612,172,614,432;473,173,536,235;553,173,608,175;614,173,615,432;554,175,608,177;615,175,616,432;555,177,608,178;616,177,617,432;556,178,608,180;617,178,618,432;557,180,608,182;618,180,619,432;558,182,608,184;619,182,620,432;559,184,608,185;620,184,621,432;560,185,608,187;621,185,622,432;225,187,259,350;561,187,608,189;622,187,623,432;562,189,608,190;623,189,624,432;563,190,608,192;624,190,625,432;564,192,608,194;625,192,626,432;565,194,608,195;626,194,627,432;566,195,608,197;627,195,628,432;567,197,608,199;628,197,629,432;568,199,608,201;629,199,630,432;630,200,631,432;569,201,608,202;570,202,608,204;631,202,632,432;275,204,336,249;571,204,608,206;632,204,633,432;633,205,634,432;572,206,608,207;573,207,608,209;634,207,635,432;574,209,608,211;635,209,636,432;636,210,637,432;575,211,608,212;576,212,608,214;637,212,638,432;577,214,608,216;638,214,639,432;639,215,640,432;578,216,608,217;579,217,608,219;640,217,641,432;580,219,608,221;641,219,642,432;642,220,643,432;581,221,608,223;643,222,644,432;582,223,608,224;583,224,608,226;644,224,645,342;584,226,608,228;645,226,646,342;646,227,647,342;585,228,608,229;586,229,608,231;647,229,648,342;587,231,608,233;648,231,649,342;649,232,650,342;588,233,608,234;589,234,608,236;650,234,651,342;473,235,504,249;590,236,608,238;651,236,652,342;652,237,653,342;591,238,608,239;592,239,608,241;653,239,654,342;593,241,608,243;654,241,655,342;655,242,656,342;594,243,608,245;656,244,657,342;595,245,608,246;596,246,608,342;657,246,658,342;289,249,319,349;351,249,458,287;474,249,504,341;658,272,681,342;259,303,289,349;319,303,434,328;574,303,596,342;458,311,474,341;504,311,508,341;319,328,433,349;481,341,496,426;609,345,611,346;644,345,646,346;373,349,433,350;601,349,611,432;644,349,692,432;225,350,258,396;374,350,433,419;458,350,481,426;496,350,519,418;698,350,705,413;519,373,585,411;585,374,586,411;586,375,587,411;587,376,588,411;588,377,590,411;590,378,591,411;694,378,696,404;591,379,592,411;592,380,593,411;692,380,694,402;696,380,698,402;593,381,594,411;597,381,598,406;594,382,595,411;598,382,599,406;595,383,597,404;599,383,601,404;693,402,694,403;697,402,698,403;595,404,596,411;599,404,600,406;699,413,705,414;700,414,705,415;701,415,705,416;702,416,705,417;703,417,705,418;496,418,511,426;704,418,705,419;390,419,419,440;350,434,390,440;419,434,480,440;349,435,350,440;348,436,349,440;347,437,348,440;346,438,347,440;345,439,346,440');
const HIGH = parse('300,104,336,174;225,158,300,174;225,174,267,187;332,174,336,187;267,175,332,187;225,187,259,190');
const COVER = parse('336,119,344,175;295,120,300,155;344,120,347,175;267,133,295,158;295,155,298,158;550,168,552,169;551,169,552,171;267,174,332,175;555,176,556,178;559,184,560,185;624,191,625,192;571,204,572,205;636,211,637,212;640,218,641,220;641,219,642,220;583,224,584,225;648,231,649,232;595,244,596,246;275,248,276,249;328,348,333,349');
// Montée vers Heaven depuis A Link (dégradé sur la minimap).
const RAMP = { r: [225, 190, 258, 305], risers: 24 };

// Caisses (contours de la minimap). Hauteurs estimées sur les captures.
const PROPS = [
  { r: [336, 88, 350, 103], h: 2.6, kind: 'crate' }, // double pile à l'angle nord-ouest du site
  // Les trois caisses de l'entrée du site ont la même taille (16 × 16 px, 2,6 m).
  { r: [457, 174, 473, 190], h: 2.6, kind: 'crate' },
  { r: [473, 174, 489, 190], h: 2.6, kind: 'crate' }, // accolée à la première
  { r: [458, 234, 474, 250], h: 2.6, kind: 'crate' },
  { r: [274, 204, 287, 217], h: 1.3, kind: 'smallCrate' },
  { r: [597, 166, 613, 184], y: LOW, h: 1.3, kind: 'smallCrate' }, // A Long
  { r: [655, 270, 677, 284], y: LOW, h: 1.3, kind: 'smallCrate' },
  { r: [340, 335, 355, 350], h: 1.4, kind: 'smallCrate' }, // A Link
  { r: [332, 343, 340, 350], h: 0.7, kind: 'smallCrate' },
  { r: [683, 348, 697, 363], y: LOW, h: 1.3, kind: 'smallCrate' }, // A Lobby
  { r: [460, 411, 475, 427], y: DEEP, h: 1.3, kind: 'smallCrate' },
  { r: [647, 411, 662, 433], y: LOW, h: 1.3, kind: 'smallCrate' },
];
// Caisse verte bâchée du « default » : tournée d'environ 15° sur la minimap,
// rendue en tranches décalées (les pavés de la carte sont alignés sur les axes).
const DEFAULT_BOX = { v0: 150, v1: 208, uAt: (v) => 389 + (v - 152) * 0.27, half: 9.5, slices: 8, h: 1.8 };

const CALLOUTS = [
  { id: 'aTower', r: [225, 60, 350, 300], minY: 2.5 },
  { id: 'aHell', r: [300, 121, 336, 175] },
  { id: 'aSite', r: [335, 88, 432, 205] },
  { id: 'aSewer', r: [490, 290, 545, 440] },
  { id: 'aLobby', r: [545, 300, 705, 440] },
  { id: 'aLong', r: [432, 60, 705, 300] },
  { id: 'aLink', r: [225, 205, 490, 440] },
];

export const HAVEN_A_SPAWNS = [
  { id: 'lobby', u: 639, v: 394, y: LOW, face: [0, -1] },
  { id: 'long', u: 600, v: 120, y: LOW, face: [-1, 0] },
  { id: 'entry', u: 535, v: 140, y: LOW, face: [-1, 0] },
  { id: 'site', u: 370, v: 130, y: 0, face: [1, 0] },
  { id: 'heaven', u: 318, v: 148, y: HEAVEN, face: [1, 0] },
  { id: 'hell', u: 318, v: 148, y: 0, face: [1, 0] },
  { id: 'link', u: 297, v: 332, y: 0, face: [0, -1] },
  { id: 'sewer', u: 512, v: 393, y: DEEP, face: [-0.3, -1] },
];

export function calloutAtHavenA(x, z, feetY) {
  const { u, v } = toMinimap(x, z);
  return CALLOUTS.find((c) => inRect(u, v, c.r) && (c.minY === undefined || feetY >= c.minY))?.id ?? null;
}

export function buildHavenSiteA(root, { floorY = 0, isDark = false } = {}) {
  const kit = createMapKit(root, { floorY, isDark, px: PX, u0: U0, v0: V0 });
  const { Y, solids, block } = kit;
  const { std, withBump, flat, face, glowing } = kit.mat;
  const M = {
    floor: withBump(siteTilesCanvas(), 2.6, { roughness: 0.9, color: 0xd6cdbd }), // dallage gris pierre
    wall: withBump(plasterCanvas('haven', '#e8c88e', { stone: '#d9b67c' }), 6),
    wallPale: withBump(plasterCanvas('havenPale', '#efdcb4', { stone: '#dcc190' }), 6),
    base: withBump(sandstoneCanvas('haven', ['#c9b190', '#bfa684', '#d2bb9a']), 2.4),
    trim: withBump(copingCanvas(), 2.4),
    wood: flat(woodFloorCanvas(), 2, { roughness: 0.8 }),
    beam: std({ color: 0x8a5a3a, roughness: 0.85 }),
    shutter: std({ color: 0xb98a55, roughness: 0.8 }),
    frieze: std({ color: 0x3f7f86, roughness: 0.7 }),
    garage: std({ color: 0xcdbfa8, roughness: 0.6, metalness: 0.2 }),
    jar: std({ color: 0x8fb2d6, roughness: 0.5 }),
    gold: std({ color: 0xd9aa4a, roughness: 0.35, metalness: 0.8 }),
    earth: std({ color: 0x9a7350, roughness: 1 }),
    whiteBrick: withBump(sandstoneCanvas('havenWhite', ['#ece7dd', '#e2dcd0', '#f1ede4', '#d9d2c4']), 1.8),
    bulb: std({ color: 0xffe2a0, emissive: 0xffc860, emissiveIntensity: 1.6 }),
    roof: std({ color: 0x9a7a52, roughness: 0.9 }),
    crate: face(plywoodCrateCanvas('tall', { bands: 2 })),
    smallCrate: face(plywoodCrateCanvas('small', { bands: 1 })),
    greenCrate: glowing(greenCrateCanvas(false), greenCrateCanvas(true), 0.5, { roughness: 0.4 }),
    tarp: face(tarpCanvas(), { roughness: 0.95 }),
    barrier: kit.mat.barrier,
  };

  const [RU0, RV0, RU1, RV1] = HAVEN_A_ROI;
  block(HAVEN_A_ROI, DEEP - 1, DEEP, M.floor, { ao: false });

  kit.fillBuildings({
    roi: HAVEN_A_ROI,
    open: WALKABLE,
    zones: [
      { r: HAVEN_A_ROI, h: 8, material: M.wall },
      { r: [225, 60, 350, 300], h: 10.5, material: M.wallPale }, // tour
      { r: [432, 190, 600, 300], h: 6, material: M.wallPale },
      { r: [450, 256, 550, 436], h: 8, material: M.whiteBrick, interior: true }, // murs d'A Sewer : brique blanche
    ],
    dress: (r, z) => {
      if (z.interior) {
        block(r, DEEP - 0.5, 0, M.whiteBrick); // le mur descend jusqu'au sol bas
        block(r, z.h, z.h + 0.3, M.roof, { solid: false, inset: -0.45, ao: false }); // débord de toit : le mur est fermé en haut
        return;
      }
      block(r, DEEP - 0.5, 0, M.base); // assise, jusqu'au fond des parties basses
      block(r, -0.5, 1.0, M.base, { solid: false, inset: -0.04 });
      block(r, 3.4, 3.6, M.beam, { solid: false, inset: -0.06, ao: false }); // bandeau de bois
      block(r, z.h, z.h + 0.3, M.roof, { solid: false, inset: -0.45, ao: false }); // débord de toit
    },
  });

  // --- Niveaux du sol : site, A Long et A Lobby en contrebas, A Sewer encore plus bas ---
  WALKABLE.forEach(([u0, v0, u1, v1]) => {
    // Découpe aux limites des niveaux.
    const us = [u0, SEWER_ROOM[0], SEWER[0], LONG_RAMP[0], SEWER[2], SEWER_ALCOVES[2], 520, 540, SEWER_CORRIDOR[2], u1].filter((u) => u >= u0 && u <= u1).sort((a, b) => a - b);
    const vs = [v0, LONG_RAMP[1], LONG_RAMP[3], SEWER[1], SEWER_ALCOVES[1], SEWER[3], SEWER_CORRIDOR[1], SEWER_CORRIDOR[3], v1].filter((v) => v >= v0 && v <= v1).sort((a, b) => a - b);
    for (let i = 0; i < us.length - 1; i += 1) {
      for (let j = 0; j < vs.length - 1; j += 1) {
        const piece = [us[i], vs[j], us[i + 1], vs[j + 1]];
        if (piece[2] - piece[0] < 0.5 || piece[3] - piece[1] < 0.5) continue;
        const h = levelAt((piece[0] + piece[2]) / 2, (piece[1] + piece[3]) / 2);
        if (h === null) continue;
        block(piece, DEEP - 0.5, h - 0.06, M.base);
        block(piece, h - 0.06, h, M.floor, { ao: false });
      }
    }
  });
  kit.slopeBlock(LONG_RAMP, DEEP - 0.5, 0, LOW, 'u', M.wood);
  kit.slopeSolids(LONG_RAMP, DEEP - 0.5, 0, LOW, 'u');
  kit.slopeBlock(SEWER_CORRIDOR, DEEP - 0.5, DEEP, LOW, 'u', M.floor);
  kit.slopeSolids(SEWER_CORRIDOR, DEEP - 0.5, DEEP, LOW, 'u');
  // Tunnel : sol en terre battue, montée vers le site, plafond de poutres qui suit le sol.
  kit.slopeBlock(SEWER_CLIMB, DEEP - 0.5, 0, DEEP, 'v', M.earth);
  kit.slopeSolids(SEWER_CLIMB, DEEP - 0.5, 0, DEEP, 'v');
  block([SEWER[0], SEWER_CLIMB[3], SEWER[2], SEWER[3]], DEEP, DEEP + 0.012, M.earth, { solid: false, ao: false });
  // Intérieur d'après les captures en jeu : plafond de planches sur poutres qui
  // suit la pente, poteaux de bois contre les murs de brique blanche, guirlande
  // d'ampoules, porte à cadre de bois au débouché sur le site, salle voûtée.
  const floorAt = (v) => (v >= SEWER_CLIMB[3] ? DEEP : (DEEP * (v - SEWER_CLIMB[1])) / (SEWER_CLIMB[3] - SEWER_CLIMB[1]));
  for (let v = SEWER[1]; v < SEWER[3]; v += 12) {
    const vb = Math.min(v + 12, SEWER[3]);
    const y = Math.max(floorAt(v), floorAt(vb)) + 2.9; // 2,9 m sous plafond au point le plus haut du tronçon
    // Seule la salle basse a des renfoncements de part et d'autre ; plus haut, le plafond reste dans le tunnel (sinon il dépasse des murs).
    const [cu0, cu1] = vb > SEWER_ALCOVES[1] ? [SEWER_ALCOVES[0], SEWER_ALCOVES[2]] : [SEWER[0], SEWER[2]];
    block([cu0, v, cu1, vb], y + 0.12, y + 0.4, M.wood);
    block([cu0, v, cu1, v + 1.4], y - 0.1, y + 0.12, M.beam, { solid: false }); // poutre
    [SEWER[0], SEWER[2] - 1.4].forEach((u) => block([u, v, u + 1.4, v + 1.4], floorAt(vb), y, M.beam, { solid: false })); // poteaux
    block([SEWER[0] + 1.6, v + 6, SEWER[0] + 2.6, v + 7], y - 0.75, y - 0.6, M.bulb, { solid: false, ao: false });
  }
  // Porte vers le site : jambages et linteau de bois.
  [[SEWER[0], SEWER[0] + 5], [SEWER[2] - 5, SEWER[2]]].forEach(([ua, ub]) => block([ua, 249, ub, 251.5], 0, 3.2, M.beam));
  block([SEWER[0], 249, SEWER[2], 251.5], 2.5, 3.2, M.beam);
  // Salle côté Lobby et couloir de descente : couverts eux aussi.
  block([SEWER_ROOM[0], SEWER_ROOM[1], SEWER_ROOM[2], 432], DEEP + 4.2, DEEP + 4.5, M.wood);
  for (let u = SEWER_ROOM[0]; u < SEWER_ROOM[2]; u += 15) block([u, SEWER_ROOM[1], u + 1.6, 432], DEEP + 3.9, DEEP + 4.2, M.beam, { solid: false });
  block(SEWER_CORRIDOR, LOW + 3.3, LOW + 3.6, M.wood);

  // --- Tour : Heaven, Hell, fenêtre, montée -----------------------------------------
  const slab = (r) => {
    block(r, HEAVEN - 0.25, HEAVEN - 0.06, M.beam);
    block(r, HEAVEN - 0.06, HEAVEN, M.wood, { ao: false });
  };
  HIGH.forEach((r) => {
    subtract(r, [HELL]).forEach((piece) => {
      block(piece, -0.5, HEAVEN - 0.06, M.wallPale);
      block(piece, HEAVEN - 0.06, HEAVEN, M.wood, { ao: false });
    });
    block(r, HEAVEN + 3.7, HEAVEN + 4, M.roof); // toit
  });
  slab(HELL);
  COVER.forEach((r) => {
    if (r[0] >= 336) {
      block(r, 3.0, 3.15, M.beam, { solid: false, ao: false }); // auvent de bois au-dessus de la porte de Hell
    } else {
      block(r, -0.5, HEAVEN - 0.06, M.wallPale);
      block(r, HEAVEN - 0.06, HEAVEN, M.wood, { ao: false });
    }
  });
  {
    // Façade est de la tour, d'après une capture en jeu prise depuis le site :
    // grande porte à cadre de bois sous un auvent à corbeaux, fermée au fond par
    // un rideau de garage ; au-dessus, la fenêtre de Heaven, presque aussi large
    // que la porte et haute de plus de 2 m, dont la moitié sud est fermée par
    // un volet ; tablette à bidons, puis trois médaillons dorés ; mur ocre
    // rayé de bandes claires.
    const [u0, u1] = [335, 337];
    const [d0, d1] = HELL_DOOR;
    const [w0, w1] = HEAVEN_WINDOW;
    const wm = (w0 + w1) / 2; // l'ouverture est la moitié nord, le volet la moitié sud
    const top = HEAVEN + 6;
    const sill = HEAVEN + 0.95;
    const head = HEAVEN + 3.1;
    const doorTop = 3.0;
    const out = { solid: false, ao: false };
    // Un seul plan de mur, de la même matière, sur toute la largeur du bâtiment :
    // tour centrale plus haute, ailes au niveau du toit de Heaven, chacune
    // coiffée d'un débord de toit.
    const edge = HIGH.filter((rect) => rect[2] >= u0);
    const vMin = Math.min(...edge.map((rect) => rect[1]));
    const vMax = Math.max(...edge.map((rect) => rect[3]));
    const wing = HEAVEN + 4;
    block([u0, HELL[1], u1, d0], 0, top, M.wall);
    block([u0, d1, u1, HELL[3]], 0, top, M.wall);
    block([u0, vMin, u1, HELL[1]], 0, wing, M.wall);
    block([u0, HELL[3], u1, vMax], 0, wing, M.wall);
    block([u0 - 3, HELL[1] - 1.5, u1 + 3, HELL[3] + 1.5], top, top + 0.3, M.roof, out);
    block([u0 - 3, vMin, u1 + 3, HELL[1] - 1.5], wing, wing + 0.3, M.roof, out);
    block([u0 - 3, HELL[3] + 1.5, u1 + 3, vMax], wing, wing + 0.3, M.roof, out);
    // Dessus de la porte ; allège seulement sous le volet : la moitié ouverte
    // descend jusqu'au plancher de Heaven.
    block([u0, d0, u1, d1], doorTop, HEAVEN, M.wall);
    block([u0, d0, u1, w0], HEAVEN, sill, M.wall);
    block([u0, wm, u1, d1], HEAVEN, sill, M.wall);
    block([u0, d0, u1, w0], sill, top, M.wall);
    block([u0, w1, u1, d1], sill, top, M.wall);
    block([u0, w0, u1, w1], head, top, M.wall);
    block([u0 + 0.4, wm, u1 - 0.4, w1], sill, head, M.shutter); // volet fermé
    // Cadre de la fenêtre, appui et tablette à bidons.
    block([u0 - 0.3, wm - 0.6, u1 + 1.2, w1 + 1.5], sill - 0.16, sill, M.beam, out);
    [[w0 - 1.5, w0], [w1, w1 + 1.5], [wm - 0.6, wm + 0.6]].forEach(([va, vb]) => block([u0 - 0.2, va, u1 + 0.6, vb], va < wm ? HEAVEN : sill, head, M.beam, out));
    block([u0 - 0.2, w0 - 1.5, u1 + 0.6, w1 + 1.5], head, head + 0.2, M.beam, out);
    block([u1, w0 - 2.5, u1 + 3, w1 + 2.5], head + 0.35, head + 0.45, M.beam, out);
    for (let v = wm - 9; v <= wm + 1; v += 2.6) block([u1 + 0.6, v, u1 + 2.4, v + 2.1], head + 0.45, head + 0.78, M.jar, out);
    // Porte : poteaux, linteau, auvent sur corbeaux, rideau de garage au fond.
    [[d0, d0 + 2.2], [d1 - 2.2, d1]].forEach(([va, vb]) => block([u0 - 0.3, va, u1 + 0.8, vb], 0, doorTop, M.beam));
    block([u0 - 0.3, d0, u1 + 0.8, d1], doorTop - 0.3, doorTop, M.beam, out);
    block([u0, d0 - 3, u1 + 4.5, d1 + 3], doorTop + 0.22, doorTop + 0.34, M.roof, out);
    for (let v = d0 - 2; v <= d1 + 2; v += 4) block([u1, v - 0.5, u1 + 3.6, v + 0.5], doorTop, doorTop + 0.22, M.beam, out);
    block([u1 + 0.8, d0 - 2.5, u1 + 1.1, d1 + 2.5], doorTop - 0.02, doorTop + 0.2, M.frieze, out);
    block([HELL[0], HELL[1], 321, HELL[3]], 0, HEAVEN - 0.25, M.wallPale); // Hell : renfoncement peu profond
    block([321, d0, 321.6, d1], 0, doorTop, M.garage, { ao: false });
    // Médaillons dorés.
    [d0 + 0.5, (d0 + d1) / 2, d1 - 0.5].forEach((v) => {
      const disc = new THREE.CylinderGeometry(0.34, 0.34, 0.1, 20);
      kit.push(disc, M.gold, kit.mtx(kit.X(u1) + 0.06, Y(HEAVEN + 5.1), kit.Z(v), 0, 0, Math.PI / 2), { ao: false });
    });
  }
  kit.stairs(RAMP.r, -0.5, HEAVEN, 0, 'v', RAMP.risers, M.trim);

  // --- Caisses ---------------------------------------------------------------------
  PROPS.forEach(({ r, y = 0, h, kind }) => block(r, y, y + h, M[kind], { inset: 0.02 }));
  {
    const { v0, v1, uAt, half, slices, h } = DEFAULT_BOX;
    const step = (v1 - v0) / slices;
    for (let k = 0; k < slices; k += 1) {
      const v = v0 + k * step;
      const cu = uAt(v + step / 2);
      block([cu - half, v, cu + half, v + step], 0, h - 0.12, M.greenCrate);
      block([cu - half - 0.6, v, cu + half + 0.6, v + step], h - 0.12, h, M.tarp, { ao: false }); // bâche
    }
  }

  // --- Limites de la carte -----------------------------------------------------------
  WALKABLE.forEach(([u0, v0, u1, v1]) => {
    if (u1 >= RU1) block([RU1 - 0.6, v0, RU1, v1], DEEP, 6, M.barrier, { ao: false });
    if (u0 <= RU0) block([RU0, v0, RU0 + 0.6, v1], 0, 9, M.barrier, { ao: false });
    if (v1 >= RV1) block([u0, RV1 - 0.6, u1, RV1], DEEP, 6, M.barrier, { ao: false });
    if (v0 <= RV0) block([u0, RV0, u1, RV0 + 0.6], DEEP, 6, M.barrier, { ao: false });
  });

  kit.finish();
  const a = toWorld(RU0, RV0);
  const b = toWorld(RU1, RV1);
  return {
    solids,
    floorY,
    spawns: HAVEN_A_SPAWNS.map((s) => {
      const { x, z } = toWorld(s.u, s.v);
      return { id: s.id, x, z, feetY: Y(s.y), yaw: Math.atan2(-s.face[0], -s.face[1]) };
    }),
    bounds: { minX: a.x, maxX: b.x, minZ: a.z, maxZ: b.z },
  };
}

// Plein jour en montagne : soleil haut, lumière chaude sur les murs ocre.
export function lightHavenSiteA(scene, renderer, info, { isDark = false } = {}) {
  return lightMap(scene, renderer, info, { isDark, sunDir: [0.45, 0.75, 0.4], sunColor: 0xfff0d2, sunIntensity: 2.8, sky: 0xcfe2ff, ground: 0xb79a72 });
}
