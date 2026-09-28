import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { seeded, drawnTexture, tiledTexture, speckle, animateEmissive, particleSystem, softDotTexture, springStep } from './weaponKit.js';
import { GRIP_OUTLINE, FRAME_OUTLINE, gripPoint, remapGrip } from './glockGeometry.js';

// Skins légendaires du Glock (même principe que ceux de la Vandal et du sniper) :
// une livrée d'un seul tenant sur les faces planes de la culasse et de la
// carcasse (UV en millimètres dans le repère du pistolet), des matériaux animés
// dans le shader, et des volumes ajoutés. Les pièces posées sur `slide` suivent
// le recul de la culasse.
//
// Repère du Glock : x vers la bouche, culasse de x = 0 à 186 (y de 0 à 30),
// poignée vers le bas jusqu'à y ≈ -104 (voir glockGeometry.js), axe du canon à y = 16.

export const G_LIVERY = { minX: -20, maxX: 200, minY: -140, maxY: 40 };
const GW = G_LIVERY.maxX - G_LIVERY.minX;
const GH = G_LIVERY.maxY - G_LIVERY.minY;
export const SLIDE = [[0, 0], [186, 0], [186, 29], [0, 29]];
export const GRIP = GRIP_OUTLINE;
export const FRAME = FRAME_OUTLINE;

export function livery(key, draw, { background = '#ffffff', color = false } = {}) {
  return drawnTexture(key, G_LIVERY, 6, draw, { background, color });
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

function branches(seed, { roots, steps, stepLen, jitter = 0.9, branchChance = 0.15, width = 1 }) {
  const rand = seeded(seed);
  const lines = [];
  const grow = (x0, y0, angle, n, w, depth) => {
    let x = x0;
    let y = y0;
    let a = angle;
    const pts = [[x, y]];
    for (let i = 0; i < n; i += 1) {
      a += (rand() - 0.5) * jitter;
      x += Math.cos(a) * stepLen;
      y += Math.sin(a) * stepLen;
      pts.push([x, y]);
      if (depth < 3 && rand() < branchChance) grow(x, y, a + (rand() < 0.5 ? 1 : -1) * (0.5 + rand() * 0.7), Math.floor(n * 0.5), w * 0.6, depth + 1);
    }
    lines.push({ pts, width: w });
  };
  for (let i = 0; i < roots; i += 1) grow(G_LIVERY.minX + rand() * GW, G_LIVERY.minY + rand() * GH, rand() * Math.PI * 2, steps, width * (0.6 + rand() * 0.8), 0);
  return lines;
}

export function ringTexture(key, color) {
  return tiledTexture(`g-ring-${key}`, 256, (ctx, size) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, color);
    g.addColorStop(0.72, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }, { color: true });
}

function anchorAt(parent, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

function taperedTube(curve, segments, radius, radialSegments, taper) {
  const geometry = new THREE.TubeGeometry(curve, segments, radius, radialSegments, false);
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i <= segments; i += 1) {
    curve.getPointAt(i / segments, c);
    const s = taper(i / segments);
    for (let j = 0; j <= radialSegments; j += 1) {
      const k = i * (radialSegments + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(s).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function pairOf(face, wall) {
  return { slide: face, slideWall: wall, frame: face, frameWall: wall };
}

// =============================================================================
// SYNTHWAVE — nuit rétro-futuriste. Culasse en laque noire à reflets
// holographiques irisés, grille en perspective et soleil couchant à bandes sur la
// carcasse et la poignée, tubes néon magenta et cyan le long de la culasse, viseur
// holographique rétro. Un glitch décale par à-coups la lumière de l'arme ; des
// pixels néon s'en échappent ; au tir, flash chromatique magenta/cyan.
// =============================================================================

function synthwaveFinish(env, { uniforms }) {
  const paint = (ctx, glow) => {
    if (!glow) {
      const holo = ctx.createLinearGradient(0, 0, 186, 30);
      ['#2a0a3a', '#6a1a8a', '#1a6a9a', '#3a0a5a', '#9a1a7a', '#1a3a8a'].forEach((c, i, arr) => holo.addColorStop(i / (arr.length - 1), c));
      ctx.fillStyle = holo;
      tracePolygon(ctx, SLIDE);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      for (let x = -20; x < 200; x += 7) ctx.fillRect(x, 0, 3.2, 30);
    }
    // Soleil couchant à bandes sur la poignée.
    ctx.save();
    tracePolygon(ctx, GRIP);
    ctx.clip();
    const sun = ctx.createLinearGradient(0, -44, 0, -96);
    sun.addColorStop(0, glow ? '#ffb040' : '#ffd060');
    sun.addColorStop(1, glow ? '#ff2a9a' : '#ff3aa0');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(22, -68, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = glow ? '#000000' : '#0a0612';
    for (let k = 0; k < 7; k += 1) ctx.fillRect(-20, -73 - k * 4.2, 100, 1 + k * 0.45);
    ctx.restore();
    // Grille en perspective sur la carcasse.
    ctx.save();
    tracePolygon(ctx, FRAME);
    ctx.clip();
    ctx.strokeStyle = glow ? 'rgba(255,60,200,1)' : '#ff3ac0';
    ctx.lineWidth = 0.5;
    for (let x = -60; x < 260; x += 12) strokeLine(ctx, [[80, 6], [x, -60]]);
    for (let y = -4; y > -40; y -= 3 + (-y) * 0.2) strokeLine(ctx, [[-20, y], [200, y]]);
    ctx.restore();
    // Liserés néon.
    ctx.strokeStyle = glow ? 'rgba(80,240,255,1)' : '#5ff7ff';
    ctx.lineWidth = 1.1;
    tracePolygon(ctx, SLIDE);
    ctx.stroke();
    ctx.strokeStyle = glow ? 'rgba(255,80,220,1)' : '#ff4fd8';
    tracePolygon(ctx, GRIP);
    ctx.stroke();
  };
  const color = livery('synth-color', (ctx) => paint(ctx, false), { background: '#08060e', color: true });
  const glow = livery('synth-glow', (ctx) => paint(ctx, true), { background: '#000000', color: true });
  // Glitch : de temps en temps, la lumière se décale en bandes horizontales.
  const glitch = `
    float frame = floor(uTime * 14.0);
    float on = step(0.93, fract(sin(frame * 91.7) * 43758.5453));
    vec2 uv2 = vEmissiveMapUv + vec2(on * 0.03 * sign(sin(vEmissiveMapUv.y * 180.0 + frame)), 0.0);
    totalEmissiveRadiance = texture2D(emissiveMap, uv2).rgb * emissive * (0.8 + 0.2 * sin(uTime * 5.0) + uFlare * 1.6);
  `;
  const lacquer = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1.1, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.3, metalness: 0.4, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.9, iridescenceIOR: 1.5 }),
    uniforms,
    glitch,
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x0c0814, metalness: 0.4, roughness: 0.1, clearcoat: 1, iridescence: 0.8 });
  const neonPink = new THREE.MeshBasicMaterial({ color: 0xff4fd8 });
  const neonCyan = new THREE.MeshBasicMaterial({ color: 0x5ff7ff });
  return {
    ...pairOf(lacquer, wall),
    barrel: new THREE.MeshStandardMaterial({ envMap: env, color: 0x2a1a3a, metalness: 1, roughness: 0.15 }),
    steel: neonCyan,
    sight: neonCyan,
    dot: neonPink,
    flash: 'void',
    light: 0xff4fd8,
    smoke: 0xffb0f0,
    makeShell: () => new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.006), Math.random() < 0.5 ? neonPink : neonCyan),
    decorate: ({ model, slide, add, scene }) => {
      // Tubes néon le long des arêtes de la culasse (suivent son recul).
      [-1, 1].forEach((side) => {
        add(new THREE.CylinderGeometry(0.9, 0.9, 150, 8), side > 0 ? neonPink : neonCyan, 95, 27, side * 12.8, slide).rotation.z = Math.PI / 2;
        add(new THREE.CylinderGeometry(0.9, 0.9, 150, 8), side > 0 ? neonCyan : neonPink, 95, 4, side * 12.8, slide).rotation.z = Math.PI / 2;
      });
      // Viseur holographique rétro sur la culasse.
      const dark = new THREE.MeshStandardMaterial({ color: 0x14101c, metalness: 0.6, roughness: 0.3 });
      add(new RoundedBoxGeometry(34, 5, 20, 2, 1.5), dark, 70, 32, 0, slide);
      [-1, 1].forEach((side) => add(new RoundedBoxGeometry(4, 20, 3, 1, 1), dark, 82, 42, side * 9, slide));
      add(new RoundedBoxGeometry(4, 3, 21, 1, 1), dark, 82, 52, 0, slide);
      const paneTex = tiledTexture('synth-reticle', 128, (ctx, size) => {
        ctx.strokeStyle = '#ff4fd8';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(size / 2, size * 0.2);
        ctx.lineTo(size * 0.2, size * 0.8);
        ctx.lineTo(size * 0.8, size * 0.8);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = '#5ff7ff';
        ctx.fillRect(size / 2 - 6, size * 0.55 - 6, 12, 12);
      }, { color: true });
      const pane = add(new THREE.PlaneGeometry(15, 16), new THREE.MeshBasicMaterial({ map: paneTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 82, 43, 0, slide);
      pane.rotation.y = Math.PI / 2;
      // Anneaux néon devant la bouche.
      const rings = [0, 1].map((i) => {
        const ring = add(new THREE.TorusGeometry(9 + i * 3, 0.7, 6, 32), i ? neonPink : neonCyan, 196 + i * 8, 16, 0);
        ring.rotation.y = Math.PI / 2;
        return ring;
      });
      const pixelTex = softDotTexture('synth-pixel', 'rgba(255,255,255,1)', 'rgba(255,255,255,0)');
      const pixels = particleSystem(scene, pixelTex, { max: 120 });
      const chroma = particleSystem(scene, ringTexture('synth', 'rgba(255,80,220,0.9)'), { max: 8 });
      const emitter = anchorAt(model, 0, 0, 0);
      const mouth = anchorAt(model, 200, 16, 0);
      const tmp = new THREE.Vector3();
      let clock = 0;
      return {
        update: (dt, time, flare) => {
          rings.forEach((ring, i) => {
            ring.rotation.x = time * (i ? -2 : 2);
            ring.scale.setScalar(1 + flare * 0.5);
          });
          pane.material.opacity = Math.random() < 0.04 ? 0.2 : 0.9;
          clock += dt;
          while (clock > 0.06) {
            clock -= 0.06;
            emitter.position.set(Math.random() * 190, -120 + Math.random() * 150, (Math.random() - 0.5) * 40);
            emitter.getWorldPosition(tmp);
            pixels.spawn(tmp, new THREE.Vector3(0, 0.02 + Math.random() * 0.02, 0), { life: 800, size: 0.0016 + Math.random() * 0.0014, drag: 0, tint: Math.random() < 0.5 ? 0xff4fd8 : 0x5ff7ff });
          }
          pixels.update(dt);
          chroma.update(dt);
        },
        onFire: () => {
          mouth.getWorldPosition(tmp);
          chroma.spawn(tmp, new THREE.Vector3(), { life: 250, size: 0.02, grow: 4, drag: 0 });
          chroma.spawn(tmp.clone().add(new THREE.Vector3(0.004, 0.002, 0)), new THREE.Vector3(), { life: 250, size: 0.02, grow: 4.5, drag: 0, tint: 0x5ff7ff });
        },
      };
    },
  };
}

// =============================================================================
// KRAKEN — relique remontée des abysses. Bronze verdi couvert de bernacles et
// d'algues, taches bioluminescentes qui pulsent. Trois tentacules (ventouses
// comprises) s'enroulent autour de la poignée et de la carcasse et ondulent ;
// une quatrième pend sous la bouche. Des bulles montent en permanence ; au tir,
// un nuage d'encre et une gerbe de bulles.
// =============================================================================

function krakenFinish(env, { uniforms }) {
  const rand = seeded(801);
  const spots = Array.from({ length: 34 }, () => [G_LIVERY.minX + rand() * GW, G_LIVERY.minY + rand() * GH, 0.6 + rand() * 1.4]);
  const color = livery('kraken-color', (ctx) => {
    const r2 = seeded(802);
    for (let i = 0; i < 40; i += 1) {
      const x = G_LIVERY.minX + r2() * GW;
      const y = G_LIVERY.minY + r2() * GH;
      const rad = 10 + r2() * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const tone = ['40,120,110', '120,90,40', '20,70,80', '70,130,70'][Math.floor(r2() * 4)];
      g.addColorStop(0, `rgba(${tone},0.6)`);
      g.addColorStop(1, `rgba(${tone},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // Bernacles : petits cercles clairs à centre sombre.
    for (let i = 0; i < 55; i += 1) {
      const x = G_LIVERY.minX + r2() * GW;
      const y = G_LIVERY.minY + r2() * GH;
      const rad = 0.8 + r2() * 2.2;
      ctx.fillStyle = '#c9c0a0';
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2418';
      ctx.beginPath();
      ctx.arc(x, y, rad * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    spots.forEach(([x, y, r]) => {
      ctx.fillStyle = '#7ff0e0';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
    speckle(ctx, G_LIVERY, 6000, ['rgba(0,0,0,0.25)', 'rgba(200,220,180,0.15)'], 0.5, seeded(803));
  }, { background: '#16403e', color: true });
  const glow = livery('kraken-glow', (ctx) => {
    spots.forEach(([x, y, r]) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
      g.addColorStop(0, 'rgba(140,255,240,1)');
      g.addColorStop(1, 'rgba(20,200,220,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    });
  }, { background: '#000000', color: true });
  const bump = livery('kraken-bump', (ctx) => {
    const r2 = seeded(802);
    for (let i = 0; i < 40; i += 1) r2();
    for (let i = 0; i < 55; i += 1) {
      const x = G_LIVERY.minX + r2() * GW;
      const y = G_LIVERY.minY + r2() * GH;
      const rad = 0.8 + r2() * 2.2;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    speckle(ctx, G_LIVERY, 9000, ['#707070', '#b0b0b0'], 0.8, seeded(804));
  }, { background: '#909090' });
  const pulse = 'totalEmissiveRadiance *= 0.25 + 0.9 * pow(0.5 + 0.5 * sin(uTime * 1.8 + vEmissiveMapUv.x * 40.0 + vEmissiveMapUv.y * 25.0), 3.0) + uFlare;';
  const bronze = animateEmissive(
    new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.8, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.4, metalness: 0.55, roughness: 0.55, bumpMap: bump, bumpScale: 2 }),
    uniforms,
    pulse,
  );
  const wall = new THREE.MeshStandardMaterial({ envMap: env, color: 0x1c4a44, metalness: 0.55, roughness: 0.5 });
  const brass = new THREE.MeshStandardMaterial({ envMap: env, color: 0x9a7a3a, metalness: 1, roughness: 0.35 });
  const glowSpot = new THREE.MeshBasicMaterial({ color: 0x7ff0e0 });
  return {
    ...pairOf(bronze, wall),
    barrel: brass,
    steel: brass,
    sight: glowSpot,
    dot: glowSpot,
    flash: 'abyss',
    light: 0x4dffe0,
    smoke: 0x2a3a44,
    decorate: ({ model, slide, add, scene }) => {
      const skin = new THREE.MeshPhysicalMaterial({ color: 0x7a2a4a, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2, sheen: 0.6, sheenColor: new THREE.Color(0xff9ab0), emissive: 0x2a0a1a, emissiveIntensity: 0.4 });
      const sucker = new THREE.MeshStandardMaterial({ color: 0xf0c0c8, roughness: 0.5 });
      const tentacle = (points, radius, parent = model) => {
        const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => (parent === model ? gripPoint(x, y, z) : new THREE.Vector3(x, y, z))));
        const pivot = new THREE.Group();
        parent.add(pivot);
        pivot.add(new THREE.Mesh(taperedTube(curve, 80, radius, 10, (t) => 1 - t * 0.9), skin));
        for (let k = 2; k < 14; k += 1) {
          const t = k / 16;
          const p = curve.getPointAt(t);
          const s = new THREE.Mesh(new THREE.TorusGeometry(radius * (1 - t * 0.9) * 0.45, radius * 0.12, 6, 12), sucker);
          s.position.copy(p).add(new THREE.Vector3(0, -radius * (1 - t * 0.9) * 0.8, 0));
          s.rotation.x = Math.PI / 2;
          pivot.add(s);
        }
        return pivot;
      };
      // Autour de la poignée et de la carcasse.
      tentacle([[20, -132, 16], [40, -110, 17], [52, -80, 16], [58, -56, -15], [36, -46, -17], [8, -62, -17], [-10, -44, -9]], 9);
      tentacle([[0, -128, -15], [-12, -100, -16], [-14, -70, 16], [0, -50, 17], [60, -28, 16], [120, -18, 16]], 7);
      tentacle([[30, -128, 0], [70, -125, 12], [95, -100, 16], [105, -70, 10]], 4.5);
      // Tentacule qui pend sous la bouche et ondule.
      const hang = new THREE.Group();
      hang.position.set(172, -12, 0);
      model.add(hang);
      tentacle([[0, 0, 0], [14, -18, 4], [8, -40, -4], [22, -60, 2], [16, -80, 0]], 4, hang);
      // Bernacles en relief sur la culasse.
      const barnacle = new THREE.MeshStandardMaterial({ color: 0xcfc6a8, roughness: 0.8 });
      [[30, 29, 6], [52, 28, -8], [120, 29, 4], [150, 20, 13], [16, 12, 13]].forEach(([x, y, z], i) => {
        const b = add(new THREE.CylinderGeometry(1.5, 3.2, 3 + (i % 2), 7, 1, true), barnacle, x, y, z, slide);
        if (Math.abs(z) > 10) b.rotation.x = Math.sign(z) * Math.PI / 2;
      });
      const bubbleTex = tiledTexture('kraken-bubble', 64, (ctx, size) => {
        ctx.strokeStyle = 'rgba(200,255,250,0.9)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(size * 0.38, size * 0.36, 5, 0, Math.PI * 2);
        ctx.fill();
      }, { color: true });
      const bubbles = particleSystem(scene, bubbleTex, { max: 100 });
      const ink = particleSystem(scene, softDotTexture('kraken-ink', 'rgba(10,14,24,0.95)', 'rgba(10,14,24,0)'), { max: 30 });
      const emitter = anchorAt(model, 0, 0, 0);
      const mouth = anchorAt(model, 196, 16, 0);
      const tmp = new THREE.Vector3();
      let clock = 0;
      return {
        update: (dt, time) => {
          hang.rotation.z = Math.sin(time * 1.4) * 0.25;
          hang.rotation.x = Math.sin(time * 1.1) * 0.2;
          clock += dt;
          while (clock > 0.08) {
            clock -= 0.08;
            emitter.position.set(Math.random() * 180, -130 + Math.random() * 150, (Math.random() - 0.5) * 30);
            emitter.getWorldPosition(tmp);
            bubbles.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.004, 0.025 + Math.random() * 0.02, 0), { life: 1300, size: 0.002 + Math.random() * 0.003, drag: 0 });
          }
          bubbles.update(dt);
          ink.update(dt);
        },
        onFire: () => {
          mouth.getWorldPosition(tmp);
          for (let i = 0; i < 4; i += 1) {
            ink.spawn(tmp, new THREE.Vector3((Math.random() - 0.3) * 0.2, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.2), { life: 1100, size: 0.014, grow: 3, drag: 1.5, additive: false, peak: 0.7 });
          }
          for (let i = 0; i < 12; i += 1) {
            bubbles.spawn(tmp, new THREE.Vector3((Math.random() - 0.3) * 0.6, Math.random() * 0.5, (Math.random() - 0.5) * 0.6), { life: 700, size: 0.003, drag: 2, gravity: 0.4 });
          }
        },
      };
    },
  };
}

// =============================================================================
// ONI — le démon masqué. Laque rouge sang traversée de vagues noires et de
// fissures réparées à l'or (kintsugi) qui respirent la lumière. La culasse porte
// deux cornes d'os aux pointes rougies et deux yeux ardents ; deux crocs sous la
// bouche ; un talisman de papier pend à la poignée et se balance. Une aura de
// flammes démoniaques monte des cornes ; au tir, les yeux s'embrasent.
// =============================================================================

function oniFinish(env, { uniforms }) {
  const cracks = branches(901, { roots: 12, steps: 14, stepLen: 4, width: 1.2 });
  const waves = (ctx) => {
    ctx.strokeStyle = '#0a0304';
    ctx.lineWidth = 1.4;
    for (let row = 0; row < 6; row += 1) {
      for (let x = -20; x < 210; x += 14) {
        const y = -130 + row * 30 + (x % 28 ? 7 : 0);
        for (let r = 3; r <= 9; r += 3) {
          ctx.beginPath();
          ctx.arc(x, y, r, Math.PI, 0);
          ctx.stroke();
        }
      }
    }
  };
  const color = livery('oni-color', (ctx) => {
    ctx.save();
    ctx.globalAlpha = 0.55;
    waves(ctx);
    ctx.restore();
    ctx.lineCap = 'round';
    cracks.forEach(({ pts, width }) => {
      ctx.strokeStyle = '#e8b64a';
      ctx.lineWidth = width;
      strokeLine(ctx, pts);
    });
    ctx.fillStyle = '#0a0304';
    tracePolygon(ctx, GRIP);
    ctx.fill();
    ctx.strokeStyle = '#e8b64a';
    ctx.lineWidth = 1.2;
    tracePolygon(ctx, GRIP);
    ctx.stroke();
    for (let y = -50; y > -120; y -= 10) strokeLine(ctx, [remapGrip(0, y), remapGrip(52, y + 4)]);
  }, { background: '#7a0c12', color: true });
  const glow = livery('oni-glow', (ctx) => {
    ctx.lineCap = 'round';
    cracks.forEach(({ pts, width }) => {
      ctx.shadowColor = 'rgba(255,190,80,1)';
      ctx.shadowBlur = 6;
      ctx.strokeStyle = 'rgba(255,200,90,1)';
      ctx.lineWidth = width * 0.8;
      strokeLine(ctx, pts);
    });
  }, { background: '#000000', color: true });
  const breathe = 'totalEmissiveRadiance *= 0.45 + 0.4 * sin(uTime * 1.6) + uFlare * 2.0;';
  const lacquer = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.9, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.3, metalness: 0.05, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04 }),
    uniforms,
    breathe,
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x5a080c, roughness: 0.2, clearcoat: 1 });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.3, color: 0xe8b64a, metalness: 1, roughness: 0.25 });
  const eyes = new THREE.MeshBasicMaterial({ color: 0xffd060 });
  return {
    ...pairOf(lacquer, wall),
    barrel: new THREE.MeshStandardMaterial({ envMap: env, color: 0x1a0406, metalness: 0.9, roughness: 0.3 }),
    steel: gold,
    sight: eyes,
    dot: eyes,
    flash: 'ember',
    light: 0xff3a3a,
    smoke: 0x5a2a4a,
    decorate: ({ model, slide, add, scene }) => {
      const bone = new THREE.MeshStandardMaterial({ color: 0xefe6d2, roughness: 0.45 });
      const tipRed = new THREE.MeshStandardMaterial({ color: 0xb01020, roughness: 0.4, emissive: 0x600008, emissiveIntensity: 0.6 });
      const hornTips = [-1, 1].map((side) => {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(26, 27, side * 7),
          new THREE.Vector3(14, 44, side * 13),
          new THREE.Vector3(-4, 56, side * 18),
          new THREE.Vector3(-22, 58, side * 22),
        ]);
        slide.add(new THREE.Mesh(taperedTube(curve, 40, 5.5, 10, (t) => 1 - t * 0.92), bone));
        const tip = new THREE.Mesh(new THREE.ConeGeometry(1.8, 8, 8), tipRed);
        tip.position.copy(curve.getPointAt(0.97));
        tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangentAt(0.97));
        slide.add(tip);
        return anchorAt(slide, -22, 58, side * 22);
      });
      const eyeMeshes = [-1, 1].map((side) => {
        const eye = add(new THREE.SphereGeometry(2.6, 14, 10), eyes, 20, 18, side * 12.8, slide);
        eye.scale.set(1.6, 0.8, 0.5);
        return eye;
      });
      [-1, 1].forEach((side) => {
        const fang = add(new THREE.ConeGeometry(2.2, 12, 8), bone, 178, -4, side * 7);
        fang.rotation.z = Math.PI;
      });
      // Talisman de papier (ofuda) suspendu à la poignée.
      const talismanTex = tiledTexture('oni-ofuda', 128, (ctx, size) => {
        ctx.fillStyle = '#f0e6c8';
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = '#a0101a';
        ctx.lineWidth = 5;
        ctx.strokeRect(10, 6, size - 20, size - 12);
        ctx.lineWidth = 7;
        for (let k = 0; k < 4; k += 1) {
          ctx.beginPath();
          ctx.moveTo(40, 22 + k * 24);
          ctx.lineTo(88, 30 + k * 24);
          ctx.moveTo(64, 16 + k * 24);
          ctx.lineTo(60, 40 + k * 24);
          ctx.stroke();
        }
      }, { color: true });
      const talisman = new THREE.Group();
      talisman.position.copy(gripPoint(20, -126, 14));
      model.add(talisman);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 6), gold);
      cord.position.y = -7;
      talisman.add(cord);
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(14, 40), new THREE.MeshStandardMaterial({ map: talismanTex, side: THREE.DoubleSide, roughness: 0.9 }));
      paper.position.y = -34;
      talisman.add(paper);

      const flameTex = softDotTexture('oni-flame', 'rgba(255,140,200,1)', 'rgba(120,0,60,0)');
      const aura = particleSystem(scene, flameTex, { max: 90 });
      const tmp = new THREE.Vector3();
      let clock = 0;
      let blaze = 0;
      return {
        update: (dt, time) => {
          talisman.rotation.z = Math.sin(time * 1.6) * 0.25;
          talisman.rotation.y = Math.sin(time * 0.9) * 0.4;
          blaze = Math.max(0, blaze - dt * 2.5);
          eyes.color.setRGB(1, 0.8 - blaze * 0.5, 0.35 - blaze * 0.3);
          eyeMeshes.forEach((e) => e.scale.set(1.6 + blaze, 0.8 + blaze * 0.4, 0.5));
          clock += dt;
          while (clock > 0.05) {
            clock -= 0.05;
            hornTips[Math.floor(Math.random() * 2)].getWorldPosition(tmp);
            aura.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.01, 0.03 + Math.random() * 0.03, (Math.random() - 0.5) * 0.01), {
              life: 700,
              size: 0.004 + Math.random() * 0.003,
              grow: 0.8,
              drag: 0.5,
              tint: Math.random() < 0.6 ? 0xff5ab0 : 0xff2a2a,
            });
          }
          aura.update(dt);
        },
        onFire: () => {
          blaze = 1;
        },
      };
    },
  };
}

// =============================================================================
// PRISME — un pistolet taillé dans le cristal. Culasse et carcasse en verre
// réfractant avec dispersion (la lumière s'y décompose en arc-en-ciel) : on voit
// à travers le canon, le ressort récupérateur, la barre de détente et les
// cartouches empilées dans la poignée. Des éclats prismatiques gravitent autour
// de l'arme ; au tir, anneaux aux couleurs du spectre.
// =============================================================================

function prismFinish(env) {
  const glass = new THREE.MeshPhysicalMaterial({
    envMap: env,
    envMapIntensity: 1.8,
    color: 0xf4fbff,
    metalness: 0,
    roughness: 0,
    transmission: 0.96,
    thickness: 18,
    ior: 1.55,
    dispersion: 6,
    iridescence: 0.5,
    iridescenceIOR: 1.4,
    clearcoat: 1,
    specularIntensity: 1,
  });
  const glassWall = glass;
  const chrome = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.5, color: 0xd8dde4, metalness: 1, roughness: 0.08 });
  return {
    ...pairOf(glass, glassWall),
    barrel: chrome,
    steel: chrome,
    sight: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff6aa0 }),
    flash: 'frost',
    light: 0xffffff,
    smoke: 0xffffff,
    makeShell: () => new THREE.Mesh(new THREE.OctahedronGeometry(0.007, 0), glass),
    decorate: ({ model, slide, add, scene, boreY }) => {
      const dark = new THREE.MeshStandardMaterial({ envMap: env, color: 0x30343a, metalness: 1, roughness: 0.2 });
      const brass = new THREE.MeshStandardMaterial({ envMap: env, color: 0xd1a54a, metalness: 1, roughness: 0.25 });
      // Mécanique visible à travers le verre.
      const inner = add(new THREE.CylinderGeometry(6, 6, 180, 24), dark, 95, boreY, 0, slide);
      inner.rotation.z = Math.PI / 2;
      const spring = [];
      for (let k = 0; k <= 120; k += 1) spring.push(new THREE.Vector3(60 + k, 6 + Math.cos(k * 0.6) * 4.5, Math.sin(k * 0.6) * 4.5));
      model.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spring), 360, 0.7, 6, false), chrome));
      add(new RoundedBoxGeometry(70, 3, 3, 1, 1), chrome, 50, -8, 0);
      for (let k = 0; k < 9; k += 1) {
        const round = add(new THREE.CylinderGeometry(4.6, 4.6, 26, 16), brass, ...gripPoint(26 - k * 3.2, -52 - k * 8, 0).toArray());
        round.rotation.z = Math.PI / 2 - 0.35;
      }
      // Éclats prismatiques en orbite.
      const shards = [0, 1, 2, 3, 4, 5].map((i) => {
        const s = add(new THREE.OctahedronGeometry(5 + (i % 3) * 2, 0), glass, 0, 0, 0);
        s.scale.set(0.6, 1.4, 0.6);
        return { s, phase: (i / 6) * Math.PI * 2, radius: 50 + (i % 2) * 20 };
      });
      const spectrum = [0xff4a4a, 0xffb14a, 0xfff04a, 0x4aff7a, 0x4ab4ff, 0xb44aff];
      const rings = particleSystem(scene, ringTexture('prism', 'rgba(255,255,255,0.9)'), { max: 24 });
      const glints = particleSystem(scene, softDotTexture('prism-glint', 'rgba(255,255,255,1)', 'rgba(255,255,255,0)'), { max: 40 });
      const mouth = anchorAt(model, 196, 16, 0);
      const emitter = anchorAt(model, 0, 0, 0);
      const tmp = new THREE.Vector3();
      let clock = 0;
      return {
        update: (dt, time) => {
          shards.forEach(({ s, phase, radius }) => {
            const a = time * 0.8 + phase;
            s.position.set(80 + Math.cos(a) * radius, -30 + Math.sin(a * 1.3) * 30, Math.sin(a) * 40);
            s.rotation.y += dt * 1.5;
          });
          clock += dt;
          while (clock > 0.15) {
            clock -= 0.15;
            emitter.position.set(Math.random() * 186, -104 + Math.random() * 134, (Math.random() - 0.5) * 30);
            emitter.getWorldPosition(tmp);
            glints.spawn(tmp, new THREE.Vector3(), { life: 350, size: 0.004, drag: 0, tint: spectrum[Math.floor(Math.random() * spectrum.length)] });
          }
          rings.update(dt);
          glints.update(dt);
        },
        onFire: () => {
          mouth.getWorldPosition(tmp);
          spectrum.forEach((tint, i) => {
            rings.spawn(tmp, new THREE.Vector3(), { life: 260 + i * 40, size: 0.012 + i * 0.002, grow: 3 + i * 0.4, drag: 0, tint });
          });
        },
      };
    },
  };
}

// =============================================================================
// XÉNO — arme biomécanique vivante. Chitine noire huileuse, côtes et nervures,
// veines d'un vert acide qui battent comme un cœur (double pulsation dans le
// shader). Une colonne vertébrale court sur la culasse, des côtes d'os
// enserrent la carcasse, des tuyaux organiques relient la poignée à la bouche,
// une gueule dentée entoure le canon. De l'acide perle et goutte sous l'arme ;
// au tir, projection d'acide.
// =============================================================================

function xenoFinish(env, { uniforms }) {
  const veins = branches(1001, { roots: 16, steps: 16, stepLen: 4, jitter: 1, width: 1.4 });
  const ribs = (ctx) => {
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1.6;
    for (let x = -20; x < 210; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, 40);
      ctx.quadraticCurveTo(x + 8, 10, x, -20);
      ctx.stroke();
    }
    for (let y = -40; y > -140; y -= 6) {
      ctx.beginPath();
      ctx.moveTo(-20, y);
      ctx.quadraticCurveTo(30, y - 6, 80, y);
      ctx.stroke();
    }
  };
  const color = livery('xeno-color', (ctx) => {
    speckle(ctx, G_LIVERY, 6000, ['rgba(60,70,60,0.4)', 'rgba(0,0,0,0.4)'], 1, seeded(1002));
    ribs(ctx);
    ctx.lineCap = 'round';
    veins.forEach(({ pts, width }) => {
      ctx.strokeStyle = '#3a6a1a';
      ctx.lineWidth = width * 1.6;
      strokeLine(ctx, pts);
    });
  }, { background: '#161b16', color: true });
  const glow = livery('xeno-glow', (ctx) => {
    ctx.lineCap = 'round';
    veins.forEach(({ pts, width }) => {
      ctx.shadowColor = 'rgba(140,255,60,1)';
      ctx.shadowBlur = 5;
      ctx.strokeStyle = 'rgba(150,255,70,1)';
      ctx.lineWidth = width * 0.7;
      strokeLine(ctx, pts);
    });
  }, { background: '#000000', color: true });
  const bump = livery('xeno-bump', (ctx) => {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.6;
    ribs(ctx);
  }, { background: '#b0b0b0' });
  const heartbeat = `
    float beat = pow(max(0.0, sin(uTime * 2.6)), 8.0) + 0.6 * pow(max(0.0, sin(uTime * 2.6 - 0.6)), 10.0);
    totalEmissiveRadiance *= 0.2 + beat * 1.9 + uFlare * 2.0;
  `;
  const chitin = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1.1, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.5, metalness: 0.3, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.15, bumpMap: bump, bumpScale: 2.5 }),
    uniforms,
    heartbeat,
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x121712, metalness: 0.3, roughness: 0.2, clearcoat: 1 });
  const acid = new THREE.MeshBasicMaterial({ color: 0x9aff4a });
  return {
    ...pairOf(chitin, wall),
    barrel: wall,
    steel: new THREE.MeshStandardMaterial({ envMap: env, color: 0x2a3326, metalness: 0.5, roughness: 0.3 }),
    sight: acid,
    dot: acid,
    flash: 'venom',
    light: 0x7dff4a,
    smoke: 0x6a8a4a,
    makeShell: () => new THREE.Mesh(new THREE.SphereGeometry(0.005, 10, 8), acid),
    decorate: ({ model, slide, add, scene }) => {
      const boneMat = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x2a2e26, metalness: 0.2, roughness: 0.25, clearcoat: 1 });
      // Colonne vertébrale sur la culasse.
      const spine = [];
      for (let k = 0; k < 9; k += 1) {
        const v = add(new THREE.SphereGeometry(4.5 - k * 0.25, 10, 8), boneMat, 16 + k * 18, 31, 0, slide);
        v.scale.set(1.5, 0.8, 1);
        const spike = add(new THREE.ConeGeometry(1.6, 7 - k * 0.4, 6), boneMat, 16 + k * 18, 36, 0, slide);
        spike.rotation.z = 0.5;
        spine.push(v);
      }
      // Côtes qui enserrent la carcasse et la poignée.
      const ribsMeshes = [];
      [[20, -30], [40, -34], [60, -36], [100, -12], [130, -10]].forEach(([x, y]) => {
        const rib = add(new THREE.TorusGeometry(15, 1.8, 8, 20, Math.PI), boneMat, x, y, 0);
        rib.rotation.y = Math.PI / 2;
        rib.rotation.x = Math.PI;
        ribsMeshes.push(rib);
      });
      // Tuyaux organiques.
      [-1, 1].forEach((side) => {
        const curve = new THREE.CatmullRomCurve3([
          gripPoint(10, -110, side * 14),
          gripPoint(60, -60, side * 17),
          new THREE.Vector3(120, -22, side * 15),
          new THREE.Vector3(172, -8, side * 9),
        ]);
        model.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 2.4, 8, false), new THREE.MeshPhysicalMaterial({ color: 0x3a4a2a, roughness: 0.3, clearcoat: 1, emissive: 0x2a5a0a, emissiveIntensity: 0.4 })));
      });
      // Gueule dentée autour du canon.
      for (let k = 0; k < 10; k += 1) {
        const a = (k / 10) * Math.PI * 2;
        const tooth = add(new THREE.ConeGeometry(1.4, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.4 }), 188, 16 + Math.sin(a) * 10, Math.cos(a) * 10, slide);
        tooth.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.6, -Math.sin(a), -Math.cos(a)).normalize());
      }
      // Gouttes d'acide.
      const dropGeometry = new THREE.SphereGeometry(2.6, 10, 8).translate(0, -2.6, 0);
      const drips = [[40, -130], [150, -16], [96, -40]].map(([x, y], i) => {
        const mesh = add(dropGeometry, acid, ...(y < -100 ? remapGrip(x, y) : [x, y]), 0);
        return { mesh, t: i * 0.3, period: 1.4 + i * 0.4 };
      });
      const acidTex = softDotTexture('xeno-acid', 'rgba(210,255,150,1)', 'rgba(80,220,20,0)');
      const drops = particleSystem(scene, acidTex, { max: 60 });
      const mouth = anchorAt(model, 196, 16, 0);
      const tmp = new THREE.Vector3();
      return {
        update: (dt, time) => {
          const beat = Math.max(0, Math.sin(time * 2.6)) ** 8;
          ribsMeshes.forEach((rib) => rib.scale.setScalar(1 + beat * 0.06));
          spine.forEach((v, k) => {
            v.position.y = 31 + Math.sin(time * 3 - k * 0.6) * 0.6;
          });
          drips.forEach((d) => {
            d.t += dt / d.period;
            if (d.t >= 1) {
              d.t = 0;
              d.mesh.getWorldPosition(tmp);
              drops.spawn(tmp, new THREE.Vector3(0, -0.04, 0), { life: 500, size: 0.004, drag: 0, gravity: -6 });
            }
            d.mesh.scale.set(1 - d.t * 0.3, 0.3 + d.t * 1.6, 1 - d.t * 0.3);
          });
          drops.update(dt);
        },
        onFire: () => {
          mouth.getWorldPosition(tmp);
          for (let i = 0; i < 14; i += 1) {
            drops.spawn(tmp, new THREE.Vector3((Math.random() - 0.2) * 1.4, (Math.random() - 0.3) * 1, (Math.random() - 0.5) * 1.4), { life: 500, size: 0.003 + Math.random() * 0.003, drag: 2.5, gravity: -3 });
          }
        },
      };
    },
  };
}

export const GLOCK_LEGENDARY_SKINS = {
  synthwave: { build: synthwaveFinish },
  kraken: { build: krakenFinish },
  oni: { build: oniFinish },
  prism: { build: prismFinish },
  xeno: { build: xenoFinish },
};
