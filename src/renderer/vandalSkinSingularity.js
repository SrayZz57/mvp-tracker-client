import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { seeded, tiledTexture, animateEmissive, softDotTexture, springStep, anchorAt } from './weaponKit.js';
import { LIVERY, livery, tracePolygon, magazineOutline } from './vandalSkins.js';
import { captureParts, placePart, restorePart, attractedParticles, shockRings, easeOutCubic, easeOutBack, clamp01 } from './transcendentKit.js';

// SINGULARITÉ — palier Transcendant de la Vandal. La carcasse est taillée dans
// du vide (champ d'étoiles, liserés d'horizon dorés, ondes gravitationnelles qui
// parcourent la surface). Un trou noir flotte contre le flanc gauche, tenu par
// des cardans dorés : disque d'accrétion (effet Doppler, rotation képlérienne),
// anneau de photons, débris qui y tombent en s'étirant. La bouche est un
// accélérateur à anneaux autour d'une mini-singularité. À l'apparition, l'arme
// sort du trou noir en spirale, pièce par pièce.
//
// Rien au-dessus du couvercle : le trou noir est sur le flanc (z = -46), sous
// la ligne de mire.

const BH = new THREE.Vector3(360, -4, -46);
const INTRO = 1.6;
const HOLE_SCALE = 0.82;

// Disque d'accrétion : rotation plus rapide au centre, bandes de matière,
// côté qui s'approche plus lumineux. `rin`/`rout` en mm.
function diskMaterial(uniforms, rin, rout, gain) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uFlare: uniforms.uFlare, uGain: { value: gain } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uFlare;
      uniform float uGain;
      varying vec2 vPos;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float r = length(vPos);
        float a = atan(vPos.y, vPos.x);
        float t = clamp((r - ${rin.toFixed(1)}) / ${(rout - rin).toFixed(1)}, 0.0, 1.0);
        float swirl = a + uTime * (1.6 / (0.25 + t));
        float n = noise(vec2(swirl * 2.5, r * 0.3)) * 0.6 + noise(vec2(swirl * 8.0, r * 1.1)) * 0.4;
        float bands = 0.55 + 0.45 * sin(r * 1.3 - uTime * 3.5 + n * 5.0);
        float doppler = 0.35 + 0.65 * pow(0.5 + 0.5 * cos(a - 0.7), 1.5);
        vec3 hot = mix(vec3(1.0, 0.96, 0.88), vec3(1.0, 0.56, 0.16), smoothstep(0.0, 0.45, t));
        vec3 col = mix(hot, vec3(0.55, 0.07, 0.02), smoothstep(0.4, 1.0, t));
        float edge = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.65, 1.0, t));
        float I = edge * (0.35 + n) * bands * doppler * uGain * (1.1 + uFlare * 2.5);
        gl_FragColor = vec4(col * I, 1.0);
      }
    `,
  });
}

function singularityFinish(env, geo) {
  const u = geo.uniforms;
  const outlines = [
    geo.stockOutline,
    geo.handguardOutline,
    [[220, 22], [504, 22], [504, -24], [220, -24]],
    [[232, 19], [496, 19], [496, 30], [252, 35], [232, 29]],
    magazineOutline(geo.magazineCurve),
  ];
  const paint = (ctx, glow) => {
    const rand = seeded(9101);
    if (!glow) {
      // Nébuleuses très sombres sous les étoiles.
      for (let i = 0; i < 26; i += 1) {
        const x = LIVERY.minX + rand() * (LIVERY.maxX - LIVERY.minX);
        const y = LIVERY.minY + rand() * (LIVERY.maxY - LIVERY.minY);
        const r = 30 + rand() * 90;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rand() < 0.5 ? 'rgba(70,40,120,0.35)' : 'rgba(30,60,120,0.3)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    for (let i = 0; i < 2600; i += 1) {
      const big = rand() < 0.06;
      ctx.fillStyle = rand() < 0.2 ? 'rgba(255,200,150,0.95)' : rand() < 0.3 ? 'rgba(160,190,255,0.95)' : 'rgba(255,255,255,0.9)';
      const s = big ? 0.9 : 0.35 + rand() * 0.3;
      ctx.fillRect(LIVERY.minX + rand() * (LIVERY.maxX - LIVERY.minX), LIVERY.minY + rand() * (LIVERY.maxY - LIVERY.minY), s, s);
    }
    // Liserés d'horizon le long des contours.
    ctx.strokeStyle = glow ? 'rgba(255,170,90,1)' : '#d9a55a';
    ctx.lineWidth = 0.9;
    outlines.forEach((o) => {
      ctx.save();
      tracePolygon(ctx, o.map(([x, y]) => [x, y]));
      ctx.clip();
      tracePolygon(ctx, o.map(([x, y]) => [x, y]));
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    });
  };
  const color = livery('sing-color', (ctx) => paint(ctx, false), { background: '#04050a', color: true });
  const glow = livery('sing-glow', (ctx) => paint(ctx, true), { background: '#000000', color: true });
  // Ondes gravitationnelles concentriques depuis le trou noir, qui balaient la
  // carcasse ; étoiles qui scintillent.
  const voidMat = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.9, map: color, metalness: 0.5, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.2 }),
    u,
    `
      vec2 pm = vEmissiveMapUv * vec2(${LIVERY.maxX - LIVERY.minX}.0, ${LIVERY.maxY - LIVERY.minY}.0) + vec2(${LIVERY.minX}.0, ${LIVERY.minY}.0);
      float d = distance(pm, vec2(${BH.x}.0, ${BH.y}.0));
      float wave = pow(0.5 + 0.5 * sin(d * 0.06 - uTime * 2.6), 14.0);
      float tw = 0.65 + 0.35 * sin(uTime * 3.0 + vEmissiveMapUv.x * 420.0 + vEmissiveMapUv.y * 310.0);
      totalEmissiveRadiance = totalEmissiveRadiance * (tw + uFlare * 1.5) + vec3(1.0, 0.45, 0.12) * wave * (0.06 + uFlare * 0.4) * exp(-d * 0.004);
    `,
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.8, color: 0x05060b, metalness: 0.5, roughness: 0.25, clearcoat: 1 });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.3, color: 0xd9a55a, metalness: 1, roughness: 0.2 });
  const white = tiledTexture('sing-white', 8, (ctx, size) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
  }, { color: true });
  // Matière aspirée qui file dans le canon vers la bouche.
  const barrel = animateEmissive(
    new THREE.MeshStandardMaterial({ envMap: env, color: 0x0a0a0d, metalness: 0.9, roughness: 0.3, emissive: 0xff7a2a, emissiveMap: white }),
    u,
    'totalEmissiveRadiance *= 0.15 + 2.2 * pow(fract(vEmissiveMapUv.y * 5.0 + uTime * 1.6), 8.0) + uFlare * 2.0;',
  );
  return {
    receiver: [voidMat, wall],
    dustCover: [voidMat, wall],
    magwell: [voidMat, wall],
    gasBlock: [voidMat, wall],
    muzzle: [voidMat, wall],
    stock: [voidMat, wall],
    grip: [voidMat, wall],
    handguard: [voidMat, wall],
    upperGuard: [voidMat, wall],
    magazine: [voidMat, wall],
    buttPad: [wall, wall],
    metal: gold,
    barrel,
    dark: new THREE.MeshStandardMaterial({ color: 0x020203, roughness: 0.9 }),
    sight: new THREE.MeshBasicMaterial({ color: 0xffb070 }),
    brass: gold,
    flash: 'gold',
    light: 0xffa050,
    smoke: 0x2a2036,
    glow: [],
    makeShell: () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.0032, 12, 8), new THREE.MeshBasicMaterial({ color: 0x000000 })));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0042, 0.0005, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffb070 }));
      g.add(ring);
      return g;
    },
    decorate: (ctx) => decorateSingularity({ ...ctx, geo, env, gold, wall }),
  };
}

function decorateSingularity({ body, add, scene, parts, carrier, geo, env, gold, wall }) {
  const u = geo.uniforms;
  parts.muzzle.visible = false;
  parts.rail.visible = false;
  parts.railGrooves.forEach((g) => (g.visible = false));
  body.children.forEach((m) => {
    if (m.geometry?.type === 'CircleGeometry' && m.position.x > 900) m.visible = false;
  });
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const halo = softDotTexture('sing-halo', 'rgba(255,190,120,1)', 'rgba(255,120,40,0)');

  // --- Trou noir sur le flanc gauche -----------------------------------------
  const hole = new THREE.Group();
  hole.position.copy(BH);
  hole.scale.setScalar(HOLE_SCALE);
  body.add(hole);
  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: 0xffa060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
  glowSprite.scale.set(110, 110, 1);
  hole.add(glowSprite);
  const core = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 20), black);
  core.renderOrder = 2;
  hole.add(core);
  const photonMat = new THREE.MeshBasicMaterial({ color: 0xfff0d8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const photon = new THREE.Mesh(new THREE.TorusGeometry(10.2, 0.5, 8, 96), photonMat);
  hole.add(photon);
  // Arrière du disque vu « par-dessus » le trou noir (lentille gravitationnelle).
  const lensed = new THREE.Mesh(new THREE.RingGeometry(10.6, 21, 96, 2), diskMaterial(u, 10.6, 21, 0.6));
  hole.add(lensed);
  const diskPivot = new THREE.Group();
  diskPivot.rotation.set(-1.22, 0.12, 0);
  hole.add(diskPivot);
  diskPivot.add(new THREE.Mesh(new THREE.RingGeometry(12, 40, 128, 6), diskMaterial(u, 12, 40, 1)));
  const ringFrame = new THREE.Object3D();
  ringFrame.rotation.y = -Math.PI / 2;
  diskPivot.add(ringFrame);

  // Cardans dorés qui tiennent le trou noir.
  const gimbals = [
    { r: 44, tube: 1.3, axis: new THREE.Vector3(1, 0, 0), speed: 0.35 },
    { r: 49, tube: 0.9, axis: new THREE.Vector3(0, 1, 0), speed: -0.22 },
    { r: 53, tube: 0.6, axis: new THREE.Vector3(0.6, 0.6, 0.5).normalize(), speed: 0.15 },
  ].map((g, i) => {
    const pivot = new THREE.Group();
    hole.add(pivot);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(g.r, g.tube, 10, 120), gold);
    pivot.add(ring);
    for (let k = 0; k < 3 + i; k += 1) {
      const a = (k / (3 + i)) * Math.PI * 2;
      const bead = new THREE.Mesh(new THREE.SphereGeometry(g.tube * 1.9, 12, 8), gold);
      bead.position.set(Math.cos(a) * g.r, Math.sin(a) * g.r, 0);
      pivot.add(bead);
    }
    pivot.quaternion.setFromAxisAngle(g.axis, i * 0.9);
    return { ...g, pivot, spin: { x: 0, v: 0 }, angle: i * 0.9 };
  });

  // Deux émetteurs sur la carcasse, reliés au trou noir par des faisceaux.
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffa060, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  [[318, 10], [402, -12]].forEach(([x, y]) => {
    const nub = add(new THREE.SphereGeometry(5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), gold, x, y, -17);
    nub.rotation.x = -Math.PI / 2;
    const from = new THREE.Vector3(x, y, -20);
    const dir = BH.clone().sub(from);
    const len = dir.length() - 30;
    const beam = add(new THREE.CylinderGeometry(0.7, 1.6, len, 10, 1, true), beamMat, 0, 0, 0);
    beam.position.copy(from).addScaledVector(dir.clone().normalize(), len / 2);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  });

  // Débris en orbite dans le plan du disque ; de temps en temps l'un d'eux est
  // happé, s'étire (spaghettification) et disparaît dans l'horizon.
  const rockMat = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.5, color: 0x2a2530, roughness: 0.8, flatShading: true, emissive: 0xff6a20, emissiveIntensity: 0.15 });
  const debris = Array.from({ length: 16 }, (_, i) => {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 + (i % 4) * 0.7, 0), rockMat);
    diskPivot.add(mesh);
    const d = { mesh, r: 44 + Math.random() * 22, angle: Math.random() * Math.PI * 2, lift: (Math.random() - 0.5) * 6, fall: -1, push: { x: 0, v: 0 } };
    return d;
  });
  let nextFall = 1.5;

  // --- Accélérateur de bouche et mini-singularité ----------------------------
  add(new THREE.CylinderGeometry(7, 8.5, 34, 24), wall, 852, 2, 0).rotation.z = Math.PI / 2;
  const accel = new THREE.Group();
  accel.position.set(882, 4, 0);
  body.add(accel);
  const accelRings = [16, 12.5, 9].map((r, i) => {
    const pivot = new THREE.Group();
    accel.add(pivot);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 1.3, 10, 64), gold);
    ring.rotation.y = Math.PI / 2;
    pivot.add(ring);
    return { pivot, speed: [1.2, -1.8, 2.6][i], axis: i };
  });
  const mini = new THREE.Group();
  mini.position.set(18, 0, 0);
  accel.add(mini);
  mini.add(new THREE.Mesh(new THREE.SphereGeometry(4.2, 20, 14), black));
  const miniRing = new THREE.Mesh(new THREE.TorusGeometry(5, 0.35, 6, 48), photonMat);
  miniRing.rotation.y = Math.PI / 2;
  mini.add(miniRing);
  const miniDisk = new THREE.Mesh(new THREE.RingGeometry(5.6, 14, 64, 2), diskMaterial(u, 5.6, 14, 0.9));
  miniDisk.rotation.set(0.3, Math.PI / 2 - 0.5, 0);
  mini.add(miniDisk);
  const miniGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: 0xffa060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
  miniGlow.scale.set(40, 40, 1);
  mini.add(miniGlow);

  // Jets relativistes le long de l'axe du disque, au tir.
  const jetTex = tiledTexture('sing-jet', 64, (ctx, size) => {
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, 'rgba(120,170,255,0)');
    g.addColorStop(0.6, 'rgba(170,200,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }, { color: true });
  const jetMat = new THREE.MeshBasicMaterial({ map: jetTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const jets = [1, -1].map((s) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(3.5, 70, 14, 1, true).translate(0, 35, 0), jetMat);
    m.rotation.x = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    diskPivot.add(m);
    return m;
  });

  // --- Effets -------------------------------------------------------------------
  const sparks = attractedParticles(scene, softDotTexture('sing-spark', 'rgba(255,240,220,1)', 'rgba(255,150,60,0)'), { max: 140 });
  const shock = shockRings(scene, { color: 0xffa060, count: 10, thickness: 0.025 });
  const darkShock = shockRings(scene, { color: 0x000000, count: 4, thickness: 0.06, additive: false });
  const mouth = anchorAt(body, 900, 4, 0);
  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const pulse = { x: 0, v: 0 };
  let time = 0;
  let jetUntil = 0;

  // --- Apparition : l'arme sort du trou noir en spirale ------------------------
  const pieces = captureParts([body], [hole, carrier]);
  const maxDist = Math.max(...pieces.map((p) => p.center.distanceTo(BH)));
  pieces.forEach((p) => {
    p.delay = 0.14 + 0.62 * (p.center.distanceTo(BH) / maxDist);
    p.rel = new THREE.Vector2(p.center.x - BH.x, p.center.y - BH.y);
  });
  let introT = -1;
  const delta = new THREE.Vector3();
  const spin = new THREE.Quaternion();
  const Z = new THREE.Vector3(0, 0, 1);
  const finishIntro = () => {
    introT = -1;
    pieces.forEach((p) => {
      restorePart(p);
      p.object.visible = true;
    });
    carrier.visible = true;
    hole.scale.setScalar(HOLE_SCALE);
  };
  const runIntro = (dt) => {
    introT += dt;
    const t = introT;
    hole.scale.setScalar(HOLE_SCALE * Math.max(0.001, easeOutBack(clamp01(t / 0.3))));
    u.uFlare.value = Math.max(u.uFlare.value, 1 - clamp01(t / INTRO) * 0.6);
    carrier.visible = t > INTRO * 0.85;
    pieces.forEach((p) => {
      const s = clamp01((t - p.delay) / 0.75);
      p.object.visible = s > 0;
      if (s <= 0) return;
      const e = easeOutCubic(s);
      const theta = (1 - e) * Math.PI * 2.4;
      const f = 1 + (1 - e) * 1.3;
      const c = Math.cos(theta);
      const sn = Math.sin(theta);
      delta.set(
        BH.x + (p.rel.x * c - p.rel.y * sn) * f - p.center.x,
        BH.y + (p.rel.x * sn + p.rel.y * c) * f - p.center.y,
        (BH.z - p.center.z) * (1 - e),
      );
      spin.setFromAxisAngle(Z, theta * 0.7);
      placePart(p, 0.06 + 0.94 * e, delta, spin);
    });
    // Matière qui s'échappe du trou noir pendant la sortie.
    if (t < INTRO * 0.8) {
      hole.getWorldPosition(tmp);
      for (let i = 0; i < 2; i += 1) {
        const a = Math.random() * Math.PI * 2;
        sparks.spawn(tmp, new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.6, Math.sin(a)).multiplyScalar(0.25 + Math.random() * 0.2), { life: 700, size: 0.003, anchor: hole, pull: 25, tint: 0xffc080 });
      }
    }
    if (t >= INTRO) {
      finishIntro();
      shockwave(1.6);
    }
  };

  const shockwave = (power) => {
    ringFrame.getWorldQuaternion(quat);
    hole.getWorldPosition(tmp);
    shock.spawn(tmp, quat, { reach: 0.07 * power, life: 260, from: 0.012, peak: 0.9 });
    shock.spawn(tmp, quat, { reach: 0.1 * power, life: 380, from: 0.012, peak: 0.5, delay: 40 });
    darkShock.spawn(tmp, quat, { reach: 0.06 * power, life: 240, from: 0.01, peak: 0.55, delay: 20 });
  };

  return {
    muzzleX: 902,
    introDuration: INTRO,
    replayIntro: () => {
      introT = 0;
      runIntro(0);
    },
    update: (dt) => {
      time += dt;
      if (introT >= 0) runIntro(dt);

      hole.rotation.z = Math.sin(time * 0.3) * 0.08;
      gimbals.forEach((g) => {
        springStep(g.spin, 0, 12, dt);
        g.angle += (g.speed + g.spin.x) * dt;
        g.pivot.quaternion.setFromAxisAngle(g.axis, g.angle);
      });
      photonMat.color.setRGB(1, 0.94, 0.85).multiplyScalar(1 + u.uFlare.value * 1.5);
      glowSprite.material.opacity = 0.45 + 0.1 * Math.sin(time * 2) + u.uFlare.value * 0.4;

      nextFall -= dt;
      if (nextFall <= 0) {
        nextFall = 2 + Math.random() * 2.5;
        const d = debris.find((x) => x.fall < 0);
        if (d) d.fall = 0;
      }
      debris.forEach((d) => {
        springStep(d.push, 0, 20, dt);
        if (d.fall >= 0) {
          d.fall += dt / 1.6;
          d.r = 10 + (d.r - 10) * Math.exp(-dt * 2.4);
          if (d.fall >= 1 || d.r < 10.5) {
            d.fall = -1;
            d.r = 48 + Math.random() * 18;
            photonMat.color.multiplyScalar(2.5);
          }
        }
        const speed = 38 / Math.pow(d.r, 1.5) * 6;
        d.angle += speed * dt;
        const r = d.r + d.push.x;
        d.mesh.position.set(Math.cos(d.angle) * r, Math.sin(d.angle) * r, d.lift * (d.fall >= 0 ? 1 - d.fall : 1));
        const stretch = d.fall >= 0 ? d.fall : 0;
        d.mesh.rotation.set(0, 0, d.angle + Math.PI / 2);
        d.mesh.scale.set(1 + stretch * 5, 1 - stretch * 0.75, 1 - stretch * 0.75);
        if (d.fall < 0) d.mesh.rotation.x = time * (0.5 + (d.r % 3));
      });

      springStep(pulse, 0, 260, dt);
      mini.scale.setScalar(1 + pulse.x * 0.9);
      accelRings.forEach((a) => {
        const r = a.speed * (1 + u.uFlare.value * 4) * dt;
        if (a.axis === 0) a.pivot.rotation.y += r;
        else if (a.axis === 1) a.pivot.rotation.z += r;
        else a.pivot.rotation.y -= r;
      });
      miniDisk.rotation.z += dt * 2;

      const jetOn = performance.now() < jetUntil;
      jetMat.opacity = jetOn ? 0.9 : 0;
      if (jetOn) jets.forEach((j) => j.scale.set(1, 0.7 + Math.random() * 0.6, 1));
      sparks.update(dt);
      shock.update();
      darkShock.update();
    },
    onFire: () => {
      pulse.v += 22;
      jetUntil = performance.now() + 90;
      gimbals.forEach((g, i) => (g.spin.v += (i % 2 ? -1 : 1) * 14));
      debris.forEach((d) => (d.push.v += 60 + Math.random() * 40));
      shockwave(1);
      mouth.getWorldPosition(tmp);
      body.getWorldQuaternion(quat);
      shock.spawn(tmp, quat, { reach: 0.05, life: 160, from: 0.006, peak: 0.9 });
      darkShock.spawn(tmp, quat, { reach: 0.035, life: 150, from: 0.004, peak: 0.6, delay: 15 });
      // Gerbe qui part puis retombe en spirale dans la mini-singularité.
      for (let i = 0; i < 16; i += 1) {
        const v = new THREE.Vector3((Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.4);
        sparks.spawn(tmp, v, { life: 520, size: 0.0028, anchor: mini, pull: 70, tint: Math.random() < 0.3 ? 0xa8c8ff : 0xffc080 });
      }
    },
  };
}

export const VANDAL_SINGULARITY_SKIN = {
  singularity: { labelKey: 'aimTrainer.skinSingularity', build: singularityFinish },
};
