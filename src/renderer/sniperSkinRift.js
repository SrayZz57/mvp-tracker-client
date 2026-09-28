import * as THREE from 'three';
import { seeded, speckle, tiledTexture, softDotTexture, springStep, anchorAt, meshBurst, extrude } from './weaponKit.js';
import { S_LIVERY, livery } from './sniperSkins.js';
import { captureParts, placePart, restorePart, shockRings, faceCamera, RIFT_GLSL, easeOutCubic, easeInOut, clamp01 } from './transcendentKit.js';

// FAILLE — palier Transcendant de l'Operator. Une coque d'obsidienne fendue
// sur toute sa longueur : par la fissure on voit une autre dimension (fond
// calculé en espace écran, il ne suit pas l'arme). Des éclats de la coque
// lévitent contre le flanc, la bouche est un portail, les lentilles de la
// lunette sont des vortex. Au tir, la réalité se déchire le long de la
// trajectoire. À l'apparition, une faille s'ouvre dans l'air et l'arme en sort.
//
// Repère : x vers la bouche (plaque de couche à 0), axe du canon y = 16,
// lunette y = 78 (ligne de visée) : rien ne monte au-dessus de y ≈ 30.

const VIOLET = new THREE.Color(0xa45cff);
const TEAL = new THREE.Color(0x3cf2d8);
const PORTAL = new THREE.Vector3(1150, 16, 0);
const SLIT = new THREE.Vector3(600, 16, -80);
const INTRO = 1.7;

const SPACE_A = 'vec3(0.45, 0.15, 0.95)';
const SPACE_B = 'vec3(0.3, 1.0, 0.88)';

// Matériau standard dont l'émissif (canal R = intérieur de la fissure, G = lèvres)
// ouvre sur l'autre dimension.
function riftSurface(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uFlare = uniforms.uFlare;
    shader.fragmentShader = `uniform float uTime;\nuniform float uFlare;\n${RIFT_GLSL}\n${shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      vec3 riftMask = totalEmissiveRadiance;
      vec3 space = riftSpace(gl_FragCoord.xy, uTime, ${SPACE_A}, ${SPACE_B});
      float lip = 0.75 + 0.25 * sin(uTime * 2.2 + vEmissiveMapUv.x * 60.0);
      totalEmissiveRadiance = riftMask.r * space * (1.7 + uFlare * 2.5) + riftMask.g * vec3(0.8, 0.55, 1.0) * (lip + uFlare * 2.5);`,
    )}`;
  };
  material.customProgramCacheKey = () => 'rift-surface';
  return material;
}

// Disque-portail (lentilles, bouche, faille d'apparition) : vortex tournant sur
// le fond de l'autre dimension. `radius` : rayon du disque en unités locales.
function portalMaterial(uniforms, radius, { spin = 1.5, open = null } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uFlare: uniforms.uFlare, uOpen: open ?? { value: 1 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
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
      uniform float uOpen;
      varying vec2 vPos;
      ${RIFT_GLSL}
      void main() {
        float r = length(vPos);
        float a = atan(vPos.y, vPos.x);
        float swirl = a * 3.0 + uTime * ${spin.toFixed(2)} + r * 7.0;
        vec3 col = riftSpace(gl_FragCoord.xy + 45.0 * vec2(cos(swirl), sin(swirl)) * (1.0 - r), uTime, ${SPACE_A}, ${SPACE_B});
        float arms = pow(0.5 + 0.5 * sin(a * 3.0 - r * 9.0 + uTime * ${(spin * 2).toFixed(2)}), 6.0) * (1.0 - r);
        col += vec3(0.75, 0.6, 1.0) * arms * 0.7;
        col += vec3(1.0) * pow(max(0.0, 1.0 - r * 3.0), 3.0) * (0.8 + uFlare * 2.0);
        float rim = smoothstep(0.8, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
        col += vec3(0.8, 0.5, 1.0) * rim * (1.6 + uFlare * 2.0);
        float alpha = (1.0 - smoothstep(0.98, 1.0, r)) * uOpen;
        gl_FragColor = vec4(col * (1.0 + uFlare), alpha);
      }
    `,
  });
}

// Tracé de la fissure principale (et de ses ramifications), en mm.
function crackPaths() {
  const rand = seeded(9301);
  const paths = [];
  const main = [];
  let y = -6;
  for (let x = -12; x <= 946; x += 10 + rand() * 16) {
    y += (rand() - 0.5) * 9;
    y = Math.max(-18, Math.min(6, y));
    main.push([x, y, 4 + rand() * 5]);
  }
  paths.push(main);
  // Ramifications : vers la poignée, le chargeur, la crosse et le garde-main.
  [[20, -60, 5], [330, -120, 7], [520, -110, 5], [150, 26, 4], [760, -26, 4], [880, 8, 3], [240, -70, 5]].forEach(([tx, ty, n]) => {
    const start = main.reduce((best, p) => (Math.abs(p[0] - tx) < Math.abs(best[0] - tx) ? p : best), main[0]);
    const branch = [[start[0], start[1], start[2] * 0.8]];
    for (let k = 1; k <= n; k += 1) {
      const t = k / n;
      branch.push([start[0] + (tx - start[0]) * t + (rand() - 0.5) * 14, start[1] + (ty - start[1]) * t + (rand() - 0.5) * 8, Math.max(1.2, start[2] * 0.7 * (1 - t * 0.75))]);
    }
    paths.push(branch);
  });
  return paths;
}

function drawCracks(ctx, paths, lineOf, color) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  paths.forEach((path) => {
    for (let i = 1; i < path.length; i += 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineOf(path[i][2]);
      ctx.beginPath();
      ctx.moveTo(path[i - 1][0], path[i - 1][1]);
      ctx.lineTo(path[i][0], path[i][1]);
      ctx.stroke();
    }
  });
}

function riftFinish(env, geo) {
  const u = geo.uniforms;
  const paths = crackPaths();
  const color = livery('rift-color', (ctx) => {
    speckle(ctx, S_LIVERY, 30000, ['rgba(120,90,180,0.08)', 'rgba(0,0,0,0.25)'], 0.6, seeded(9302));
    // Veines de lave refroidie dans l'obsidienne.
    ctx.strokeStyle = 'rgba(90,60,140,0.18)';
    ctx.lineWidth = 0.6;
    const rand = seeded(9303);
    for (let i = 0; i < 90; i += 1) {
      let x = S_LIVERY.minX + rand() * 1220;
      let y = S_LIVERY.minY + rand() * 240;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 8; k += 1) {
        x += 6 + rand() * 10;
        y += (rand() - 0.5) * 6;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    drawCracks(ctx, paths, (w) => w + 3, '#2a1a40');
    drawCracks(ctx, paths, (w) => w, '#000000');
  }, { background: '#0d0b14', color: true });
  const glow = livery('rift-glow', (ctx) => {
    drawCracks(ctx, paths, (w) => w + 3.2, 'rgb(0,255,0)');
    drawCracks(ctx, paths, (w) => w, 'rgb(255,0,0)');
  }, { background: '#000000', color: true });
  const shell = riftSurface(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1.1, map: color, metalness: 0.3, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1 }),
    u,
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1.1, color: 0x0d0b14, metalness: 0.3, roughness: 0.12, clearcoat: 1 });
  const tileCracks = (key, seed, repeatY) => {
    const tex = tiledTexture(key, 512, (ctx, size) => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, size, size);
      const rnd = seeded(seed);
      const lines = [];
      for (let i = 0; i < 3; i += 1) {
        const pts = [];
        let x = rnd() * size;
        for (let y = -20; y <= size + 20; y += 18 + rnd() * 20) {
          x += (rnd() - 0.5) * 40;
          pts.push([x, y, 4 + rnd() * 8]);
        }
        lines.push(pts);
      }
      drawCracks(ctx, lines, (w) => w + 7, 'rgb(0,255,0)');
      drawCracks(ctx, lines, (w) => w, 'rgb(255,0,0)');
    }, { color: true });
    tex.repeat.set(1, repeatY);
    return tex;
  };
  const tube = (key, seed, repeatY) => riftSurface(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1.1, color: 0x0d0b14, metalness: 0.3, roughness: 0.12, clearcoat: 1, emissive: 0xffffff, emissiveMap: tileCracks(key, seed, repeatY), emissiveIntensity: 1 }),
    u,
  );
  const edgeMetal = new THREE.MeshStandardMaterial({ envMap: env, color: 0x2a2436, metalness: 0.9, roughness: 0.25 });
  return {
    stock: [shell, wall],
    buttPad: [wall, wall],
    grip: [shell, wall],
    chassis: [shell, wall],
    forend: [shell, wall],
    muzzle: [shell, wall],
    receiver: tube('rift-tile-a', 9321, 2),
    barrel: tube('rift-tile-b', 9322, 3),
    scope: tube('rift-tile-c', 9323, 2),
    lens: portalMaterial(u, 25, { spin: 1.2 }),
    lensBack: portalMaterial(u, 19, { spin: -1.6 }),
    metal: edgeMetal,
    dark: new THREE.MeshStandardMaterial({ color: 0x030205, roughness: 0.9 }),
    brass: edgeMetal,
    flash: 'void',
    light: 0xa45cff,
    smoke: 0x6a4a9a,
    makeShell: () => {
      const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.006), new THREE.MeshStandardMaterial({ color: 0x0d0b14, metalness: 0.3, roughness: 0.1, emissive: 0xa45cff, emissiveIntensity: 0.6 }));
      return m;
    },
    decorate: (ctx) => decorateRift({ ...ctx, geo, env, wall }),
  };
}

function shardGeometry(rand, size) {
  const s = new THREE.Shape();
  const n = 3 + Math.floor(rand() * 2);
  for (let k = 0; k < n; k += 1) {
    const a = (k / n) * Math.PI * 2 + rand() * 0.8;
    const r = size * (0.5 + rand() * 0.6);
    if (k === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r * 1.6);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r * 1.6);
  }
  return extrude(s, size * 0.25, size * 0.08, { bevelSegments: 1 });
}

function decorateRift({ body, add, scene, parts, geo, env, wall }) {
  const u = geo.uniforms;
  parts.muzzle.visible = false;
  body.children.forEach((m) => {
    if (m.geometry?.type === 'CircleGeometry' && m.position.x > 1180) m.visible = false;
  });
  const glowTex = softDotTexture('rift-glow', 'rgba(230,200,255,1)', 'rgba(164,92,255,0)');
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xc9a0ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const shardMat = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1.2, color: 0x0d0b14, metalness: 0.3, roughness: 0.08, clearcoat: 1, emissive: 0x4a1a8a, emissiveIntensity: 0.25 });
  const rand = seeded(9310);

  // --- Éclats de coque en lévitation le long de la fissure (flanc gauche) -----
  const halfWidth = (x) => (x < 318 ? 21 : x < 642 ? 26 : 30);
  const shards = Array.from({ length: 14 }, (_, i) => {
    const x = 40 + (i / 13) * 900 + (rand() - 0.5) * 40;
    const g = new THREE.Group();
    const base = new THREE.Vector3(x, -6 + (rand() - 0.5) * 34, -(halfWidth(x) + 9 + rand() * 12));
    g.position.copy(base);
    body.add(g);
    const geoShard = shardGeometry(rand, 10 + rand() * 12);
    g.add(new THREE.Mesh(geoShard, shardMat));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geoShard, 20), edgeMat));
    g.rotation.set(rand() * 6, rand() * 6, rand() * 6);
    return { g, base, phase: rand() * 6, spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.8), push: { x: 0, v: 0 } };
  });

  // --- Portail de bouche -------------------------------------------------------
  const portal = new THREE.Group();
  portal.position.copy(PORTAL);
  portal.scale.setScalar(1.25);
  body.add(portal);
  const disk = new THREE.Mesh(new THREE.CircleGeometry(28, 64), portalMaterial(u, 28, { spin: 2 }));
  disk.rotation.y = Math.PI / 2;
  portal.add(disk);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(30, 2.4, 10, 96), wall);
  frame.rotation.y = Math.PI / 2;
  portal.add(frame);
  const rimGlow = new THREE.Mesh(new THREE.TorusGeometry(29, 0.7, 6, 96), new THREE.MeshBasicMaterial({ color: 0xd6b4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  rimGlow.rotation.y = Math.PI / 2;
  portal.add(rimGlow);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: VIOLET, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45 }));
  halo.scale.set(120, 120, 1);
  portal.add(halo);
  // Trois griffes d'obsidienne relient le canon au portail.
  [0, 1, 2].forEach((k) => {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    const claw = new THREE.Shape();
    claw.moveTo(0, 0);
    claw.lineTo(62, 22);
    claw.lineTo(66, 30);
    claw.lineTo(54, 30);
    claw.lineTo(0, 10);
    const m = new THREE.Mesh(extrude(claw, 4, 1), wall);
    const pivot = new THREE.Group();
    pivot.position.set(1088, 16, 0);
    pivot.rotation.x = a;
    body.add(pivot);
    m.position.set(0, 2, 0);
    pivot.add(m);
  });
  // Débris en orbite autour du portail.
  const orbiters = Array.from({ length: 9 }, (_, i) => {
    const geoShard = shardGeometry(rand, 3 + rand() * 3);
    const m = new THREE.Mesh(geoShard, shardMat);
    portal.add(m);
    return { m, a: (i / 9) * Math.PI * 2, r: 38 + rand() * 8, speed: 0.6 + rand() * 0.6 };
  });

  // --- Effets de tir -------------------------------------------------------------
  const shock = shockRings(scene, { color: 0xb07aff, count: 8, thickness: 0.03 });
  const burst = meshBurst(scene, { max: 40 });
  const burstGeo = new THREE.TetrahedronGeometry(0.004);
  const tears = [];
  const mouth = anchorAt(body, PORTAL.x + 8, PORTAL.y, 0);
  const tmp = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  const portalPush = { x: 0, v: 0 };
  let time = 0;

  // Déchirure de la réalité le long de la trajectoire : ligne brisée
  // lumineuse, avec deux ramifications, qui s'éteint en ~0,4 s.
  const tear = () => {
    mouth.getWorldPosition(tmp);
    body.getWorldQuaternion(quat);
    dir.set(1, 0, 0).applyQuaternion(quat);
    side.set(0, 0, 1).applyQuaternion(quat);
    up.set(0, 1, 0).applyQuaternion(quat);
    const pts = [];
    const n = 16;
    for (let k = 0; k <= n; k += 1) {
      const t = k / n;
      const amp = Math.sin(t * Math.PI) * 0.03;
      pts.push(tmp.clone().addScaledVector(dir, 0.02 + t * 1.3).addScaledVector(side, (Math.random() - 0.5) * amp).addScaledVector(up, (Math.random() - 0.5) * amp));
    }
    const curves = [new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1)];
    [4, 9].forEach((k) => {
      const from = pts[k];
      const b = [from];
      for (let j = 1; j <= 4; j += 1) b.push(from.clone().addScaledVector(dir, j * 0.05).addScaledVector(side, (Math.random() - 0.5) * 0.05 * j).addScaledVector(up, (Math.random() - 0.3) * 0.04 * j));
      curves.push(new THREE.CatmullRomCurve3(b, false, 'catmullrom', 0.1));
    });
    curves.forEach((c, i) => {
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xf2e8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const glowMat = new THREE.MeshBasicMaterial({ color: i ? TEAL : VIOLET, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
      const core = new THREE.Mesh(new THREE.TubeGeometry(c, i ? 12 : 60, i ? 0.0008 : 0.0016, 5, false), coreMat);
      const aura = new THREE.Mesh(new THREE.TubeGeometry(c, i ? 12 : 60, i ? 0.003 : 0.006, 6, false), glowMat);
      core.frustumCulled = false;
      aura.frustumCulled = false;
      scene.add(core, aura);
      tears.push({ meshes: [core, aura], born: performance.now() });
    });
  };

  // --- Apparition : la faille s'ouvre et l'arme en sort ------------------------
  const slitOpen = { value: 0 };
  const slitHeight = { value: 0 };
  const slit = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      uniforms: { uTime: u.uTime, uFlare: u.uFlare, uOpen: slitOpen, uHeight: slitHeight },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpen;
        uniform float uHeight;
        varying vec2 vUv;
        ${RIFT_GLSL}
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float h = uHeight;
          float profile = max(0.0, 1.0 - (p.y * p.y) / max(0.001, h * h));
          float jag = 0.75 + 0.5 * rkNoise(vec2(p.y * 14.0, uTime * 3.0));
          float halfW = (0.015 + uOpen * 0.55) * sqrt(profile) * jag;
          float d = abs(p.x) - halfW;
          float inside = step(d, 0.0) * step(abs(p.y), h);
          float edge = exp(-max(d, 0.0) * 60.0) * step(abs(p.y), h * 1.05) * sqrt(profile);
          vec3 space = riftSpace(gl_FragCoord.xy, uTime, ${SPACE_A}, ${SPACE_B});
          vec3 col = mix(vec3(0.85, 0.6, 1.0) * 2.0 * edge, space * 1.6, inside);
          gl_FragColor = vec4(col, max(inside, edge));
        }
      `,
    }),
  );
  slit.scale.set(220, 420, 1);
  slit.position.copy(SLIT);
  slit.visible = false;
  slit.frustumCulled = false;
  faceCamera(slit);
  body.add(slit);

  const pieces = captureParts([body], [parts.bolt, slit]);
  const maxDx = Math.max(...pieces.map((p) => Math.abs(p.center.x - SLIT.x)));
  pieces.forEach((p, i) => {
    p.delay = 0.35 + 0.72 * (Math.abs(p.center.x - SLIT.x) / maxDx);
    p.axis = new THREE.Vector3(Math.sin(i * 1.7), Math.cos(i * 2.3), Math.sin(i * 0.9)).normalize();
  });
  let introT = -1;
  const delta = new THREE.Vector3();
  const tumble = new THREE.Quaternion();
  const finishIntro = () => {
    introT = -1;
    pieces.forEach((p) => {
      restorePart(p);
      p.object.visible = true;
    });
    parts.bolt.visible = true;
    slit.visible = false;
  };
  const runIntro = (dt) => {
    introT += dt;
    const t = introT;
    slit.visible = true;
    slitHeight.value = easeOutCubic(clamp01(t / 0.3)) * (1 - easeInOut(clamp01((t - INTRO + 0.25) / 0.25)));
    slitOpen.value = easeOutCubic(clamp01((t - 0.2) / 0.3)) * (1 - easeInOut(clamp01((t - INTRO + 0.4) / 0.3)));
    u.uFlare.value = Math.max(u.uFlare.value, slitOpen.value * 0.6);
    parts.bolt.visible = t > INTRO * 0.8;
    pieces.forEach((p) => {
      const s = clamp01((t - p.delay) / 0.55);
      p.object.visible = s > 0;
      if (s <= 0) return;
      const e = easeOutCubic(s);
      delta.copy(SLIT).sub(p.center).multiplyScalar(1 - e);
      tumble.setFromAxisAngle(p.axis, (1 - e) * 2.2);
      placePart(p, 0.05 + 0.95 * e, delta, tumble);
    });
    if (t >= INTRO) {
      finishIntro();
      mouth.getWorldPosition(tmp);
      body.getWorldQuaternion(quat);
      shock.spawn(tmp, quat, { reach: 0.09, life: 400, peak: 1 });
      shards.forEach((s) => (s.push.v += 40));
    }
  };

  return {
    muzzleX: PORTAL.x + 10,
    introDuration: INTRO,
    replayIntro: () => {
      introT = 0;
      runIntro(0);
    },
    update: (dt, t, flare, { slide = 0 } = {}) => {
      time += dt;
      shards.forEach((s) => {
        springStep(s.push, 0, 30, dt);
        s.g.position.set(
          s.base.x,
          s.base.y + Math.sin(time * 1.1 + s.phase) * 2.2,
          s.base.z - Math.max(0, s.push.x) * 0.5 - slide * 6 + Math.sin(time * 0.7 + s.phase) * 1.2,
        );
        s.g.rotation.x += s.spin.x * dt;
        s.g.rotation.y += s.spin.y * dt;
        s.g.rotation.z += s.spin.z * dt;
      });
      edgeMat.opacity = 0.6 + 0.3 * Math.sin(time * 2) + flare * 0.5;
      springStep(portalPush, 0, 120, dt);
      portal.scale.setScalar(1.25 * (1 + Math.max(0, portalPush.x) * 0.7));
      frame.rotation.x = time * 0.4;
      halo.material.opacity = 0.35 + 0.1 * Math.sin(time * 2.5) + flare * 0.6;
      orbiters.forEach((o) => {
        o.a += o.speed * dt;
        o.m.position.set(Math.sin(o.a * 2) * 4, Math.cos(o.a) * o.r, Math.sin(o.a) * o.r);
        o.m.rotation.set(o.a * 2, o.a, 0);
      });
      const now = performance.now();
      for (let i = tears.length - 1; i >= 0; i -= 1) {
        const tr = tears[i];
        const k = (now - tr.born) / 420;
        if (k >= 1) {
          tr.meshes.forEach((m) => {
            scene.remove(m);
            m.geometry.dispose();
            m.material.dispose();
          });
          tears.splice(i, 1);
        } else {
          tr.meshes[0].material.opacity = (1 - k) ** 1.5;
          tr.meshes[1].material.opacity = 0.35 * (1 - k);
        }
      }
      if (introT >= 0) runIntro(dt);
      shock.update();
      burst.update(dt);
    },
    onFire: () => {
      portalPush.v += 28;
      shards.forEach((s) => (s.push.v += 30 + Math.random() * 30));
      tear();
      mouth.getWorldPosition(tmp);
      body.getWorldQuaternion(quat);
      shock.spawn(tmp, quat, { reach: 0.07, life: 260, from: 0.02, peak: 1 });
      shock.spawn(tmp, quat, { reach: 0.12, life: 420, from: 0.02, peak: 0.5, delay: 50, tint: 0x3cf2d8 });
      for (let i = 0; i < 10; i += 1) {
        const m = new THREE.Mesh(burstGeo, new THREE.MeshStandardMaterial({ color: 0x0d0b14, metalness: 0.3, roughness: 0.1, emissive: i % 2 ? 0xa45cff : 0x3cf2d8, emissiveIntensity: 0.8 }));
        burst.spawn(m, tmp, new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.2) * 1.2, (Math.random() - 0.5) * 1.6), { life: 700, gravity: -3, drag: 1.5, spin: 12 });
      }
    },
  };
}

export const SNIPER_TRANSCENDENT_SKINS = {
  rift: { labelKey: 'aimTrainer.skinRift', build: riftFinish },
};
