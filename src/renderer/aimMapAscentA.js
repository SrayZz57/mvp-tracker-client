import * as THREE from 'three';
import { rng } from './aimArenaAscent.js';
import { createMapKit, inRect, lightMap, subtract } from './mapKit.js';
import {
  plasterCanvas,
  sandstoneCanvas,
  copingCanvas,
  siteTilesCanvas,
  fanCobbleCanvas,
  greyStoneCanvas,
  sandCanvas,
  grassCanvas,
  plywoodCrateCanvas,
  greenCrateCanvas,
  stoneBlockCanvas,
  tarpCanvas,
  clothCanvas,
  generatorSideCanvas,
  generatorEndCanvas,
  shutterCanvas,
  aDoorCanvas,
  archWindowCanvas,
} from './aimMapAscentATextures.js';

// Site A d'Ascent, reproduit pour les futurs modes avec déplacement (entrées
// sur site). À ne pas confondre avec Belvédère (aimArenaAscent.js), une arène
// seulement inspirée d'Ascent.
//
// Plan au sol : relevé sur la minimap officielle (displayIcon de
// valorant-api.com). Ses coefficients (xMultiplier 0,00007 par unité de jeu)
// donnent 13,95 unités par pixel de l'image 1024 px, soit 14 cm : chaque sol,
// mur et caisse ci-dessous est placé au pixel près. Les données sont écrites en
// pixels de cette minimap (u vers la droite = est, v vers le bas = sud ;
// défenseurs à l'ouest, attaquants à l'est), rectangles [u0, v0, u1, v1[.
//
// Hauteurs : la minimap n'en donne pas. Elles viennent de deux captures du jeu
// (depuis la place devant A Main et depuis Heaven) dont on a retrouvé la pose de
// caméra par moindres carrés sur des points au sol connus (générateur, caisses,
// escalier, arche d'A Main) : terrasse du site à 1,55 m au-dessus de la place,
// Heaven à 3,75 m, générateur de 3,1 m, caisse verte de 1,77 m. Précision de
// l'ordre de 10 à 20 cm. Les hauteurs des murs et des grandes caisses sont
// estimées à l'œil.
//
// Repère monde : mètres, x vers l'est, z vers le sud, y vers le haut ; le sol
// de la place est à `floorY`. Toutes les pièces fixes d'un même matériau sont
// fusionnées (quelques dizaines d'appels de dessin pour toute la carte), et les
// collisions sont une simple liste de pavés (Box3), lue par mapWalker.js.

export const ASCENT_MINIMAP_URL = 'https://media.valorant-api.com/maps/7eaecc1b-4337-bbf6-6ab9-04b8f06b3319/displayicon.png';
export const PX = 0.1395; // mètres par pixel de minimap
const U0 = 440; // origine monde : débouché d'A Main sur la place du site
const V0 = 151;

export const toWorld = (u, v) => ({ x: (u - U0) * PX, z: (v - V0) * PX });
export const toMinimap = (x, z) => ({ u: x / PX + U0, v: z / PX + V0 });

const TERRACE = 1.55; // plateforme du site (zone de plant), 8 marches au-dessus de la place
const HEAVEN = 4.25; // Rafters (Heaven) et ses couloirs
const HEAVEN_SLAB = 0.22; // épaisseur du plancher de Heaven au-dessus de Hell
export const ASCENT_A_LEVELS = { ground: 0, terrace: TERRACE, heaven: HEAVEN };

// Zone couverte par la carte (tout ce qui n'y est pas praticable est bâti).
export const ASCENT_A_ROI = [140, 40, 726, 385];

// --- Plan ---------------------------------------------------------------------

// Sols à plat au niveau de la place.
const GROUND = [
  { r: [527, 234, 719, 308], mat: 'cobble' }, // A Lobby
  { r: [656, 308, 719, 326], mat: 'cobble' }, // sortie vers le spawn attaquant (coupée)
  { r: [518, 259, 527, 283], mat: 'cobble' }, // passage Lobby → A Main
  { r: [456, 258, 519, 294], mat: 'cobble' }, // bas d'A Main
  { r: [477, 49, 505, 258], mat: 'cobble' }, // A Main, Wine au nord
  { r: [505, 49, 519, 94], mat: 'cobble' },
  { r: [505, 116, 519, 258], mat: 'cobble' }, // (entre les deux : pilier du mur est)
  { r: [441, 134, 477, 168], mat: 'cobble' }, // arche d'A Main vers le site
  { r: [398, 81, 441, 235], mat: 'cobble' }, // place au pied de l'escalier
  { r: [369, 222, 398, 235], mat: 'cobble' },
  { r: [392, 235, 418, 245], mat: 'cobble' }, // porte A (mécanique)
  { r: [377, 245, 435, 367], mat: 'sand' }, // Tree (A Link)
  { r: [435, 331, 449, 350], mat: 'cobble' }, // Tree → Cubby
  { r: [449, 317, 505, 376], mat: 'cobble' }, // Mid Cubby (escalier vers Mid coupé)
  { r: [148, 335, 276, 379], mat: 'stone' }, // couloir bas côté défenseurs (coupé)
];

const TERRACE_RECT = [273, 81, 369, 222]; // zone de plant (jaune sur la minimap)
// Hell : le recoin sous Heaven, ouvert sur le site entre v = 112 et 172.
const HELL = [
  [238, 112, 273, 172],
  [238, 172, 257, 190],
  [238, 94, 257, 112], // poche du côté droit, derrière le mur, symétrique de celle du sud
];
const HEAVEN_RECTS = [
  [235, 81, 273, 231], // Rafters (Heaven), tout le long du site
  [148, 231, 273, 264], // couloir vers la rampe des défenseurs
  [233, 264, 273, 315], // A Window
  [273, 273, 290, 304], // avancée de la fenêtre au-dessus de Garden
];
// Rampe couverte : de Heaven (v = 264) au couloir bas (v = 335).
const RAMP = { r: [148, 264, 183, 335], from: HEAVEN, to: 0 };
// Escalier entre la place (est) et la terrasse (ouest) : 8 contremarches.
const STAIRS = { r: [369, 137, 398, 168], risers: 8 };
// Talus de gazon de part et d'autre de l'escalier, et leurs murets.
const BERMS = [
  [369, 81, 398, 133],
  [369, 172, 398, 222],
];
const CHEEKS = [
  [369, 133, 398, 137],
  [369, 168, 398, 172],
];
// Caisses et gros objets. `y` = niveau de pose, `h` = hauteur.
const PROPS = [
  { id: 'generator', r: [306, 187, 346, 200], y: TERRACE, h: 3.1, kind: 'generator' },
  { id: 'defaultBlock', r: [317, 117, 328, 129], y: TERRACE, h: 1.65, kind: 'blocks' },
  { id: 'defaultCrate', r: [313, 130, 324, 142], y: TERRACE, h: 1.77, kind: 'greenCrate' },
  { id: 'siteNW', r: [273, 81, 286, 94], y: TERRACE, h: 1.7, kind: 'blocks' }, // assez basse pour monter dessus en sautant depuis la petite
  { id: 'siteNWsmall', r: [273, 94, 280, 100], y: TERRACE, h: 0.9, kind: 'blocks' }, // marchepied, collée à Heaven et à la face sud de la grande
  { id: 'siteTallCrate', r: [343, 81, 356, 94], y: TERRACE, h: 3.6, kind: 'crate' },
  { id: 'heavenCrate', r: [261, 81, 273, 95], y: HEAVEN, h: 2.2, kind: 'crate' },
  { id: 'plazaBlocks', r: [411, 81, 440, 93], y: 0, h: 2.2, kind: 'blocks' },
  { id: 'plazaCovered', r: [411, 93, 440, 108], y: 0, h: 1.3, kind: 'tarp' },
  { id: 'lobbyA', r: [527, 234, 540, 247], y: 0, h: 1.3, kind: 'crate' },
  { id: 'lobbyAtop', r: [527, 234, 535, 242], y: 1.3, h: 1.0, kind: 'crate' },
  { id: 'lobbyB', r: [626, 234, 641, 247], y: 0, h: 1.6, kind: 'crate' },
  { id: 'lobbyBsmall', r: [633, 247, 641, 254], y: 0, h: 0.9, kind: 'crate' },
  { id: 'lobbyC', r: [584, 294, 598, 307], y: 0, h: 1.4, kind: 'crate' },
  { id: 'corridorBox', r: [262, 337, 275, 350], y: 0, h: 1.3, kind: 'crate' },
];

// Bâtiments qui remplissent tout ce qui n'est pas praticable : hauteur et
// enduit par zone (la dernière zone qui contient une case l'emporte).
const ZONES = [
  { r: ASCENT_A_ROI, h: 9, mat: 'cream' },
  { r: [230, 40, 445, 81], h: 13, mat: 'lavender' }, // immeuble au nord du site
  { r: [140, 40, 235, 231], h: 17, mat: 'cream' }, // église derrière Heaven
  { r: [273, 222, 369, 257], h: 7, mat: 'peach' }, // mur sud du site, côté Garden
  { r: [441, 81, 477, 258], h: 9.5, mat: 'peach' }, // entre la place et A Main
  { r: [519, 40, 726, 234], h: 11, mat: 'salmon' }, // à l'est d'A Main
  { r: [369, 235, 449, 380], h: 7, mat: 'cream' }, // murs de Tree
];

// Limites de la carte (le reste d'Ascent n'est pas modélisé).
const BARRIERS = [
  [656, 325, 719, 326],
  [449, 375, 482, 376],
  [148, 335, 149, 379],
  [148, 378, 183, 379],
];

// Noms de zone affichés en jeu, testés dans l'ordre (le premier qui contient le
// joueur l'emporte) ; `minY`/`maxY` séparent Heaven de Hell, superposés.
const CALLOUTS = [
  { id: 'aHell', r: [238, 112, 273, 190], maxY: 2.6 },
  { id: 'aRafters', r: [235, 81, 273, 231], minY: 2.6 },
  { id: 'aWindow', r: [233, 264, 290, 315], minY: 2.6 },
  { id: 'defenderSide', r: [140, 231, 276, 385] },
  { id: 'aSite', r: [273, 81, 441, 238] },
  { id: 'aTree', r: [368, 238, 449, 368] },
  { id: 'midCubby', r: [449, 317, 506, 385] },
  { id: 'aWine', r: [477, 40, 519, 94] },
  { id: 'aMain', r: [441, 94, 519, 300] },
  { id: 'aLobby', r: [519, 230, 726, 385] },
];

// Points de départ de l'aperçu (et du futur mode). `face` : direction du
// regard sur la minimap (est = [1, 0], nord = [0, -1]).
export const ASCENT_A_SPAWNS = [
  { id: 'lobby', u: 700, v: 272, y: 0, face: [-1, 0] },
  { id: 'main', u: 497, v: 245, y: 0, face: [0, -1] },
  { id: 'plaza', u: 430, v: 190, y: 0, face: [-0.94, -0.35] },
  { id: 'site', u: 300, v: 160, y: TERRACE, face: [1, 0] },
  { id: 'heaven', u: 265, v: 151, y: HEAVEN, face: [1, 0] },
  { id: 'hell', u: 250, v: 142, y: TERRACE, face: [1, 0] },
  { id: 'tree', u: 405, v: 330, y: 0, face: [0, -1] },
  { id: 'defenders', u: 200, v: 357, y: 0, face: [1, 0] },
];

// Nom de la zone où se trouve un point du monde (pieds à `feetY` au-dessus du sol de la place).
export function calloutAt(x, z, feetY) {
  const { u, v } = toMinimap(x, z);
  const hit = CALLOUTS.find((c) => inRect(u, v, c.r) && (c.minY === undefined || feetY >= c.minY) && (c.maxY === undefined || feetY < c.maxY));
  return hit?.id ?? null;
}

// --- Construction -------------------------------------------------------------

export function buildAscentSiteA(root, { floorY = 0, isDark = false } = {}) {
  const kit = createMapKit(root, { floorY, isDark, px: PX, u0: U0, v0: V0 });
  const { X, Y, Z, solids, push, mtx, addSolid, block, slopeBlock, slopeSolids } = kit;
  const { std, withBump, flat, face, glowing, barrier } = kit.mat;
  const M = {
    cream: withBump(plasterCanvas('cream', '#dcc8b6', { stone: '#dcbf98' }), 6),
    peach: withBump(plasterCanvas('peach', '#e3bfa2', { stone: '#e2c49c' }), 6),
    salmon: withBump(plasterCanvas('salmon', '#d8a58f', { stone: '#e0c09a' }), 6),
    lavender: withBump(plasterCanvas('lavender', '#c9c8e6', { stone: '#e6e1e0', brick: true, clusters: 3 }), 6),
    stone: withBump(sandstoneCanvas(), 2.4), // soubassements et flancs de la terrasse
    steps: withBump(greyStoneCanvas(), 1.6),
    cobble: withBump(fanCobbleCanvas(), 6, { roughness: 0.9 }),
    tiles: withBump(siteTilesCanvas(), 2.6, { roughness: 0.85 }),
    sand: flat(sandCanvas(), 4),
    grass: flat(grassCanvas(), 2.5, { roughness: 1 }),
    coping: withBump(copingCanvas(), 2.4, { roughness: 0.8 }),
    trim: std({ color: 0xeadfcd, roughness: 0.85 }),
    blocks: face(stoneBlockCanvas(), { roughness: 0.9 }),
    crate: face(plywoodCrateCanvas('tall', { bands: 2 })),
    smallCrate: face(plywoodCrateCanvas('small', { bands: 1 })),
    greenCrate: glowing(greenCrateCanvas(false), greenCrateCanvas(true), 0.55, { roughness: 0.4 }),
    tarp: face(tarpCanvas(), { roughness: 0.95 }),
    cloth: face(clothCanvas(), { roughness: 0.95, side: THREE.DoubleSide }),
    genSide: face(generatorSideCanvas(), { roughness: 0.6, metalness: 0.1 }),
    genEnd: glowing(generatorEndCanvas(false), generatorEndCanvas(true), 1.4, { roughness: 0.55, metalness: 0.1 }),
    door: glowing(aDoorCanvas(false), aDoorCanvas(true), 0.8, { roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide }),
    shutter: face(shutterCanvas(), { roughness: 0.6, metalness: 0.2 }),
    window: face(archWindowCanvas(), { alphaTest: 0.5, roughness: 0.3 }),
    sill: std({ color: 0xc0674a, roughness: 0.8 }), // appuis de fenêtre en terre cuite
    rail: std({ color: 0xb4b9b0, roughness: 0.45, metalness: 0.6 }),
    iron: std({ color: 0x55575e, roughness: 0.5, metalness: 0.5 }),
    wood: std({ color: 0xb98a5a, roughness: 0.85 }),
    bark: std({ color: 0x5c4a3a, roughness: 0.95, flatShading: true }),
    leaf: std({ color: 0xffffff, roughness: 0.85, flatShading: true }),
    barrier,
  };

  // --- Sol de base et revêtements --------------------------------------------
  const [RU0, RV0, RU1, RV1] = ASCENT_A_ROI;
  block(ASCENT_A_ROI, -1, 0, M.cobble, { ao: false });
  GROUND.forEach(({ r, mat }) => {
    if (mat !== 'cobble') block(r, 0, 0.012, M[mat], { solid: false, ao: false });
  });

  // --- Bâti : tout ce qui n'est pas praticable, par zones ----------------------
  kit.fillBuildings({
    roi: ASCENT_A_ROI,
    open: [...GROUND.map((g) => g.r), TERRACE_RECT, ...HELL, ...HEAVEN_RECTS, RAMP.r, STAIRS.r, ...BERMS, ...CHEEKS],
    zones: ZONES.map((z) => ({ ...z, material: M[z.mat] })),
    dress: (r, z) => {
      block(r, -0.5, 1.2, M.stone, { solid: false, inset: -0.04 }); // soubassement
      block(r, 1.2, 1.34, M.trim, { solid: false, inset: -0.08, ao: false }); // bandeau
      block(r, z.h, z.h + 0.32, M.trim, { solid: false, inset: -0.14, ao: false }); // corniche
    },
  });

  // --- Terrasse du site, Heaven, Hell ------------------------------------------
  block(TERRACE_RECT, -0.5, TERRACE - 0.08, M.stone);
  block(TERRACE_RECT, TERRACE - 0.08, TERRACE, M.tiles, { ao: false });

  const heavenPieces = [...subtract(HEAVEN_RECTS[0], HELL), ...HEAVEN_RECTS.slice(1)];
  heavenPieces.forEach((r) => {
    block(r, -0.5, HEAVEN - 0.08, M.cream);
    block(r, HEAVEN - 0.08, HEAVEN, M.tiles, { ao: false });
  });
  HELL.forEach((r) => {
    block(r, -0.5, TERRACE - 0.08, M.stone);
    block(r, TERRACE - 0.08, TERRACE, M.tiles, { ao: false });
    block(r, HEAVEN - HEAVEN_SLAB, HEAVEN - 0.08, M.cream);
    block(r, HEAVEN - 0.08, HEAVEN, M.tiles, { ao: false });
  });
  // Fond de Hell : rideau de garage clair.
  push(new THREE.PlaneGeometry(PX * 44, 2.3), M.shutter, mtx(X(238) + 0.02, Y(TERRACE + 1.15), Z(142), Math.PI / 2), { ao: false });

  // Pas de rebord le long de Heaven (retiré à la demande) ; échafaudage et
  // bâches seulement là où les captures en montrent.
  block([272.6, 81, 273.2, 222], HEAVEN - 0.5, HEAVEN, M.wood, { solid: false });
  [
    [174, 221, 0.1, 2.5], // grande bâche au sud de Heaven (masque une partie du site)
  ].forEach(([va, vb, y0, y1]) => {
    for (let v = va; v <= vb + 0.1; v += (vb - va) / Math.max(1, Math.round((vb - va) / 14))) {
      block([272.2, v - 0.4, 273, v + 0.4], HEAVEN, HEAVEN + 2.7, M.rail, { solid: false });
    }
    block([272.2, va, 273, vb], HEAVEN + 2.6, HEAVEN + 2.7, M.rail, { solid: false });
    const len = (vb - va) * PX;
    const geom = new THREE.PlaneGeometry(len, y1 - y0, 16, 6);
    const p = geom.attributes.position;
    for (let i = 0; i < p.count; i += 1) p.setZ(i, Math.sin(p.getX(i) * 2.1) * 0.05 + Math.sin(p.getY(i) * 3) * 0.03);
    push(geom, M.cloth, mtx(X(273) + 0.08, Y(HEAVEN + (y0 + y1) / 2), Z((va + vb) / 2), Math.PI / 2), { ao: false });
    block([273, va, 273.5, vb], HEAVEN + y0, HEAVEN + y1, null, { render: false }); // bloque aussi le passage
  });

  // Fenêtre (A Window) : parapet, piliers et toit de l'avancée sur Garden.
  block([289, 273, 290, 304], HEAVEN, HEAVEN + 0.95, M.coping);
  block([273, 303, 290, 304], HEAVEN, HEAVEN + 0.95, M.coping);
  [[289, 273], [289, 303]].forEach(([u, v]) => block([u, v, u + 1, v + 1], HEAVEN + 0.95, HEAVEN + 2.6, M.stone));
  block([273, 273, 290, 304], HEAVEN + 2.6, HEAVEN + 3.0, M.cream);
  // Couloirs couverts : bande vers la rampe, salle de la fenêtre, rampe.
  [[148, 231, 235, 264], [233, 264, 273, 315], [148, 264, 183, 335]].forEach((r) => block(r, HEAVEN + 3.2, HEAVEN + 3.6, M.cream));

  // --- Escalier, talus, murets ---------------------------------------------------
  {
    const [u0, v0, u1, v1] = STAIRS.r;
    const n = STAIRS.risers;
    const treads = n - 1;
    const w = (u1 - u0) / treads;
    for (let k = 0; k < treads; k += 1) {
      const h = (TERRACE * (treads - k)) / n;
      block([u0 + k * w, v0, u0 + (k + 1) * w, v1], -0.5, h, M.steps);
    }
  }
  BERMS.forEach((r) => {
    slopeBlock(r, -0.5, TERRACE, 0.02, 'u', M.grass);
    slopeSolids(r, -0.5, TERRACE, 0.02, 'u');
  });
  CHEEKS.forEach((r) => {
    slopeBlock(r, -0.5, TERRACE + 0.3, 0.3, 'u', M.coping);
    slopeSolids(r, -0.5, TERRACE + 0.3, 0.3, 'u');
  });
  // Rebord de la terrasse au-dessus des talus.
  block([367, 81, 369, 133], TERRACE, TERRACE + 0.18, M.coping);
  block([367, 172, 369, 222], TERRACE, TERRACE + 0.18, M.coping);

  // Rampe couverte entre Heaven et le couloir bas des défenseurs.
  slopeBlock(RAMP.r, -0.5, RAMP.from, RAMP.to, 'v', M.steps);
  slopeSolids(RAMP.r, -0.5, RAMP.from, RAMP.to, 'v', 0.12);

  // --- Ouvertures : linteaux au-dessus des passages -----------------------------
  // Arche d'A Main vers le site : ouverture de 4,2 m, haute d'environ 7,5 m
  // (capture depuis Heaven), dans un mur de 9,5 m.
  {
    const z0 = Z(134);
    const z1 = Z(168);
    const zc = (z0 + z1) / 2;
    const half = 2.1;
    const spring = 5.4;
    const wall = new THREE.Shape();
    wall.moveTo(z0, 0);
    wall.lineTo(z1, 0);
    wall.lineTo(z1, 9.5);
    wall.lineTo(z0, 9.5);
    wall.closePath();
    const hole = new THREE.Path();
    hole.moveTo(zc - half, 0);
    hole.lineTo(zc - half, spring);
    hole.absarc(zc, spring, half, Math.PI, 0, true);
    hole.lineTo(zc + half, 0);
    hole.closePath();
    wall.holes.push(hole);
    // Profil dessiné dans le plan (z, y), épaisseur vers l'ouest.
    const geom = new THREE.ExtrudeGeometry(wall, { depth: 4 * PX, bevelEnabled: false, curveSegments: 20 });
    push(geom, M.peach, mtx(X(445), Y(0), 0, -Math.PI / 2));
    // Encadrement de pierre claire et clé de voûte, sur les deux faces.
    const band = 0.32;
    const frame = new THREE.Shape();
    frame.moveTo(zc - half - band, 0);
    frame.lineTo(zc - half - band, spring);
    frame.absarc(zc, spring, half + band, Math.PI, 0, true);
    frame.lineTo(zc + half + band, 0);
    frame.lineTo(zc + half, 0);
    frame.lineTo(zc + half, spring);
    frame.absarc(zc, spring, half, 0, Math.PI, false);
    frame.lineTo(zc - half, 0);
    frame.closePath();
    const frameGeom = new THREE.ExtrudeGeometry(frame, { depth: 0.08, bevelEnabled: false, curveSegments: 20 });
    [
      [X(441), X(441)],
      [X(445) + 0.08, X(445)],
    ].forEach(([x, faceX]) => {
      push(frameGeom, M.coping, mtx(x, Y(0), 0, -Math.PI / 2));
      push(new THREE.BoxGeometry(0.2, 0.62, 0.5), M.coping, mtx(faceX, Y(spring + half + 0.12), zc));
    });
    block([441, 134, 445, 134 + (zc - half - z0) / PX], 0, 9.5, null, { render: false });
    block([441, 168 - (z1 - zc - half) / PX, 445, 168], 0, 9.5, null, { render: false });
    block([441, 134, 445, 168], spring + half, 9.5, null, { render: false });
  }
  block([392, 235, 418, 245], 3.6, 7, M.cream); // porte A
  block([518, 259, 527, 283], 3.4, 9, M.cream); // Lobby → A Main
  block([435, 331, 449, 350], 3.4, 7, M.cream); // Tree → Cubby
  // Porte A relevée (ouverte), côté place.
  push(new THREE.PlaneGeometry((418 - 392) * PX, 3.2), M.door, mtx(X(405), Y(5.2), Z(235) - 0.03, Math.PI), { ao: false });

  // --- Caisses et générateur -------------------------------------------------------
  const kindMat = { generator: M.genSide, blocks: M.blocks, greenCrate: M.greenCrate, tarp: M.tarp };
  PROPS.forEach(({ r, y, h, kind }) => {
    const material = kind === 'crate' ? (h >= 2 ? M.crate : M.smallCrate) : kindMat[kind];
    block(r, y, y + h, material, { inset: 0.02 });
    if (kind === 'generator') {
      // Faces avant et arrière : anneau lumineux et triangle, comme en jeu.
      const w = (r[3] - r[1]) * PX - 0.04;
      [
        [X(r[0]) + 0.01, -Math.PI / 2],
        [X(r[2]) - 0.01, Math.PI / 2],
      ].forEach(([x, ry]) => push(new THREE.PlaneGeometry(w, h), M.genEnd, mtx(x, Y(y + h / 2), Z((r[1] + r[3]) / 2), ry), { ao: false }));
    }
  });
  // Générateur : conduits sur le dessus et câbles jusqu'au mur sud.
  [312, 326, 340].forEach((u) => push(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 12), M.iron, mtx(X(u), Y(TERRACE + 3.35), Z(193.5))));
  [[318, 0.5], [334, 1.1]].forEach(([u, h]) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(X(u), Y(TERRACE + h), Z(200)),
      new THREE.Vector3(X(u + 2), Y(TERRACE + 0.05), Z(206)),
      new THREE.Vector3(X(u + 6), Y(TERRACE + 0.05), Z(214)),
      new THREE.Vector3(X(u + 8), Y(TERRACE + 2.8), Z(221.9)),
    ]);
    push(new THREE.TubeGeometry(curve, 30, 0.06, 6, false), M.iron, null, { ao: false });
  });

  // --- Arbres : Tree (jardinière en quart de cercle) et Wine ---------------------
  const leafy = (x, z, y0, spread, count, size, seed) => {
    const r = rng(seed);
    for (let k = 0; k < count; k += 1) {
      const a = r() * Math.PI * 2;
      const d = r() * spread;
      const green = [0.27 + r() * 0.08, 0.42 + r() * 0.12, 0.22 + r() * 0.06];
      push(new THREE.IcosahedronGeometry(size * (0.7 + r() * 0.5), 1), M.leaf, mtx(x + Math.cos(a) * d, Y(y0 + r() * size * 1.4), z + Math.sin(a) * d), {
        colorFn: (px, py, pz, n) => green.map((c) => c * (0.75 + n.y * 0.25)),
      });
    }
  };
  const planter = (u, v, radius, thetaStart, h, seed, treeHeight) => {
    const R = radius * PX;
    push(new THREE.CylinderGeometry(R, R, h, 18, 1, false, thetaStart, Math.PI / 2), M.coping, mtx(X(u), Y(h / 2), Z(v)));
    push(new THREE.CylinderGeometry(R - 0.15, R - 0.15, 0.04, 18, 1, false, thetaStart, Math.PI / 2), M.grass, mtx(X(u), Y(h + 0.01), Z(v)), { ao: false });
    const dx = Math.sin(thetaStart + Math.PI / 4) * R * 0.45;
    const dz = Math.cos(thetaStart + Math.PI / 4) * R * 0.45;
    const tx = X(u) + dx;
    const tz = Z(v) + dz;
    const trunk = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.25, treeHeight * 0.35, 0.1),
      new THREE.Vector3(-0.15, treeHeight * 0.7, -0.2),
      new THREE.Vector3(0.15, treeHeight, 0.1),
    ]);
    push(new THREE.TubeGeometry(trunk, 16, 0.12 + treeHeight * 0.035, 8, false), M.bark, mtx(tx, Y(h), tz), { ao: false });
    leafy(tx, tz, h + treeHeight * 0.85, treeHeight * 0.45, 12, treeHeight * 0.28, seed);
    addSolid(tx - 0.3, 0, tz - 0.3, tx + 0.3, h + treeHeight, tz + 0.3);
    return R;
  };
  {
    const R = planter(377, 367, 12, Math.PI / 2, 0.55, 7, 5.5);
    addSolid(X(377), 0, Z(367) - R * 0.8, X(377) + R * 0.8, 0.55, Z(367));
  }
  planter(477, 49, 6, 0, 0.5, 8, 2.4);

  // --- Façades : fenêtres des bâtiments qui entourent le site --------------------
  const windowOn = (x, y0, z, ry, w = 1.3, h = 2) => {
    push(new THREE.PlaneGeometry(w, h), M.window, mtx(x, Y(y0 + h / 2), z, ry), { ao: false });
    push(new THREE.BoxGeometry(w + 0.3, 0.16, 0.36), M.sill, mtx(x, Y(y0 - 0.08), z, ry), { ao: false });
  };
  // Immeuble lavande au nord du site (face sud, v = 81).
  [290, 310, 330, 360, 395, 425].forEach((u, i) => {
    windowOn(X(u), 6.2, Z(81) + 0.02, 0);
    if (i % 2 === 0) windowOn(X(u), 9.6, Z(81) + 0.02, 0);
  });
  // Église derrière Heaven (face est, u = 235) : hautes fenêtres au niveau de Heaven.
  [95, 125, 155, 185, 215].forEach((v) => windowOn(X(235) + 0.02, HEAVEN + 0.3, Z(v), Math.PI / 2, 1.5, 3));
  [110, 170].forEach((v) => windowOn(X(235) + 0.02, HEAVEN + 5.5, Z(v), Math.PI / 2, 1.4, 2.4));

  // --- Limites de la carte ----------------------------------------------------------
  BARRIERS.forEach((r) => block(r, 0, 6, M.barrier, { ao: false }));

  kit.finish();

  const a = toWorld(RU0, RV0);
  const b = toWorld(RU1, RV1);
  return {
    solids,
    floorY,
    levels: ASCENT_A_LEVELS,
    spawns: ASCENT_A_SPAWNS.map((s) => {
      const { x, z } = toWorld(s.u, s.v);
      // Lacet de la caméra three.js (0 = regard vers -z, c'est-à-dire le nord).
      return { id: s.id, x, z, feetY: Y(s.y), yaw: Math.atan2(-s.face[0], -s.face[1]) };
    }),
    bounds: { minX: a.x, maxX: b.x, minZ: a.z, maxZ: b.z },
  };
}

// Éclairage du site : soleil de fin d'après-midi au sud-ouest (les ombres des
// captures tombent vers le nord-est), ciel lavande, et ombres portées sur toute
// la carte. Partagé par l'aperçu et le futur mode, pour un rendu identique.
export function lightAscentSiteA(scene, renderer, info, { isDark = false } = {}) {
  return lightMap(scene, renderer, info, {
    isDark,
    sunDir: [-0.55, 0.62, 0.56],
    sunColor: 0xffe2c0,
    sunIntensity: 2.9,
    sky: 0xe2def2,
    ground: 0xb39684,
  });
}
