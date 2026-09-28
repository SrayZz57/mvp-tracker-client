import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AGENT_HEIGHT, AGENT_HEAD_RADIUS } from './aimTrainerModes.js';

const AGENT_TOTAL_HEIGHT = AGENT_HEIGHT;
const AGENT_EYE_TO_HEAD = AGENT_HEIGHT - AGENT_HEAD_RADIUS; // pieds -> centre de la tête

// Arène « Canyon » : le stand de tir des modes sniper. Un nid surélevé protégé
// par des sacs de sable, face à une longue vallée de 80 m entre deux falaises
// de roche rouge, au coucher du soleil. Des couverts à distances croissantes
// (sacs et caisses à ~18 m, bâtisse en adobe à ~30 m, arche de pierre à ~45 m,
// tour de guet à ~60 m) : chacun déclare des « angles » d'où un ennemi sort.
//
// Performances : les pièces fixes qui partagent un matériau sont fusionnées
// (une quinzaine d'appels de dessin pour tout le décor), les textures sont
// dessinées une fois par lancement, pas d'ombres dynamiques.
//
// Repère : le joueur est à l'origine, les yeux à y = 0, face à -Z. Unités :
// mètres. La vallée est 2,5 m plus bas que le nid : on tire en plongée, comme
// depuis une position de sniper.

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const canvases = new Map();
function paint(key, w, h, draw) {
  if (!canvases.has(key)) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    canvases.set(key, c);
  }
  return canvases.get(key);
}

function texture(canvas, repeat = [1, 1]) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function grain(ctx, w, h, rand, count, colors, size = 2) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.fillRect(rand() * w, rand() * h, size * rand() + 0.5, size * rand() + 0.5);
  }
}

// --- Textures ---------------------------------------------------------------------

const sandCanvas = () =>
  paint('range-sand', 512, 512, (ctx, w, h) => {
    const rand = rng(11);
    ctx.fillStyle = '#c98f5c';
    ctx.fillRect(0, 0, w, h);
    // Rides de sable soufflé.
    for (let y = 0; y < h; y += 7) {
      ctx.strokeStyle = `rgba(120, 70, 35, ${0.06 + rand() * 0.06})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.03 + y * 0.1) * 3);
      ctx.stroke();
    }
    grain(ctx, w, h, rand, 14000, ['rgba(255,220,180,0.18)', 'rgba(90,50,25,0.2)', 'rgba(160,100,60,0.25)'], 2);
  });

const rockCanvas = () =>
  paint('range-rock', 512, 512, (ctx, w, h) => {
    const rand = rng(23);
    ctx.fillStyle = '#9c4b2f';
    ctx.fillRect(0, 0, w, h);
    // Strates horizontales du grès.
    for (let y = 0; y < h; y += 6 + rand() * 18) {
      ctx.fillStyle = ['#b35a36', '#8a3f27', '#c46a3f', '#7a3521', '#a8522f'][Math.floor(rand() * 5)];
      ctx.globalAlpha = 0.55;
      ctx.fillRect(0, y, w, 4 + rand() * 14);
    }
    ctx.globalAlpha = 1;
    // Fissures verticales.
    ctx.strokeStyle = 'rgba(40, 15, 8, 0.35)';
    for (let i = 0; i < 40; i += 1) {
      ctx.lineWidth = 0.5 + rand() * 1.5;
      ctx.beginPath();
      let x = rand() * w;
      ctx.moveTo(x, rand() * h);
      for (let k = 0; k < 6; k += 1) {
        x += (rand() - 0.5) * 20;
        ctx.lineTo(x, rand() * h);
      }
      ctx.stroke();
    }
    grain(ctx, w, h, rand, 9000, ['rgba(255,200,150,0.12)', 'rgba(40,15,8,0.2)'], 2);
  });

const adobeCanvas = () =>
  paint('range-adobe', 512, 512, (ctx, w, h) => {
    const rand = rng(37);
    ctx.fillStyle = '#d9a877';
    ctx.fillRect(0, 0, w, h);
    // Enduit irrégulier et briques de terre crue apparentes par endroits.
    for (let i = 0; i < 26; i += 1) {
      const x = rand() * w;
      const y = rand() * h;
      ctx.fillStyle = 'rgba(150, 95, 55, 0.35)';
      for (let k = 0; k < 4; k += 1) ctx.fillRect(x + (k % 2) * 30, y + Math.floor(k / 2) * 14, 28, 12);
    }
    grain(ctx, w, h, rand, 16000, ['rgba(255,235,210,0.2)', 'rgba(120,70,40,0.18)'], 3);
    // Coulures en bas du mur.
    const g = ctx.createLinearGradient(0, h * 0.75, 0, h);
    g.addColorStop(0, 'rgba(110,60,30,0)');
    g.addColorStop(1, 'rgba(110,60,30,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.75, w, h * 0.25);
  });

const woodCanvas = () =>
  paint('range-wood', 256, 256, (ctx, w, h) => {
    const rand = rng(51);
    ctx.fillStyle = '#7a5334';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      ctx.fillStyle = `rgba(0,0,0,${0.12 + rand() * 0.1})`;
      ctx.fillRect(0, y, w, 2);
      for (let k = 0; k < 30; k += 1) {
        ctx.strokeStyle = `rgba(60,35,20,${0.15 + rand() * 0.2})`;
        ctx.beginPath();
        const yy = y + rand() * 30;
        ctx.moveTo(0, yy);
        ctx.bezierCurveTo(w * 0.3, yy + rand() * 4, w * 0.6, yy - rand() * 4, w, yy + rand() * 3);
        ctx.stroke();
      }
    }
    grain(ctx, w, h, rand, 3000, ['rgba(255,220,180,0.1)', 'rgba(0,0,0,0.15)'], 2);
  });

const sandbagCanvas = () =>
  paint('range-sandbag', 256, 128, (ctx, w, h) => {
    const rand = rng(63);
    ctx.fillStyle = '#b39468';
    ctx.fillRect(0, 0, w, h);
    // Trame de toile de jute.
    for (let x = 0; x < w; x += 3) {
      ctx.fillStyle = 'rgba(80,60,35,0.12)';
      ctx.fillRect(x, 0, 1, h);
    }
    for (let y = 0; y < h; y += 3) {
      ctx.fillStyle = 'rgba(80,60,35,0.1)';
      ctx.fillRect(0, y, w, 1);
    }
    grain(ctx, w, h, rand, 2500, ['rgba(60,40,20,0.2)', 'rgba(255,240,210,0.15)'], 2);
  });

const crateCanvas = () =>
  paint('range-crate', 256, 256, (ctx, w, h) => {
    const rand = rng(71);
    ctx.fillStyle = '#6f7a4a';
    ctx.fillRect(0, 0, w, h);
    grain(ctx, w, h, rand, 5000, ['rgba(0,0,0,0.15)', 'rgba(255,255,220,0.08)'], 2);
    // Cadre et croisillon renforcés, pochoir « MVP ».
    ctx.strokeStyle = '#3e4428';
    ctx.lineWidth = 16;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(16, 16);
    ctx.lineTo(w - 16, h - 16);
    ctx.stroke();
    ctx.fillStyle = 'rgba(230, 220, 170, 0.7)';
    ctx.font = 'bold 44px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('MVP', w / 2, h / 2 + 60);
  });

const skyCanvas = () =>
  paint('range-sky', 1024, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1d1f45');
    g.addColorStop(0.35, '#6b3a6e');
    g.addColorStop(0.55, '#e0664b');
    g.addColorStop(0.68, '#ffb35c');
    g.addColorStop(1, '#ffd9a0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Longs nuages effilés éclairés par en dessous.
    const rand = rng(91);
    for (let i = 0; i < 26; i += 1) {
      const y = h * (0.3 + rand() * 0.28);
      const x = rand() * w;
      const len = 120 + rand() * 320;
      const cg = ctx.createLinearGradient(x, y, x + len, y);
      cg.addColorStop(0, 'rgba(255, 170, 120, 0)');
      cg.addColorStop(0.5, `rgba(255, ${150 + rand() * 60}, ${110 + rand() * 40}, ${0.25 + rand() * 0.3})`);
      cg.addColorStop(1, 'rgba(255, 170, 120, 0)');
      ctx.fillStyle = cg;
      ctx.fillRect(x, y, len, 3 + rand() * 7);
    }
    // Quelques étoiles tout en haut.
    for (let i = 0; i < 90; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.6})`;
      ctx.fillRect(rand() * w, rand() * h * 0.22, 1.2, 1.2);
    }
  });

// --- Construction ----------------------------------------------------------------

export function buildRangeArena(arena, { floorY, isDark }) {
  const colliders = [];
  const byMaterial = new Map(); // matériau -> géométries à fusionner
  const valleyY = floorY - 2.5;

  const mats = {
    sand: new THREE.MeshStandardMaterial({ map: texture(sandCanvas(), [30, 30]), roughness: 0.95, color: isDark ? 0x8a6a55 : 0xffffff }),
    rock: new THREE.MeshStandardMaterial({ map: texture(rockCanvas(), [4, 2]), roughness: 0.9, color: isDark ? 0x7a5a50 : 0xffffff, flatShading: true }),
    adobe: new THREE.MeshStandardMaterial({ map: texture(adobeCanvas(), [2, 1]), roughness: 0.92, color: isDark ? 0x8a7060 : 0xffffff }),
    wood: new THREE.MeshStandardMaterial({ map: texture(woodCanvas(), [1, 1]), roughness: 0.8 }),
    sandbag: new THREE.MeshStandardMaterial({ map: texture(sandbagCanvas(), [1, 1]), roughness: 1 }),
    crate: new THREE.MeshStandardMaterial({ map: texture(crateCanvas(), [1, 1]), roughness: 0.85 }),
    stone: new THREE.MeshStandardMaterial({ map: texture(rockCanvas(), [1.5, 1.5]), roughness: 0.9, color: 0xe7c9a8 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 1 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.5, metalness: 0.6 }),
    banner: new THREE.MeshStandardMaterial({ color: 0xff4655, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x3a0508, emissiveIntensity: 0.4 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x3a3228, roughness: 1, side: THREE.DoubleSide }),
  };

  // Ajoute une géométrie à fusionner, placée dans le monde.
  const put = (geometry, material, x, y, z, { rx = 0, ry = 0, rz = 0, solid = false } = {}) => {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(1, 1, 1),
    );
    const g = geometry.clone().applyMatrix4(m);
    if (!byMaterial.has(material)) byMaterial.set(material, []);
    byMaterial.get(material).push(g);
    if (solid) {
      g.computeBoundingBox();
      colliders.push(g.boundingBox.clone());
    }
    return g;
  };
  const box = (w, h, d, material, x, y0, z, opts = {}) => put(new THREE.BoxGeometry(w, h, d), material, x, y0 + h / 2, z, opts);

  // --- Sol de la vallée et ciel ---------------------------------------------------
  put(new THREE.PlaneGeometry(160, 200, 40, 40), mats.sand, 0, valleyY, -60, { rx: -Math.PI / 2 });

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(180, 48, 24),
    new THREE.MeshBasicMaterial({ map: texture(skyCanvas()), side: THREE.BackSide, fog: false, depthWrite: false, color: isDark ? 0x5a4a6a : 0xffffff }),
  );
  sky.material.map.wrapS = THREE.ClampToEdgeWrapping;
  sky.rotation.y = Math.PI;
  arena.add(sky);

  // Soleil couchant, bas sur l'horizon, dans l'axe de la vallée.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(9, 48),
    new THREE.MeshBasicMaterial({ color: 0xffd28a, fog: false, transparent: true, opacity: isDark ? 0.5 : 0.95 }),
  );
  sun.position.set(-18, valleyY + 16, -165);
  arena.add(sun);
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(24, 48),
    new THREE.MeshBasicMaterial({ color: 0xff9a50, fog: false, transparent: true, opacity: isDark ? 0.12 : 0.28, depthWrite: false }),
  );
  halo.position.set(-18, valleyY + 16, -166);
  arena.add(halo);

  // --- Falaises : blocs de grès empilés, irréguliers ----------------------------------
  const cliffRand = rng(7);
  const cliff = (side) => {
    for (let z = 12; z > -125; z -= 7) {
      const depth = 6 + cliffRand() * 5;
      const x = side * (17 + cliffRand() * 3 + (z < -70 ? (z + 70) * -0.05 : 0));
      let y = valleyY;
      const layers = 3 + Math.floor(cliffRand() * 3);
      for (let k = 0; k < layers; k += 1) {
        const h = 3 + cliffRand() * 5;
        const w = 7 + cliffRand() * 4 - k * 0.8;
        box(w, h, depth, mats.rock, x + side * (w / 2 - 3 + k * 0.6), y, z, { ry: (cliffRand() - 0.5) * 0.2 });
        y += h;
      }
    }
  };
  cliff(-1);
  cliff(1);

  // Mesas au loin, silhouettes plus sombres.
  [
    [-60, -150, 22, 18],
    [-25, -175, 30, 26],
    [28, -160, 18, 30],
    [70, -140, 26, 20],
  ].forEach(([x, z, h, r]) => {
    put(new THREE.CylinderGeometry(r * 0.75, r, h, 9), mats.rock, x, valleyY + h / 2, z);
    put(new THREE.CylinderGeometry(r * 0.8, r * 0.75, 2, 9), mats.dark, x, valleyY + h + 1, z);
  });

  // --- Nid de sniper du joueur --------------------------------------------------------
  // Plancher en bois sous les pieds, rambarde de sacs de sable devant (à ~1,6 m).
  box(8, 0.2, 5, mats.wood, 0, floorY - 0.2, 0.5);
  box(8.4, floorY - valleyY - 0.2, 5.4, mats.dark, 0, valleyY, 0.5); // soubassement
  for (let i = 0; i < 9; i += 1) {
    const x = -3.6 + i * 0.9;
    put(new THREE.CapsuleGeometry(0.22, 0.55, 4, 10), mats.sandbag, x, floorY + 0.05, -2.4, { rz: Math.PI / 2, ry: (i % 2) * 0.1 });
    if (i % 2 === 0 && i < 8) put(new THREE.CapsuleGeometry(0.21, 0.5, 4, 10), mats.sandbag, x + 0.45, floorY + 0.45, -2.4, { rz: Math.PI / 2 });
  }
  // Poteaux et toile tendue au-dessus du nid (ombre et cadre du regard).
  [-3.8, 3.8].forEach((x) => {
    box(0.15, 3.4, 0.15, mats.wood, x, floorY, -1.6);
    box(0.15, 3.4, 0.15, mats.wood, x, floorY, 2.8);
  });
  put(new THREE.PlaneGeometry(8, 4.6), mats.cloth, 0, floorY + 3.3, 0.6, { rx: -Math.PI / 2 + 0.08 });
  // Fanion MVP au bord du nid.
  box(0.06, 2.4, 0.06, mats.metal, -3.8, floorY + 3.3, -1.6);
  put(new THREE.PlaneGeometry(1.1, 0.6), mats.banner, -3.25, floorY + 5.3, -1.6);

  // --- Couverts et angles -------------------------------------------------------------
  // Un angle est décrit à partir de la BOÎTE du couvert (celle qui arrête aussi
  // les balles), pour que la cachette soit vraiment derrière l'obstacle vu du nid :
  //   'edge' : l'ennemi sort latéralement du bord gauche (-1) ou droit (+1) ;
  //   'rise' : il se relève derrière un couvert bas (sacs, parapet) ;
  //   'door' : il apparaît dans une embrasure.
  // floor = hauteur du sol à cet endroit, tier = distance (near / mid / far).
  const angles = [];
  const solidBox = (w, h, d, material, x, y0, z, opts = {}) => {
    box(w, h, d, material, x, y0, z, { ...opts, solid: true });
    return colliders[colliders.length - 1];
  };
  const edge = (cover, side, tier, floor = valleyY) => angles.push({ kind: 'edge', cover, side, tier, floor });
  const rise = (cover, tier, floor = valleyY) => angles.push({ kind: 'rise', cover, side: 0, tier, floor });
  const door = (x, z, tier, floor = valleyY) => angles.push({ kind: 'door', x, z, side: 0, tier, floor });

  // ~18 m : murets de sacs de sable et pile de caisses.
  const bags = (cx, cz, n) => {
    for (let i = 0; i < n; i += 1) {
      put(new THREE.CapsuleGeometry(0.25, 0.6, 4, 10), mats.sandbag, cx - (n - 1) * 0.45 + i * 0.9, valleyY + 0.26, cz, { rz: Math.PI / 2 });
      put(new THREE.CapsuleGeometry(0.24, 0.55, 4, 10), mats.sandbag, cx - (n - 1) * 0.45 + i * 0.9 + 0.2, valleyY + 0.72, cz, { rz: Math.PI / 2 });
    }
    const cover = new THREE.Box3(new THREE.Vector3(cx - n * 0.5, valleyY, cz - 0.3), new THREE.Vector3(cx + n * 0.5, valleyY + 1.0, cz + 0.3));
    colliders.push(cover);
    return cover;
  };
  rise(bags(-8, -17, 4), 'near');
  rise(bags(7, -19, 3), 'near');
  const crates = solidBox(1.4, 1.4, 1.4, mats.crate, -2.6, valleyY, -18);
  box(1.4, 1.4, 1.4, mats.crate, -2.6, valleyY + 1.4, -18.1, { ry: 0.3 });
  crates.max.y += 1.4; // la caisse du dessus couvre aussi
  edge(crates, -1, 'near');
  edge(crates, 1, 'near');
  const crate2 = solidBox(1.2, 1.2, 1.2, mats.crate, 11, valleyY, -16, { ry: -0.2 });
  rise(crate2, 'near');

  // ~30 m : bâtisse en adobe (deux portes, une fenêtre), tonneaux devant.
  const bx = 8.5;
  const bz = -31;
  const house = solidBox(8, 4.2, 5, mats.adobe, bx, valleyY, bz - 2.5);
  box(8.6, 0.3, 5.6, mats.wood, bx, valleyY + 4.2, bz - 2.5); // avancée du toit
  for (let i = 0; i < 5; i += 1) put(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8), mats.wood, bx - 3.6 + i * 1.8, valleyY + 3.8, bz + 0.35, { rx: Math.PI / 2 });
  // Embrasures sombres (le mur est plein : l'ennemi se tient dans l'encadrement).
  box(1.3, 2.3, 0.1, mats.dark, bx - 2.1, valleyY, bz + 0.02);
  box(1.3, 2.3, 0.1, mats.dark, bx + 2.1, valleyY, bz + 0.02);
  box(1.2, 1.0, 0.1, mats.dark, bx, valleyY + 2.1, bz + 0.02);
  door(bx - 2.1, bz + 0.35, 'mid');
  door(bx + 2.1, bz + 0.35, 'mid');
  edge(house, -1, 'mid');
  edge(house, 1, 'mid');
  [[-12, -29], [-12.7, -29.4]].forEach(([x, z]) => put(new THREE.CylinderGeometry(0.4, 0.4, 1.1, 14), mats.wood, x, valleyY + 0.55, z));
  const barrels = new THREE.Box3(new THREE.Vector3(-13.2, valleyY, -29.9), new THREE.Vector3(-11.5, valleyY + 1.1, -28.5));
  colliders.push(barrels);
  rise(barrels, 'mid');

  // ~45 m : arche de pierre sur deux piliers, blocs éboulés.
  const az = -45;
  const ax = -5.5;
  const pillarL = solidBox(1.8, 5.5, 1.8, mats.stone, ax - 4, valleyY, az);
  const pillarR = solidBox(1.8, 5.5, 1.8, mats.stone, ax + 4, valleyY, az);
  put(new THREE.TorusGeometry(4, 0.9, 10, 24, Math.PI), mats.stone, ax, valleyY + 5.5, az);
  const rubble = solidBox(2.4, 1.2, 1.6, mats.stone, 3, valleyY, az - 2);
  box(1.6, 0.9, 1.4, mats.stone, 11, valleyY, az - 0.5, { ry: -0.3, solid: true });
  edge(pillarL, -1, 'far');
  edge(pillarL, 1, 'far');
  edge(pillarR, -1, 'far');
  edge(pillarR, 1, 'far');
  rise(rubble, 'far');

  // ~60 m : tour de guet en bois avec balcon, rocher à droite.
  const tz = -62;
  const tx = 4;
  [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => box(0.3, 7, 0.3, mats.wood, tx + sx * 1.6, valleyY, tz + sz * 1.6)));
  box(3.8, 0.25, 3.8, mats.wood, tx, valleyY + 7, tz, { solid: true });
  const parapet = solidBox(3.8, 1.1, 0.12, mats.wood, tx, valleyY + 7.25, tz + 1.9);
  put(new THREE.ConeGeometry(3, 1.6, 4), mats.wood, tx, valleyY + 9.4, tz, { ry: Math.PI / 4 });
  [-1, 1].forEach((sx) => box(0.12, 2.1, 0.12, mats.wood, tx + sx * 1.8, valleyY + 7.25, tz + 1.8));
  rise(parapet, 'far', valleyY + 7.25);
  const boulder = solidBox(3, 2.2, 2.5, mats.rock, -14, valleyY, -57);
  edge(boulder, 1, 'far');

  // Postes « à découvert » (debout, sans couvert) pour les modes où la cible
  // est déjà visible : de ~20 à ~60 m.
  const openCandidates = [
    [-5, -22], [3, -23], [-11, -24], [10, -24], [0, -30], [-8, -35], [2, -38], [-1, -44], [6, -47], [-12, -49],
    [0, -52], [8, -55], [-4, -58], [-9, -63], [10, -66], [-2, -68],
  ].map(([x, z]) => ({ x, z, floor: valleyY }));

  // --- Poussière et détails --------------------------------------------------------------
  // Cactus colonnaires (saguaros) le long de la vallée.
  const cactusMat = new THREE.MeshStandardMaterial({ color: 0x4f6b3a, roughness: 0.8 });
  [[-13, -24], [14, -34], [-14, -56], [13, -68], [-4, -72]].forEach(([x, z], i) => {
    const h = 3 + (i % 3);
    put(new THREE.CapsuleGeometry(0.28, h, 4, 10), cactusMat, x, valleyY + h / 2 + 0.28, z);
    put(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), cactusMat, x + 0.55, valleyY + h * 0.55 + 0.6, z);
    put(new THREE.CapsuleGeometry(0.2, 0.6, 4, 8), cactusMat, x + 0.35, valleyY + h * 0.55, z, { rz: Math.PI / 2 });
  });
  // Lignes de visée peintes au sol tous les 10 m (repères de distance).
  const markMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.35 });
  for (let d = 20; d <= 60; d += 10) put(new THREE.PlaneGeometry(1.6, 0.15), markMat, 0, valleyY + 0.02, -d, { rx: -Math.PI / 2 });

  // --- Ligne de vue ----------------------------------------------------------------
  // Un angle n'est gardé que si l'ennemi y est réellement caché depuis le nid
  // puis bien visible une fois sorti ; un poste à découvert, que s'il est
  // visible. Ainsi, déplacer un décor ne peut pas créer d'angle injouable.
  const eye = new THREE.Vector3(0, 0, 0);
  const ray = new THREE.Ray();
  const hit = new THREE.Vector3();
  const headOf = (x, baseY, z) => new THREE.Vector3(x, baseY + AGENT_EYE_TO_HEAD, z);
  const blocked = (p) => {
    const dir = p.clone().sub(eye);
    const dist = dir.length();
    ray.set(eye, dir.normalize());
    return colliders.some((c) => ray.intersectBox(c, hit) && eye.distanceTo(hit) < dist - 0.05);
  };
  const playable = angles.filter((a) => {
    if (a.kind === 'door') return !blocked(headOf(a.x, a.floor, a.z));
    if (a.kind === 'edge') {
      const z = a.cover.min.z - 0.45;
      const out = a.side > 0 ? a.cover.max.x + 0.55 : a.cover.min.x - 0.55;
      const hid = a.side > 0 ? a.cover.max.x - 0.55 : a.cover.min.x + 0.55;
      return blocked(headOf(hid, a.floor, z)) && !blocked(headOf(out, a.floor, z));
    }
    const x = (a.cover.min.x + a.cover.max.x) / 2;
    const z = a.cover.min.z - 0.4;
    return blocked(headOf(x, a.cover.max.y - AGENT_TOTAL_HEIGHT - 0.15, z)) && !blocked(headOf(x, a.floor, z));
  });
  const open = openCandidates.filter((o) => !blocked(headOf(o.x, o.floor, o.z)));

  // Fusion : un seul maillage par matériau.
  byMaterial.forEach((geometries, material) => {
    const merged = mergeGeometries(geometries.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    geometries.forEach((g) => g.dispose());
    if (!merged) return;
    merged.computeVertexNormals();
    arena.add(new THREE.Mesh(merged, material));
  });

  // Éclairage chaud rasant du couchant + contre-jour froid.
  const sunLight = new THREE.DirectionalLight(0xffb070, isDark ? 0.8 : 2.2);
  sunLight.position.set(-30, 25, -120);
  arena.add(sunLight);
  const fill = new THREE.HemisphereLight(0xffd6a8, 0x5a2a1a, isDark ? 0.5 : 1.0);
  arena.add(fill);

  return {
    colliders,
    floorY: valleyY,
    angles: playable,
    open,
    fogColor: isDark ? 0x2a1a24 : 0xe8a070,
  };
}
