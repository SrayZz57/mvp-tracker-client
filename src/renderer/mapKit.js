import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint, tex } from './aimArenaAscent.js';

// Outils communs aux cartes reproduites d'après une minimap officielle
// (aimMapAscentA.js, aimMapSunsetB.js) : les données de chaque carte sont en
// pixels de sa minimap (u vers l'est, v vers le sud), converties ici en mètres.
//
// Rendu : les pièces fixes d'un même matériau sont fusionnées en un seul objet,
// les textures sont plaquées en UV monde (`tile` = taille en mètres d'une
// répétition) et l'ombrage de contact est cuit dans les couleurs de sommets.
// Collisions : une simple liste de pavés (Box3), lue par mapWalker.js.

export const inRect = (u, v, [u0, v0, u1, v1]) => u >= u0 && u < u1 && v >= v0 && v < v1;

// Rectangle privé de trous (rectangles), découpé en rectangles.
export function subtract(rect, holes) {
  const us = new Set([rect[0], rect[2]]);
  const vs = new Set([rect[1], rect[3]]);
  holes.forEach((h) => {
    [h[0], h[2]].forEach((u) => u > rect[0] && u < rect[2] && us.add(u));
    [h[1], h[3]].forEach((v) => v > rect[1] && v < rect[3] && vs.add(v));
  });
  const U = [...us].sort((a, b) => a - b);
  const V = [...vs].sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j < V.length - 1; j += 1) {
    let run = null;
    for (let i = 0; i < U.length - 1; i += 1) {
      const cu = (U[i] + U[i + 1]) / 2;
      const cv = (V[j] + V[j + 1]) / 2;
      if (holes.some((h) => inRect(cu, cv, h))) {
        run = null;
      } else if (run) {
        run[2] = U[i + 1];
      } else {
        run = [U[i], V[j], U[i + 1], V[j + 1]];
        out.push(run);
      }
    }
  }
  return out;
}

// Barrière de fin de carte, à la manière des barrières de spawn.
function barrierCanvas() {
  return paint('ascA-barrier', 256, 256, (ctx, s) => {
    ctx.fillStyle = 'rgba(255,70,85,0.35)';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(255,120,130,0.55)';
    for (let k = -s; k < s; k += 64) {
      ctx.beginPath();
      ctx.moveTo(k, s);
      ctx.lineTo(k + 32, s);
      ctx.lineTo(k + 32 + s, 0);
      ctx.lineTo(k + s, 0);
      ctx.fill();
    }
  });
}

// `px` : mètres par pixel de minimap ; (u0, v0) : pixel placé à l'origine du monde.
export function createMapKit(root, { floorY = 0, isDark = false, px, u0: U0, v0: V0 }) {
  const Y = (h) => floorY + h;
  const X = (u) => (u - U0) * px;
  const Z = (v) => (v - V0) * px;
  const shade = isDark ? 0.45 : 1;
  const solids = [];

  // --- Matériaux ----------------------------------------------------------------
  const std = (params, tile = null) => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...params });
    if (m.color) m.color.multiplyScalar(shade);
    m.userData.tile = tile;
    return m;
  };
  // Relief léger seulement : le jeu a un rendu peint, pas de grain marqué.
  const withBump = (canvas, tile, extra = {}) =>
    std({ map: tex(canvas), bumpMap: tex(canvas, { srgb: false }), bumpScale: 0.6, roughness: 0.92, ...extra }, tile);
  const flat = (canvas, tile, extra = {}) => std({ map: tex(canvas), roughness: 0.92, ...extra }, tile);
  // Texture entière sur chaque face (caisses, générateur, portes).
  const face = (canvas, extra = {}) => std({ map: tex(canvas, { wrap: false }), roughness: 0.8, ...extra });
  const glowing = (canvas, glowCanvas, intensity, extra = {}) =>
    face(canvas, { emissive: 0xffffff, emissiveMap: tex(glowCanvas, { wrap: false }), emissiveIntensity: intensity, ...extra });
  const barrier = new THREE.MeshBasicMaterial({ map: tex(barrierCanvas()), transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false });
  barrier.userData.tile = 1.6;

  // --- Géométrie ------------------------------------------------------------------
  const buckets = new Map();
  const nrm = new THREE.Vector3();
  const push = (geometry, material, matrix, { ao = true, aoBase = 0, colorFn = null } = {}) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (matrix) g.applyMatrix4(matrix);
    g.clearGroups();
    Object.keys(g.attributes).forEach((a) => {
      if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    });
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2));
    const uv = g.attributes.uv;
    const tile = material.userData.tile;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i) - floorY;
      const z = pos.getZ(i);
      nrm.fromBufferAttribute(nor, i);
      if (tile) {
        const ax = Math.abs(nrm.x);
        const ay = Math.abs(nrm.y);
        const az = Math.abs(nrm.z);
        if (ay >= ax && ay >= az) uv.setXY(i, x / tile, z / tile);
        else if (ax >= az) uv.setXY(i, z / tile, y / tile);
        else uv.setXY(i, x / tile, y / tile);
      }
      let c = 1;
      if (colorFn) c = colorFn(x, y, z, nrm);
      else if (ao) {
        // Ombrage de contact cuit : pied des murs plus sombre, dessous sombre.
        const t = Math.min(1, Math.max(0, (y - aoBase) / 1.6));
        c = nrm.y < -0.5 ? 0.55 : nrm.y > 0.5 ? 1 : 0.62 + 0.38 * t * t * (3 - 2 * t);
      }
      const col = Array.isArray(c) ? c : [c, c, c];
      colors[i * 3] = col[0];
      colors[i * 3 + 1] = col[1];
      colors[i * 3 + 2] = col[2];
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!buckets.has(material)) buckets.set(material, []);
    buckets.get(material).push(g);
  };
  const mtx = (x, y, z, ry = 0, rx = 0, rz = 0) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));

  const addSolid = (x0, y0, z0, x1, y1, z1) => solids.push(new THREE.Box3(new THREE.Vector3(x0, Y(y0), z0), new THREE.Vector3(x1, Y(y1), z1)));

  // Pavé [u0, v0, u1, v1] entre les hauteurs y0 et y1. `inset` (m) le rétrécit
  // (négatif : le fait déborder, pour les soubassements et corniches).
  const block = ([u0, v0, u1, v1], y0, y1, material, { solid = true, ao = true, inset = 0, render = true } = {}) => {
    const x0 = X(u0) + inset;
    const x1 = X(u1) - inset;
    const z0 = Z(v0) + inset;
    const z1 = Z(v1) - inset;
    const w = x1 - x0;
    const h = y1 - y0;
    const d = z1 - z0;
    if (w <= 0.001 || h <= 0.001 || d <= 0.001) return;
    if (render) {
      const segs = h > 2 ? Math.min(14, Math.ceil(h / 0.9)) : 1;
      push(new THREE.BoxGeometry(w, h, d, 1, segs, 1), material, mtx((x0 + x1) / 2, Y(y0 + h / 2), (z0 + z1) / 2), { ao, aoBase: y0 });
    }
    if (solid) addSolid(x0, y0, z0, x1, y1, z1);
  };

  // Pavé à dessus incliné le long de `axis` ('u' ou 'v') : de hStart à hEnd.
  const slopeBlock = ([u0, v0, u1, v1], bottom, hStart, hEnd, axis, material, opts = {}) => {
    const x0 = X(u0);
    const x1 = X(u1);
    const z0 = Z(v0);
    const z1 = Z(v1);
    const g = new THREE.BoxGeometry(1, 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const tx = p.getX(i) + 0.5;
      const tz = p.getZ(i) + 0.5;
      const t = axis === 'u' ? tx : tz;
      const y = p.getY(i) > 0 ? hStart + (hEnd - hStart) * t : bottom;
      p.setXYZ(i, x0 + tx * (x1 - x0), Y(y), z0 + tz * (z1 - z0));
    }
    g.computeVertexNormals();
    push(g, material, null, { aoBase: bottom, ...opts });
  };
  // Collisions d'une pente : fines marches (le joueur monte les marches de moins
  // de 50 cm sans sauter, voir mapWalker.js), à mi-hauteur de chaque tranche.
  const slopeSolids = ([u0, v0, u1, v1], bottom, hStart, hEnd, axis, stepH = 0.1) => {
    const n = Math.max(1, Math.ceil(Math.abs(hEnd - hStart) / stepH));
    for (let k = 0; k < n; k += 1) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const h = hStart + (hEnd - hStart) * ((t0 + t1) / 2);
      const r = axis === 'u' ? [u0 + t0 * (u1 - u0), v0, u0 + t1 * (u1 - u0), v1] : [u0, v0 + t0 * (v1 - v0), u1, v0 + t1 * (v1 - v0)];
      block(r, bottom, h, null, { render: false });
    }
  };

  // Escalier droit le long de `axis` ('u' ou 'v') : de la hauteur hStart au
  // début du rectangle à hEnd à la fin, en `risers` contremarches. Chaque
  // marche est un pavé plein (rendu et collision) ; la plus haute affleure le
  // palier du haut.
  const stairs = ([u0, v0, u1, v1], bottom, hStart, hEnd, axis, risers, material) => {
    const low = Math.min(hStart, hEnd);
    const rise = Math.abs(hEnd - hStart);
    for (let k = 0; k < risers; k += 1) {
      const fromLow = hEnd > hStart ? k : risers - 1 - k;
      const h = low + (rise * (fromLow + 1)) / risers;
      const t0 = k / risers;
      const t1 = (k + 1) / risers;
      const r = axis === 'u' ? [u0 + t0 * (u1 - u0), v0, u0 + t1 * (u1 - u0), v1] : [u0, v0 + t0 * (v1 - v0), u1, v0 + t1 * (v1 - v0)];
      block(r, bottom, h, material);
    }
  };

  // Bâti : chaque case de `roi` qui n'est dans aucun rectangle de `open` devient
  // un immeuble, dont la hauteur et le matériau viennent de la dernière zone
  // de `zones` qui la contient. Les cases voisines de même zone sont réunies en
  // grands pavés. `dress(rect, zone)` ajoute soubassement, bandeaux, corniche.
  const fillBuildings = ({ roi, open: openRects, zones, dress }) => {
    const [RU0, RV0, RU1, RV1] = roi;
    const W = RU1 - RU0;
    const H = RV1 - RV0;
    const open = new Uint8Array(W * H);
    const mark = ([u0, v0, u1, v1], grid, value) => {
      for (let v = Math.max(Math.floor(v0), RV0); v < Math.min(Math.ceil(v1), RV1); v += 1) {
        for (let u = Math.max(Math.floor(u0), RU0); u < Math.min(Math.ceil(u1), RU1); u += 1) grid[(v - RV0) * W + (u - RU0)] = value;
      }
    };
    openRects.forEach((r) => mark(r, open, 1));
    const zoneOf = new Uint8Array(W * H);
    zones.forEach((zone, i) => mark(zone.r, zoneOf, i));
    const used = new Uint8Array(W * H);
    const free = (u, v, zone) => {
      const k = v * W + u;
      return !open[k] && !used[k] && zoneOf[k] === zone;
    };
    for (let v = 0; v < H; v += 1) {
      for (let u = 0; u < W; u += 1) {
        const k = v * W + u;
        if (open[k] || used[k]) continue;
        const zone = zoneOf[k];
        let w = 1;
        while (u + w < W && free(u + w, v, zone)) w += 1;
        let h = 1;
        grow: while (v + h < H) {
          for (let i = 0; i < w; i += 1) if (!free(u + i, v + h, zone)) break grow;
          h += 1;
        }
        for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) used[(v + j) * W + u + i] = 1;
        const r = [u + RU0, v + RV0, u + w + RU0, v + h + RV0];
        const z = zones[zone];
        block(r, -0.5, z.h, z.material);
        dress?.(r, z);
      }
    }
  };

  // Fusion finale : un objet par matériau, avec ombres portées (sauf barrières).
  const finish = () => {
    buckets.forEach((list, material) => {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) return;
      const mesh = new THREE.Mesh(merged, material);
      if (material === barrier) mesh.renderOrder = 5;
      else {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      root.add(mesh);
    });
    buckets.clear();
  };

  return {
    X,
    Y,
    Z,
    solids,
    mat: { std, withBump, flat, face, glowing, barrier },
    push,
    mtx,
    addSolid,
    block,
    slopeBlock,
    slopeSolids,
    stairs,
    fillBuildings,
    finish,
  };
}

// Éclairage commun : soleil avec ombres portées sur toute la carte, ciel et
// rebond du sol en lumière hémisphérique, léger contre-jour.
export function lightMap(scene, renderer, info, { isDark = false, sunDir, sunColor, sunIntensity, sky, ground, hemi = 1.15, ambient = 0.28, fillColor = 0xc6ccff, fill = 0.5 }) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.add(new THREE.HemisphereLight(isDark ? 0x5a5f80 : sky, isDark ? 0x2a2622 : ground, isDark ? 0.45 : hemi));
  scene.add(new THREE.AmbientLight(0xffffff, isDark ? 0.12 : ambient));
  const { minX, maxX, minZ, maxZ } = info.bounds;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const sun = new THREE.DirectionalLight(sunColor, isDark ? 0.45 : sunIntensity);
  const dir = new THREE.Vector3(...sunDir).normalize();
  sun.position.set(cx + dir.x * 90, info.floorY + dir.y * 90, cz + dir.z * 90);
  sun.target.position.set(cx, info.floorY, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const half = Math.hypot(maxX - minX, maxZ - minZ) / 2 + 4;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 220 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const back = new THREE.DirectionalLight(fillColor, isDark ? 0.2 : fill);
  back.position.set(cx - dir.x * 30, info.floorY + 25, cz - dir.z * 30);
  scene.add(back);
  return { sun };
}
