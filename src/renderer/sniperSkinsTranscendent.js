import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { seeded, tiledTexture, speckle, animateEmissive, patchShader, particleSystem, softDotTexture, springStep, anchorAt, meshBurst, extrude } from './weaponKit.js';
import { S_LIVERY, livery, tracePolygon } from './sniperSkins.js';
import {
  captureParts,
  placePart,
  introRunner,
  orderBy,
  shockRings,
  easeOutCubic,
  easeOutBack,
  easeInOut,
  clamp01,
} from './transcendentKit.js';

// Skins Transcendants de l'Operator (suite de Faille) : Locomotive,
// Kaléidoscope, Marbre, Tisseuse, Corsaire. Repère : x vers la bouche (plaque
// de couche à 0, bouche ≈ 1190), axe du canon y = 16, lunette y = 78 (ligne de
// visée : rien ne monte au-dessus de y ≈ 60 devant elle). Flanc gauche (vu par
// le joueur) vers -z : crosse ±20, carcasse ±24,5, garde-main ±29.

const SW = S_LIVERY.maxX - S_LIVERY.minX;
const SH = S_LIVERY.maxY - S_LIVERY.minY;
const ZERO = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0);
const GUN_MID = new THREE.Vector3(600, 10, 0);

function sniperFaces(face, wall, extra = {}) {
  const pair = [face, wall];
  return { stock: pair, buttPad: [wall, wall], grip: pair, chassis: pair, forend: pair, muzzle: pair, ...extra };
}

function hideMuzzle(body, parts) {
  parts.muzzle.visible = false;
  body.children.forEach((m) => {
    if (m.geometry?.type === 'CircleGeometry' && m.position.x > 1180) m.visible = false;
  });
}

function capture(body, parts, extra = []) {
  return captureParts([body], [parts.bolt, ...extra]);
}

// Texture de tube : bandes le long de la longueur (v) des cylindres.
function bandTexture(key, draw, repeatV = 1) {
  const tex = tiledTexture(key, 256, draw, { color: true });
  tex.repeat.set(1, repeatV);
  return tex;
}

// =============================================================================
// LOCOMOTIVE — une machine à vapeur : émail noir filets d'or, châssis rouge,
// chaudière cerclée de laiton, lunette en laiton poli. Roues motrices rouges à
// rayons sur les deux flancs, bielles et pistons qui les entraînent, cheminée
// qui crache des bouffées au rythme des coups de piston, chasse-pierres et
// phare à l'avant. Au tir : jet de vapeur des cylindres, panache noir, roues
// qui patinent, sifflet. Apparition : des rails se tracent et la machine entre
// en gare, pièce par pièce, depuis l'arrière.
// =============================================================================

function locomotiveFinish(env, geo) {
  const u = geo.uniforms;
  const color = livery('loco-color', (ctx) => {
    ctx.fillStyle = '#0c0c0e';
    ctx.fillRect(S_LIVERY.minX, S_LIVERY.minY, SW, SH);
    // Bande rouge basse et filets d'or.
    ctx.fillStyle = '#9a1a18';
    ctx.fillRect(S_LIVERY.minX, -130, SW, 110);
    ctx.fillStyle = '#0c0c0e';
    ctx.fillRect(S_LIVERY.minX, -20, SW, 30);
    ctx.strokeStyle = '#d9a55a';
    ctx.lineWidth = 1;
    [-18, -22, 6, 9].forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(S_LIVERY.minX, y);
      ctx.lineTo(S_LIVERY.maxX, y);
      ctx.stroke();
    });
    // Plaque de numéro en laiton sur la crosse.
    ctx.fillStyle = '#c9a04a';
    ctx.fillRect(90, -10, 70, 22);
    ctx.fillStyle = '#1a1206';
    ctx.font = 'bold 16px Georgia';
    ctx.save();
    ctx.scale(1, -1);
    ctx.fillText('241', 108, 5);
    ctx.restore();
    speckle(ctx, S_LIVERY, 8000, ['rgba(255,255,255,0.04)'], 0.4, seeded(3101));
  }, { color: true });
  const enamel = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1, map: color, metalness: 0.3, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 });
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x0c0c0e, metalness: 0.3, roughness: 0.25, clearcoat: 1 });
  const boiler = bandTexture('loco-boiler', (ctx, size) => {
    ctx.fillStyle = '#101012';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#c9a04a';
    ctx.fillRect(0, size * 0.46, size, size * 0.08);
  }, 5);
  const brass = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.3, color: 0xd6a84a, metalness: 1, roughness: 0.18 });
  return {
    ...sniperFaces(enamel, wall),
    receiver: new THREE.MeshPhysicalMaterial({ envMap: env, map: boiler, metalness: 0.5, roughness: 0.3, clearcoat: 1 }),
    barrel: new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x141416, metalness: 0.6, roughness: 0.35, clearcoat: 0.6 }),
    scope: brass,
    lens: new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x3a2a10, roughness: 0.05, clearcoat: 1, metalness: 0.4 }),
    metal: brass,
    dark: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 }),
    brass,
    flash: 'ember',
    light: 0xffb060,
    smoke: 0x3a3a3a,
    decorate: (ctx) => decorateLocomotive({ ...ctx, env, brass, u }),
  };
}

function spokedWheel(radius, red, brass) {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 2.6, 10, 40), red);
  g.add(rim);
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(radius + 2.6, 1.4, 8, 40), new THREE.MeshStandardMaterial({ color: 0x3a3a3e, metalness: 0.9, roughness: 0.3 }));
  g.add(tyre);
  for (let k = 0; k < 12; k += 1) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(1.6, radius, 1.6), red);
    const a = (k / 12) * Math.PI * 2;
    spoke.position.set(Math.cos(a) * radius * 0.5, Math.sin(a) * radius * 0.5, 0);
    spoke.rotation.z = a - Math.PI / 2;
    g.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 5, 16), brass);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  const weight = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.7, radius * 0.7, 2.4, 20, 1, false, 0, Math.PI * 0.7), red);
  weight.rotation.x = Math.PI / 2;
  g.add(weight);
  return g;
}

function decorateLocomotive({ body, add, scene, parts, env, brass, u }) {
  hideMuzzle(body, parts);
  parts.bipod.visible = false;
  const red = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xa81c18, metalness: 0.3, roughness: 0.3, clearcoat: 1 });
  const steel = new THREE.MeshStandardMaterial({ envMap: env, color: 0x8a8d94, metalness: 1, roughness: 0.25 });
  const black = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x0e0e10, metalness: 0.4, roughness: 0.3, clearcoat: 1 });

  // Roues motrices, bielles d'accouplement et pistons, des deux côtés.
  const WHEELS = [520, 600, 680];
  const R = 24;
  const CRANK = 11;
  const drive = [-1, 1].map((side) => {
    const z = side * 33;
    const wheels = WHEELS.map((x) => {
      const w = spokedWheel(R, red, brass);
      w.position.set(x, -40, z);
      body.add(w);
      return w;
    });
    const rod = new THREE.Mesh(new RoundedBoxGeometry(WHEELS[2] - WHEELS[0] + 10, 4, 2.4, 1, 0.8), steel);
    rod.position.z = z + side * 4;
    body.add(rod);
    const mainRod = new THREE.Mesh(new RoundedBoxGeometry(120, 3.4, 2.4, 1, 0.8), steel);
    mainRod.position.z = z + side * 7;
    body.add(mainRod);
    const cyl = add(new THREE.CylinderGeometry(9, 9, 46, 20), black, 790, -34, z);
    cyl.rotation.z = Math.PI / 2;
    [767, 813].forEach((x) => {
      const band = add(new THREE.CylinderGeometry(9.6, 9.6, 2.4, 20), brass, x, -34, z);
      band.rotation.z = Math.PI / 2;
    });
    const piston = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 10), steel);
    piston.rotation.z = Math.PI / 2;
    body.add(piston);
    const valve = anchorAt(body, 810, -26, z + side * 10);
    return { side, z, wheels, rod, mainRod, piston, valve };
  });

  // Cheminée devant la carcasse (sous la ligne de la lunette) et chasse-pierres.
  const stack = add(new THREE.LatheGeometry([new THREE.Vector2(7, 0), new THREE.Vector2(6, 16), new THREE.Vector2(8, 26), new THREE.Vector2(12, 34), new THREE.Vector2(11, 36)], 24), black, 980, 26, 0);
  add(new THREE.CylinderGeometry(12.2, 12.2, 2, 24), brass, 980, 60.5, 0);
  const stackTop = anchorAt(body, 980, 64, 0);
  const pilot = new THREE.Group();
  pilot.position.set(1120, -20, 0);
  body.add(pilot);
  for (let k = -4; k <= 4; k += 1) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2, 44, 2), red);
    bar.position.set(Math.abs(k) * 5, -8, k * 5.5);
    bar.rotation.z = -0.7;
    pilot.add(bar);
  }
  // Boîte à fumée qui relie le canon au phare.
  add(new THREE.CylinderGeometry(15, 15, 58, 28), black, 1122, 16, 0).rotation.z = Math.PI / 2;
  [1100, 1140].forEach((x) => add(new THREE.CylinderGeometry(15.8, 15.8, 3, 28), brass, x, 16, 0).rotation.z = Math.PI / 2);
  // Phare autour de la bouche.
  const lampGlass = new THREE.MeshBasicMaterial({ color: 0xffe6a0 });
  add(new THREE.LatheGeometry([new THREE.Vector2(12, 0), new THREE.Vector2(20, 12), new THREE.Vector2(21, 30)], 32), black, 1150, 16, 0).rotation.z = -Math.PI / 2;
  const ring = add(new THREE.RingGeometry(9, 20, 40), lampGlass, 1180.5, 16, 0);
  ring.rotation.y = Math.PI / 2;
  add(new THREE.TorusGeometry(21, 1.6, 8, 40), brass, 1181, 16, 0).rotation.y = Math.PI / 2;
  const beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture('loco-lamp', 'rgba(255,240,200,1)', 'rgba(255,200,120,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
  beam.scale.set(90, 90, 1);
  beam.position.set(1184, 16, 0);
  body.add(beam);

  const smoke = particleSystem(scene, softDotTexture('loco-smoke', 'rgba(60,60,64,0.8)', 'rgba(60,60,64,0)'), { max: 80 });
  const steam = particleSystem(scene, softDotTexture('loco-steam', 'rgba(245,248,250,0.8)', 'rgba(245,248,250,0)'), { max: 90 });
  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const boost = { x: 0, v: 0 };
  let angle = 0;
  let lastChuff = 0;
  let time = 0;

  const chuff = (big) => {
    stackTop.getWorldPosition(tmp);
    for (let i = 0; i < (big ? 8 : 2); i += 1) smoke.spawn(tmp, new THREE.Vector3((Math.random() - 0.7) * 0.15, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.08), { life: big ? 1600 : 1100, size: big ? 0.03 : 0.018, grow: 3, drag: 1, additive: false, peak: big ? 0.8 : 0.5 });
  };
  const hiss = (n) => {
    body.getWorldQuaternion(quat);
    drive.forEach((d) => {
      d.valve.getWorldPosition(tmp);
      for (let i = 0; i < n; i += 1) steam.spawn(tmp, new THREE.Vector3(-0.2 + Math.random() * 0.1, -0.1 + Math.random() * 0.2, d.side * (0.3 + Math.random() * 0.3)).applyQuaternion(quat), { life: 700, size: 0.012, grow: 3, drag: 2, additive: false, peak: 0.6 });
    });
  };

  // Apparition : rails et traverses, puis la machine entre en gare par l'arrière.
  const track = new THREE.Group();
  track.visible = false;
  body.add(track);
  [-12, 12].forEach((z) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1600, 5, 4), steel);
    rail.position.set(600, -70, z * 2.5);
    track.add(rail);
  });
  for (let x = -200; x <= 1400; x += 45) {
    const tie = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 90), new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 1 }));
    tie.position.set(x, -74, 0);
    track.add(tie);
  }
  const pieces = capture(body, parts, [track]);
  orderBy(pieces, (p) => -p.center.x);
  const delta = new THREE.Vector3();
  const intro = introRunner(pieces, {
    duration: 1.8,
    hidden: [parts.bolt],
    start: () => (track.visible = true),
    end: () => (track.visible = false),
    frame: (t) => {
      track.scale.set(clamp01(t / 0.3), 1, 1);
      track.visible = t < 1.7;
      track.position.y = -40 * clamp01((t - 1.4) / 0.3);
      if (t > 0.3 && t < 1.4 && Math.floor(t * 8) !== Math.floor((t - 1 / 60) * 8)) chuff(false);
    },
    place: (p, t) => {
      const s = clamp01((t - 0.3 - p.order * 0.8) / 0.55);
      p.object.visible = s > 0;
      if (s <= 0) return;
      delta.set(-1100 * (1 - easeOutCubic(s)), 0, 0);
      placePart(p, 1, delta);
    },
  });

  return {
    muzzleX: 1186,
    replayIntro: intro.start,
    introDuration: intro.duration,
    update: (dt, t, flare) => {
      time += dt;
      springStep(boost, 0, 3, dt);
      const speed = 2.2 + Math.max(0, boost.x) * 14;
      angle += speed * dt;
      // Coup de piston à chaque demi-tour : bouffée de fumée.
      if (Math.floor(angle / Math.PI) !== lastChuff) {
        lastChuff = Math.floor(angle / Math.PI);
        chuff(false);
        if (Math.random() < 0.4) hiss(1);
      }
      drive.forEach((d) => {
        const phase = angle + (d.side > 0 ? Math.PI / 2 : 0);
        d.wheels.forEach((w) => (w.rotation.z = -phase));
        const cx = Math.cos(phase) * CRANK;
        const cy = Math.sin(-phase) * CRANK;
        d.rod.position.set((WHEELS[0] + WHEELS[2]) / 2 + cx, -40 + cy, d.rod.position.z);
        const crank = new THREE.Vector2(WHEELS[2] + cx, -40 + cy);
        const cross = new THREE.Vector2(740 + cx * 0.9, -34);
        d.mainRod.position.set((crank.x + cross.x) / 2, (crank.y + cross.y) / 2, d.mainRod.position.z);
        d.mainRod.rotation.z = Math.atan2(cross.y - crank.y, cross.x - crank.x);
        d.mainRod.scale.x = crank.distanceTo(cross) / 120;
        d.piston.position.set(cross.x + 30, -34, d.z);
      });
      lampGlass.color.setRGB(1, 0.9, 0.63).multiplyScalar(1 + flare * 1.5);
      beam.material.opacity = 0.45 + flare * 0.5;
      smoke.update(dt);
      steam.update(dt);
      intro.update(dt);
    },
    onFire: () => {
      boost.v += 8;
      chuff(true);
      hiss(6);
    },
  };
}

// =============================================================================
// KALÉIDOSCOPE — miroir chromé où tourne en permanence un motif de
// kaléidoscope (symétrie à 8 branches, couleurs qui glissent), lunette-tube
// aux verres colorés, prismes de verre qui dispersent la lumière en orbite,
// mandala qui tourne derrière la bouche. Au tir : mandalas qui s'ouvrent et
// éclats de verre colorés. Apparition : les pièces tournent en rosace autour
// de l'axe du canon puis se referment en place.
// =============================================================================

const KALEIDO_GLSL = `
  vec3 kaleido(vec2 p, float t) {
    float a = atan(p.y, p.x);
    float r = length(p);
    float seg = 6.2831853 / 8.0;
    a = mod(a + t * 0.25, seg);
    a = abs(a - seg * 0.5);
    vec2 q = vec2(cos(a), sin(a)) * r;
    float n = sin(q.x * 11.0 + t) * cos(q.y * 9.0 - t * 1.3) + 0.5 * sin((q.x + q.y) * 16.0 - t * 0.7);
    vec3 col = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + n * 0.35 + r * 1.2 + t * 0.08));
    float lines = smoothstep(0.08, 0.0, abs(fract(n * 2.0) - 0.5) - 0.42);
    col = pow(col, vec3(1.8));
    return col * (0.22 + 0.4 * n * n) + col * lines * 0.5;
  }
`;

function kaleidoMaterial(base, uniforms, mapPoint, key) {
  base.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uFlare = uniforms.uFlare;
    shader.fragmentShader = `uniform float uTime;\nuniform float uFlare;\n${KALEIDO_GLSL}\n${shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      vec2 kp = ${mapPoint};
      // Cellules en miroir : le motif reste continu d'une rosace à l'autre.
      vec2 cell = abs(fract(kp) - 0.5);
      totalEmissiveRadiance = kaleido(cell, uTime) * (0.8 + uFlare * 1.2);`,
    )}`;
  };
  base.customProgramCacheKey = () => key;
  return base;
}

function polarKaleido(uniforms, radius, { additive = false, opacity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uFlare: uniforms.uFlare, uOpacity: { value: opacity } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `
      varying vec2 vPos;
      void main() {
        vPos = position.xy / ${radius.toFixed(2)};
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uFlare;
      uniform float uOpacity;
      varying vec2 vPos;
      ${KALEIDO_GLSL}
      void main() {
        float r = length(vPos);
        vec3 col = kaleido(vPos * 0.5, uTime * 1.5) * 1.6 * (1.0 + uFlare);
        float edge = 1.0 - smoothstep(0.92, 1.0, r);
        gl_FragColor = vec4(col, edge * uOpacity);
      }
    `,
  });
}

function kaleidoFinish(env, geo) {
  const u = geo.uniforms;
  const white = tiledTexture('kal-white', 8, (ctx, size) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
  }, { color: true });
  const face = kaleidoMaterial(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1.4, color: 0x121216, metalness: 1, roughness: 0.12, clearcoat: 1, emissive: 0xffffff, emissiveMap: white }),
    u,
    `vEmissiveMapUv * vec2(1.0, 1.0)`,
    'kaleido-face',
  );
  // Les faces extrudées ont des UV en mm : une rosace tous les 70 mm.
  white.repeat.set(1 / 150, 1 / 150);
  const chrome = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1.6, color: 0xc8ccd6, metalness: 1, roughness: 0.05, clearcoat: 1 });
  const bands = bandTexture('kal-bands', (ctx, size) => {
    const cols = ['#c9a04a', '#e0406a', '#c9a04a', '#3aa8ff', '#c9a04a', '#6ae08a'];
    cols.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(0, (i / cols.length) * size, size, size / cols.length);
    });
  }, 2);
  return {
    ...sniperFaces(face, chrome),
    receiver: chrome,
    barrel: chrome,
    scope: new THREE.MeshPhysicalMaterial({ envMap: env, map: bands, metalness: 0.9, roughness: 0.15, clearcoat: 1 }),
    lens: polarKaleido(u, 25),
    lensBack: polarKaleido(u, 19),
    metal: chrome,
    dark: new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.9 }),
    brass: chrome,
    flash: 'void',
    light: 0xd08aff,
    smoke: 0xd0c0ff,
    decorate: (ctx) => decorateKaleido({ ...ctx, env, u }),
  };
}

function decorateKaleido({ body, add, scene, parts, env, u }) {
  hideMuzzle(body, parts);
  // Mandala tournant devant la bouche (vu de dos par le joueur).
  const mandala = new THREE.Mesh(new THREE.CircleGeometry(34, 64), polarKaleido(u, 34, { additive: true, opacity: 0.85 }));
  mandala.rotation.y = Math.PI / 2;
  mandala.position.set(1165, 16, 0);
  body.add(mandala);
  const bezel = add(new THREE.TorusGeometry(35, 1.8, 10, 64), new THREE.MeshStandardMaterial({ envMap: env, color: 0xc9a04a, metalness: 1, roughness: 0.2 }), 1165, 16, 0);
  bezel.rotation.y = Math.PI / 2;
  add(new THREE.CylinderGeometry(9, 12, 60, 24), new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xc8ccd6, metalness: 1, roughness: 0.05 }), 1130, 16, 0).rotation.z = Math.PI / 2;

  // Prismes de verre en orbite, côté joueur.
  const prismMats = [0xff6a8a, 0x6ac8ff, 0xffe06a, 0x9aff8a, 0xd08aff].map((c) => new THREE.MeshPhysicalMaterial({ envMap: env, color: c, metalness: 0, roughness: 0.02, transmission: 0.9, thickness: 8, ior: 1.7, dispersion: 6, iridescence: 0.6, clearcoat: 1 }));
  const orbit = new THREE.Group();
  body.add(orbit);
  const prismGeo = new THREE.CylinderGeometry(7, 7, 22, 3);
  const prisms = Array.from({ length: 10 }, (_, i) => {
    const m = new THREE.Mesh(prismGeo, prismMats[i % 5]);
    orbit.add(m);
    return { m, a: (i / 10) * Math.PI * 2, push: { x: 0, v: 0 } };
  });
  // Facettes miroir le long du garde-main.
  const mirror = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 2, color: 0xffffff, metalness: 1, roughness: 0 });
  [700, 760, 820, 880].forEach((x, i) => {
    const tri = new THREE.Shape();
    tri.moveTo(0, 0);
    tri.lineTo(40, i % 2 ? 26 : -4);
    tri.lineTo(4, 30);
    tri.closePath();
    add(extrude(tri, 1.2, 0.3, { bevelSegments: 1 }), mirror, x, -22, -30);
  });

  // Rosaces de tir : disques kaléidoscopiques qui s'ouvrent devant la bouche.
  const burstGeo = new THREE.CircleGeometry(1, 48).rotateY(Math.PI / 2);
  const bursts = Array.from({ length: 4 }, () => {
    const mat = polarKaleido(u, 1, { additive: true, opacity: 0 });
    const m = new THREE.Mesh(burstGeo, mat);
    m.visible = false;
    m.frustumCulled = false;
    scene.add(m);
    return { m, born: -1 };
  });
  let burstCursor = 0;
  const glass = meshBurst(scene, { max: 40 });
  const shardGeo = new THREE.TetrahedronGeometry(0.004);
  const mouth = anchorAt(body, 1170, 16, 0);
  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const spin = { x: 0, v: 0 };
  let time = 0;

  // Apparition : rosace de pièces autour de l'axe du canon qui se referme.
  const pieces = capture(body, parts, [orbit]);
  pieces.forEach((p, i) => {
    p.theta = ((i % 8) + 1) * (Math.PI / 4);
    p.order = (i % 8) / 8;
  });
  const delta = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const c = new THREE.Vector3();
  const intro = introRunner(pieces, {
    duration: 1.6,
    hidden: [parts.bolt, orbit],
    frame: (t) => {
      mandala.scale.setScalar(1 + (1 - clamp01(t / 1.4)) * 6);
    },
    end: () => mandala.scale.setScalar(1),
    place: (p, t) => {
      const s = clamp01((t - 0.05 - p.order * 0.3) / 1.1);
      const e = easeInOut(s);
      const theta = p.theta * (1 - e) + (1 - e) * t * 3;
      // Rotation du centre de la pièce autour de l'axe du canon (x, y = 16).
      c.copy(p.center).sub(GUN_MID);
      const out = (1 - e) * 140;
      const cy = c.y;
      const cz = c.z;
      const len = Math.hypot(cy, cz) || 1;
      const ny = cy + (cy / len) * out;
      const nz = cz + (cz / len) * out + (1 - e) * 40;
      delta.set(0, ny * Math.cos(theta) - nz * Math.sin(theta) - cy, ny * Math.sin(theta) + nz * Math.cos(theta) - cz);
      rot.setFromAxisAngle(X, theta);
      placePart(p, 0.5 + 0.5 * e, delta, rot);
    },
  });

  return {
    muzzleX: 1172,
    replayIntro: intro.start,
    introDuration: intro.duration,
    update: (dt, t, flare) => {
      time += dt;
      springStep(spin, 0, 8, dt);
      mandala.rotation.x = time * 0.6 + spin.x;
      prisms.forEach((p, i) => {
        springStep(p.push, 0, 30, dt);
        p.a += dt * (0.35 + spin.x * 0.2);
        const r = 70 + p.push.x;
        p.m.position.set(600 + Math.cos(p.a) * 420, -50 + Math.sin(p.a * 2 + i) * 18, -60 + Math.sin(p.a) * r * 0.4);
        p.m.rotation.set(time * 0.9 + i, time * 0.6, i);
      });
      const now = performance.now();
      bursts.forEach((b) => {
        if (b.born < 0) return;
        const k = (now - b.born) / 380;
        if (k >= 1) {
          b.born = -1;
          b.m.visible = false;
          return;
        }
        b.m.visible = true;
        b.m.scale.setScalar(0.01 + easeOutCubic(k) * b.reach);
        b.m.material.uniforms.uOpacity.value = 1 - k;
      });
      glass.update(dt);
      intro.update(dt);
    },
    onFire: () => {
      spin.v += 10;
      prisms.forEach((p) => (p.push.v += 90));
      mouth.getWorldPosition(tmp);
      body.getWorldQuaternion(quat);
      [0.06, 0.1].forEach((reach) => {
        const b = bursts[burstCursor];
        burstCursor = (burstCursor + 1) % bursts.length;
        b.born = performance.now() + (reach > 0.07 ? 40 : 0);
        b.reach = reach;
        b.m.position.copy(tmp);
        b.m.quaternion.copy(quat);
      });
      for (let i = 0; i < 12; i += 1) {
        glass.spawn(new THREE.Mesh(shardGeo, prismMats[i % 5]), tmp, new THREE.Vector3(0.5 + Math.random(), (Math.random() - 0.3) * 1.2, (Math.random() - 0.5) * 1.3).applyQuaternion(quat), { life: 700, gravity: -4, drag: 1, spin: 14 });
      }
    },
  };
}

// =============================================================================
// MARBRE — sculptée dans du marbre de Carrare veiné d'or, frise grecque dorée,
// cannelures dorées, couronne de laurier autour du canon, volutes ioniques à
// l'avant du garde-main, poussière de marbre en suspension. Au tir : éclats de
// marbre et feuilles de laurier d'or. Apparition : un bloc de marbre brut
// entoure l'arme et s'effrite morceau par morceau sous le ciseau.
// =============================================================================

function marbleVeins(ctx, area, rand, glow) {
  for (let i = 0; i < 70; i += 1) {
    let x = area.minX + rand() * (area.maxX - area.minX);
    let y = area.minY + rand() * (area.maxY - area.minY);
    let a = rand() * Math.PI * 2;
    const goldVein = rand() < 0.14;
    if (glow && !goldVein) continue;
    ctx.strokeStyle = goldVein ? (glow ? '#ffcf70' : '#c9a04a') : `rgba(90,90,100,${0.15 + rand() * 0.35})`;
    ctx.lineWidth = goldVein ? 1 + rand() : 0.4 + rand() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 40; k += 1) {
      a += (rand() - 0.5) * 0.6;
      x += Math.cos(a) * 6;
      y += Math.sin(a) * 3;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function meander(ctx, x0, x1, y, h) {
  const s = h / 4;
  ctx.beginPath();
  for (let x = x0; x < x1; x += s * 4) {
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + s * 3, y + h);
    ctx.lineTo(x + s * 3, y + s);
    ctx.lineTo(x + s, y + s);
    ctx.lineTo(x + s, y + s * 2);
    ctx.lineTo(x + s * 2, y + s * 2);
    ctx.moveTo(x, y);
    ctx.lineTo(x + s * 4, y);
  }
  ctx.stroke();
}

function marbleFinish(env, geo) {
  const u = geo.uniforms;
  const color = livery('marble-color', (ctx) => {
    const rand = seeded(3301);
    speckle(ctx, S_LIVERY, 20000, ['rgba(200,200,205,0.35)', 'rgba(255,255,255,0.6)'], 0.8, rand);
    marbleVeins(ctx, S_LIVERY, seeded(3302), false);
    ctx.strokeStyle = '#c9a04a';
    ctx.lineWidth = 1.2;
    meander(ctx, 640, 940, -26, 10);
    meander(ctx, 20, 230, -76, 10);
  }, { background: '#f2f0ec', color: true });
  const glow = livery('marble-glow', (ctx) => {
    marbleVeins(ctx, S_LIVERY, seeded(3302), true);
    ctx.strokeStyle = '#ffcf70';
    ctx.lineWidth = 1.2;
    meander(ctx, 640, 940, -26, 10);
    meander(ctx, 20, 230, -76, 10);
  }, { background: '#000000', color: true });
  const marble = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.9, map: color, roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.1, sheen: 0.3, sheenColor: new THREE.Color(0xffffff), emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.5 }),
    u,
    'totalEmissiveRadiance *= 0.5 + 0.7 * pow(0.5 + 0.5 * sin(vEmissiveMapUv.x * 14.0 - uTime * 1.2), 6.0) + uFlare * 1.5;',
  );
  const tile = tiledTexture('marble-tile', 256, (ctx, size) => {
    ctx.fillStyle = '#f2f0ec';
    ctx.fillRect(0, 0, size, size);
    marbleVeins(ctx, { minX: 0, maxX: size, minY: 0, maxY: size }, seeded(3303), false);
  }, { color: true });
  const tubeMarble = new THREE.MeshPhysicalMaterial({ envMap: env, map: tile, roughness: 0.22, clearcoat: 0.7 });
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xf2f0ec, roughness: 0.25, clearcoat: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.3, color: 0xe0b050, metalness: 1, roughness: 0.18 });
  return {
    ...sniperFaces(marble, wall),
    receiver: tubeMarble,
    barrel: tubeMarble,
    scope: tubeMarble,
    lens: new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x2a2010, metalness: 0.6, roughness: 0.05, clearcoat: 1 }),
    metal: gold,
    dark: gold,
    brass: gold,
    flash: 'gold',
    light: 0xffe0a0,
    smoke: 0xf4f0e8,
    makeShell: () => new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.02, 12), new THREE.MeshStandardMaterial({ color: 0xe0b050, metalness: 1, roughness: 0.2 })),
    decorate: (ctx) => decorateMarble({ ...ctx, env, gold, wall }),
  };
}

function laurelLeaf() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(4, 7, 0, 16);
  s.quadraticCurveTo(-4, 7, 0, 0);
  return new THREE.ShapeGeometry(s);
}

function decorateMarble({ body, add, scene, parts, env, gold, wall }) {
  parts.flutes.forEach((f) => (f.material = gold));
  // Couronne de laurier d'or autour du canon.
  const leafGeo = laurelLeaf();
  const leafMat = new THREE.MeshStandardMaterial({ envMap: env, color: 0xe0b050, metalness: 1, roughness: 0.25, side: THREE.DoubleSide });
  const wreath = new THREE.Group();
  wreath.position.set(1070, 16, 0);
  body.add(wreath);
  const leaves = [];
  for (let k = 0; k < 22; k += 1) {
    const a = (k / 22) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.rotation.x = a;
    wreath.add(pivot);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(0, 15, 0);
    leaf.rotation.set(0.5, k % 2 ? 0.6 : -0.6, (k % 2 ? 1 : -1) * 0.9);
    pivot.add(leaf);
    leaves.push(leaf);
  }
  add(new THREE.TorusGeometry(15, 1, 8, 40), gold, 1070, 16, 0).rotation.y = Math.PI / 2;
  // Volutes ioniques à l'avant du garde-main.
  const volute = new THREE.CatmullRomCurve3(Array.from({ length: 50 }, (_, k) => {
    const t = k / 49;
    const a = t * Math.PI * 4;
    const r = 12 * (1 - t * 0.85);
    return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0);
  }));
  [-1, 1].forEach((side) => {
    const m = add(new THREE.TubeGeometry(volute, 120, 1.6, 8, false), gold, 928, -10, side * 31);
    m.rotation.y = side > 0 ? 0 : Math.PI;
  });

  // Poussière de marbre en suspension.
  const dust = particleSystem(scene, softDotTexture('marble-dust', 'rgba(255,252,245,0.9)', 'rgba(255,252,245,0)'), { max: 160 });
  const chips = meshBurst(scene, { max: 70 });
  const chipGeo = new THREE.TetrahedronGeometry(0.004);
  const worldLeaf = laurelLeaf();
  worldLeaf.scale(0.0012, 0.0012, 0.0012);
  const drift = anchorAt(body, 0, 0, 0);
  const mouth = anchorAt(body, 1192, 16, 0);
  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  let time = 0;
  let dustClock = 0;

  // Apparition : bloc de marbre brut qui s'effrite sous le ciseau.
  const block = new THREE.Group();
  block.visible = false;
  body.add(block);
  const rough = tiledTexture('marble-rough', 128, (ctx, size) => {
    ctx.fillStyle = '#e8e4dc';
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, { minX: 0, maxX: size, minY: 0, maxY: size }, 3000, ['rgba(120,115,110,0.3)', 'rgba(255,255,255,0.5)'], 1.5, seeded(3304));
  }, { color: true });
  const blockMat = new THREE.MeshStandardMaterial({ map: rough, roughness: 0.95, flatShading: true });
  const chunks = [];
  for (let i = 0; i < 8; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      for (let k = 0; k < 2; k += 1) {
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), blockMat);
        m.scale.set(95, 70, 30);
        m.position.set(-20 + i * 155 + 70, -70 + j * 110 + 20, k ? 25 : -25);
        block.add(m);
        chunks.push({ m, base: m.position.clone(), at: 0.1 + ((i * 7 + j * 3 + k * 5) % 16) / 16 * 1.1, dir: new THREE.Vector3((i - 3.5) * 0.3, j ? 1 : -0.6, k ? 1 : -1).normalize() });
      }
    }
  }
  const intro = introRunner([], {
    duration: 1.6,
    start: () => {
      block.visible = true;
      chunks.forEach((c) => {
        c.m.position.copy(c.base);
        c.m.visible = true;
        c.gone = false;
      });
    },
    end: () => (block.visible = false),
    frame: (t) => {
      chunks.forEach((c) => {
        const k = (t - c.at) / 0.4;
        if (k <= 0) return;
        if (!c.gone) {
          c.gone = true;
          body.localToWorld(tmp.copy(c.base));
          for (let i = 0; i < 6; i += 1) dust.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.5, (Math.random() - 0.5) * 0.6), { life: 800, size: 0.014, grow: 2, drag: 2, additive: false, peak: 0.7 });
        }
        c.m.position.copy(c.base).addScaledVector(c.dir, easeOutCubic(Math.min(1, k)) * 260);
        c.m.rotation.set(k * 3, k * 2, 0);
        c.m.visible = k < 1;
      });
    },
    place: () => {},
  });

  return {
    replayIntro: intro.start,
    introDuration: intro.duration,
    update: (dt, t, flare) => {
      time += dt;
      leaves.forEach((l, i) => (l.rotation.x = 0.5 + Math.sin(time * 2.2 + i) * 0.06));
      wreath.rotation.x = Math.sin(time * 0.4) * 0.1;
      dustClock += dt;
      if (dustClock > 0.12) {
        dustClock = 0;
        drift.position.set(Math.random() * 1150, -80 + Math.random() * 120, -60 + Math.random() * 40);
        drift.getWorldPosition(tmp);
        dust.spawn(tmp, new THREE.Vector3(0, 0.01, 0), { life: 2000, size: 0.0022, drag: 0.5, additive: false, peak: 0.5 });
      }
      dust.update(dt);
      chips.update(dt);
      intro.update(dt);
    },
    onFire: () => {
      mouth.getWorldPosition(tmp);
      body.getWorldQuaternion(quat);
      for (let i = 0; i < 10; i += 1) {
        chips.spawn(new THREE.Mesh(chipGeo, wall), tmp, new THREE.Vector3(0.5 + Math.random(), (Math.random() - 0.3) * 1.1, (Math.random() - 0.5) * 1.3).applyQuaternion(quat), { life: 700, gravity: -6, drag: 1, spin: 14 });
      }
      for (let i = 0; i < 6; i += 1) {
        chips.spawn(new THREE.Mesh(worldLeaf, leafMat), tmp, new THREE.Vector3(0.3 + Math.random() * 0.6, 0.2 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8).applyQuaternion(quat), { life: 1400, gravity: -0.8, drag: 2, spin: 8, shrink: false });
      }
      for (let i = 0; i < 4; i += 1) dust.spawn(tmp, new THREE.Vector3(0.2, 0.08, 0).applyQuaternion(quat), { life: 700, size: 0.02, grow: 2, drag: 2, additive: false, peak: 0.6 });
    },
  };
}

// =============================================================================
// TISSEUSE — soie indigo brodée d'arabesques d'or. Des fils d'or tendus entre
// des chevilles courent le long des flancs comme des cordes de harpe et
// vibrent ; une bobine tourne sur la crosse, une navette file sous le
// garde-main. Au tir : les cordes sont pincées, des fils d'or s'échappent.
// Apparition : des fils partent d'un fuseau et tissent chaque pièce.
// =============================================================================

function tisseuseFinish(env, geo) {
  const u = geo.uniforms;
  const vines = (ctx, glow) => {
    const rand = seeded(3401);
    ctx.strokeStyle = glow ? '#ffcf70' : '#d9a55a';
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 26; i += 1) {
      let x = S_LIVERY.minX + rand() * SW;
      let y = S_LIVERY.minY + rand() * SH;
      let a = rand() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 30; k += 1) {
        a += Math.sin(k * 0.5) * 0.35;
        x += Math.cos(a) * 5;
        y += Math.sin(a) * 5;
        ctx.lineTo(x, y);
        if (k % 6 === 3) {
          ctx.moveTo(x, y);
          for (let t = 0; t < Math.PI * 1.5; t += 0.3) ctx.lineTo(x + Math.cos(a + t) * t * 2, y + Math.sin(a + t) * t * 2);
          ctx.moveTo(x, y);
        }
      }
      ctx.stroke();
    }
  };
  const color = livery('weave-color', (ctx) => {
    for (let y = S_LIVERY.minY; y < S_LIVERY.maxY; y += 1.2) {
      ctx.fillStyle = Math.floor(y / 1.2) % 2 ? '#1a1e4a' : '#161a40';
      ctx.fillRect(S_LIVERY.minX, y, SW, 1.2);
    }
    vines(ctx, false);
  }, { color: true });
  const glow = livery('weave-glow', (ctx) => vines(ctx, true), { background: '#000000', color: true });
  const weave = tiledTexture('weave-bump', 64, (ctx, size) => {
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        ctx.fillStyle = (x + y) % 8 ? '#b0b0b0' : '#606060';
        ctx.fillRect(x, y, 4, 4);
      }
    }
  }, { repeat: 1 / 2 });
  const silk = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.6, map: color, roughness: 0.55, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(0x9aa0ff), bumpMap: weave, bumpScale: 0.25, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.9 }),
    u,
    'totalEmissiveRadiance *= 0.4 + 0.8 * pow(0.5 + 0.5 * sin(vEmissiveMapUv.x * 30.0 + vEmissiveMapUv.y * 10.0 - uTime * 2.0), 5.0) + uFlare * 1.5;',
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x1a1e4a, roughness: 0.55, sheen: 1, sheenColor: new THREE.Color(0x9aa0ff) });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.3, color: 0xe0b050, metalness: 1, roughness: 0.2 });
  const wrapped = bandTexture('weave-wrap', (ctx, size) => {
    ctx.fillStyle = '#1a1e4a';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#d9a55a';
    for (let y = 0; y < size; y += 6) ctx.fillRect(0, y, size, 2);
  }, 3);
  return {
    ...sniperFaces(silk, wall),
    receiver: new THREE.MeshPhysicalMaterial({ envMap: env, map: wrapped, roughness: 0.5, sheen: 0.8, sheenColor: new THREE.Color(0xffd080) }),
    barrel: gold,
    scope: new THREE.MeshPhysicalMaterial({ envMap: env, map: wrapped, roughness: 0.5, sheen: 0.8, sheenColor: new THREE.Color(0xffd080) }),
    lens: new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x2a2a60, metalness: 0.4, roughness: 0.05, clearcoat: 1 }),
    metal: gold,
    dark: new THREE.MeshStandardMaterial({ color: 0x0a0a1a, roughness: 0.9 }),
    brass: gold,
    flash: 'gold',
    light: 0xffd080,
    smoke: 0xe8e0ff,
    decorate: (ctx) => decorateTisseuse({ ...ctx, env, gold }),
  };
}

function decorateTisseuse({ body, add, scene, parts, env, gold }) {
  const threadMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  // Cordes de harpe : chevilles en haut et en bas des flancs, fil tendu entre.
  const strings = [];
  const harp = (x0, x1, yTop, yBot, z, count) => {
    for (let k = 0; k < count; k += 1) {
      const x = x0 + ((x1 - x0) * k) / (count - 1);
      const top = yTop(x);
      const bot = yBot(x);
      [top, bot].forEach((y) => add(new THREE.CylinderGeometry(1.4, 1.4, 4, 10), gold, x, y, z).rotation.x = Math.PI / 2);
      const len = top - bot;
      const geo = new THREE.CylinderGeometry(0.35, 0.35, len, 4, 12);
      const m = add(geo, threadMat, x, (top + bot) / 2, z - 1.5);
      strings.push({ m, baseZ: z - 1.5, amp: { x: 0, v: 0 }, freq: 18 + k * 2.5, phase: k });
    }
  };
  harp(660, 920, () => 6, () => -24, -30, 10);
  harp(40, 200, (x) => 28 - x * 0.04, (x) => -40 - (200 - x) * 0.18, -21.5, 7);
  // Bobine sur le flanc de la crosse.
  const spoolTex = tiledTexture('weave-spool', 64, (ctx, size) => {
    ctx.fillStyle = '#d9a55a';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#8a6a2a';
    for (let y = 0; y < size; y += 3) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + 2);
      ctx.stroke();
    }
  }, { color: true });
  const spool = new THREE.Group();
  spool.position.set(250, -6, -30);
  body.add(spool);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 12, 24), new THREE.MeshStandardMaterial({ map: spoolTex, roughness: 0.6 }));
  core.rotation.x = Math.PI / 2;
  spool.add(core);
  [-7, 7].forEach((z) => {
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 1.6, 24), gold);
    flange.rotation.x = Math.PI / 2;
    flange.position.z = z;
    spool.add(flange);
  });
  // Fil qui part de la bobine vers le garde-main, et navette qui le parcourt.
  const feed = new THREE.CatmullRomCurve3([new THREE.Vector3(250, -15, -38), new THREE.Vector3(450, -60, -44), new THREE.Vector3(660, -34, -36)]);
  add(new THREE.TubeGeometry(feed, 40, 0.35, 4, false), threadMat, 0, 0, 0);
  const shuttle = new THREE.Mesh(new THREE.CapsuleGeometry(2.4, 14, 4, 10), gold);
  shuttle.rotation.z = Math.PI / 2;
  body.add(shuttle);
  // Rosace de fil à la bouche.
  const knot = add(new THREE.TorusKnotGeometry(9, 1.2, 120, 8, 3, 7), gold, 1200, 16, 0);
  knot.rotation.y = Math.PI / 2;

  const filaments = meshBurst(scene, { max: 50 });
  const filGeo = new THREE.CylinderGeometry(0.0003, 0.0003, 0.03, 3);
  const glitter = particleSystem(scene, softDotTexture('weave-glitter', 'rgba(255,240,190,1)', 'rgba(255,200,90,0)'), { max: 100 });
  const mouth = anchorAt(body, 1205, 16, 0);
  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  let time = 0;
  let shuttleT = 0;

  // Apparition : fils tendus depuis un fuseau vers chaque pièce qui se tisse.
  const SPINDLE = new THREE.Vector3(600, -150, -140);
  const spindle = new THREE.Mesh(new THREE.ConeGeometry(6, 40, 16), gold);
  spindle.position.copy(SPINDLE);
  spindle.visible = false;
  body.add(spindle);
  const pieces = capture(body, parts, [spool, spindle]);
  orderBy(pieces, (p) => Math.abs(p.center.x - 600));
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = pieces.map((p) => {
    const g = new THREE.BufferGeometry().setFromPoints([SPINDLE, p.center]);
    const l = new THREE.Line(g, lineMat);
    l.visible = false;
    l.frustumCulled = false;
    body.add(l);
    return l;
  });
  const intro = introRunner(pieces, {
    duration: 1.7,
    hidden: [parts.bolt, spool],
    start: () => (spindle.visible = true),
    end: () => {
      spindle.visible = false;
      lines.forEach((l) => (l.visible = false));
    },
    frame: (t) => {
      spindle.rotation.y = t * 30;
      spindle.visible = t < 1.55;
      lineMat.opacity = 1 - clamp01((t - 1.3) / 0.35);
    },
    place: (p, t) => {
      const i = pieces.indexOf(p);
      const s = clamp01((t - 0.1 - p.order * 0.9) / 0.5);
      lines[i].visible = s > 0;
      p.object.visible = s > 0;
      if (s <= 0) return;
      placePart(p, easeOutBack(s), ZERO);
    },
  });

  return {
    replayIntro: intro.start,
    introDuration: intro.duration,
    update: (dt, t, flare) => {
      time += dt;
      strings.forEach((s) => {
        springStep(s.amp, 0, 4, dt);
        const a = 0.15 + Math.max(0, s.amp.x) * 3;
        s.m.scale.set(1 + Math.abs(Math.sin(time * s.freq + s.phase)) * a, 1, 1);
        s.m.position.z = s.baseZ + Math.sin(time * s.freq * 1.3 + s.phase) * a * 0.6;
      });
      spool.rotation.z = time * 1.2;
      shuttleT += dt * 0.35;
      const k = 0.5 + 0.5 * Math.sin(shuttleT * Math.PI * 2);
      feed.getPoint(k, tmp);
      shuttle.position.copy(tmp);
      threadMat.color.setRGB(1, 0.82, 0.48).multiplyScalar(1 + flare);
      knot.rotation.x = time * 0.8;
      filaments.update(dt);
      glitter.update(dt);
      intro.update(dt);
    },
    onFire: () => {
      strings.forEach((s, i) => (s.amp.v += 2 + (i % 3)));
      mouth.getWorldPosition(tmp);
      body.getWorldQuaternion(quat);
      for (let i = 0; i < 10; i += 1) {
        filaments.spawn(new THREE.Mesh(filGeo, threadMat), tmp, new THREE.Vector3(0.4 + Math.random() * 0.8, (Math.random() - 0.3) * 0.8, (Math.random() - 0.5) * 1).applyQuaternion(quat), { life: 900, gravity: -1.5, drag: 1.5, spin: 10, shrink: true });
      }
      for (let i = 0; i < 14; i += 1) glitter.spawn(tmp, new THREE.Vector3(0.3 + Math.random() * 0.6, (Math.random() - 0.3) * 0.6, (Math.random() - 0.5) * 0.7).applyQuaternion(quat), { life: 600, size: 0.0026, drag: 2 });
    },
  };
}

// =============================================================================
// CORSAIRE — bois de navire usé cloué, ferrures en laiton, carcasse en fer
// riveté, lunette-longue-vue en laiton gainée de cuir, cordages enroulés,
// boussole dont l'aiguille cherche le nord, pavillon noir qui claque sous le
// garde-main, doublon au bout d'une chaîne, bouche en gueule de canon. Au tir :
// fumée de canon, pluie de pièces d'or, la boussole s'affole. Apparition : un
// coffre au trésor s'ouvre et l'arme en jaillit pièce par pièce.
// =============================================================================

function corsairFinish(env, geo) {
  const u = geo.uniforms;
  const color = livery('corsair-color', (ctx) => {
    const rand = seeded(3501);
    // Planches de bois patiné, fil du bois et clous.
    for (let y = S_LIVERY.minY; y < S_LIVERY.maxY; y += 18) {
      ctx.fillStyle = ['#4a3020', '#553624', '#3f281a'][Math.floor(rand() * 3)];
      ctx.fillRect(S_LIVERY.minX, y, SW, 18);
      for (let k = 0; k < 14; k += 1) {
        ctx.strokeStyle = `rgba(20,10,4,${0.2 + rand() * 0.3})`;
        ctx.lineWidth = 0.5 + rand();
        const yy = y + rand() * 18;
        ctx.beginPath();
        ctx.moveTo(S_LIVERY.minX, yy);
        for (let x = S_LIVERY.minX; x < S_LIVERY.maxX; x += 30) ctx.lineTo(x, yy + Math.sin(x * 0.02 + k) * 1.5);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(S_LIVERY.minX, y, SW, 0.8);
      for (let x = S_LIVERY.minX + 20; x < S_LIVERY.maxX; x += 90 + rand() * 60) {
        ctx.fillStyle = '#8a8a8a';
        ctx.beginPath();
        ctx.arc(x, y + 4, 1.2, 0, Math.PI * 2);
        ctx.arc(x, y + 14, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    speckle(ctx, S_LIVERY, 8000, ['rgba(0,0,0,0.2)', 'rgba(200,170,120,0.1)'], 0.8, seeded(3502));
  }, { color: true });
  const wood = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.4, map: color, bumpMap: color, bumpScale: 1, roughness: 0.8 });
  const wall = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.4, color: 0x4a3020, roughness: 0.85 });
  const iron = new THREE.MeshStandardMaterial({ envMap: env, color: 0x2a2826, metalness: 0.85, roughness: 0.5 });
  const brass = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.2, color: 0xc99a45, metalness: 1, roughness: 0.3 });
  const spyglass = bandTexture('corsair-spyglass', (ctx, size) => {
    ctx.fillStyle = '#c99a45';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#5a3418';
    ctx.fillRect(0, size * 0.25, size, size * 0.5);
    ctx.strokeStyle = '#3a2008';
    for (let x = 0; x < size; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, size * 0.25);
      ctx.lineTo(x + 8, size * 0.75);
      ctx.stroke();
    }
  }, 2);
  return {
    ...sniperFaces(wood, wall),
    receiver: iron,
    barrel: iron,
    scope: new THREE.MeshStandardMaterial({ envMap: env, map: spyglass, metalness: 0.7, roughness: 0.35 }),
    lens: new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x6a8aa0, metalness: 0.3, roughness: 0.05, clearcoat: 1 }),
    metal: brass,
    dark: new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.9 }),
    brass,
    flash: 'ember',
    light: 0xffa050,
    smoke: 0x6a6660,
    makeShell: () => new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.0014, 18), new THREE.MeshStandardMaterial({ color: 0xe0b040, metalness: 1, roughness: 0.25 })),
    decorate: (ctx) => decorateCorsair({ ...ctx, env, brass, iron, u }),
  };
}

function decorateCorsair({ body, add, scene, parts, env, brass, iron, u }) {
  hideMuzzle(body, parts);
  // Rivets sur la carcasse et gueule de canon à la bouche.
  for (let x = 340; x < 640; x += 24) [-1, 1].forEach((s) => add(new THREE.SphereGeometry(2, 8, 6), brass, x, 27.9, s * 17.4));
  const muzzle = add(new THREE.LatheGeometry([new THREE.Vector2(13, 0), new THREE.Vector2(13, 30), new THREE.Vector2(17, 40), new THREE.Vector2(20, 50), new THREE.Vector2(14, 52), new THREE.Vector2(9, 50)], 32), iron, 1110, 16, 0);
  muzzle.rotation.z = -Math.PI / 2;
  [1122, 1138].forEach((x) => add(new THREE.TorusGeometry(14, 1.8, 8, 32), brass, x, 16, 0).rotation.y = Math.PI / 2);

  // Cordages enroulés autour du garde-main et du col de crosse.
  const ropeTex = tiledTexture('corsair-rope', 64, (ctx, size) => {
    ctx.fillStyle = '#b89868';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#6a5030';
    ctx.lineWidth = 6;
    for (let k = -2; k < 3; k += 1) {
      ctx.beginPath();
      ctx.moveTo(k * size * 0.5, size);
      ctx.lineTo(k * size * 0.5 + size, 0);
      ctx.stroke();
    }
  }, { color: true });
  ropeTex.repeat.set(60, 1);
  const ropeMat = new THREE.MeshStandardMaterial({ map: ropeTex, roughness: 0.9 });
  const coil = (x0, len, y, r, turns) => new THREE.CatmullRomCurve3(Array.from({ length: turns * 16 + 1 }, (_, k) => {
    const a = (k / 16) * Math.PI * 2;
    return new THREE.Vector3(x0 + (k / (turns * 16)) * len, y + Math.cos(a) * r, Math.sin(a) * r * 1.15);
  }));
  add(new THREE.TubeGeometry(coil(880, 50, -8, 27, 7), 400, 2.6, 6, false), ropeMat, 0, 0, 0);
  add(new THREE.TubeGeometry(coil(262, 36, -4, 24, 5), 300, 2.4, 6, false), ropeMat, 0, 0, 0);

  // Boussole sur le flanc gauche de la crosse.
  const compass = new THREE.Group();
  compass.position.set(150, 4, -22);
  compass.rotation.y = Math.PI;
  body.add(compass);
  const face = tiledTexture('corsair-compass', 256, (ctx, size) => {
    const c = size / 2;
    ctx.fillStyle = '#efe2c0';
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a2410';
    for (let k = 0; k < 16; k += 1) {
      const a = (k / 16) * Math.PI * 2;
      const long = k % 4 === 0;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + Math.cos(a - 0.08) * c * 0.2, c + Math.sin(a - 0.08) * c * 0.2);
      ctx.lineTo(c + Math.cos(a) * c * (long ? 0.85 : 0.55), c + Math.sin(a) * c * (long ? 0.85 : 0.55));
      ctx.fill();
    }
    ctx.font = 'bold 30px Georgia';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ['N', 'E', 'S', 'O'].forEach((l, k) => ctx.fillText(l, c + Math.sin((k * Math.PI) / 2) * c * 0.72, c - Math.cos((k * Math.PI) / 2) * c * 0.72));
  }, { color: true });
  compass.add(new THREE.Mesh(new THREE.CircleGeometry(15, 40), new THREE.MeshStandardMaterial({ map: face, roughness: 0.7 })));
  compass.add(new THREE.Mesh(new THREE.TorusGeometry(15.5, 2.2, 10, 40), brass));
  const needle = new THREE.Group();
  needle.position.z = 1;
  compass.add(needle);
  needle.add(triMeshC([[-1.6, 0, 0], [1.6, 0, 0], [0, 12, 0]], new THREE.MeshBasicMaterial({ color: 0xb8261e })));
  needle.add(triMeshC([[-1.6, 0, 0], [0, -12, 0], [1.6, 0, 0]], new THREE.MeshBasicMaterial({ color: 0x1a1a1a })));
  const lid = new THREE.Mesh(new THREE.SphereGeometry(15, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, roughness: 0, clearcoat: 1, depthWrite: false }));
  lid.rotation.x = Math.PI / 2;
  lid.scale.y = 0.25;
  compass.add(lid);
  const needleState = { x: 0, v: 0 };

  // Pavillon noir qui claque sous le garde-main.
  const flagTex = tiledTexture('corsair-flag', 256, (ctx, size) => {
    ctx.fillStyle = '#101010';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#e8e2d0';
    const c = size / 2;
    ctx.beginPath();
    ctx.arc(c, c - 20, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(c - 26, c + 10, 52, 22);
    ctx.fillStyle = '#101010';
    [-16, 16].forEach((dx) => {
      ctx.beginPath();
      ctx.arc(c + dx, c - 22, 11, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillRect(c - 3, c - 6, 6, 10);
    ctx.strokeStyle = '#e8e2d0';
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    [[-1, 1], [1, -1]].forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(c + a * 80, c + 70);
      ctx.lineTo(c - a * 80, c + 70 + b * 0 + 50);
      ctx.stroke();
    });
    for (let i = 0; i < 12; i += 1) ctx.clearRect(size - 14 + Math.random() * 14, Math.random() * size, 14, 8);
  }, { color: true });
  const flagMat = patchShader(
    new THREE.MeshStandardMaterial({ map: flagTex, roughness: 0.9, side: THREE.DoubleSide, transparent: true, alphaTest: 0.1 }),
    u,
    { vertex: 'float w = (position.x + 40.0) / 80.0; transformed.z += sin(position.x * 0.09 - uTime * 7.0) * 6.0 * w + uFlare * sin(position.x * 0.2) * 5.0 * w; transformed.y += sin(position.x * 0.05 - uTime * 5.0) * 2.0 * w;' },
  );
  flagMat.customProgramCacheKey = () => 'corsair-flag';
  const flag = add(new THREE.PlaneGeometry(80, 52, 24, 8), flagMat, 800, -62, -32);
  flag.rotation.y = Math.PI;
  add(new THREE.CylinderGeometry(1.2, 1.2, 60, 8), brass, 760, -60, -32);

  // Doublon au bout d'une chaîne, sous la crosse.
  const charm = new THREE.Group();
  charm.position.set(220, -60, -20);
  body.add(charm);
  for (let k = 0; k < 5; k += 1) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.6, 6, 12), brass);
    link.position.y = -k * 4.2;
    link.rotation.y = k % 2 ? Math.PI / 2 : 0;
    charm.add(link);
  }
  const doubloon = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 1.6, 24), new THREE.MeshStandardMaterial({ envMap: env, color: 0xe8b840, metalness: 1, roughness: 0.2, emissive: 0x6a4a10, emissiveIntensity: 0.3 }));
  doubloon.rotation.x = Math.PI / 2;
  doubloon.position.y = -30;
  charm.add(doubloon);
  const charmSwing = { x: 0, v: 0 };

  const smoke = particleSystem(scene, softDotTexture('corsair-smoke', 'rgba(170,165,158,0.8)', 'rgba(170,165,158,0)'), { max: 60 });
  const coins = meshBurst(scene, { max: 50 });
  const coinGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.001, 14);
  const coinMat = new THREE.MeshStandardMaterial({ envMap: env, color: 0xe8b840, metalness: 1, roughness: 0.2 });
  const mouth = anchorAt(body, 1165, 16, 0);
  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  let time = 0;

  // Apparition : coffre au trésor qui s'ouvre, l'arme en jaillit.
  const CHEST = new THREE.Vector3(560, -160, -60);
  const chest = new THREE.Group();
  chest.position.copy(CHEST);
  chest.visible = false;
  body.add(chest);
  chest.add(new THREE.Mesh(new RoundedBoxGeometry(160, 70, 90, 2, 4), new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.85 })));
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 35, -45);
  chest.add(lidPivot);
  const chestLid = new THREE.Mesh(new THREE.CylinderGeometry(45, 45, 160, 20, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.85 }));
  chestLid.rotation.z = Math.PI / 2;
  chestLid.position.z = 45;
  lidPivot.add(chestLid);
  [-60, 60].forEach((x) => {
    const band = new THREE.Mesh(new THREE.BoxGeometry(8, 72, 92), brass);
    band.position.x = x;
    chest.add(band);
  });
  const treasureGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture('corsair-gold', 'rgba(255,220,120,1)', 'rgba(255,170,40,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  treasureGlow.scale.set(260, 260, 1);
  treasureGlow.position.y = 40;
  chest.add(treasureGlow);
  const pieces = capture(body, parts, [chest, flag, charm]);
  orderBy(pieces, () => Math.random());
  const delta = new THREE.Vector3();
  const spin = new THREE.Quaternion();
  const intro = introRunner(pieces, {
    duration: 1.8,
    hidden: [parts.bolt, flag, charm],
    start: () => (chest.visible = true),
    end: () => (chest.visible = false),
    frame: (t) => {
      chest.scale.setScalar(Math.max(0.01, easeOutBack(clamp01(t / 0.25)) * (1 - clamp01((t - 1.5) / 0.3))));
      lidPivot.rotation.x = -easeOutBack(clamp01((t - 0.25) / 0.25)) * 1.9;
      treasureGlow.material.opacity = clamp01((t - 0.3) / 0.2) * (1 - clamp01((t - 1.3) / 0.4));
      if (t > 0.35 && t < 1.2 && Math.random() < 0.5) {
        chest.localToWorld(tmp.set((Math.random() - 0.5) * 100, 40, (Math.random() - 0.5) * 60));
        coins.spawn(new THREE.Mesh(coinGeo, coinMat), tmp, new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.2 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8), { life: 900, gravity: -6, drag: 0.3, spin: 14, shrink: false });
      }
    },
    place: (p, t) => {
      const s = clamp01((t - 0.4 - p.order * 0.8) / 0.55);
      p.object.visible = s > 0;
      if (s <= 0) return;
      const e = easeOutCubic(s);
      delta.copy(CHEST).sub(p.center).multiplyScalar(1 - e);
      delta.y += Math.sin(s * Math.PI) * 180;
      spin.setFromAxisAngle(X, (1 - e) * 6);
      placePart(p, 0.15 + 0.85 * e, delta, spin);
    },
  });

  return {
    muzzleX: 1166,
    replayIntro: intro.start,
    introDuration: intro.duration,
    update: (dt, t, flare) => {
      time += dt;
      springStep(needleState, 0, 14, dt);
      needle.rotation.z = Math.sin(time * 0.7) * 0.25 + Math.sin(time * 2.9) * 0.05 + needleState.x;
      springStep(charmSwing, 0, 12, dt);
      charm.rotation.z = Math.sin(time * 1.5) * 0.12 + charmSwing.x * 0.5;
      doubloon.rotation.z = time * 0.8;
      smoke.update(dt);
      coins.update(dt);
      intro.update(dt);
    },
    onFire: () => {
      needleState.v += (Math.random() - 0.5) * 60;
      charmSwing.v += 8;
      mouth.getWorldPosition(tmp);
      body.getWorldQuaternion(quat);
      for (let i = 0; i < 10; i += 1) smoke.spawn(tmp, new THREE.Vector3(0.3 + Math.random() * 0.5, 0.05 + Math.random() * 0.15, (Math.random() - 0.5) * 0.3).applyQuaternion(quat), { life: 1500, size: 0.03, grow: 3, drag: 2, additive: false, peak: 0.55 });
      for (let i = 0; i < 8; i += 1) coins.spawn(new THREE.Mesh(coinGeo, coinMat), tmp, new THREE.Vector3(0.2 + Math.random() * 0.6, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 0.9).applyQuaternion(quat), { life: 1000, gravity: -7, drag: 0.4, spin: 16, shrink: false });
    },
  };
}

function triMeshC(points, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

export const SNIPER_TRANSCENDENT_SET = {
  locomotive: { labelKey: 'aimTrainer.skinLocomotive', build: locomotiveFinish },
  kaleidoscope: { labelKey: 'aimTrainer.skinKaleidoscope', build: kaleidoFinish },
  marble: { labelKey: 'aimTrainer.skinMarble', build: marbleFinish },
  weaver: { labelKey: 'aimTrainer.skinWeaver', build: tisseuseFinish },
  corsair: { labelKey: 'aimTrainer.skinCorsair', build: corsairFinish },
};
