import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  seeded,
  drawnTexture,
  tiledTexture,
  speckle,
  animateEmissive,
  particleSystem,
  softDotTexture,
  roundedShape,
  extrude,
  springStep,
} from './weaponKit.js';

// Skins légendaires du sniper. Même principe que les skins de la Vandal : une
// « livrée » peinte d'un seul tenant sur toutes les faces planes (UV en mm dans
// le repère de l'arme), des matériaux animés dans le shader, et surtout des
// volumes ajoutés ou remplacés qui changent la silhouette de l'arme.
//
// `geo` (fourni par sniperModel.js) : contours des pièces, fentes du garde-main,
// hauteurs du canon et de la lunette, uniformes partagés (temps, sursaut de tir).

export const S_LIVERY = { minX: -20, maxX: 1200, minY: -130, maxY: 110 };
const WIDTH = S_LIVERY.maxX - S_LIVERY.minX;
const HEIGHT = S_LIVERY.maxY - S_LIVERY.minY;

export function livery(key, draw, { background = '#ffffff', color = false } = {}) {
  return drawnTexture(key, S_LIVERY, 2.5, draw, { background, color });
}

export function tracePolygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

export function strokeLine(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
}

export function blobs(ctx, rand, count, tones, alpha, minR, maxR) {
  for (let i = 0; i < count; i += 1) {
    const x = S_LIVERY.minX + rand() * WIDTH;
    const y = S_LIVERY.minY + rand() * HEIGHT;
    const r = minR + rand() * (maxR - minR);
    const tone = tones[Math.floor(rand() * tones.length)];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${tone},${alpha})`);
    g.addColorStop(1, `rgba(${tone},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// Réseau de fissures ramifiées (réutilisé pour la glace, le néant, la foudre).
export function branches(seed, { roots = 10, steps = 30, stepLen = 5, jitter = 0.8, branchChance = 0.1, width = 2, angular = false }) {
  const rand = seeded(seed);
  const lines = [];
  const grow = (x0, y0, angle, n, w, depth) => {
    let x = x0;
    let y = y0;
    let a = angle;
    const pts = [[x, y]];
    for (let i = 0; i < n; i += 1) {
      a += angular ? (rand() < 0.35 ? (rand() - 0.5) * 2 * jitter : 0) : (rand() - 0.5) * jitter;
      x += Math.cos(a) * stepLen * (0.6 + rand() * 0.8);
      y += Math.sin(a) * stepLen * (0.6 + rand() * 0.8);
      pts.push([x, y]);
      if (depth < 3 && rand() < branchChance) grow(x, y, a + (rand() < 0.5 ? 1 : -1) * (0.5 + rand() * 0.8), Math.floor(n * 0.5), w * 0.6, depth + 1);
    }
    lines.push({ pts, width: w });
  };
  for (let i = 0; i < roots; i += 1) {
    grow(S_LIVERY.minX + rand() * WIDTH, S_LIVERY.minY + rand() * HEIGHT, rand() * Math.PI * 2, steps, width * (0.6 + rand() * 0.8), 0);
  }
  return lines;
}

export function allOutlines(geo) {
  return [geo.shapes.stock, geo.shapes.stockHole, geo.shapes.grip, geo.shapes.forend, geo.shapes.chassis];
}

export function ringTexture(key, color) {
  return tiledTexture(`s-ring-${key}`, 256, (ctx, size) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, color);
    g.addColorStop(0.72, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }, { color: true });
}

// Place un objet dans le repère de l'arme et renvoie un point monde à jour.
function anchorAt(body, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  body.add(o);
  return o;
}

// Oriente un objet (dont l'axe « long » est +Y) selon une direction.
export function pointAlong(object, dir) {
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
}

// =============================================================================
// GLACIER — glace vive. L'arme est prise dans un givre bleuté aux facettes
// cristallines qui scintillent (reflets ponctuels animés dans le shader). Des
// grappes de cristaux translucides (réfraction réelle) poussent sur la crosse,
// le long du canon et en couronne autour de l'objectif ; le frein de bouche est
// remplacé par une gerbe de pics de glace ; des stalactites pendent sous le
// garde-main ; la neige tombe en permanence autour de l'arme. Au tir : onde de
// givre, éclats de glace, les cristaux s'illuminent.
// =============================================================================

function crystalGeometry(radius, height) {
  const body = new THREE.CylinderGeometry(radius, radius * 0.85, height, 6);
  body.translate(0, height / 2, 0);
  const tip = new THREE.ConeGeometry(radius, height * 0.5, 6);
  tip.translate(0, height + height * 0.25, 0);
  return [body, tip];
}

function glacierFinish(env, geo) {
  const cracks = branches(301, { roots: 16, steps: 26, stepLen: 6, jitter: 0.9, width: 1.6 });
  const frost = branches(302, { roots: 60, steps: 10, stepLen: 3, jitter: 1.4, branchChance: 0.35, width: 0.8 });
  const color = livery('glacier-color', (ctx) => {
    const rand = seeded(303);
    blobs(ctx, rand, 60, ['127,184,216', '169,216,238', '220,244,255', '90,150,200'], 0.55, 20, 90);
    // Facettes cristallines.
    for (let i = 0; i < 900; i += 1) {
      const x = S_LIVERY.minX + rand() * WIDTH;
      const y = S_LIVERY.minY + rand() * HEIGHT;
      const r = 3 + rand() * 12;
      ctx.beginPath();
      for (let k = 0; k < 5; k += 1) {
        const a = (k / 5) * Math.PI * 2 + rand();
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(80,140,190,0.1)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 0.3;
      ctx.stroke();
    }
    ctx.lineCap = 'round';
    frost.forEach(({ pts, width }) => {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = width * 0.7;
      strokeLine(ctx, pts);
    });
    cracks.forEach(({ pts, width }) => {
      ctx.strokeStyle = 'rgba(30,95,140,0.85)';
      ctx.lineWidth = width;
      strokeLine(ctx, pts);
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.6;
    allOutlines(geo).forEach((o) => {
      tracePolygon(ctx, o);
      ctx.stroke();
    });
  }, { background: '#c6e6f4', color: true });
  const glow = livery('glacier-glow', (ctx) => {
    ctx.lineCap = 'round';
    cracks.forEach(({ pts, width }) => {
      ctx.shadowColor = 'rgba(80,220,255,0.9)';
      ctx.shadowBlur = 6;
      ctx.strokeStyle = 'rgba(120,230,255,0.9)';
      ctx.lineWidth = width * 0.7;
      strokeLine(ctx, pts);
    });
    ctx.shadowBlur = 0;
    frost.forEach(({ pts, width }) => {
      ctx.strokeStyle = 'rgba(200,245,255,0.35)';
      ctx.lineWidth = width * 0.5;
      strokeLine(ctx, pts);
    });
  }, { background: '#000000', color: true });
  const bump = livery('glacier-bump', (ctx) => {
    ctx.lineCap = 'round';
    frost.forEach(({ pts, width }) => {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = width;
      strokeLine(ctx, pts);
    });
    cracks.forEach(({ pts, width }) => {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = width;
      strokeLine(ctx, pts);
    });
  }, { background: '#909090' });

  // Scintillement : reflets ponctuels qui s'allument et s'éteignent sur la glace.
  const sparkle = `
    float glint = pow(max(0.0, sin(vEmissiveMapUv.x * 520.0 + uTime * 0.7) * sin(vEmissiveMapUv.y * 330.0 - uTime * 0.5)), 60.0);
    totalEmissiveRadiance = totalEmissiveRadiance * (0.7 + 0.3 * sin(uTime * 1.3 + vEmissiveMapUv.x * 12.0) + uFlare * 1.6) + vec3(glint) * 1.2;
  `;
  const ice = animateEmissive(
    new THREE.MeshPhysicalMaterial({
      envMap: env,
      envMapIntensity: 1.1,
      map: color,
      emissive: 0xffffff,
      emissiveMap: glow,
      emissiveIntensity: 1,
      metalness: 0,
      roughness: 0.14,
      bumpMap: bump,
      bumpScale: 0.8,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      sheen: 0.4,
      sheenColor: new THREE.Color(0x9fe8ff),
    }),
    geo.uniforms,
    sparkle,
  );
  const iceWall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xb6def0, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 });
  const frostMetal = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.1, color: 0xa9cfe6, metalness: 0.85, roughness: 0.22 });
  const pair = [ice, iceWall];
  return {
    stock: pair,
    buttPad: [iceWall, iceWall],
    grip: pair,
    chassis: pair,
    forend: pair,
    muzzle: pair,
    receiver: frostMetal,
    barrel: new THREE.MeshStandardMaterial({ envMap: env, color: 0x2a4a66, metalness: 0.9, roughness: 0.2 }),
    scope: frostMetal,
    lens: new THREE.MeshBasicMaterial({ color: 0x9ff3ff }),
    metal: new THREE.MeshStandardMaterial({ envMap: env, color: 0xdff4ff, metalness: 0.9, roughness: 0.18 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b1c2a, roughness: 0.6 }),
    brass: frostMetal,
    flash: 'frost',
    light: 0x9fe8ff,
    smoke: 0xe6f8ff,
    makeShell: () => {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.009, 0), new THREE.MeshPhysicalMaterial({ color: 0xcff6ff, roughness: 0.05, transmission: 0.8, thickness: 0.01, emissive: 0x3ab8e6, emissiveIntensity: 0.4 }));
      shard.scale.set(0.6, 1.6, 0.6);
      return shard;
    },
    decorate: (ctx) => decorateGlacier({ ...ctx, env }),
  };
}

function decorateGlacier({ body, add, scene, parts, geo, env }) {
  const crystalMat = new THREE.MeshPhysicalMaterial({
    envMap: env,
    envMapIntensity: 1.6,
    color: 0xd4f6ff,
    roughness: 0.03,
    metalness: 0,
    transmission: 0.85,
    thickness: 8,
    ior: 1.31,
    clearcoat: 1,
    emissive: 0x3ab8e6,
    emissiveIntensity: 0.15,
    flatShading: true,
  });
  const rand = seeded(311);
  const crystal = (x, y, z, dir, radius, height) => {
    const group = new THREE.Group();
    crystalGeometry(radius, height).forEach((g) => group.add(new THREE.Mesh(g, crystalMat)));
    group.position.set(x, y, z);
    pointAlong(group, dir);
    group.rotateY(rand() * Math.PI);
    body.add(group);
    return group;
  };
  const cluster = (x, y, z, dir, count, scale) => {
    for (let i = 0; i < count; i += 1) {
      const d = dir.clone().add(new THREE.Vector3((rand() - 0.5) * 0.9, (rand() - 0.5) * 0.9, (rand() - 0.5) * 0.9)).normalize();
      crystal(x + (rand() - 0.5) * 12, y + (rand() - 0.5) * 8, z + (rand() - 0.5) * 16, d, (3 + rand() * 4) * scale, (16 + rand() * 26) * scale);
    }
  };

  cluster(10, 30, 0, new THREE.Vector3(-0.5, 1, 0), 7, 1.4);
  cluster(26, -78, 0, new THREE.Vector3(-0.4, -1, 0), 5, 1.1);
  cluster(236, 26, 0, new THREE.Vector3(0.2, 1, 0), 3, 0.8);
  for (let x = 700; x <= 1060; x += 60) cluster(x, geo.boreY + 12, 0, new THREE.Vector3(0.5, 1, 0), 2, 0.6);
  // Couronne de cristaux autour de l'objectif.
  for (let k = 0; k < 9; k += 1) {
    const a = (k / 9) * Math.PI * 2;
    const dir = new THREE.Vector3(0.7, Math.sin(a), Math.cos(a));
    crystal(744, geo.scopeY + Math.sin(a) * 27, Math.cos(a) * 27, dir, 3.2, 18 + (k % 3) * 6);
  }
  // Pics de glace à la place du frein de bouche.
  parts.muzzle.visible = false;
  const tip = add(new THREE.DodecahedronGeometry(20, 0), crystalMat, 1112, geo.boreY, 0);
  tip.scale.set(1.8, 1, 1);
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2;
    crystal(1120, geo.boreY + Math.sin(a) * 10, Math.cos(a) * 10, new THREE.Vector3(1.4, Math.sin(a), Math.cos(a)), 4.5, 30 + (k % 2) * 16);
  }
  crystal(1140, geo.boreY, 0, new THREE.Vector3(1, 0, 0), 6, 44);
  // Stalactites sous le garde-main.
  for (let x = 660; x <= 920; x += 22) {
    const len = 10 + rand() * 22;
    const icicle = add(new THREE.ConeGeometry(2.4 + rand() * 1.5, len, 6), crystalMat, x, -30 - len / 2, (rand() - 0.5) * 30);
    icicle.rotation.z = Math.PI;
  }

  const snowTex = softDotTexture('snow', 'rgba(255,255,255,1)', 'rgba(220,245,255,0)');
  const snow = particleSystem(scene, snowTex, { max: 220 });
  const burst = particleSystem(scene, snowTex, { max: 80 });
  const rings = particleSystem(scene, ringTexture('frost', 'rgba(140,230,255,0.9)'), { max: 8 });
  const emitter = anchorAt(body, 0, 0, 0);
  const mouth = anchorAt(body, 1190, geo.boreY, 0);
  const tmp = new THREE.Vector3();
  let clock = 0;
  return {
    muzzleX: 1190,
    update: (dt, time, flare) => {
      crystalMat.emissiveIntensity = 0.15 + 0.06 * Math.sin(time * 2) + flare * 1.4;
      clock += dt;
      while (clock > 0.035) {
        clock -= 0.035;
        emitter.position.set(Math.random() * 1200, 110 + Math.random() * 40, (Math.random() - 0.5) * 160);
        emitter.getWorldPosition(tmp);
        snow.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.02, -0.04 - Math.random() * 0.03, (Math.random() - 0.5) * 0.02), {
          life: 2600,
          size: 0.0018 + Math.random() * 0.0025,
          drag: 0,
        });
      }
      snow.update(dt);
      burst.update(dt);
      rings.update(dt);
    },
    onFire: () => {
      mouth.getWorldPosition(tmp);
      rings.spawn(tmp, new THREE.Vector3(), { life: 380, size: 0.03, grow: 6, drag: 0 });
      for (let i = 0; i < 18; i += 1) {
        burst.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.3) * 1.6, (Math.random() - 0.5) * 2), {
          life: 500,
          size: 0.003 + Math.random() * 0.003,
          drag: 2.5,
          gravity: -2,
          tint: 0xbff4ff,
        });
      }
    },
  };
}

// =============================================================================
// NÉANT — l'arme se désagrège dans le vide. Verre noir miroir fendu de failles
// violettes qui pulsent, éclats de l'arme détachés qui flottent autour d'elle
// (projetés vers l'extérieur à chaque tir), garde-main qui laisse voir la
// lumière du vide à travers ses fentes, et un trou noir à la bouche : sphère
// d'ombre, anneau de photons, disque d'accrétion qui tourne et matière qui
// spirale vers la singularité.
// =============================================================================

function accretionTexture() {
  return tiledTexture('void-disk', 512, (ctx, size) => {
    const c = size / 2;
    const g = ctx.createRadialGradient(c, c, size * 0.14, c, c, c);
    g.addColorStop(0, 'rgba(255,240,255,1)');
    g.addColorStop(0.25, 'rgba(230,120,255,0.95)');
    g.addColorStop(0.6, 'rgba(120,40,220,0.5)');
    g.addColorStop(1, 'rgba(40,0,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // Bras spiraux plus sombres : donnent la sensation de rotation.
    ctx.globalCompositeOperation = 'destination-out';
    for (let arm = 0; arm < 5; arm += 1) {
      ctx.beginPath();
      for (let k = 0; k <= 60; k += 1) {
        const t = k / 60;
        const a = arm * ((Math.PI * 2) / 5) + t * 4;
        const r = size * 0.14 + t * size * 0.36;
        ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      ctx.lineWidth = 10;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }, { color: true });
}

function voidFinish(env, geo) {
  const rifts = branches(401, { roots: 14, steps: 22, stepLen: 9, jitter: 0.9, branchChance: 0.12, width: 2.2, angular: true });
  const color = livery('void-color', (ctx) => {
    const rand = seeded(402);
    blobs(ctx, rand, 40, ['80,20,140', '140,30,160', '30,10,80'], 0.35, 30, 110);
    speckle(ctx, S_LIVERY, 2500, ['rgba(255,255,255,0.8)', 'rgba(210,170,255,0.7)'], 0.5, seeded(403));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'miter';
    rifts.forEach(({ pts, width }) => {
      ctx.strokeStyle = '#5a1a8a';
      ctx.lineWidth = width * 2.2;
      strokeLine(ctx, pts);
      ctx.strokeStyle = '#f0c8ff';
      ctx.lineWidth = width * 0.5;
      strokeLine(ctx, pts);
    });
  }, { background: '#06050b', color: true });
  const glow = livery('void-glow', (ctx) => {
    ctx.lineCap = 'round';
    rifts.forEach(({ pts, width }) => {
      ctx.shadowColor = 'rgba(200,80,255,1)';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = 'rgba(190,80,255,0.95)';
      ctx.lineWidth = width * 1.5;
      strokeLine(ctx, pts);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,220,255,1)';
      ctx.lineWidth = width * 0.4;
      strokeLine(ctx, pts);
    });
    speckle(ctx, S_LIVERY, 1200, ['rgba(255,255,255,0.9)'], 0.45, seeded(403));
  }, { background: '#000000', color: true });
  const pulse = `
    float wave = pow(0.5 + 0.5 * sin(vEmissiveMapUv.x * 30.0 - uTime * 2.1 + vEmissiveMapUv.y * 14.0), 3.0);
    totalEmissiveRadiance *= 0.35 + wave * 1.6 + uFlare * 2.2;
  `;
  const glass = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1.3, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 }),
    geo.uniforms,
    pulse,
  );
  const glassWall = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1.3, color: 0x07060d, metalness: 0.3, roughness: 0.05, clearcoat: 1 });
  const chrome = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.4, color: 0x1a1726, metalness: 1, roughness: 0.12, emissive: 0x2a0a4a, emissiveIntensity: 0.4 });
  const pair = [glass, glassWall];
  return {
    stock: pair,
    buttPad: [glassWall, glassWall],
    grip: pair,
    chassis: pair,
    forend: pair,
    muzzle: pair,
    receiver: chrome,
    barrel: chrome,
    scope: chrome,
    lens: new THREE.MeshBasicMaterial({ color: 0xc070ff }),
    metal: chrome,
    dark: new THREE.MeshStandardMaterial({ color: 0x030206, roughness: 0.4 }),
    brass: chrome,
    flash: 'void',
    light: 0xb050ff,
    smoke: 0x6a3a9a,
    makeShell: () => {
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.009, 0.009), new THREE.MeshStandardMaterial({ color: 0x0a0612, emissive: 0x9a3aff, emissiveIntensity: 1.2, roughness: 0.2 }));
      return cube;
    },
    decorate: (ctx) => decorateVoid({ ...ctx, glass, glassWall, chrome }),
  };
}

function decorateVoid({ body, add, scene, parts, geo, glass, glassWall }) {
  const rand = seeded(411);
  // Éclats détachés qui flottent autour de l'arme.
  const shards = [];
  const shardSpots = [
    [60, 50, 30], [140, 52, -34], [30, -96, 26], [200, -84, -30], [260, 44, 34],
    [700, 36, -40], [780, 40, 42], [860, -46, -38], [940, 30, 40], [1010, -30, 34],
    [520, 112, 20], [600, 110, -24], [400, -60, 40], [1100, 52, -26],
  ];
  shardSpots.forEach(([x, y, z], i) => {
    const pts = [];
    const n = 5 + Math.floor(rand() * 3);
    const r = 8 + rand() * 14;
    for (let k = 0; k < n; k += 1) {
      const a = (k / n) * Math.PI * 2 + rand() * 0.6;
      pts.push([Math.cos(a) * r * (0.5 + rand() * 0.6), Math.sin(a) * r * (0.5 + rand() * 0.6), 0]);
    }
    const mesh = new THREE.Mesh(extrude(roundedShape(pts), 3, 0.6), [glass, glassWall]);
    const home = new THREE.Vector3(x, y, z);
    mesh.position.copy(home);
    mesh.rotation.set(rand() * 6, rand() * 6, rand() * 6);
    body.add(mesh);
    shards.push({ mesh, home, phase: i * 0.9, spin: new THREE.Vector3((rand() - 0.5) * 0.8, (rand() - 0.5) * 0.8, (rand() - 0.5) * 0.8) });
  });
  // Lumière du vide derrière les fentes du garde-main.
  const riftLight = new THREE.MeshBasicMaterial({ color: 0xb050ff, side: THREE.DoubleSide });
  add(new THREE.PlaneGeometry(270, 14), riftLight, 790, -5, 0);

  // Trou noir à la bouche.
  parts.muzzle.visible = false;
  const hole = new THREE.Group();
  hole.position.set(1150, geo.boreY, 0);
  body.add(hole);
  hole.add(new THREE.Mesh(new THREE.SphereGeometry(16, 32, 24), new THREE.MeshBasicMaterial({ color: 0x000000 })));
  const photon = new THREE.Mesh(new THREE.TorusGeometry(18, 1.3, 10, 64), new THREE.MeshBasicMaterial({ color: 0xf2d8ff }));
  hole.add(photon);
  const diskMat = new THREE.MeshBasicMaterial({ map: accretionTexture(), transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const disks = [0, 1].map((i) => {
    const disk = new THREE.Mesh(new THREE.RingGeometry(18, 62, 96, 1), diskMat);
    disk.rotation.x = Math.PI / 2 - 0.35 + i * 0.12;
    hole.add(disk);
    return disk;
  });
  const lensTex = ringTexture('void-lens', 'rgba(190,110,255,0.6)');
  const lensing = new THREE.Sprite(new THREE.SpriteMaterial({ map: lensTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  lensing.scale.set(110, 110, 1);
  hole.add(lensing);
  // Matière qui spirale vers la singularité.
  const dot = softDotTexture('void-dot', 'rgba(255,230,255,1)', 'rgba(160,60,255,0)');
  const matter = Array.from({ length: 70 }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: Math.random() < 0.5 ? 0xe0a0ff : 0xffffff }));
    hole.add(sprite);
    return { sprite, angle: Math.random() * Math.PI * 2, radius: 20 + Math.random() * 60, height: (Math.random() - 0.5) * 10 };
  });
  const rings = particleSystem(scene, ringTexture('void-shock', 'rgba(190,90,255,0.9)'), { max: 8 });
  const mouth = anchorAt(body, 1175, geo.boreY, 0);
  const tmp = new THREE.Vector3();
  const push = { x: 0, v: 0 };
  return {
    muzzleX: 1175,
    update: (dt, time, flare) => {
      springStep(push, 0, 25, dt);
      shards.forEach((s) => {
        const out = s.home.clone().sub(new THREE.Vector3(s.home.x, 16, 0)).normalize();
        s.mesh.position.copy(s.home).addScaledVector(out, Math.sin(time * 0.9 + s.phase) * 4 + push.x * 26);
        s.mesh.position.x += Math.sin(time * 0.6 + s.phase) * 3;
        s.mesh.rotation.x += s.spin.x * dt;
        s.mesh.rotation.y += s.spin.y * dt;
      });
      riftLight.color.setHSL(0.78, 1, 0.45 + 0.1 * Math.sin(time * 3) + flare * 0.3);
      disks[0].rotation.z += dt * 1.6;
      disks[1].rotation.z -= dt * 1.1;
      photon.scale.setScalar(1 + flare * 0.25);
      lensing.material.opacity = 0.55 + 0.2 * Math.sin(time * 2) + flare * 0.5;
      matter.forEach((m) => {
        m.angle += (dt * 90) / m.radius;
        m.radius -= dt * (10 + 300 / m.radius);
        if (m.radius < 17) {
          m.radius = 50 + Math.random() * 30;
          m.height = (Math.random() - 0.5) * 10;
        }
        const tilt = Math.PI / 2 - 0.35;
        const px = Math.cos(m.angle) * m.radius;
        const py = Math.sin(m.angle) * m.radius;
        m.sprite.position.set(px, py * Math.cos(tilt) + m.height, py * Math.sin(tilt));
        m.sprite.scale.setScalar(3 + (60 - m.radius) * 0.05);
      });
      rings.update(dt);
    },
    onFire: () => {
      push.v += 5;
      matter.forEach((m) => {
        m.radius += 25 + Math.random() * 20;
      });
      mouth.getWorldPosition(tmp);
      rings.spawn(tmp, new THREE.Vector3(), { life: 420, size: 0.04, grow: 5, drag: 0 });
    },
  };
}

// =============================================================================
// PHÉNIX — l'oiseau de feu. Laque pourpre dont la teinte vire à l'orange ardent
// vers la bouche, gravée de plumes d'or qui scintillent comme des braises. Deux
// ailes de plumes (or et flamme) sont repliées le long de la crosse et se
// déploient d'un coup à chaque tir ; deux ailerons font de même sur la lunette ;
// trois longues plumes de queue flottent derrière la crosse. La bouche devient un
// bec d'or surmonté d'une crête, et des flammèches montent en permanence.
// =============================================================================

function featherShape(length, width) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(length * 0.45, width, length, 0);
  s.quadraticCurveTo(length * 0.5, -width * 0.55, 0, 0);
  return s;
}

function drawFeather(ctx, x, y, angle, length, width) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(length * 0.45, width, length, 0);
  ctx.quadraticCurveTo(length * 0.5, -width * 0.55, 0, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(length, 0);
  ctx.stroke();
  for (let k = 1; k < 8; k += 1) {
    const t = k / 8;
    ctx.beginPath();
    ctx.moveTo(length * t, 0);
    ctx.lineTo(length * t + length * 0.08, width * 0.7 * Math.sin(t * Math.PI));
    ctx.stroke();
  }
  ctx.restore();
}

function phoenixFinish(env, geo) {
  const feathers = [];
  const rand = seeded(501);
  for (let i = 0; i < 90; i += 1) {
    feathers.push([S_LIVERY.minX + rand() * WIDTH, -60 + rand() * 140, -0.4 + rand() * 0.5, 22 + rand() * 26, 5 + rand() * 4]);
  }
  const paintBase = (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 1200, 0);
    g.addColorStop(0, '#4a080e');
    g.addColorStop(0.45, '#7a1016');
    g.addColorStop(0.75, '#b0261a');
    g.addColorStop(1, '#f07a1e');
    ctx.fillStyle = g;
    ctx.fillRect(S_LIVERY.minX, S_LIVERY.minY, WIDTH, HEIGHT);
  };
  const color = livery('phoenix-color', (ctx) => {
    paintBase(ctx);
    blobs(ctx, seeded(502), 30, ['255,140,40', '120,10,20'], 0.25, 30, 90);
    ctx.strokeStyle = 'rgba(232,180,80,0.9)';
    ctx.lineWidth = 0.6;
    feathers.forEach((f) => drawFeather(ctx, ...f));
    ctx.strokeStyle = '#e8b450';
    ctx.lineWidth = 2;
    allOutlines(geo).forEach((o) => {
      tracePolygon(ctx, o);
      ctx.stroke();
    });
  }, { color: true });
  const glow = livery('phoenix-glow', (ctx) => {
    const g = ctx.createLinearGradient(700, 0, 1200, 0);
    g.addColorStop(0, 'rgba(255,90,20,0)');
    g.addColorStop(1, 'rgba(255,140,40,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(700, S_LIVERY.minY, 500, HEIGHT);
    ctx.shadowColor = 'rgba(255,170,60,1)';
    ctx.shadowBlur = 5;
    ctx.strokeStyle = 'rgba(255,190,80,0.9)';
    ctx.lineWidth = 0.5;
    feathers.forEach((f) => drawFeather(ctx, ...f));
  }, { background: '#000000', color: true });
  const flicker = `
    float fl = 0.72 + 0.28 * sin(uTime * 9.0 + vEmissiveMapUv.x * 50.0) * sin(uTime * 6.3 + vEmissiveMapUv.y * 37.0);
    totalEmissiveRadiance *= fl + uFlare * 1.8;
  `;
  const lacquer = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.9, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.3, metalness: 0.1, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }),
    geo.uniforms,
    flicker,
  );
  const lacquerWall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x5a0a10, roughness: 0.2, clearcoat: 1 });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.3, color: 0xe0a93a, metalness: 1, roughness: 0.22 });
  const crimsonMetal = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.1, color: 0x7a1418, metalness: 0.75, roughness: 0.28 });
  const pair = [lacquer, lacquerWall];
  return {
    stock: pair,
    buttPad: [gold, gold],
    grip: pair,
    chassis: pair,
    forend: pair,
    muzzle: pair,
    receiver: gold,
    barrel: crimsonMetal,
    scope: crimsonMetal,
    lens: new THREE.MeshBasicMaterial({ color: 0xffa040 }),
    metal: gold,
    dark: new THREE.MeshStandardMaterial({ color: 0x1a0204, roughness: 0.7 }),
    brass: gold,
    flash: 'ember',
    light: 0xff7a2a,
    smoke: 0xffb070,
    makeShell: () => {
      const f = new THREE.Mesh(new THREE.ShapeGeometry(featherShape(0.03, 0.007)), new THREE.MeshBasicMaterial({ color: 0xffb040, side: THREE.DoubleSide }));
      return f;
    },
    decorate: (ctx) => decoratePhoenix({ ...ctx, gold }),
  };
}

function decoratePhoenix({ body, add, scene, parts, geo, gold }) {
  const flameMats = [
    new THREE.MeshStandardMaterial({ color: 0xe0a93a, metalness: 1, roughness: 0.25, emissive: 0x6a3000, emissiveIntensity: 0.4 }),
    new THREE.MeshStandardMaterial({ color: 0xc8261a, metalness: 0.4, roughness: 0.35, emissive: 0xff5a14, emissiveIntensity: 0.6 }),
    new THREE.MeshStandardMaterial({ color: 0xff9a2a, metalness: 0.3, roughness: 0.35, emissive: 0xff8a1a, emissiveIntensity: 0.8 }),
  ];
  const makeWing = (x, y, side, count, baseLength, scale) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, side * 18);
    body.add(pivot);
    const plane = new THREE.Group();
    pivot.add(plane);
    const feathers = [];
    for (let i = 0; i < count; i += 1) {
      const length = (baseLength + i * 12) * scale;
      const feather = new THREE.Mesh(extrude(featherShape(length, 9 * scale), 1.6, 0.5), flameMats[i % 3]);
      plane.add(feather);
      feathers.push(feather);
    }
    return { pivot, plane, feathers, side };
  };
  const wings = [-1, 1].map((side) => makeWing(214, 18, side, 10, 72, 1.1));
  const fins = [-1, 1].map((side) => makeWing(690, geo.scopeY, side, 5, 40, 0.9));
  // Plumes de queue derrière la crosse.
  const tail = [0, 1, 2].map((i) => {
    const pivot = new THREE.Group();
    pivot.position.set(-6, -30 + i * 20, 0);
    body.add(pivot);
    const f = new THREE.Mesh(extrude(featherShape(120 + i * 20, 10), 1.6, 0.5), flameMats[(i + 1) % 3]);
    f.rotation.z = Math.PI + 0.25 - i * 0.22;
    pivot.add(f);
    return { pivot, phase: i };
  });

  // Bec d'or et crête à la bouche.
  parts.muzzle.visible = false;
  const beak = add(new THREE.ConeGeometry(18, 70, 4), gold, 1130, geo.boreY, 0);
  beak.rotation.z = -Math.PI / 2;
  beak.scale.set(1, 1, 0.7);
  const crest = [0, 1, 2].map((i) => {
    const f = new THREE.Mesh(extrude(featherShape(46 - i * 8, 7), 1.4, 0.4), flameMats[i]);
    f.position.set(1100 + i * 10, geo.boreY + 14, 0);
    f.rotation.z = 2.2 - i * 0.25;
    body.add(f);
    return f;
  });
  [-1, 1].forEach((side) => {
    add(new THREE.SphereGeometry(3.5, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffe08a }), 1110, geo.boreY + 6, side * 11);
  });

  const flameTex = softDotTexture('phoenix-flame', 'rgba(255,240,180,1)', 'rgba(255,80,10,0)');
  const flames = particleSystem(scene, flameTex, { max: 200 });
  const tips = [];
  wings.forEach((w) => tips.push(anchorAt(w.plane, 0, 0, 0)));
  const mouth = anchorAt(body, 1168, geo.boreY, 0);
  const tmp = new THREE.Vector3();
  const open = { x: 0.2, v: 0 };
  let clock = 0;

  const layout = (wing, spread, lift, time) => {
    wing.feathers.forEach((f, i) => {
      f.rotation.z = Math.PI * 0.62 + i * (0.05 + spread * 0.12) + Math.sin(time * 2 + i) * 0.02;
    });
    wing.plane.rotation.y = wing.side * (0.12 + spread * 0.75);
    wing.pivot.rotation.x = wing.side * lift;
  };

  return {
    muzzleX: 1168,
    update: (dt, time, flare) => {
      springStep(open, 0.38 + Math.sin(time * 1.4) * 0.06, 22, dt);
      const s = Math.max(0, open.x);
      wings.forEach((w) => layout(w, s, -0.35, time));
      fins.forEach((w) => layout(w, s * 0.8, 0, time));
      tail.forEach(({ pivot, phase }) => {
        pivot.rotation.z = Math.sin(time * 1.8 + phase) * 0.08;
        pivot.rotation.y = Math.sin(time * 1.3 + phase) * 0.12;
      });
      crest.forEach((f, i) => {
        f.rotation.x = Math.sin(time * 5 + i) * 0.08;
      });
      flameMats.forEach((m, i) => {
        m.emissiveIntensity = (0.4 + i * 0.2) * (0.85 + 0.15 * Math.sin(time * 8 + i)) + flare * 1.5;
      });
      clock += dt;
      while (clock > 0.03) {
        clock -= 0.03;
        const wing = wings[Math.floor(Math.random() * 2)];
        const f = wing.feathers[Math.floor(Math.random() * wing.feathers.length)];
        f.localToWorld(tmp.set(60 + Math.random() * 60, 0, 0));
        flames.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.02, 0.05 + Math.random() * 0.05, (Math.random() - 0.5) * 0.02), {
          life: 600 + Math.random() * 400,
          size: 0.004 + Math.random() * 0.004,
          grow: 0.5,
          drag: 0.5,
        });
      }
      flames.update(dt);
    },
    onFire: () => {
      open.v += 14;
      mouth.getWorldPosition(tmp);
      for (let i = 0; i < 20; i += 1) {
        flames.spawn(tmp, new THREE.Vector3((Math.random() - 0.3) * 1.6, (Math.random() - 0.3) * 1.2, (Math.random() - 0.5) * 1.6), {
          life: 450,
          size: 0.008 + Math.random() * 0.008,
          grow: 1,
          drag: 3,
        });
      }
    },
  };
}

// =============================================================================
// TEMPÊTE — l'orage enfermé dans l'acier. Blindage à plaques hexagonales parcouru
// de veines d'éclairs qui crépitent (scintillement irrégulier dans le shader),
// trois bobines Tesla en cuivre sur le garde-main reliées par de vrais arcs
// électriques recalculés en continu, anneaux-condensateurs qui s'allument en
// chenillard autour du canon, bouche en canon électromagnétique à deux rails
// entre lesquels l'arc ne cesse de claquer. Au tir : décharge géante vers
// l'avant, étincelles, tous les anneaux au maximum.
// =============================================================================

function hexGrid(ctx, cell, stroke, width) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  const h = cell * Math.sqrt(3);
  for (let y = S_LIVERY.minY; y < S_LIVERY.maxY + h; y += h / 2) {
    const row = Math.round((y - S_LIVERY.minY) / (h / 2));
    for (let x = S_LIVERY.minX + (row % 2 ? cell * 1.5 : 0); x < S_LIVERY.maxX + cell * 3; x += cell * 3) {
      ctx.beginPath();
      for (let k = 0; k <= 6; k += 1) {
        const a = (k / 6) * Math.PI * 2;
        ctx.lineTo(x + Math.cos(a) * cell, y + Math.sin(a) * cell);
      }
      ctx.stroke();
    }
  }
}

function stormFinish(env, geo) {
  const bolts = branches(601, { roots: 18, steps: 20, stepLen: 8, jitter: 1.2, branchChance: 0.2, width: 1.6, angular: true });
  const color = livery('storm-color', (ctx) => {
    blobs(ctx, seeded(602), 30, ['40,60,90', '10,16,26'], 0.5, 40, 120);
    hexGrid(ctx, 9, 'rgba(0,0,0,0.6)', 1.1);
    hexGrid(ctx, 9, 'rgba(140,170,210,0.12)', 0.4);
    ctx.lineCap = 'round';
    bolts.forEach(({ pts, width }) => {
      ctx.strokeStyle = 'rgba(120,200,255,0.8)';
      ctx.lineWidth = width;
      strokeLine(ctx, pts);
    });
  }, { background: '#1b2230', color: true });
  const glow = livery('storm-glow', (ctx) => {
    ctx.lineCap = 'round';
    bolts.forEach(({ pts, width }) => {
      ctx.shadowColor = 'rgba(90,200,255,1)';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = 'rgba(140,220,255,1)';
      ctx.lineWidth = width * 0.8;
      strokeLine(ctx, pts);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(240,252,255,1)';
      ctx.lineWidth = width * 0.3;
      strokeLine(ctx, pts);
    });
  }, { background: '#000000', color: true });
  const bump = livery('storm-bump', (ctx) => hexGrid(ctx, 9, '#000000', 1.2), { background: '#b0b0b0' });
  // Crépitement irrégulier : l'intensité change par à-coups, pas en douceur.
  const crackle = `
    float frame = floor(uTime * 16.0);
    float r = fract(sin(frame * 12.9898 + floor(vEmissiveMapUv.x * 9.0) * 78.233) * 43758.5453);
    totalEmissiveRadiance *= 0.25 + step(0.4, r) * (0.6 + r * 0.8) + uFlare * 2.6;
  `;
  const armor = animateEmissive(
    new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.6, metalness: 0.75, roughness: 0.34, bumpMap: bump, bumpScale: 1.2 }),
    geo.uniforms,
    crackle,
  );
  const armorWall = new THREE.MeshStandardMaterial({ envMap: env, color: 0x1b2230, metalness: 0.75, roughness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.2, color: 0x3a4250, metalness: 0.95, roughness: 0.2 });
  const pair = [armor, armorWall];
  return {
    stock: pair,
    buttPad: [armorWall, armorWall],
    grip: pair,
    chassis: pair,
    forend: pair,
    muzzle: pair,
    receiver: steel,
    barrel: steel,
    scope: new THREE.MeshStandardMaterial({ envMap: env, color: 0x1b2230, metalness: 0.8, roughness: 0.3 }),
    lens: new THREE.MeshBasicMaterial({ color: 0x7fe0ff }),
    metal: steel,
    dark: new THREE.MeshStandardMaterial({ color: 0x06090e, roughness: 0.7 }),
    brass: steel,
    flash: 'plasma',
    light: 0x7fd8ff,
    smoke: 0x9ab8d8,
    makeShell: () => {
      const cell = new THREE.Group();
      cell.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.04, 12), armorWall));
      cell.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.008, 12), new THREE.MeshBasicMaterial({ color: 0x9fe8ff })));
      return cell;
    },
    decorate: (ctx) => decorateStorm({ ...ctx, steel }),
  };
}

// Trajet d'éclair entre deux points : déplacement aléatoire du point milieu,
// récursif, pour une ligne brisée crédible.
function lightningPoints(a, b, depth, spread) {
  if (depth === 0) return [a, b];
  const mid = a.clone().lerp(b, 0.5);
  mid.add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread));
  const left = lightningPoints(a, mid, depth - 1, spread * 0.55);
  return [...left.slice(0, -1), ...lightningPoints(mid, b, depth - 1, spread * 0.55)];
}

function decorateStorm({ body, add, scene, parts, geo, steel }) {
  const copper = new THREE.MeshStandardMaterial({ color: 0xc8703a, metalness: 1, roughness: 0.3 });
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.35 });
  const plasma = new THREE.MeshBasicMaterial({ color: 0xbff0ff });
  const glowTex = softDotTexture('storm-glow', 'rgba(220,250,255,1)', 'rgba(60,160,255,0)');

  // Bobines Tesla sur le garde-main.
  const coilTops = [720, 810, 900].map((x) => {
    add(new THREE.CylinderGeometry(7, 9, 10, 16), ceramic, x, 17, 0);
    const pts = [];
    for (let k = 0; k <= 80; k += 1) {
      const a = k * 0.5;
      pts.push(new THREE.Vector3(Math.cos(a) * 6, 22 + k * 0.4, Math.sin(a) * 6));
    }
    const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 1.1, 6, false), copper);
    coil.position.x = x;
    body.add(coil);
    add(new THREE.CylinderGeometry(4.5, 4.5, 34, 12), ceramic, x, 38, 0);
    const torus = add(new THREE.TorusGeometry(9, 3.4, 12, 32), steel, x, 58, 0);
    torus.rotation.x = Math.PI / 2;
    add(new THREE.SphereGeometry(4.2, 16, 12), plasma, x, 60, 0);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(34, 34, 1);
    halo.position.set(x, 60, 0);
    body.add(halo);
    return { point: new THREE.Vector3(x, 60, 0), halo };
  });

  // Anneaux-condensateurs autour du canon, allumés en chenillard.
  const capMats = [];
  [980, 1010, 1040, 1070].forEach((x) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x3fb8ff });
    capMats.push(mat);
    const ring = add(new THREE.TorusGeometry(15, 2.6, 10, 32), mat, x, geo.boreY, 0);
    ring.rotation.y = Math.PI / 2;
    const collar = add(new THREE.TorusGeometry(15, 3.6, 10, 32), steel, x + 8, geo.boreY, 0);
    collar.rotation.y = Math.PI / 2;
  });

  // Paratonnerre sur la lunette.
  add(new THREE.CylinderGeometry(1.4, 1.8, 46, 8), steel, 400, geo.scopeY + 36, 0);
  add(new THREE.SphereGeometry(4, 14, 10), plasma, 400, geo.scopeY + 60, 0);

  // Bouche en canon à rails.
  parts.muzzle.visible = false;
  [-1, 1].forEach((side) => {
    add(new RoundedBoxGeometry(120, 8, 12, 2, 2), steel, 1140, geo.boreY + side * 16, 0);
    add(new RoundedBoxGeometry(110, 1.5, 10, 1, 0.5), plasma, 1142, geo.boreY + side * 11.5, 0);
  });
  add(new RoundedBoxGeometry(18, 44, 22, 3, 3), steel, 1086, geo.boreY, 0);

  // Arcs : tubes fins recalculés en continu.
  const arcMat = new THREE.MeshBasicMaterial({ color: 0xd8f6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const arcs = [];
  const makeArc = (from, to, spread) => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), arcMat);
    body.add(mesh);
    const arc = { mesh, from, to, spread, life: 0 };
    arcs.push(arc);
    return arc;
  };
  makeArc(coilTops[0].point, coilTops[1].point, 30);
  makeArc(coilTops[1].point, coilTops[2].point, 30);
  makeArc(coilTops[2].point, new THREE.Vector3(980, geo.boreY + 15, 0), 24);
  makeArc(new THREE.Vector3(1090, geo.boreY + 11, 0), new THREE.Vector3(1195, geo.boreY - 11, 0), 14);
  makeArc(new THREE.Vector3(400, geo.scopeY + 60, 0), new THREE.Vector3(470, geo.boreY + 30, 10), 22);
  const bigArc = makeArc(new THREE.Vector3(1195, geo.boreY, 0), new THREE.Vector3(1520, geo.boreY + 10, 0), 90);
  bigArc.mesh.visible = false;

  const rebuild = (arc) => {
    const pts = lightningPoints(arc.from.clone(), arc.to.clone(), 5, arc.spread);
    arc.mesh.geometry.dispose();
    arc.mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), pts.length * 2, arc === bigArc ? 1.8 : 0.9, 4, false);
  };

  const sparks = particleSystem(scene, glowTex, { max: 120 });
  const mouth = anchorAt(body, 1195, geo.boreY, 0);
  const tmp = new THREE.Vector3();
  let arcClock = 0;
  let bigUntil = 0;
  return {
    muzzleX: 1195,
    update: (dt, time, flare) => {
      arcClock += dt;
      if (arcClock > 0.055) {
        arcClock = 0;
        arcs.forEach((arc) => {
          if (arc === bigArc) return;
          // Tous les arcs ne claquent pas en même temps : plus vivant.
          arc.mesh.visible = Math.random() < 0.75 || flare > 0.3;
          if (arc.mesh.visible) rebuild(arc);
        });
        if (performance.now() < bigUntil) rebuild(bigArc);
      }
      bigArc.mesh.visible = performance.now() < bigUntil;
      arcMat.opacity = 0.75 + Math.random() * 0.25;
      capMats.forEach((m, i) => {
        const chase = 0.5 + 0.5 * Math.sin(time * 8 - i * 1.4);
        m.color.setRGB(0.15 + chase * 0.6 + flare, 0.55 + chase * 0.4 + flare, 1);
      });
      coilTops.forEach(({ halo }, i) => {
        halo.material.opacity = 0.5 + 0.4 * Math.abs(Math.sin(time * 11 + i * 2)) + flare * 0.5;
      });
      sparks.update(dt);
    },
    onFire: () => {
      bigUntil = performance.now() + 140;
      rebuild(bigArc);
      mouth.getWorldPosition(tmp);
      for (let i = 0; i < 24; i += 1) {
        sparks.spawn(tmp, new THREE.Vector3((Math.random() - 0.2) * 2.4, (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4), {
          life: 350,
          size: 0.003 + Math.random() * 0.002,
          drag: 4,
          gravity: -3,
          tint: 0xbff0ff,
        });
      }
    },
  };
}

// =============================================================================
// COURONNE — l'arme d'un monarque. Marbre blanc veiné de gris et d'or, panneaux
// d'émail bleu roi semés de fleurons, filets d'or où glisse un éclat de lumière
// (reflet animé dans le shader). Volutes baroques en or massif, pierres
// précieuses taillées (rubis, saphirs, diamant) qui réfractent la lumière, une
// couronne sur la lunette, deux glands de velours rouge qui se balancent sous la
// crosse, frein de bouche en couronne. Au tir : pluie de paillettes d'or.
// =============================================================================

function fleuron(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s);
  ctx.quadraticCurveTo(x + s * 0.5, y + s * 0.2, x, y - s * 0.6);
  ctx.quadraticCurveTo(x - s * 0.5, y + s * 0.2, x, y + s);
  ctx.moveTo(x, y + s * 0.2);
  ctx.quadraticCurveTo(x + s, y + s * 0.4, x + s * 0.9, y - s * 0.3);
  ctx.moveTo(x, y + s * 0.2);
  ctx.quadraticCurveTo(x - s, y + s * 0.4, x - s * 0.9, y - s * 0.3);
  ctx.moveTo(x - s * 0.6, y + s * 0.3);
  ctx.lineTo(x + s * 0.6, y + s * 0.3);
  ctx.stroke();
}

function crownFinish(env, geo) {
  const veins = branches(701, { roots: 40, steps: 18, stepLen: 7, jitter: 0.6, branchChance: 0.15, width: 1.2 });
  const panels = [
    [[676, 8], [900, 8], [912, -2], [900, -20], [676, -22]],
    [[56, 18], [214, 14], [196, -16], [60, -52]],
  ];
  const paintGold = (ctx, stroke, width) => {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    allOutlines(geo).forEach((o) => {
      tracePolygon(ctx, o);
      ctx.stroke();
    });
    ctx.lineWidth = width * 0.6;
    panels.forEach((p) => {
      tracePolygon(ctx, p);
      ctx.stroke();
    });
  };
  const color = livery('crown-color', (ctx) => {
    blobs(ctx, seeded(702), 50, ['200,200,205', '255,255,255', '225,220,210'], 0.5, 20, 80);
    ctx.lineCap = 'round';
    veins.forEach(({ pts, width }, i) => {
      ctx.strokeStyle = i % 7 === 0 ? 'rgba(200,160,70,0.8)' : 'rgba(110,110,120,0.45)';
      ctx.lineWidth = width;
      strokeLine(ctx, pts);
    });
    ctx.fillStyle = '#1b2f7a';
    panels.forEach((p) => {
      tracePolygon(ctx, p);
      ctx.fill();
    });
    ctx.strokeStyle = '#d6aa45';
    ctx.lineWidth = 0.7;
    for (let x = 694; x < 900; x += 26) fleuron(ctx, x, -7, 5);
    for (let i = 0; i < 4; i += 1) fleuron(ctx, 90 + i * 30, -2 - i * 6, 5);
    paintGold(ctx, '#d6aa45', 2.6);
  }, { background: '#efece6', color: true });
  const gleam = livery('crown-gleam', (ctx) => {
    paintGold(ctx, 'rgba(255,220,140,1)', 2.6);
    ctx.strokeStyle = 'rgba(255,220,140,1)';
    ctx.lineWidth = 0.7;
    for (let x = 694; x < 900; x += 26) fleuron(ctx, x, -7, 5);
  }, { background: '#000000', color: true });
  const rough = livery('crown-rough', (ctx) => paintGold(ctx, '#202020', 2.6), { background: '#3a3a3a' });
  // Éclat de lumière qui glisse le long des filets d'or.
  const sweep = `
    float band = pow(max(0.0, 1.0 - abs(fract(vEmissiveMapUv.x * 1.3 - uTime * 0.22) - 0.5) * 7.0), 3.0);
    totalEmissiveRadiance *= 0.1 + band * 2.4 + uFlare * 1.2;
  `;
  const marble = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1, map: color, emissive: 0xffffff, emissiveMap: gleam, emissiveIntensity: 1, metalness: 0, roughness: 1, roughnessMap: rough, clearcoat: 1, clearcoatRoughness: 0.04 }),
    geo.uniforms,
    sweep,
  );
  const marbleWall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xe6e2da, roughness: 0.2, clearcoat: 1 });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.4, color: 0xe2b24a, metalness: 1, roughness: 0.18 });
  const royal = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.1, color: 0x1b2f7a, metalness: 0.8, roughness: 0.25 });
  const pair = [marble, marbleWall];
  return {
    stock: pair,
    buttPad: [gold, gold],
    grip: pair,
    chassis: pair,
    forend: pair,
    muzzle: pair,
    receiver: gold,
    barrel: royal,
    scope: royal,
    lens: new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x3a0a14, metalness: 0.3, roughness: 0.02, clearcoat: 1, emissive: 0x6a0010, emissiveIntensity: 0.6 }),
    metal: gold,
    dark: new THREE.MeshStandardMaterial({ color: 0x0b0f22, roughness: 0.6 }),
    brass: gold,
    flash: 'gold',
    light: 0xffd27a,
    smoke: 0xfff4dc,
    decorate: (ctx) => decorateCrown({ ...ctx, gold, env }),
  };
}

function gemMaterial(env, color) {
  return new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 2.2, color, metalness: 0, roughness: 0.02, transmission: 0.9, thickness: 6, ior: 2.2, clearcoat: 1, flatShading: true });
}

function decorateCrown({ body, add, scene, parts, geo, gold, env }) {
  const ruby = gemMaterial(env, 0xff2a4a);
  const sapphire = gemMaterial(env, 0x3a6aff);
  const diamond = gemMaterial(env, 0xffffff);

  // Volutes baroques en or massif.
  const scroll = (cx, cy, z, size, turns, flip) => {
    const pts = [];
    for (let k = 0; k <= 50; k += 1) {
      const t = k / 50;
      const a = t * turns * Math.PI * 2;
      const r = size * (1 - t * 0.82);
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r * flip, cy + Math.sin(a) * r, z));
    }
    body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 1.6, 8, false), gold));
  };
  [-1, 1].forEach((side) => {
    const zs = side * 19.4;
    [[26, 12, 11, 2], [240, 6, 9, 1.8], [30, -64, 9, 1.8], [150, -44, 8, 1.6]].forEach(([x, y, s, t], i) => scroll(x, y, zs, s, t, i % 2 ? 1 : -1));
    [[660, -4, 9, 1.8], [925, -8, 8, 1.6], [300, -70, 7, 1.6]].forEach(([x, y, s, t], i) => scroll(x, y, side * 28.4, s, t, i % 2 ? -1 : 1));
    // Pierres serties : rubis sur la crosse, saphirs sur le garde-main.
    const stone = add(new THREE.DodecahedronGeometry(8, 0), ruby, 130, -14, side * 19);
    stone.scale.set(1.3, 1, 0.45);
    add(new THREE.TorusGeometry(9.5, 1.4, 8, 24), gold, 130, -14, side * 19).scale.set(1.3, 1, 1);
    [700, 780, 860].forEach((x) => {
      const s = add(new THREE.OctahedronGeometry(5, 0), sapphire, x, -7, side * 27.5);
      s.scale.set(1, 1, 0.5);
    });
  });

  // Couronne sur la lunette.
  const crown = new THREE.Group();
  crown.position.set(510, geo.scopeY + 38, 0);
  body.add(crown);
  crown.add(new THREE.Mesh(new THREE.CylinderGeometry(15, 13, 9, 32, 1, true), gold));
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(3.2, 16, 4), gold);
    spike.position.set(Math.cos(a) * 14, 12, Math.sin(a) * 14);
    crown.add(spike);
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 8), new THREE.MeshPhysicalMaterial({ color: 0xfaf6ee, roughness: 0.2, clearcoat: 1, iridescence: 0.6 }));
    pearl.position.set(Math.cos(a) * 14, 21, Math.sin(a) * 14);
    crown.add(pearl);
  }
  const crownGem = new THREE.Mesh(new THREE.OctahedronGeometry(7, 0), diamond);
  crownGem.position.y = 16;
  crown.add(crownGem);

  // Glands de velours sous la crosse.
  const velvet = new THREE.MeshStandardMaterial({ color: 0x8a0a1c, roughness: 0.9 });
  const tassels = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(160, -60, side * 20);
    body.add(pivot);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 40, 8), gold);
    cord.position.y = -20;
    pivot.add(cord);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(5, 14, 10), gold);
    knot.position.y = -42;
    pivot.add(knot);
    const tassel = new THREE.Mesh(new THREE.ConeGeometry(8, 30, 16, 1, true), velvet);
    tassel.position.y = -60;
    pivot.add(tassel);
    return { pivot, side };
  });

  // Frein de bouche en couronne.
  parts.muzzle.visible = false;
  const bell = add(new THREE.LatheGeometry([[12, 0], [14, 30], [18, 56], [22, 64], [20, 66], [15, 60], [11, 40]].map(([r, h]) => new THREE.Vector2(r, h)), 40), gold, 1100, geo.boreY, 0);
  bell.rotation.z = -Math.PI / 2;
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2;
    const spike = add(new THREE.ConeGeometry(3, 14, 4), gold, 1168, geo.boreY + Math.sin(a) * 20, Math.cos(a) * 20);
    spike.rotation.z = -Math.PI / 2;
  }
  const muzzleGem = add(new THREE.OctahedronGeometry(6, 0), ruby, 1136, geo.boreY + 25, 0);

  const glintTex = softDotTexture('crown-glint', 'rgba(255,250,230,1)', 'rgba(255,200,80,0)');
  const glints = particleSystem(scene, glintTex, { max: 60 });
  const confetti = particleSystem(scene, glintTex, { max: 120 });
  const rings = particleSystem(scene, ringTexture('crown', 'rgba(255,210,120,0.9)'), { max: 8 });
  const emitter = anchorAt(body, 0, 0, 0);
  const mouth = anchorAt(body, 1172, geo.boreY, 0);
  const tmp = new THREE.Vector3();
  const sway = { x: 0, v: 0 };
  let clock = 0;
  return {
    muzzleX: 1172,
    update: (dt, time) => {
      springStep(sway, 0, 6, dt);
      tassels.forEach(({ pivot, side }) => {
        pivot.rotation.x = side * (0.05 + Math.sin(time * 1.7) * 0.06);
        pivot.rotation.z = Math.sin(time * 1.3 + side) * 0.08 + sway.x * 0.35;
      });
      crownGem.rotation.y += dt * 0.9;
      muzzleGem.rotation.y += dt * 1.2;
      clock += dt;
      while (clock > 0.12) {
        clock -= 0.12;
        emitter.position.set(Math.random() * 1180, -60 + Math.random() * 160, (Math.random() - 0.5) * 50);
        emitter.getWorldPosition(tmp);
        glints.spawn(tmp, new THREE.Vector3(0, 0.004, 0), { life: 500, size: 0.004 + Math.random() * 0.004, drag: 0 });
      }
      glints.update(dt);
      confetti.update(dt);
      rings.update(dt);
    },
    onFire: () => {
      sway.v += 4;
      mouth.getWorldPosition(tmp);
      rings.spawn(tmp, new THREE.Vector3(), { life: 400, size: 0.035, grow: 5, drag: 0 });
      for (let i = 0; i < 30; i += 1) {
        confetti.spawn(tmp, new THREE.Vector3((Math.random() - 0.3) * 1.8, Math.random() * 1.6, (Math.random() - 0.5) * 1.8), {
          life: 900,
          size: 0.003 + Math.random() * 0.003,
          drag: 2,
          gravity: -2.2,
          tint: Math.random() < 0.7 ? 0xffd27a : 0xffffff,
        });
      }
    },
  };
}

export const SNIPER_SKIN_BUILDERS = {
  glacier: { labelKey: 'aimTrainer.skinGlacier', build: glacierFinish },
  void: { labelKey: 'aimTrainer.skinVoid', build: voidFinish },
  phoenix: { labelKey: 'aimTrainer.skinPhoenix', build: phoenixFinish },
  storm: { labelKey: 'aimTrainer.skinStorm', build: stormFinish },
  crown: { labelKey: 'aimTrainer.skinCrown', build: crownFinish },
};
