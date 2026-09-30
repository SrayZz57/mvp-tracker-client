import * as THREE from 'three';
import { rng, tex } from './aimArenaAscent.js';
import { createMapKit, inRect, lightMap, subtract } from './mapKit.js';
import {
  plazaTilesCanvas,
  woodFloorCanvas,
  concreteCanvas,
  brickCanvas,
  marbleCanvas,
  pillarCanvas,
  woodCrateCanvas,
  recycleCanvas,
  railingCanvas,
  sunsetSkyCanvas,
  cityCanvas,
} from './aimMapSunsetBTextures.js';

// Site B de Sunset (version du patch 9.08), pour les futurs modes avec
// déplacement. Même méthode que le site A d'Ascent (aimMapAscentA.js) :
//
// Plan au sol : minimap officielle (displayIcon de valorant-api.com). Ses
// coefficients (xMultiplier 0,000078 par unité de jeu) donnent 12,52 unités —
// 12,5 cm — par pixel de l'image 1024 px. Le masque praticable ci-dessous est
// relevé automatiquement sur l'image (diagonales et angles compris), découpé
// en rectangles [u0, v0, u1, v1[ en pixels de minimap (u vers l'est, v vers le
// sud ; défenseurs au nord, attaquants au sud, site B à l'ouest de la carte).
//
// Niveaux : relevés sur les captures officielles du patch 9.08, la minimap
// étant trompeuse ici (son dégradé dans Boba n'est pas un dénivelé). Le niveau
// haut réunit la salle de Boba, le fond du site (B Back, de plain-pied avec
// Boba) et la plateforme côté Market. On y monte par trois escaliers :
// - couloir ouest → palier intermédiaire (la zone de plant à l'ouest du pilier) ;
// - palier → niveau haut, au nord du pilier ;
// - couloir de Market → Boba (marche à nez jaune sur la capture de Boba).
// Le rebord sud de la plateforme ne se franchit qu'en sautant sur les caisses
// posées au pied du pilier. Hauteurs estimées sur ces captures : à confirmer.
//
// Repère monde : mètres, x vers l'est, z vers le sud ; sol à `floorY`.

export const SUNSET_MINIMAP_URL = 'https://media.valorant-api.com/maps/92584fbe-486a-b1b2-9faa-39b0f486b498/displayicon.png';
export const PX = 0.1252; // mètres par pixel de minimap
const U0 = 140; // origine monde : angle sud-ouest du pilier
const V0 = 480;

export const toWorld = (u, v) => ({ x: (u - U0) * PX, z: (v - V0) * PX });
export const toMinimap = (x, z) => ({ u: x / PX + U0, v: z / PX + V0 });

const UP = 1.7; // Boba, fond du site (B Back) et plateforme côté Market
const MID = 1.1; // palier intermédiaire : zone de plant à l'ouest du pilier
export const SUNSET_B_ROI = [40, 250, 400, 760];

// --- Plan ---------------------------------------------------------------------

// Masque praticable relevé sur la minimap (voir en tête de fichier).
const WALKABLE = '384,250,416,352;154,256,384,288;149,257,154,336;146,258,149,336;144,259,146,336;142,260,144,336;141,261,142,336;140,262,141,336;138,263,140,336;137,264,138,336;136,265,137,336;135,266,136,336;134,268,135,336;133,269,134,336;132,271,133,336;131,272,132,336;130,274,131,336;129,277,130,336;128,282,129,336;154,288,288,336;352,288,384,352;416,288,424,352;152,336,200,415;256,336,288,544;48,352,152,415;200,352,240,532;416,384,424,438;48,415,112,448;176,415,200,447;288,417,289,544;289,418,290,544;290,419,291,544;291,420,292,544;292,421,293,544;293,422,294,544;294,423,295,544;295,424,296,544;296,425,297,544;297,426,298,544;298,427,299,544;299,428,300,544;300,429,301,544;301,430,302,544;302,431,303,544;303,432,304,544;304,433,305,544;305,434,306,544;306,435,307,544;307,436,308,544;308,437,309,544;309,438,310,544;418,438,424,576;310,439,311,544;311,440,312,544;312,441,313,544;313,442,314,544;314,443,315,544;315,444,316,544;316,445,317,544;317,446,318,544;177,447,200,532;318,447,319,544;80,448,112,576;319,448,418,480;121,464,167,576;176,464,177,542;120,480,121,688;319,480,368,544;416,480,418,576;112,481,120,688;167,481,176,543;240,501,241,544;241,502,256,544;48,512,80,576;177,532,196,533;199,532,200,533;203,532,240,534;177,533,194,534;177,534,192,535;204,534,240,536;177,535,190,536;177,536,188,537;205,536,240,538;177,537,186,538;177,538,184,539;206,538,240,540;177,539,182,540;177,540,180,541;207,540,240,542;177,541,178,542;208,542,240,544;167,543,174,576;174,545,175,547;174,549,175,576;175,551,176,576;176,552,177,560;177,554,178,559;178,556,179,559;88,576,112,688;121,576,136,688;59,608,88,688;136,608,336,656;352,608,424,648;352,648,423,672;136,656,208,688;240,656,336,698;423,657,424,672;352,672,416,760;240,698,335,699;240,699,334,701;240,701,333,732;351,705,352,760;350,706,351,760;333,707,334,760;349,707,350,760;348,708,349,760;334,709,335,760;347,709,348,760;335,710,337,760;346,710,347,760;337,711,338,760;345,711,346,760;340,712,342,760;344,712,345,760;338,713,340,760;342,713,344,760;240,732,302,733;303,732,306,733;307,732,333,733;240,733,301,734;308,733,333,734;240,734,299,735;309,734,333,735;240,735,298,736;310,735,333,736;311,736,333,737;416,736,424,760;312,737,333,738;313,738,333,760;312,740,313,742;312,744,313,760;311,745,312,760;310,746,311,760;309,747,310,760;308,748,309,760;307,749,308,760;306,750,307,760;305,751,306,760;304,752,305,760'
  .split(';')
  .map((r) => r.split(',').map(Number))
  .filter(([u0, v0]) => u0 < SUNSET_B_ROI[2] && v0 < SUNSET_B_ROI[3])
  .map(([u0, v0, u1, v1]) => [u0, v0, Math.min(u1, SUNSET_B_ROI[2]), Math.min(v1, SUNSET_B_ROI[3])]);

// Niveau haut : bande du fond (côté Boba) et plateforme à l'est du pilier.
// Tout ce qui est praticable au nord de cette ligne (Boba) est au niveau haut.
const BOBA_SOUTH = 336;
const UPPER = [
  [150, 336, 200, 351], // porte de Boba, de plain-pied
  [48, 351, 240, 385],
  [140, 385, 240, 415],
  [175, 415, 240, 447],
];
// Palier intermédiaire, entre le muret ouest et le pilier.
const LANDING = [48, 385, 112, 448];
// Escaliers. `axis` : direction de montée ou de descente sur la minimap ;
// hauteurs au début puis à la fin du rectangle.
const STAIRS = [
  { r: [80, 448, 112, 480], axis: 'v', from: MID, to: 0, risers: 8 }, // couloir ouest → palier
  { r: [112, 385, 140, 415], axis: 'u', from: MID, to: UP, risers: 4 }, // palier → niveau haut, au nord du pilier
  { r: [256, 336, 288, 368], axis: 'v', from: UP, to: 0, risers: 10 }, // Boba → couloir de Market
];
const PILLAR = [112, 415, 175, 480];
// Hall du cinéma (B Main) et intérieur de Boba : couverts, avec une verrière.
const B_MAIN_HALL = [48, 600, 240, 700];
const B_MAIN_SKYLIGHT = [96, 624, 196, 676];
const BOBA_HALL = [128, 255, 245, 305];
const BOBA_SKYLIGHT = [160, 266, 220, 294];

// Caisses et objets (contours relevés sur la minimap), `y` = niveau de pose.
const PROPS = [
  // Boba : grand bac rose et deux jardinières (capture « B Boba » du patch 9.08).
  { r: [208, 320, 246, 336], y: UP, h: 1.6, kind: 'planter' },
  { r: [208, 304, 225, 320], y: UP, h: 1.15, kind: 'planter' },
  { r: [224, 312, 233, 320], y: UP, h: 0.55, kind: 'planter' },
  { r: [87, 352, 105, 368], y: UP, h: 1.0, kind: 'crate' }, // jardinière en bois du fond du site
  { r: [224, 391, 240, 409], y: UP, h: 1.35, kind: 'metal' }, // caisse métallique de la plateforme
  { r: [176, 447, 192, 464], y: 0, h: 1.25, kind: 'crate' }, // jardinière en bois au pied du pilier : avec le bac, marchepied vers la plateforme
  { r: [192, 447, 201, 457], y: 0, h: 0.7, kind: 'recycle' },
  { r: [304, 476, 321, 516], y: 0, h: 1.15, kind: 'cart' }, // l'objet au milieu de Market
  { r: [136, 608, 153, 624], y: 0, h: 2.2, kind: 'crate' }, // hall de B Main : guichet « Tickets »
  { r: [103, 672, 120, 688], y: 0, h: 1.0, kind: 'crate' },
  { r: [282, 634, 298, 678], y: 0, h: 1.0, kind: 'cart' },
];

// Bâti : hauteur et matière par zone (la dernière zone qui contient une case l'emporte).
const ZONES = [
  { r: SUNSET_B_ROI, h: 10, mat: 'concrete' },
  { r: [40, 250, 128, 351], h: 5, mat: 'concreteWarm' },
  { r: [240, 285, 355, 450], h: 13, mat: 'brick' }, // immeuble en brique à l'est du site
  { r: [40, 575, 400, 760], h: 9, mat: 'marble' }, // cinéma (B Main)
  { r: PILLAR, h: 17, mat: 'pillar' },
  // Bord ouest du site : muret d'un mètre au-dessus de chaque niveau, ouvert sur la ville.
  { r: [40, 351, 48, 385], h: UP + 1, mat: 'concrete', parapet: true },
  { r: [40, 385, 48, 450], h: MID + 1, mat: 'concrete', parapet: true },
  { r: [40, 512, 48, 600], h: 1, mat: 'concrete', parapet: true },
  { r: [40, 450, 80, 512], h: 3.2, mat: 'concreteWarm' }, // bloc Art déco à l'ouest de l'escalier
];

// Garde-corps posés sur le muret ouest : segment en pixels de minimap, puis
// hauteur du muret qui le porte.
const RAILINGS = [
  [48, 351, 48, 385, UP + 1],
  [48, 385, 48, 450, MID + 1],
  [48, 512, 48, 576, 1],
];

const CALLOUTS = [
  { id: 'bBack', r: [48, 345, 245, 385] },
  { id: 'bSite', r: [40, 385, 245, 600] },
  { id: 'bBoba', r: [120, 250, 300, 345] },
  { id: 'bMarket', r: [245, 345, 400, 600] },
  { id: 'bMain', r: [40, 600, 345, 760] },
  { id: 'bLobby', r: [345, 600, 400, 760] },
  { id: 'midTop', r: [300, 250, 400, 345] },
];

// Points de départ. `face` : direction du regard sur la minimap (est = [1, 0], nord = [0, -1]).
export const SUNSET_B_SPAWNS = [
  { id: 'bMain', u: 200, v: 660, y: 0, face: [-0.6, -1] },
  { id: 'market', u: 340, v: 500, y: 0, face: [-1, 0] },
  { id: 'site', u: 190, v: 540, y: 0, face: [-0.2, -1] },
  { id: 'platform', u: 225, v: 425, y: UP, face: [-1, 0] },
  { id: 'back', u: 70, v: 368, y: UP, face: [1, 0.3] },
  { id: 'westPlant', u: 70, v: 430, y: MID, face: [1, 0] },
  { id: 'boba', u: 175, v: 280, y: UP, face: [0, 1] },
  { id: 'lobby', u: 385, v: 700, y: 0, face: [0, -1] },
];

export function calloutAtSunsetB(x, z) {
  const { u, v } = toMinimap(x, z);
  return CALLOUTS.find((c) => inRect(u, v, c.r))?.id ?? null;
}

// --- Construction -------------------------------------------------------------

export function buildSunsetSiteB(root, { floorY = 0, isDark = false } = {}) {
  const kit = createMapKit(root, { floorY, isDark, px: PX, u0: U0, v0: V0 });
  const { X, Y, Z, solids, push, mtx, addSolid, block, slopeBlock, slopeSolids } = kit;
  const { std, withBump, flat, face } = kit.mat;
  const M = {
    tiles: withBump(plazaTilesCanvas(), 3.6, { roughness: 0.85 }),
    wood: flat(woodFloorCanvas(), 2, { roughness: 0.7 }),
    concrete: withBump(concreteCanvas('grey', '#c2b3b0'), 4),
    concreteWarm: withBump(concreteCanvas('warm', '#cdb7a8'), 4),
    brick: withBump(brickCanvas(), 2),
    marble: flat(marbleCanvas(), 3, { roughness: 0.5 }),
    pillar: face(pillarCanvas(), { roughness: 0.85 }),
    base: std({ color: 0x847883, roughness: 0.85 }),
    copper: std({ color: 0xd98a52, roughness: 0.6, metalness: 0.3 }),
    slate: std({ color: 0x6f87a0, roughness: 0.7 }),
    crate: face(woodCrateCanvas()),
    recycle: face(recycleCanvas()),
    planter: std({ color: 0xd9a58c, roughness: 0.85 }),
    metal: std({ color: 0xb9b4b8, roughness: 0.5, metalness: 0.4 }),
    cart: std({ color: 0x8aa0b4, roughness: 0.6, metalness: 0.3 }),
    steps: std({ color: 0xa79aa2, roughness: 0.9 }),
    yellow: std({ color: 0xe0b23a, roughness: 0.7 }),
    railing: face(railingCanvas(), { alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4 }),
    glass: std({ color: 0x9fc4d6, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.35 }),
    city: std({ map: tex(cityCanvas()), roughness: 0.95, fog: true }, 12),
    bark: std({ color: 0x8a6a52, roughness: 0.95, flatShading: true }),
    leaf: std({ color: 0xffffff, roughness: 0.85, flatShading: true }),
    ground: std({ color: 0x8f7f86, roughness: 1 }),
    barrier: kit.mat.barrier,
  };

  // --- Sol ----------------------------------------------------------------------
  const [RU0, RV0, RU1, RV1] = SUNSET_B_ROI;
  block(SUNSET_B_ROI, -1, 0, M.tiles, { ao: false });
  block(B_MAIN_HALL, 0, 0.012, M.wood, { solid: false, ao: false });

  // --- Bâti ---------------------------------------------------------------------
  kit.fillBuildings({
    roi: SUNSET_B_ROI,
    open: WALKABLE,
    zones: ZONES.map((z) => ({ ...z, material: M[z.mat] })),
    dress: (r, z) => {
      if (z.mat === 'pillar') return;
      if (z.parapet) {
        block(r, z.h, z.h + 0.12, M.copper, { solid: false, inset: -0.05, ao: false });
        return;
      }
      block(r, -0.5, 0.7, M.base, { solid: false, inset: -0.04 }); // soubassement
      block(r, 0.7, 0.8, M.copper, { solid: false, inset: -0.05, ao: false }); // filet cuivré
      block(r, z.h, z.h + 0.35, M.slate, { solid: false, inset: -0.16, ao: false }); // corniche bleu ardoise
    },
  });
  // Couronnement du pilier (gradins Art déco).
  [
    [0, 1.2, 0.3],
    [1.2, 2.2, 0.9],
    [2.2, 3.0, 1.6],
  ].forEach(([y0, y1, inset]) => block(PILLAR, 17 + y0, 17 + y1, M.concreteWarm, { solid: false, inset }));

  // --- Niveau haut, palier, escaliers -----------------------------------------------
  const boba = WALKABLE.filter(([, v0]) => v0 < BOBA_SOUTH).map(([u0, v0, u1, v1]) => [u0, v0, u1, Math.min(v1, BOBA_SOUTH)]);
  [...boba.map((r) => [r, UP]), ...UPPER.map((r) => [r, UP]), [LANDING, MID]].forEach(([r, h]) => {
    block(r, -0.5, h - 0.08, M.concrete);
    block(r, h - 0.08, h, M.tiles, { ao: false });
  });
  STAIRS.forEach(({ r, axis, from, to, risers }) => kit.stairs(r, -0.5, from, to, axis, risers, M.steps));
  // Rebord sud de la plateforme (trait clair sur la minimap) : muret incliné,
  // plus haut côté Market (« slight slope tapering to the left », patch 9.08).
  slopeBlock([176, 444.5, 240, 447.5], UP, UP + 0.03, UP + 0.25, 'u', M.copper);
  slopeSolids([176, 444.5, 240, 447.5], UP, UP + 0.03, UP + 0.25, 'u');
  // Nez de marche jaune en haut de l'escalier de Market, comme en jeu.
  block([256, 336, 288, 337.2], UP, UP + 0.015, M.yellow, { solid: false, ao: false });

  // --- Toitures des intérieurs, avec verrière ------------------------------------
  [
    [B_MAIN_HALL, B_MAIN_SKYLIGHT, 6.5],
    [BOBA_HALL, BOBA_SKYLIGHT, UP + 4.5],
  ].forEach(([hall, sky, h]) => {
    subtract(hall, [sky]).forEach((r) => block(r, h, h + 0.5, M.concrete));
    block(sky, h + 0.4, h + 0.45, M.glass, { solid: false, ao: false });
    for (let u = sky[0]; u <= sky[2]; u += (sky[2] - sky[0]) / 4) block([u - 0.8, sky[1], u + 0.8, sky[3]], h, h + 0.5, M.slate, { solid: false });
  });

  // --- Caisses et objets ----------------------------------------------------------
  PROPS.forEach(({ r, y, h, kind }) => block(r, y, y + h, M[kind], { inset: 0.02 }));

  // --- Bord ouest : garde-corps Art déco, palmiers, ville au loin -----------------
  RAILINGS.forEach(([ua, va, ub, vb, base]) => {
    const len = Math.hypot(ub - ua, vb - va) * PX;
    const ry = ua === ub ? Math.PI / 2 : 0;
    push(new THREE.PlaneGeometry(len, 0.9), M.railing, mtx(X((ua + ub) / 2), Y(base + 0.45), Z((va + vb) / 2), ry), { ao: false });
    // Infranchissable : on ne sort pas de la carte par-dessus le muret.
    const t = 0.6;
    if (ua === ub) block([ua - t, va, ua + t / 4, vb], base, base + 1.4, null, { render: false });
    else block([ua, va - t / 4, ub, va + t / 4], base, base + 1.4, null, { render: false });
  });
  // Contrebas de la ville, sous le bord ouest.
  block([RU0 - 400, RV0 - 200, RU0, RV1 + 200], -9, -8, M.ground, { solid: false, ao: false });
  const crand = rng(33);
  // Tours au loin (150 à 300 m), voilées par la brume : on voit le ciel entre elles.
  for (let i = 0; i < 14; i += 1) {
    const u = RU0 - 1200 - crand() * 1200;
    const v = RV0 - 700 + crand() * 2000;
    const w = 80 + crand() * 120;
    block([u, v, u + w, v + w * (0.6 + crand() * 0.6)], -8, 14 + crand() * 40, M.city, { solid: false, ao: false });
  }
  const palm = (u, v, base, height, seed) => {
    const r = rng(seed);
    const x = X(u);
    const z = Z(v);
    const lean = (r() - 0.5) * 0.8;
    const trunk = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(lean * 0.4, height * 0.5, 0),
      new THREE.Vector3(lean, height, lean * 0.3),
    ]);
    push(new THREE.TubeGeometry(trunk, 12, 0.22, 7, false), M.bark, mtx(x, Y(base), z), { ao: false });
    for (let k = 0; k < 9; k += 1) {
      const a = (k / 9) * Math.PI * 2 + r();
      const frond = new THREE.BoxGeometry(3.4, 0.06, 0.55);
      frond.translate(1.7, 0, 0);
      push(frond, M.leaf, mtx(x + lean, Y(base + height), z + lean * 0.3, a, 0, -0.45 - r() * 0.3), {
        colorFn: () => [0.36 + r() * 0.06, 0.5 + r() * 0.08, 0.26],
      });
    }
  };
  [
    [20, 380, 20],
    [8, 470, 22],
    [24, 560, 18],
    [-10, 420, 24],
  ].forEach(([u, v, hgt], i) => palm(u, v, -8, hgt, 40 + i));

  // --- Limites de la carte : barrière là où le praticable touche le bord ------------
  WALKABLE.forEach(([u0, v0, u1, v1]) => {
    if (u1 >= RU1) block([RU1 - 0.6, v0, RU1, v1], 0, 6, M.barrier, { ao: false });
    if (v1 >= RV1) block([u0, RV1 - 0.6, u1, RV1], 0, 6, M.barrier, { ao: false });
    if (v0 <= RV0) block([u0, RV0, u1, RV0 + 0.6], 0, 6, M.barrier, { ao: false });
  });

  kit.finish();

  const a = toWorld(RU0, RV0);
  const b = toWorld(RU1, RV1);
  return {
    solids,
    floorY,
    spawns: SUNSET_B_SPAWNS.map((s) => {
      const { x, z } = toWorld(s.u, s.v);
      return { id: s.id, x, z, feetY: Y(s.y), yaw: Math.atan2(-s.face[0], -s.face[1]) };
    }),
    bounds: { minX: a.x, maxX: b.x, minZ: a.z, maxZ: b.z },
    addSolid,
  };
}

// Coucher de soleil : soleil bas à l'ouest (côté océan), lumière orangée,
// ciel rose et violet.
export function lightSunsetSiteB(scene, renderer, info, { isDark = false } = {}) {
  return lightMap(scene, renderer, info, {
    isDark,
    sunDir: [-0.88, 0.36, 0.22],
    sunColor: 0xffb27a,
    sunIntensity: 2.7,
    sky: 0xd2bfff,
    ground: 0xa47a68,
    hemi: 1.1,
    fillColor: 0x9fb4ff,
    fill: 0.55,
  });
}

// Ciel de coucher de soleil (sphère qui suit la caméra).
export function sunsetSky() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(180, 40, 24),
    new THREE.MeshBasicMaterial({ map: tex(sunsetSkyCanvas(), { wrap: false }), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
}
