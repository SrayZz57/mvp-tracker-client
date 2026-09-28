import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { seeded, tiledTexture, speckle, animateEmissive, particleSystem, softDotTexture, extrude, springStep, taperedTube, anchorAt, meshBurst } from './weaponKit.js';
import { G_LIVERY, SLIDE, GRIP, livery, tracePolygon, strokeLine, ringTexture, pairOf } from './glockSkins.js';
import { gripPoint, GRIP_BOTTOM } from './glockGeometry.js';

// Skins « Ultimes » du Glock. Repère : culasse x 0 → 186 (y 0 → 30, suit le
// recul via `slide`), poignée jusqu'à y ≈ -104, axe du canon à y = 16.

const GW = G_LIVERY.maxX - G_LIVERY.minX;
const GH = G_LIVERY.maxY - G_LIVERY.minY;

function glowSprite(texture, color, size) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sprite.scale.set(size, size, 1);
  return sprite;
}

// =============================================================================
// CHRONOS — le maître du temps. Émail bleu nuit gravé de graduations d'or. Un
// vrai cadran sur chaque flanc de la culasse affiche l'heure réelle (heures,
// minutes, trotteuse qui avance à la seconde) ; des rouages tournent sur la
// carcasse ; un balancier oscille sous la poignée ; deux anneaux temporels
// dorés gravitent autour de l'arme. Au tir, la trotteuse recule d'un bond
// (le temps revient en arrière) et une onde dorée se propage.
// =============================================================================

function dialTexture() {
  return tiledTexture('chronos-dial', 256, (ctx, size) => {
    const c = size / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, '#f6efdc');
    g.addColorStop(1, '#d8c8a0');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, c - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a1c0c';
    ctx.fillStyle = '#2a1c0c';
    for (let i = 0; i < 60; i += 1) {
      const a = (i / 60) * Math.PI * 2;
      const inner = i % 5 === 0 ? c * 0.76 : c * 0.86;
      ctx.lineWidth = i % 5 === 0 ? 5 : 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
      ctx.lineTo(c + Math.cos(a) * c * 0.94, c + Math.sin(a) * c * 0.94);
      ctx.stroke();
    }
    ctx.font = 'bold 30px Georgia';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let h = 1; h <= 12; h += 1) {
      const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
      ctx.fillText(String(h), c + Math.cos(a) * c * 0.62, c + Math.sin(a) * c * 0.62);
    }
  }, { color: true });
}

function chronosFinish(env, { uniforms }) {
  const paint = (ctx, glow) => {
    ctx.strokeStyle = glow ? 'rgba(255,220,130,1)' : '#d6aa45';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 18; i += 1) {
      const cx = G_LIVERY.minX + ((i * 53) % GW);
      const cy = G_LIVERY.minY + ((i * 37) % GH);
      const r = 8 + (i % 4) * 5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      for (let k = 0; k < 12; k += 1) {
        const a = (k / 12) * Math.PI * 2;
        strokeLine(ctx, [[cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82], [cx + Math.cos(a) * r, cy + Math.sin(a) * r]]);
      }
    }
    if (!glow) {
      ctx.strokeStyle = '#d6aa45';
      ctx.lineWidth = 1.2;
      [SLIDE, GRIP].forEach((o) => {
        tracePolygon(ctx, o);
        ctx.stroke();
      });
    }
  };
  const color = livery('chronos-color', (ctx) => paint(ctx, false), { background: '#101a3a', color: true });
  const glow = livery('chronos-glow', (ctx) => paint(ctx, true), { background: '#000000', color: true });
  const enamel = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.7, metalness: 0.1, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03 }),
    uniforms,
    'totalEmissiveRadiance *= 0.3 + 0.7 * pow(0.5 + 0.5 * sin(atan(vEmissiveMapUv.y - 0.5, vEmissiveMapUv.x - 0.5) * 6.0 - uTime * 1.5), 6.0) + uFlare * 1.5;',
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x101a3a, roughness: 0.15, clearcoat: 1 });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.4, color: 0xe2b24a, metalness: 1, roughness: 0.2 });
  return {
    ...pairOf(enamel, wall),
    barrel: gold,
    steel: gold,
    sight: new THREE.MeshBasicMaterial({ color: 0xffe8a0 }),
    dot: new THREE.MeshBasicMaterial({ color: 0xffe8a0 }),
    flash: 'gold',
    light: 0xffd27a,
    smoke: 0xfff0d0,
    decorate: ({ model, slide, add, scene }) => {
      const dialMat = new THREE.MeshStandardMaterial({ map: dialTexture(), roughness: 0.5 });
      const handMat = new THREE.MeshStandardMaterial({ color: 0x1a120a, metalness: 0.6, roughness: 0.3 });
      const secondMat = new THREE.MeshBasicMaterial({ color: 0xb3261e });
      const glass = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xffffff, transparent: true, opacity: 0.15, roughness: 0, clearcoat: 1, depthWrite: false });
      const dials = [-1, 1].map((side) => {
        const g = new THREE.Group();
        g.position.set(110, 14, side * 13.5);
        if (side < 0) g.rotation.y = Math.PI;
        slide.add(g);
        g.add(new THREE.Mesh(new THREE.CircleGeometry(13, 48), dialMat));
        const bezel = new THREE.Mesh(new THREE.TorusGeometry(13.5, 1.4, 8, 48), gold);
        g.add(bezel);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(13, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass);
        dome.rotation.x = Math.PI / 2;
        dome.scale.y = 0.25;
        g.add(dome);
        const hand = (length, width, material, z) => {
          const pivot = new THREE.Group();
          pivot.position.z = z;
          g.add(pivot);
          const m = new THREE.Mesh(new THREE.BoxGeometry(width, length, 0.4), material);
          m.position.y = length / 2 - 1.5;
          pivot.add(m);
          return pivot;
        };
        return { hours: hand(7, 1.4, handMat, 0.4), minutes: hand(10, 1, handMat, 0.8), seconds: hand(11.5, 0.5, secondMat, 1.2) };
      });
      // Rouages sur la carcasse.
      const gearShape = (r, teeth) => {
        const s = new THREE.Shape();
        for (let i = 0; i < teeth * 2; i += 1) {
          const a = (i / (teeth * 2)) * Math.PI * 2;
          const rr = i % 2 ? r * 0.82 : r;
          if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        const hole = new THREE.Path();
        hole.absarc(0, 0, r * 0.3, 0, Math.PI * 2, true);
        s.holes.push(hole);
        return s;
      };
      const gears = [];
      [-1, 1].forEach((side) => {
        [[40, -18, 11, 12, 1], [58, -22, 7, 9, -11 / 7], [22, -60, 9, 10, 0.8]].forEach(([x, y, r, t, speed]) => {
          const gm = add(extrude(gearShape(r, t), 1.6, 0.3), gold, ...gripPoint(x, y, side * 14.3).toArray());
          gears.push({ gm, speed });
        });
      });
      // Balancier sous la poignée.
      const pendulum = new THREE.Group();
      pendulum.position.copy(gripPoint(20, -130, 0));
      model.add(pendulum);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 50, 6), gold);
      rod.position.y = -25;
      pendulum.add(rod);
      const bob = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 2, 32), gold);
      bob.rotation.x = Math.PI / 2;
      bob.position.y = -52;
      pendulum.add(bob);
      // Anneaux temporels.
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
      const halos = [0, 1].map((i) => {
        const r = new THREE.Mesh(new THREE.TorusGeometry(90 + i * 18, 0.7, 6, 96), ringMat);
        r.position.set(80, -30, 0);
        model.add(r);
        return r;
      });
      const waves = particleSystem(scene, ringTexture('chronos', 'rgba(255,210,120,0.9)'), { max: 6 });
      const mouth = anchorAt(model, 196, 16, 0);
      const tmp = new THREE.Vector3();
      let rewind = 0;
      return {
        update: (dt, time) => {
          const now = new Date();
          rewind = Math.max(0, rewind - dt * 1.5);
          const sec = now.getSeconds() - rewind * 8;
          const min = now.getMinutes() + sec / 60;
          const hr = (now.getHours() % 12) + min / 60;
          dials.forEach((d) => {
            d.seconds.rotation.z = -(sec / 60) * Math.PI * 2;
            d.minutes.rotation.z = -(min / 60) * Math.PI * 2;
            d.hours.rotation.z = -(hr / 12) * Math.PI * 2;
          });
          gears.forEach((g) => (g.gm.rotation.z += dt * g.speed * (1 + rewind * 6)));
          pendulum.rotation.z = Math.sin(time * Math.PI) * 0.35;
          halos.forEach((h, i) => {
            h.rotation.x = time * (0.4 + i * 0.2);
            h.rotation.y = time * (0.3 - i * 0.15);
          });
          waves.update(dt);
        },
        onFire: () => {
          rewind = 1;
          mouth.getWorldPosition(tmp);
          waves.spawn(tmp, new THREE.Vector3(), { life: 400, size: 0.02, grow: 5, drag: 0 });
        },
      };
    },
  };
}

// =============================================================================
// MONARQUE — le papillon monarque. Motif d'aile orange veiné de noir et
// ponctué de blanc. Deux grandes paires d'ailes déployées sur les flancs de la
// culasse battent lentement ; une dizaine de papillons volettent autour de
// l'arme ; au tir, une nuée s'envole de la bouche.
// =============================================================================

function wingTexture(key) {
  return tiledTexture(key, 256, (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const s = size;
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(4, s * 0.55);
      ctx.bezierCurveTo(s * 0.2, s * 0.02, s * 0.95, s * 0.02, s * 0.97, s * 0.4);
      ctx.bezierCurveTo(s * 0.9, s * 0.62, s * 0.55, s * 0.62, s * 0.5, s * 0.6);
      ctx.bezierCurveTo(s * 0.7, s * 0.95, s * 0.3, s * 1.0, 4, s * 0.6);
      ctx.closePath();
    };
    shape();
    const g = ctx.createRadialGradient(4, s * 0.55, 0, 4, s * 0.55, s);
    g.addColorStop(0, '#ffb030');
    g.addColorStop(1, '#e05a0a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    shape();
    ctx.clip();
    ctx.strokeStyle = '#0a0604';
    ctx.lineWidth = 5;
    for (let k = 0; k < 7; k += 1) {
      const a = -0.9 + k * 0.28;
      ctx.beginPath();
      ctx.moveTo(4, s * 0.55);
      ctx.quadraticCurveTo(s * 0.4, s * 0.55 + Math.sin(a) * s * 0.3, s * Math.cos(a * 0.5), s * 0.55 + Math.sin(a) * s * 0.5);
      ctx.stroke();
    }
    ctx.restore();
    shape();
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 14; k += 1) {
      ctx.beginPath();
      ctx.arc(s * (0.55 + (k % 7) * 0.06), s * (0.12 + Math.floor(k / 7) * 0.06) + (k % 7) * s * 0.02, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { color: true });
}

function monarchFinish(env, { uniforms }) {
  const paint = (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 200, 0);
    g.addColorStop(0, '#e05a0a');
    g.addColorStop(1, '#ffb030');
    ctx.fillStyle = g;
    ctx.fillRect(G_LIVERY.minX, G_LIVERY.minY, GW, GH);
    ctx.strokeStyle = '#0a0604';
    ctx.lineWidth = 2.6;
    const rand = seeded(4201);
    for (let i = 0; i < 14; i += 1) {
      let x = G_LIVERY.minX + rand() * GW;
      let y = G_LIVERY.minY + rand() * GH;
      let a = rand() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 10; k += 1) {
        a += (rand() - 0.5) * 0.5;
        x += Math.cos(a) * 9;
        y += Math.sin(a) * 9;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#0a0604';
    ctx.fillRect(G_LIVERY.minX, GRIP_BOTTOM - 4, GW, 16);
    ctx.fillStyle = '#ffffff';
    for (let x = G_LIVERY.minX; x < G_LIVERY.maxX; x += 7) {
      ctx.beginPath();
      ctx.arc(x, GRIP_BOTTOM + 4, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const color = livery('monarch-color', paint, { color: true });
  const lacquer = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.9, map: color, metalness: 0.05, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.6, sheenColor: new THREE.Color(0xffc060) });
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x1a0c04, roughness: 0.3, clearcoat: 1 });
  const black = new THREE.MeshStandardMaterial({ envMap: env, color: 0x14100c, metalness: 0.6, roughness: 0.3 });
  return {
    ...pairOf(lacquer, wall),
    barrel: black,
    steel: black,
    sight: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    dot: new THREE.MeshBasicMaterial({ color: 0xffb030 }),
    flash: 'gold',
    light: 0xffa040,
    smoke: 0xffe0b0,
    decorate: ({ model, slide, scene }) => {
      const wingMat = new THREE.MeshStandardMaterial({ map: wingTexture('monarch-wing'), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.5 });
      const wingGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
      const makeButterfly = (size) => {
        const b = new THREE.Group();
        const pair = [-1, 1].map((s) => {
          const pivot = new THREE.Group();
          b.add(pivot);
          const w = new THREE.Mesh(wingGeo, wingMat);
          w.scale.set(size, size, 1);
          w.rotation.x = -Math.PI / 2;
          if (s < 0) w.scale.x = -size;
          pivot.add(w);
          return { pivot, s };
        });
        const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.04, size * 0.03, size * 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x0a0604 }));
        bodyMesh.rotation.x = Math.PI / 2;
        b.add(bodyMesh);
        b.userData.flap = (t) => pair.forEach(({ pivot, s }) => (pivot.rotation.z = s * (0.3 + Math.sin(t) * 0.9)));
        return b;
      };
      // Grandes ailes sur les flancs de la culasse.
      const bigWings = [-1, 1].map((side) => {
        const pivot = new THREE.Group();
        pivot.position.set(96, 26, side * 12);
        slide.add(pivot);
        const w1 = new THREE.Mesh(wingGeo, wingMat);
        w1.scale.set(90, 80, 1);
        w1.rotation.set(0, side * -Math.PI / 2, Math.PI * 0.62);
        pivot.add(w1);
        const w2 = new THREE.Mesh(wingGeo, wingMat);
        w2.scale.set(70, 60, 1);
        w2.rotation.set(0, side * -Math.PI / 2, Math.PI * 0.9);
        pivot.add(w2);
        return { pivot, side };
      });
      // Papillons qui volettent autour de l'arme.
      const flock = Array.from({ length: 10 }, (_, i) => {
        const b = makeButterfly(14 + (i % 3) * 3);
        model.add(b);
        return { b, phase: (i / 10) * Math.PI * 2, radius: 90 + (i % 4) * 25, height: -40 + (i % 5) * 25, speed: 0.5 + (i % 3) * 0.2 };
      });
      const swarm = meshBurst(scene, { max: 30 });
      const mouth = anchorAt(model, 196, 16, 0);
      const tmp = new THREE.Vector3();
      return {
        update: (dt, time) => {
          bigWings.forEach(({ pivot, side }) => {
            pivot.rotation.x = side * (0.15 + Math.sin(time * 2.2) * 0.35);
          });
          flock.forEach(({ b, phase, radius, height, speed }) => {
            const a = time * speed + phase;
            b.position.set(80 + Math.cos(a) * radius, height + Math.sin(a * 2.3) * 20, Math.sin(a) * radius * 0.6);
            b.rotation.y = -a + Math.PI / 2;
            b.userData.flap(time * 14 + phase);
          });
          swarm.update(dt);
        },
        onFire: () => {
          mouth.getWorldPosition(tmp);
          for (let i = 0; i < 6; i += 1) {
            const b = makeButterfly(0.012);
            swarm.spawn(b, tmp, new THREE.Vector3((Math.random() - 0.2) * 0.6, 0.2 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6), {
              life: 1400,
              gravity: 0.1,
              drag: 1,
              spin: 0,
              shrink: false,
              onUpdate: (p) => p.mesh.userData.flap(performance.now() / 40),
            });
          }
        },
      };
    },
  };
}

// =============================================================================
// SCORPION — le prédateur du désert. Chitine ambrée à segments sombres. Une
// queue articulée part du talon de la poignée, s'arque au-dessus de la culasse
// et pointe son dard vers l'avant ; elle frappe à chaque tir. Deux pinces
// encadrent la bouche et s'ouvrent/se ferment ; du sable s'échappe au tir.
// =============================================================================

function scorpionFinish(env, { uniforms }) {
  const paint = (ctx, glow) => {
    if (!glow) {
      const g = ctx.createLinearGradient(0, G_LIVERY.minY, 0, G_LIVERY.maxY);
      g.addColorStop(0, '#6a3a0a');
      g.addColorStop(1, '#c8841a');
      ctx.fillStyle = g;
      ctx.fillRect(G_LIVERY.minX, G_LIVERY.minY, GW, GH);
      speckle(ctx, G_LIVERY, 6000, ['rgba(0,0,0,0.25)', 'rgba(255,220,150,0.2)'], 0.6, seeded(4301));
    }
    ctx.strokeStyle = glow ? 'rgba(255,170,60,0.9)' : '#1a0c02';
    ctx.lineWidth = glow ? 0.5 : 2.2;
    for (let x = G_LIVERY.minX; x < G_LIVERY.maxX; x += 14) strokeLine(ctx, [[x, 40], [x + 6, -140]]);
    for (let y = -40; y > -140; y -= 12) strokeLine(ctx, [[-20, y], [80, y + 4]]);
  };
  const color = livery('scorpion-color', (ctx) => paint(ctx, false), { color: true });
  const glow = livery('scorpion-glow', (ctx) => paint(ctx, true), { background: '#000000', color: true });
  const chitin = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }),
    uniforms,
    'totalEmissiveRadiance *= 0.3 + 0.4 * sin(uTime * 2.0 + vEmissiveMapUv.y * 20.0) + uFlare * 1.5;',
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x3a1a04, roughness: 0.2, clearcoat: 1 });
  const dark = new THREE.MeshStandardMaterial({ envMap: env, color: 0x1a0c04, metalness: 0.4, roughness: 0.3 });
  return {
    ...pairOf(chitin, wall),
    barrel: dark,
    steel: dark,
    sight: new THREE.MeshBasicMaterial({ color: 0xffb040 }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff4020 }),
    flash: 'ember',
    light: 0xffa040,
    smoke: 0xd8b880,
    decorate: ({ model, add, scene }) => {
      const segMat = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x8a4a0a, metalness: 0.2, roughness: 0.2, clearcoat: 1 });
      // Queue : chaîne de segments dont chacun pivote sur le précédent.
      const tailBase = new THREE.Group();
      tailBase.position.copy(gripPoint(-6, -120, 0));
      model.add(tailBase);
      const segments = [];
      let parent = tailBase;
      for (let k = 0; k < 16; k += 1) {
        const pivot = new THREE.Group();
        pivot.position.set(0, k === 0 ? 0 : 19 - k * 0.45, 0);
        parent.add(pivot);
        const size = Math.max(5, 11 - k * 0.4);
        const seg = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 10), segMat);
        seg.scale.set(0.9, 1.25, 0.9);
        seg.position.y = 10;
        pivot.add(seg);
        segments.push(pivot);
        parent = pivot;
      }
      const stinger = new THREE.Mesh(new THREE.ConeGeometry(4, 22, 10), new THREE.MeshStandardMaterial({ color: 0x1a0402, roughness: 0.3 }));
      stinger.position.y = 28;
      parent.add(stinger);
      const venom = new THREE.Mesh(new THREE.SphereGeometry(2, 10, 8), new THREE.MeshBasicMaterial({ color: 0x9aff4a }));
      venom.position.y = 40;
      parent.add(venom);
      // Pinces.
      const claws = [-1, 1].map((side) => {
        const arm = new THREE.Group();
        arm.position.set(176, 4, side * 14);
        model.add(arm);
        const upper = new THREE.Mesh(new RoundedBoxGeometry(34, 10, 10, 2, 3), segMat);
        upper.position.set(17, 0, 0);
        upper.rotation.y = -side * 0.35;
        arm.add(upper);
        const jaw = new THREE.Group();
        jaw.position.set(32, 0, -side * 10);
        arm.add(jaw);
        [-1, 1].forEach((j) => {
          const finger = new THREE.Mesh(new THREE.ConeGeometry(6, 30, 8), segMat);
          finger.rotation.z = -Math.PI / 2;
          finger.position.set(12, j * 5, 0);
          finger.userData.j = j;
          jaw.add(finger);
        });
        return jaw;
      });
      const sand = particleSystem(scene, softDotTexture('scorpion-sand', 'rgba(255,220,150,1)', 'rgba(200,140,60,0)'), { max: 60 });
      const mouth = anchorAt(model, 196, 16, 0);
      const tmp = new THREE.Vector3();
      const strike = { x: 0, v: 0 };
      return {
        update: (dt, time) => {
          springStep(strike, 0, 45, dt);
          const s = Math.max(0, strike.x);
          segments.forEach((seg, k) => {
            // Arc de repos au-dessus de la culasse, qui se tend vers l'avant pendant la frappe.
            // Les premiers segments remontent le long du dos de la poignée, les suivants se recourbent vers l'avant.
            const rest = k === 0 ? 0.06 : k < 8 ? 0.0 : -0.4;
            seg.rotation.z = rest - (k >= 8 ? s * 0.12 : 0) + Math.sin(time * 2 + k * 0.5) * 0.02;
          });
          claws.forEach((jaw) => {
            jaw.children.forEach((f) => {
              f.rotation.x = f.userData.j * (0.2 + Math.max(0, Math.sin(time * 1.8)) * 0.35 + s * 0.5);
            });
          });
          sand.update(dt);
        },
        onFire: () => {
          strike.v += 10;
          mouth.getWorldPosition(tmp);
          for (let i = 0; i < 14; i += 1) {
            sand.spawn(tmp, new THREE.Vector3((Math.random() - 0.3) * 0.8, (Math.random() - 0.3) * 0.6, (Math.random() - 0.5) * 0.8), { life: 600, size: 0.002, drag: 2.5, gravity: -1.5 });
          }
        },
      };
    },
  };
}

// =============================================================================
// QUANTIQUE — la physique des particules. Céramique blanche traversée de
// figures d'interférence cyan et violettes qui ondulent. Un anneau
// d'accélérateur de particules encercle l'arme, parcouru par une particule
// lumineuse qui laisse une traînée ; trois électrons gravitent autour d'un
// noyau dans la poignée ; un nuage de probabilité scintille devant la bouche.
// Au tir, la particule est éjectée le long du canon.
// =============================================================================

function quantumFinish(env, { uniforms }) {
  const paint = (ctx, glow) => {
    [[40, 0], [150, -40], [20, -90]].forEach(([cx, cy], i) => {
      for (let r = 4; r < 90; r += 5) {
        ctx.strokeStyle = glow ? (i % 2 ? 'rgba(170,110,255,0.8)' : 'rgba(90,240,255,0.8)') : 'rgba(80,100,140,0.35)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  };
  const color = livery('quantum-color', (ctx) => paint(ctx, false), { background: '#eef1f5', color: true });
  const glow = livery('quantum-glow', (ctx) => paint(ctx, true), { background: '#000000', color: true });
  const ceramic = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1, metalness: 0.05, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }),
    uniforms,
    'totalEmissiveRadiance *= 0.2 + 0.9 * pow(0.5 + 0.5 * sin(vEmissiveMapUv.x * 90.0 + vEmissiveMapUv.y * 60.0 - uTime * 3.0), 3.0) + uFlare * 1.5;',
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xe6e9ee, roughness: 0.2, clearcoat: 1 });
  const chrome = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.4, color: 0xc8d0da, metalness: 1, roughness: 0.12 });
  return {
    ...pairOf(ceramic, wall),
    barrel: chrome,
    steel: chrome,
    sight: new THREE.MeshBasicMaterial({ color: 0x5ff7ff }),
    dot: new THREE.MeshBasicMaterial({ color: 0xb46aff }),
    flash: 'plasma',
    light: 0x7ae8ff,
    smoke: 0xd8f4ff,
    decorate: ({ model, add, scene }) => {
      // Anneau d'accélérateur.
      const ring = new THREE.Group();
      ring.position.set(80, -20, 0);
      ring.rotation.set(0, 0, 0.2);
      model.add(ring);
      ring.add(new THREE.Mesh(new THREE.TorusGeometry(100, 4, 12, 96), chrome));
      const tubeGlow = new THREE.Mesh(new THREE.TorusGeometry(100, 1.6, 8, 96), new THREE.MeshBasicMaterial({ color: 0x5ff7ff, transparent: true, opacity: 0.5 }));
      ring.add(tubeGlow);
      for (let k = 0; k < 8; k += 1) {
        const a = (k / 8) * Math.PI * 2;
        const magnet = new THREE.Mesh(new RoundedBoxGeometry(14, 14, 14, 2, 2), new THREE.MeshStandardMaterial({ color: 0x3a4a8a, metalness: 0.6, roughness: 0.3 }));
        magnet.position.set(Math.cos(a) * 100, Math.sin(a) * 100, 0);
        ring.add(magnet);
      }
      const dot = softDotTexture('quantum-dot', 'rgba(230,255,255,1)', 'rgba(90,240,255,0)');
      const runner = glowSprite(dot, 0xbff8ff, 30);
      ring.add(runner);
      const trail = Array.from({ length: 12 }, (_, i) => {
        const s = glowSprite(dot, 0x5ff7ff, 22 - i * 1.5);
        ring.add(s);
        return s;
      });
      // Noyau et électrons dans la poignée.
      const atom = gripPoint(26, -80, 0);
      const nucleus = add(new THREE.SphereGeometry(7, 20, 14), new THREE.MeshBasicMaterial({ color: 0xb46aff }), atom.x, atom.y, 0);
      const electrons = [0, 1, 2].map((i) => {
        const orbitLine = add(new THREE.TorusGeometry(22, 0.4, 4, 48), new THREE.MeshBasicMaterial({ color: 0x9ab4ff, transparent: true, opacity: 0.5 }), atom.x, atom.y, 0);
        orbitLine.rotation.set(i * 1.05, i * 0.6, 0);
        const e = glowSprite(dot, 0x5ff7ff, 12);
        model.add(e);
        return { e, orbitLine, phase: i * 2.1 };
      });
      // Nuage de probabilité devant la bouche.
      const cloud = particleSystem(scene, dot, { max: 80 });
      const launch = particleSystem(scene, dot, { max: 20 });
      const cloudCenter = anchorAt(model, 230, 16, 0);
      const mouth = anchorAt(model, 196, 16, 0);
      const tmp = new THREE.Vector3();
      const dirVec = new THREE.Vector3();
      let clock = 0;
      return {
        update: (dt, time, flare) => {
          const a = time * 4;
          runner.position.set(Math.cos(a) * 100, Math.sin(a) * 100, 0);
          trail.forEach((s, i) => {
            const b = a - (i + 1) * 0.08;
            s.position.set(Math.cos(b) * 100, Math.sin(b) * 100, 0);
            s.material.opacity = 0.8 - i * 0.06;
          });
          tubeGlow.material.opacity = 0.4 + 0.2 * Math.sin(time * 5) + flare * 0.5;
          nucleus.scale.setScalar(1 + 0.1 * Math.sin(time * 6));
          electrons.forEach(({ e, orbitLine, phase }) => {
            const t = time * 3 + phase;
            tmp.set(Math.cos(t) * 22, Math.sin(t) * 22, 0).applyEuler(orbitLine.rotation).add(nucleus.position);
            e.position.copy(tmp);
          });
          clock += dt;
          while (clock > 0.03) {
            clock -= 0.03;
            cloudCenter.getWorldPosition(tmp);
            tmp.add(new THREE.Vector3((Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.04));
            cloud.spawn(tmp, new THREE.Vector3(), { life: 120 + Math.random() * 200, size: 0.0015 + Math.random() * 0.002, drag: 0, tint: Math.random() < 0.5 ? 0x5ff7ff : 0xb46aff });
          }
          cloud.update(dt);
          launch.update(dt);
        },
        onFire: () => {
          mouth.getWorldPosition(tmp);
          dirVec.set(1, 0, 0).transformDirection(model.matrixWorld);
          for (let i = 0; i < 6; i += 1) {
            launch.spawn(tmp, dirVec.clone().multiplyScalar(3 + i * 0.6), { life: 300, size: 0.006 - i * 0.0007, drag: 0 });
          }
        },
      };
    },
  };
}

// =============================================================================
// ARLEQUIN — le fou du roi. Losanges rouge, noir et or ponctués des quatre
// couleurs de cartes ; collerette à pointes alternées autour de la bouche,
// grelots d'or qui pendent de la culasse et se balancent, cartes à jouer qui
// tournoient en orbite. Au tir : pluie de confettis et gerbe de cartes.
// =============================================================================

function suit(ctx, kind, x, y, s) {
  ctx.beginPath();
  if (kind === 0) {
    ctx.moveTo(x, y + s);
    ctx.bezierCurveTo(x - s * 1.4, y, x - s * 0.5, y - s * 1.1, x, y - s * 0.3);
    ctx.bezierCurveTo(x + s * 0.5, y - s * 1.1, x + s * 1.4, y, x, y + s);
  } else if (kind === 1) {
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.7, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s * 0.7, y);
  } else if (kind === 2) {
    ctx.arc(x, y - s * 0.4, s * 0.45, 0, Math.PI * 2);
    ctx.arc(x - s * 0.45, y + s * 0.2, s * 0.45, 0, Math.PI * 2);
    ctx.arc(x + s * 0.45, y + s * 0.2, s * 0.45, 0, Math.PI * 2);
  } else {
    ctx.moveTo(x, y - s);
    ctx.bezierCurveTo(x - s * 1.4, y, x - s * 0.5, y + s * 1.1, x, y + s * 0.3);
    ctx.bezierCurveTo(x + s * 0.5, y + s * 1.1, x + s * 1.4, y, x, y - s);
  }
  ctx.fill();
}

function harlequinFinish(env, { uniforms }) {
  const paint = (ctx) => {
    const size = 14;
    for (let y = G_LIVERY.minY; y < G_LIVERY.maxY; y += size) {
      for (let x = G_LIVERY.minX; x < G_LIVERY.maxX; x += size) {
        const k = (Math.round(x / size) + Math.round(y / size)) % 3;
        ctx.fillStyle = ['#b3121e', '#0e0e12', '#d6aa45'][(k + 3) % 3];
        tracePolygon(ctx, [[x + size / 2, y], [x + size, y + size / 2], [x + size / 2, y + size], [x, y + size / 2]]);
        ctx.fill();
      }
    }
    const rand = seeded(4501);
    for (let i = 0; i < 40; i += 1) {
      const kind = Math.floor(rand() * 4);
      ctx.fillStyle = kind % 2 ? '#f4efe6' : '#f4efe6';
      suit(ctx, kind, G_LIVERY.minX + rand() * GW, G_LIVERY.minY + rand() * GH, 3);
    }
  };
  const color = livery('harlequin-color', paint, { background: '#0e0e12', color: true });
  const lacquer = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1, map: color, metalness: 0.1, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x0e0e12, roughness: 0.2, clearcoat: 1 });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.4, color: 0xe2b24a, metalness: 1, roughness: 0.2 });
  return {
    ...pairOf(lacquer, wall),
    barrel: gold,
    steel: gold,
    sight: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff3a4a }),
    flash: 'gold',
    light: 0xffd27a,
    smoke: 0xffe0f0,
    decorate: ({ model, slide, add, scene }) => {
      const cardTex = (kind) =>
        tiledTexture(`harlequin-card-${kind}`, 128, (ctx, size) => {
          ctx.fillStyle = '#f7f4ee';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = '#d6aa45';
          ctx.lineWidth = 6;
          ctx.strokeRect(6, 6, size - 12, size - 12);
          ctx.fillStyle = kind % 2 ? '#b3121e' : '#0e0e12';
          suit(ctx, kind, size / 2, size / 2, 26);
        }, { color: true });
      const cardMats = [0, 1, 2, 3].map((k) => new THREE.MeshStandardMaterial({ map: cardTex(k), side: THREE.DoubleSide, roughness: 0.5 }));
      const cardGeo = new THREE.PlaneGeometry(26, 36);
      const cards = Array.from({ length: 8 }, (_, i) => {
        const card = new THREE.Mesh(cardGeo, cardMats[i % 4]);
        model.add(card);
        return { card, phase: (i / 8) * Math.PI * 2 };
      });
      // Collerette à pointes autour de la bouche.
      const ruffColors = [new THREE.MeshStandardMaterial({ color: 0xb3121e, roughness: 0.4 }), new THREE.MeshStandardMaterial({ color: 0x0e0e12, roughness: 0.4 }), gold];
      for (let k = 0; k < 12; k += 1) {
        const a = (k / 12) * Math.PI * 2;
        const spike = add(new THREE.ConeGeometry(5, 18, 4), ruffColors[k % 3], 182, 16 + Math.sin(a) * 16, Math.cos(a) * 16, slide);
        spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.3, Math.sin(a), Math.cos(a)).normalize());
      }
      // Grelots.
      const bells = [[40, -1], [80, 1], [120, -1]].map(([x, side]) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, 0, side * 13);
        slide.add(pivot);
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 16, 6), ruffColors[0]);
        cord.position.y = -8;
        pivot.add(cord);
        const bell = new THREE.Mesh(new THREE.SphereGeometry(4.5, 14, 10), gold);
        bell.position.y = -19;
        pivot.add(bell);
        return { pivot, phase: x };
      });
      const confetti = particleSystem(scene, softDotTexture('harlequin-confetti', 'rgba(255,255,255,1)', 'rgba(255,255,255,0)'), { max: 120 });
      const flying = meshBurst(scene, { max: 12 });
      const mouth = anchorAt(model, 200, 16, 0);
      const tmp = new THREE.Vector3();
      const jingle = { x: 0, v: 0 };
      return {
        update: (dt, time) => {
          springStep(jingle, 0, 20, dt);
          cards.forEach(({ card, phase }, i) => {
            const a = time * 0.7 + phase;
            card.position.set(80 + Math.cos(a) * 120, -30 + Math.sin(a * 2) * 30, Math.sin(a) * 80);
            card.rotation.set(Math.sin(a) * 0.5, a * 2, i);
          });
          bells.forEach(({ pivot, phase }) => {
            pivot.rotation.x = Math.sin(time * 3 + phase) * 0.25 + jingle.x * 0.6;
          });
          confetti.update(dt);
          flying.update(dt);
        },
        onFire: () => {
          jingle.v += 5;
          mouth.getWorldPosition(tmp);
          const tints = [0xff3a4a, 0xffd27a, 0xffffff, 0x4a8aff];
          for (let i = 0; i < 26; i += 1) {
            confetti.spawn(tmp, new THREE.Vector3((Math.random() - 0.3) * 1.4, Math.random() * 1.2, (Math.random() - 0.5) * 1.4), { life: 900, size: 0.003, drag: 2, gravity: -1.5, tint: tints[i % 4] });
          }
          for (let i = 0; i < 3; i += 1) {
            const card = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.028), cardMats[Math.floor(Math.random() * 4)]);
            flying.spawn(card, tmp, new THREE.Vector3((Math.random() - 0.2) * 1.2, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 1.2), { life: 1100, gravity: -2, drag: 0.8, spin: 14, shrink: false });
          }
        },
      };
    },
  };
}

export const GLOCK_MYTHIC_SKINS = {
  chronos: { build: chronosFinish },
  monarch: { build: monarchFinish },
  scorpion: { build: scorpionFinish },
  quantum: { build: quantumFinish },
  harlequin: { build: harlequinFinish },
};
