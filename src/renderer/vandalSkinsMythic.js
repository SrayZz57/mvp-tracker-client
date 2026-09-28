import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  seeded,
  tiledTexture,
  speckle,
  animateEmissive,
  patchShader,
  particleSystem,
  softDotTexture,
  extrude,
  springStep,
  taperedTube,
  anchorAt,
  meshBurst,
  sigilTexture,
} from './weaponKit.js';
import { LIVERY, livery, tracePolygon, strokeLine, magazineOutline, glowSprite, ringTexture } from './vandalSkins.js';

// Skins « Ultimes » de la Vandal : le palier au-dessus des mythiques. Ils
// épaississent et transforment franchement la silhouette (blindage, cercles
// magiques, métal liquide, végétation, armure spectrale) et chaque élément a sa
// propre animation.

const W = LIVERY.maxX - LIVERY.minX;
const H = LIVERY.maxY - LIVERY.minY;

function faces(pair) {
  return { receiver: pair, dustCover: pair, magwell: pair, gasBlock: pair, muzzle: pair, stock: pair, grip: pair, handguard: pair, upperGuard: pair, magazine: pair };
}

function outlines(geo) {
  return [geo.stockOutline, geo.stockHole, geo.handguardOutline, magazineOutline(geo.magazineCurve)];
}

// =============================================================================
// TITAN — blindage de mécha. L'arme est cuirassée : plaques épaisses boulonnées
// sur les flancs de la carcasse et du garde-main, carénage massif sur le
// couvercle avec ouïes d'échappement, compensateur lourd à ailettes. Des vérins
// hydrauliques relient les plaques et se compriment à chaque tir ; un réacteur
// bleu tourne dans la crosse au cœur de trois anneaux ; des témoins clignotent ;
// au tir, les ouïes crachent un jet de chaleur.
// =============================================================================

function titanFinish(env, geo) {
  const plates = (ctx, glow) => {
    if (!glow) {
      speckle(ctx, LIVERY, 14000, ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.12)'], 0.6, seeded(2101));
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 0.9;
      const rand = seeded(2102);
      for (let x = LIVERY.minX; x < LIVERY.maxX; x += 34 + rand() * 30) strokeLine(ctx, [[x, LIVERY.minY], [x, LIVERY.maxY]]);
      for (let y = LIVERY.minY; y < LIVERY.maxY; y += 22 + rand() * 16) strokeLine(ctx, [[LIVERY.minX, y], [LIVERY.maxX, y]]);
      // Rivets aux intersections.
      ctx.fillStyle = 'rgba(200,205,215,0.5)';
      for (let i = 0; i < 400; i += 1) ctx.fillRect(LIVERY.minX + rand() * W, LIVERY.minY + rand() * H, 1.2, 1.2);
      // Bandes de danger orange sur les bords.
      ctx.save();
      ctx.lineWidth = 5;
      outlines(geo).forEach((o) => {
        tracePolygon(ctx, o);
        ctx.strokeStyle = '#e86a1a';
        ctx.stroke();
      });
      ctx.restore();
      ctx.fillStyle = '#e86a1a';
      [[260, 8, 30, 5], [560, 10, 40, 4], [120, -90, 44, 5]].forEach(([x, y, w, h]) => ctx.fillRect(x, y, w, h));
    }
    // Filets lumineux bleus (circuits d'énergie).
    ctx.strokeStyle = glow ? 'rgba(90,200,255,1)' : '#3aa8ff';
    ctx.lineWidth = 1;
    [[[240, -8], [320, -8], [330, 2], [480, 2]], [[520, -18], [700, -18]], [[20, 10], [180, 10], [200, 0]]].forEach((pts) => strokeLine(ctx, pts));
  };
  const color = livery('titan-color', (ctx) => plates(ctx, false), { background: '#2a2f38', color: true });
  const glow = livery('titan-glow', (ctx) => plates(ctx, true), { background: '#000000', color: true });
  const bump = livery('titan-bump', (ctx) => {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    const rand = seeded(2102);
    for (let x = LIVERY.minX; x < LIVERY.maxX; x += 34 + rand() * 30) strokeLine(ctx, [[x, LIVERY.minY], [x, LIVERY.maxY]]);
    for (let y = LIVERY.minY; y < LIVERY.maxY; y += 22 + rand() * 16) strokeLine(ctx, [[LIVERY.minX, y], [LIVERY.maxX, y]]);
  }, { background: '#b0b0b0' });
  const armor = animateEmissive(
    new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.2, metalness: 0.8, roughness: 0.38, bumpMap: bump, bumpScale: 1.5 }),
    geo.uniforms,
    'totalEmissiveRadiance *= 0.6 + 0.4 * step(0.5, fract(vEmissiveMapUv.x * 6.0 - uTime * 0.8)) + uFlare * 1.8;',
  );
  const wall = new THREE.MeshStandardMaterial({ envMap: env, color: 0x2a2f38, metalness: 0.8, roughness: 0.35 });
  const steel = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.1, color: 0x4a515c, metalness: 0.9, roughness: 0.3 });
  return {
    ...faces([armor, wall]),
    buttPad: [wall, wall],
    metal: steel,
    barrel: steel,
    dark: new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.7 }),
    sight: new THREE.MeshBasicMaterial({ color: 0x5ac8ff }),
    brass: new THREE.MeshStandardMaterial({ envMap: env, color: 0xb88a3a, metalness: 1, roughness: 0.3 }),
    flash: 'plasma',
    light: 0x7ac8ff,
    smoke: 0x9aa4b0,
    glow: [],
    decorate: ({ body, add, scene, parts }) => {
      const plateMat = armor;
      const orange = new THREE.MeshStandardMaterial({ envMap: env, color: 0xe86a1a, metalness: 0.4, roughness: 0.4 });
      const chrome = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.4, color: 0xd8dde4, metalness: 1, roughness: 0.1 });
      // Plaques de blindage épaisses sur les flancs (deux couches décalées).
      [-1, 1].forEach((side) => {
        add(new RoundedBoxGeometry(150, 40, 7, 3, 2.5), plateMat, 330, -2, side * 19);
        add(new RoundedBoxGeometry(110, 24, 5, 3, 2), steel, 340, -2, side * 23.5);
        add(new RoundedBoxGeometry(170, 46, 8, 3, 3), plateMat, 606, -4, side * 29);
        add(new RoundedBoxGeometry(120, 18, 5, 2, 2), orange, 606, 12, side * 33.5);
        [270, 390, 530, 680].forEach((x) => add(new THREE.CylinderGeometry(2.6, 2.6, 3, 10), chrome, x, 12, side * (x < 500 ? 23.5 : 33.8)).rotation.x = Math.PI / 2);
      });
      // Plaques claires en surépaisseur, fentes lumineuses et blindage de crosse.
      const pale = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1, color: 0x8a95a6, metalness: 0.7, roughness: 0.35 });
      const slit = new THREE.MeshBasicMaterial({ color: 0x5ac8ff });
      [-1, 1].forEach((side) => {
        add(new RoundedBoxGeometry(90, 20, 4, 2, 1.5), pale, 300, 6, side * 25);
        add(new RoundedBoxGeometry(70, 2.2, 1, 1, 0.4), slit, 300, -6, side * 27.2);
        add(new RoundedBoxGeometry(130, 2.2, 1, 1, 0.4), slit, 606, -20, side * 33.4);
        add(new RoundedBoxGeometry(120, 34, 6, 3, 2), pale, 70, 0, side * 19);
        add(new RoundedBoxGeometry(90, 2.2, 1, 1, 0.4), slit, 70, -12, side * 22.2);
        // Ailerons sur le carénage.
        [310, 350, 390].forEach((x) => {
          const fin = add(new RoundedBoxGeometry(24, 14, 3, 1, 1), pale, x, 50, side * 16);
          fin.rotation.x = side * 0.5;
        });
      });

      // Carénage massif sur le couvercle, avec ouïes.
      add(new RoundedBoxGeometry(280, 16, 38, 4, 4), plateMat, 370, 40, 0);
      const vents = [];
      [300, 340, 380, 420].forEach((x) => {
        add(new RoundedBoxGeometry(26, 3, 26, 1, 1), new THREE.MeshStandardMaterial({ color: 0x14161a }), x, 48.5, 0);
        const heat = add(new THREE.PlaneGeometry(22, 22), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.4 }), x, 48, 0);
        heat.rotation.x = -Math.PI / 2;
        vents.push(anchorAt(body, x, 52, 0));
        vents[vents.length - 1].userData.heat = heat;
      });
      // Vérins hydrauliques entre carcasse et garde-main.
      const rods = [-1, 1].map((side) => {
        const housing = add(new THREE.CylinderGeometry(5, 5, 60, 16), steel, 452, -16, side * 26);
        housing.rotation.z = Math.PI / 2;
        const rod = add(new THREE.CylinderGeometry(2.8, 2.8, 60, 12), chrome, 508, -16, side * 26);
        rod.rotation.z = Math.PI / 2;
        return rod;
      });
      // Compensateur lourd à ailettes.
      parts.muzzle.visible = false;
      add(new RoundedBoxGeometry(80, 36, 40, 4, 4), plateMat, 872, 4, 0);
      [-1, 1].forEach((side) => {
        [0, 1, 2].forEach((k) => add(new RoundedBoxGeometry(10, 44, 3, 1, 1), steel, 848 + k * 22, 4, side * 21.5));
      });
      // Réacteur dans la crosse : noyau et anneaux gyroscopiques.
      const core = add(new THREE.SphereGeometry(12, 24, 18), new THREE.MeshBasicMaterial({ color: 0x8adcff }), 110, -26, 0);
      const coreHalo = glowSprite(softDotTexture('titan-core', 'rgba(200,240,255,1)', 'rgba(60,160,255,0)'), 0x6ac8ff, 70);
      coreHalo.position.set(110, -26, 0);
      body.add(coreHalo);
      const rings = [0, 1, 2].map((i) => {
        const ring = add(new THREE.TorusGeometry(18 + i * 5, 1.6, 8, 40), chrome, 110, -26, 0);
        ring.rotation.set(i * 1.1, i * 0.7, 0);
        return ring;
      });
      const coreLight = new THREE.PointLight(0x6ac8ff, 0.6, 0.3, 2);
      coreLight.position.set(110, -26, 0);
      body.add(coreLight);
      // Témoins d'état.
      const leds = [0, 1, 2].map((k) => add(new THREE.SphereGeometry(1.8, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3aff8a }), 470, 12 - k * 7, -24));

      const exhaust = particleSystem(scene, softDotTexture('titan-heat', 'rgba(255,200,140,1)', 'rgba(255,90,20,0)'), { max: 80 });
      const haze = particleSystem(scene, softDotTexture('titan-haze', 'rgba(200,200,210,0.5)', 'rgba(200,200,210,0)'), { max: 40 });
      const tmp = new THREE.Vector3();
      const press = { x: 0, v: 0 };
      let clock = 0;
      return {
        update: (dt, time, flare) => {
          springStep(press, 0, 80, dt);
          rods.forEach((rod) => {
            rod.position.x = 508 - Math.max(0, press.x) * 22;
          });
          rings.forEach((ring, i) => {
            ring.rotation.x += dt * (0.8 + i * 0.5) * (1 + flare * 4);
            ring.rotation.y += dt * (0.5 + i * 0.3);
          });
          core.material.color.setHSL(0.55, 1, 0.72 + 0.08 * Math.sin(time * 4) + flare * 0.2);
          coreHalo.material.opacity = 0.6 + 0.2 * Math.sin(time * 4) + flare * 0.4;
          coreLight.intensity = 0.5 + flare * 1.5;
          leds.forEach((led, k) => led.material.color.setRGB(0.1, Math.sin(time * 3 + k * 2) > 0.3 ? 1 : 0.2, 0.4));
          vents.forEach((v, i) => {
            v.userData.heat.material.opacity = 0.25 + 0.15 * Math.sin(time * 5 + i) + flare * 0.6;
          });
          clock += dt;
          while (clock > 0.18) {
            clock -= 0.18;
            vents[Math.floor(Math.random() * vents.length)].getWorldPosition(tmp);
            haze.spawn(tmp, new THREE.Vector3(0, 0.03, 0), { life: 1200, size: 0.008, grow: 2.5, drag: 0.3, additive: false, peak: 0.18 });
          }
          exhaust.update(dt);
          haze.update(dt);
        },
        onFire: () => {
          press.v += 9;
          vents.forEach((v) => {
            v.getWorldPosition(tmp);
            for (let i = 0; i < 3; i += 1) {
              exhaust.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.1), { life: 350, size: 0.005, grow: 1.5, drag: 3 });
            }
          });
        },
      };
    },
  };
}

// =============================================================================
// ARCANE — une arme de mage. Cuir violet profond gravé de runes d'or qui
// s'allument en vagues. Trois cercles magiques tournent autour du canon, du
// garde-main et de la crosse, chacun à sa vitesse ; une gemme focale flotte
// devant la bouche avec trois éclats en orbite ; quatre pages de grimoire
// gravitent autour de la crosse ; des filets de mana spiralent le long du canon.
// Au tir, les cercles s'embrasent et grandissent d'un coup.
// =============================================================================

function arcaneRune(ctx, x, y, s, k) {
  ctx.beginPath();
  switch (k % 5) {
    case 0:
      ctx.moveTo(x - s, y + s);
      ctx.lineTo(x, y - s);
      ctx.lineTo(x + s, y + s);
      ctx.moveTo(x - s * 0.5, y);
      ctx.lineTo(x + s * 0.5, y);
      break;
    case 1:
      ctx.arc(x, y, s * 0.8, 0.3, Math.PI * 1.7);
      ctx.moveTo(x, y - s);
      ctx.lineTo(x, y + s);
      break;
    case 2:
      ctx.moveTo(x - s, y - s);
      ctx.lineTo(x + s, y + s);
      ctx.moveTo(x + s, y - s);
      ctx.lineTo(x - s, y + s);
      ctx.moveTo(x, y - s);
      ctx.lineTo(x, y + s);
      break;
    case 3:
      ctx.rect(x - s * 0.7, y - s, s * 1.4, s * 2);
      ctx.moveTo(x - s * 0.7, y);
      ctx.lineTo(x + s * 0.7, y - s * 0.5);
      break;
    default:
      ctx.moveTo(x - s, y);
      ctx.quadraticCurveTo(x, y - s * 2, x + s, y);
      ctx.quadraticCurveTo(x, y + s * 2, x - s, y);
  }
  ctx.stroke();
}

function arcaneFinish(env, geo) {
  const paint = (ctx, glow) => {
    if (!glow) {
      speckle(ctx, LIVERY, 20000, ['rgba(120,60,180,0.15)', 'rgba(10,0,20,0.25)'], 0.7, seeded(2201));
    }
    ctx.strokeStyle = glow ? 'rgba(230,190,255,1)' : '#d6aa45';
    ctx.lineWidth = 0.9;
    const rand = seeded(2202);
    [[-8, 240, 490], [4, 240, 490], [-6, 520, 700], [-40, 30, 200], [-60, 40, 170]].forEach(([y, x0, x1]) => {
      for (let x = x0; x < x1; x += 11) arcaneRune(ctx, x, y, 3.2, Math.floor(rand() * 5));
    });
    if (!glow) {
      ctx.strokeStyle = '#d6aa45';
      ctx.lineWidth = 1.6;
      outlines(geo).forEach((o) => {
        tracePolygon(ctx, o);
        ctx.stroke();
      });
    }
  };
  const color = livery('arcane-color', (ctx) => paint(ctx, false), { background: '#2a1240', color: true });
  const glow = livery('arcane-glow', (ctx) => paint(ctx, true), { background: '#000000', color: true });
  const leather = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.8, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.3, metalness: 0.1, roughness: 0.45, clearcoat: 0.5, sheen: 0.5, sheenColor: new THREE.Color(0xb080ff) }),
    geo.uniforms,
    'totalEmissiveRadiance *= 0.2 + 1.4 * pow(0.5 + 0.5 * sin(vEmissiveMapUv.x * 22.0 - uTime * 2.4), 4.0) + uFlare * 2.0;',
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x2a1240, roughness: 0.4, sheen: 0.5, sheenColor: new THREE.Color(0xb080ff) });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.3, color: 0xd6aa45, metalness: 1, roughness: 0.22 });
  return {
    ...faces([leather, wall]),
    buttPad: [gold, gold],
    metal: gold,
    barrel: new THREE.MeshStandardMaterial({ envMap: env, color: 0x3a1a5a, metalness: 0.9, roughness: 0.2 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0c0414, roughness: 0.6 }),
    sight: new THREE.MeshBasicMaterial({ color: 0xe0b0ff }),
    brass: gold,
    flash: 'void',
    light: 0xc080ff,
    smoke: 0xd8b8ff,
    glow: [],
    makeShell: () => new THREE.Mesh(new THREE.OctahedronGeometry(0.006, 0), new THREE.MeshBasicMaterial({ color: 0xe0b0ff })),
    decorate: ({ body, add, scene }) => {
      const circleMat = (key, color, star, seed) =>
        new THREE.MeshBasicMaterial({ map: sigilTexture(key, { color, star, seed }), transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
      const circles = [
        { x: 770, y: 4, z: 0, size: 120, rot: [0, Math.PI / 2, 0], speed: 0.9, mat: circleMat('arcane-c1', '#c890ff', 6, 1) },
        { x: 600, y: 0, z: 0, size: 150, rot: [0, Math.PI / 2, 0], speed: -0.5, mat: circleMat('arcane-c2', '#ffd27a', 5, 2) },
        { x: 110, y: -26, z: 0, size: 110, rot: [0, 0, 0], speed: 0.35, mat: circleMat('arcane-c3', '#8ad8ff', 7, 3) },
      ].map((c) => {
        const pivot = new THREE.Group();
        pivot.position.set(c.x, c.y, c.z);
        pivot.rotation.set(...c.rot);
        body.add(pivot);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(c.size, c.size), c.mat);
        pivot.add(mesh);
        return { ...c, mesh };
      });
      // Gemme focale devant la bouche et ses éclats.
      const gemMat = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 2, color: 0xc890ff, roughness: 0.02, transmission: 0.7, thickness: 6, ior: 2, emissive: 0x7a3aff, emissiveIntensity: 0.8, flatShading: true });
      const focus = add(new THREE.OctahedronGeometry(12, 0), gemMat, 950, 4, 0);
      focus.scale.set(1.6, 1, 1);
      const shards = [0, 1, 2].map(() => add(new THREE.OctahedronGeometry(4, 0), gemMat, 950, 4, 0));
      const focusHalo = glowSprite(softDotTexture('arcane-focus', 'rgba(240,210,255,1)', 'rgba(140,60,255,0)'), 0xc890ff, 80);
      focusHalo.position.set(950, 4, 0);
      body.add(focusHalo);
      // Pages de grimoire en orbite autour de la crosse.
      const pageTex = tiledTexture('arcane-page', 128, (ctx, size) => {
        ctx.fillStyle = '#f0e2c0';
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = '#5a2a8a';
        ctx.lineWidth = 2;
        const rand = seeded(2203);
        for (let y = 16; y < size - 10; y += 14) for (let x = 12; x < size - 12; x += 16) arcaneRune(ctx, x, y, 4, Math.floor(rand() * 5));
      }, { color: true });
      const pages = [0, 1, 2, 3].map((i) => {
        const page = new THREE.Mesh(new THREE.PlaneGeometry(28, 36), new THREE.MeshStandardMaterial({ map: pageTex, side: THREE.DoubleSide, roughness: 0.9, emissive: 0x3a2a10, emissiveIntensity: 0.3 }));
        body.add(page);
        return { page, phase: (i / 4) * Math.PI * 2 };
      });
      // Filets de mana : sprites qui spiralent le long du canon.
      const manaTex = softDotTexture('arcane-mana', 'rgba(240,220,255,1)', 'rgba(150,80,255,0)');
      const mana = Array.from({ length: 40 }, (_, i) => {
        const sprite = glowSprite(manaTex, i % 3 ? 0xc890ff : 0xffd27a, 6);
        body.add(sprite);
        return { sprite, t: Math.random(), speed: 0.3 + Math.random() * 0.3, phase: Math.random() * Math.PI * 2 };
      });
      const rings = particleSystem(scene, ringTexture('arcane', 'rgba(200,140,255,0.9)'), { max: 8 });
      const mouth = anchorAt(body, 950, 4, 0);
      const tmp = new THREE.Vector3();
      const burst = { x: 0, v: 0 };
      return {
        muzzleX: 912,
        update: (dt, time, flare) => {
          springStep(burst, 0, 14, dt);
          circles.forEach((c) => {
            c.mesh.rotation.z += dt * c.speed * (1 + flare * 5);
            const s = 1 + Math.max(0, burst.x) * 0.35;
            c.mesh.scale.set(s, s, 1);
            c.mat.opacity = 0.65 + 0.2 * Math.sin(time * 2 + c.x) + flare * 0.3;
          });
          focus.rotation.y += dt * 1.2;
          focus.position.y = 4 + Math.sin(time * 1.8) * 3;
          shards.forEach((s, i) => {
            const a = time * 2.2 + (i * Math.PI * 2) / 3;
            s.position.set(950 + Math.cos(a) * 8, 4 + Math.sin(a * 1.3) * 22, Math.sin(a) * 22);
            s.rotation.y += dt * 3;
          });
          focusHalo.material.opacity = 0.6 + 0.25 * Math.sin(time * 3) + flare * 0.5;
          pages.forEach(({ page, phase }) => {
            const a = time * 0.6 + phase;
            page.position.set(110 + Math.cos(a) * 80, 10 + Math.sin(a * 2) * 14, Math.sin(a) * 60);
            page.rotation.set(Math.sin(a) * 0.4, a, Math.cos(a) * 0.2);
          });
          mana.forEach((m) => {
            m.t += dt * m.speed;
            if (m.t > 1) m.t -= 1;
            const x = 480 + m.t * 470;
            const a = m.t * 18 + m.phase + time;
            const r = 22 * (1 - m.t * 0.6);
            m.sprite.position.set(x, 4 + Math.sin(a) * r, Math.cos(a) * r);
            m.sprite.material.opacity = Math.sin(m.t * Math.PI);
          });
          rings.update(dt);
        },
        onFire: () => {
          burst.v += 6;
          mouth.getWorldPosition(tmp);
          rings.spawn(tmp, new THREE.Vector3(), { life: 420, size: 0.04, grow: 5, drag: 0 });
        },
      };
    },
  };
}

// =============================================================================
// MERCURE — métal liquide vivant. Toute l'arme est un chrome parfait dont la
// surface ondule réellement (déformation calculée dans le shader, sommet par
// sommet) ; des vrilles liquides s'enroulent autour de la crosse et de la
// carcasse ; des gouttes flottent, fusionnent et se séparent autour du garde-main
// ; une goutte s'étire sous le canon puis tombe ; la bouche est une couronne de
// pointes qui respirent. Au tir, éclaboussure de gouttelettes de chrome.
// =============================================================================

function mercuryFinish(env, geo) {
  const ripple = `
    float w1 = sin(position.x * 0.09 + uTime * 3.1) * sin(position.y * 0.11 - uTime * 2.3);
    float w2 = sin(position.x * 0.05 - uTime * 1.7 + position.y * 0.07);
    transformed += objectNormal * (w1 * 0.9 + w2 * 0.6) * (1.0 + uFlare * 2.5);
  `;
  const chrome = () =>
    patchShader(new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 2.2, color: 0xe8ecf2, metalness: 1, roughness: 0.035 }), geo.uniforms, { vertex: ripple });
  const liquid = chrome();
  const liquidWall = chrome();
  const still = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 2.2, color: 0xe8ecf2, metalness: 1, roughness: 0.035 });
  return {
    ...faces([liquid, liquidWall]),
    buttPad: [liquidWall, liquidWall],
    metal: still,
    barrel: still,
    dark: new THREE.MeshStandardMaterial({ envMap: env, color: 0x30343a, metalness: 1, roughness: 0.2 }),
    sight: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    brass: still,
    flash: 'frost',
    light: 0xf0f4ff,
    smoke: 0xd8dde4,
    glow: [],
    makeShell: () => new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 10), still),
    decorate: ({ body, add, scene, parts }) => {
      const flowing = chrome();
      // Vrilles liquides autour de la crosse et de la carcasse.
      const vrille = (pts, r) => body.add(new THREE.Mesh(taperedTube(new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))), 90, r, 12, (t) => 0.35 + 0.65 * Math.sin(t * Math.PI)), flowing));
      vrille([[10, -100, 18], [60, -40, 22], [120, 20, 18], [190, 30, -18], [240, 10, -24], [300, -24, -20], [360, -30, 18], [420, 0, 22]], 6);
      vrille([[20, 26, -18], [80, -60, -20], [150, -40, 22], [200, 20, 20]], 4.5);
      // Gouttes qui flottent autour du garde-main.
      const drops = Array.from({ length: 9 }, (_, i) => {
        const mesh = add(new THREE.SphereGeometry(6 + (i % 3) * 3, 24, 18), still, 600, 0, 0);
        return { mesh, phase: i * 0.7, radius: 40 + (i % 3) * 12, speed: 0.6 + (i % 4) * 0.15 };
      });
      // Goutte qui s'étire sous le canon puis tombe.
      const hang = add(new THREE.SphereGeometry(5, 20, 14).translate(0, -5, 0), still, 780, -10, 0);
      let hangT = 0;
      // Couronne de pointes liquides à la bouche.
      parts.muzzle.visible = false;
      add(new THREE.SphereGeometry(16, 28, 20), flowing, 868, 4, 0).scale.set(2.2, 1, 1);
      const spikes = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
        const a = (k / 8) * Math.PI * 2;
        const spike = add(new THREE.ConeGeometry(4, 26, 12), still, 900, 4 + Math.sin(a) * 12, Math.cos(a) * 12);
        spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1.4, Math.sin(a), Math.cos(a)).normalize());
        return { spike, phase: a };
      });
      const splash = meshBurst(scene, { max: 50 });
      const dropletGeo = new THREE.SphereGeometry(0.0035, 10, 8);
      const mouth = anchorAt(body, 918, 4, 0);
      const tmp = new THREE.Vector3();
      return {
        muzzleX: 918,
        update: (dt, time, flare) => {
          drops.forEach((d) => {
            const a = time * d.speed + d.phase;
            d.mesh.position.set(600 + Math.cos(a) * 110, 4 + Math.sin(a * 1.7) * d.radius * 0.6, Math.sin(a) * d.radius);
            const pulse = 1 + 0.15 * Math.sin(time * 3 + d.phase);
            d.mesh.scale.set(pulse * 1.2, pulse, pulse);
          });
          hangT += dt / 1.8;
          if (hangT >= 1) {
            hangT = 0;
            hang.getWorldPosition(tmp);
            tmp.y -= 0.012;
            splash.spawn(new THREE.Mesh(dropletGeo, still), tmp, new THREE.Vector3(0, -0.1, 0), { life: 700, gravity: -7, drag: 0, spin: 0, shrink: false });
          }
          hang.scale.set(1 - hangT * 0.3, 0.4 + hangT * 1.6, 1 - hangT * 0.3);
          spikes.forEach(({ spike, phase }) => {
            spike.scale.set(1, 0.7 + 0.35 * Math.sin(time * 2.5 + phase) + flare * 0.8, 1);
          });
          splash.update(dt);
        },
        onFire: () => {
          mouth.getWorldPosition(tmp);
          for (let i = 0; i < 14; i += 1) {
            const m = new THREE.Mesh(dropletGeo, still);
            m.scale.setScalar(0.6 + Math.random() * 1.2);
            splash.spawn(m, tmp, new THREE.Vector3((Math.random() - 0.2) * 1.8, (Math.random() - 0.1) * 1.4, (Math.random() - 0.5) * 1.8), { life: 800, gravity: -5, drag: 1.5, spin: 0 });
          }
        },
      };
    },
  };
}

// =============================================================================
// SYLVE — la forêt enchantée. Bois d'écorce sombre veiné d'une sève lumineuse,
// coussins de mousse sur les arêtes, lianes feuillues qui enlacent le garde-main
// et le canon, bouquets de champignons bioluminescents (cyan, bleu, turquoise)
// qui pulsent lentement sur la crosse et le couvercle. Des lucioles errent
// autour de l'arme ; au tir, nuage de spores lumineuses.
// =============================================================================

function sylvanFinish(env, geo) {
  const paint = (ctx, glow) => {
    if (!glow) {
      const rand = seeded(2401);
      for (let y = LIVERY.minY; y < LIVERY.maxY; y += 1.4) {
        ctx.strokeStyle = rand() < 0.5 ? 'rgba(20,10,4,0.6)' : 'rgba(110,70,40,0.35)';
        ctx.lineWidth = 0.4 + rand() * 0.8;
        ctx.beginPath();
        const phase = rand() * 10;
        for (let x = LIVERY.minX; x <= LIVERY.maxX; x += 8) {
          const yy = y + Math.sin(x * 0.03 + phase) * 3;
          if (x === LIVERY.minX) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      // Mousse.
      for (let i = 0; i < 60; i += 1) {
        const x = LIVERY.minX + rand() * W;
        const y = LIVERY.minY + rand() * H;
        const r = 6 + rand() * 18;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(70,120,40,0.85)');
        g.addColorStop(1, 'rgba(70,120,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      speckle(ctx, LIVERY, 12000, ['rgba(120,180,60,0.35)', 'rgba(0,0,0,0.3)'], 0.6, seeded(2402));
    }
    // Veines de sève lumineuse.
    const rand2 = seeded(2403);
    ctx.lineCap = 'round';
    for (let i = 0; i < 26; i += 1) {
      let x = LIVERY.minX + rand2() * W;
      let y = LIVERY.minY + rand2() * H;
      let a = rand2() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 14; k += 1) {
        a += (rand2() - 0.5) * 0.8;
        x += Math.cos(a) * 6;
        y += Math.sin(a) * 6;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = glow ? 'rgba(90,255,210,0.9)' : 'rgba(80,200,170,0.8)';
      ctx.lineWidth = glow ? 1 : 0.8;
      ctx.stroke();
    }
  };
  const color = livery('sylvan-color', (ctx) => paint(ctx, false), { background: '#2a1a0e', color: true });
  const glow = livery('sylvan-glow', (ctx) => paint(ctx, true), { background: '#000000', color: true });
  const bark = animateEmissive(
    new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.4, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1, metalness: 0, roughness: 0.85 }),
    geo.uniforms,
    'totalEmissiveRadiance *= 0.3 + 0.8 * pow(0.5 + 0.5 * sin(uTime * 1.1 + vEmissiveMapUv.x * 14.0 + vEmissiveMapUv.y * 9.0), 2.0) + uFlare;',
  );
  const wall = new THREE.MeshStandardMaterial({ envMap: env, color: 0x2a1a0e, roughness: 0.85 });
  const bronze = new THREE.MeshStandardMaterial({ envMap: env, color: 0x6a5a3a, metalness: 0.8, roughness: 0.5 });
  return {
    ...faces([bark, wall]),
    buttPad: [wall, wall],
    metal: bronze,
    barrel: bronze,
    dark: new THREE.MeshStandardMaterial({ color: 0x0c0804, roughness: 0.8 }),
    sight: new THREE.MeshBasicMaterial({ color: 0x7affd8 }),
    brass: bronze,
    flash: 'jade',
    light: 0x7affd8,
    smoke: 0xc8ffd8,
    glow: [],
    makeShell: () => {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshStandardMaterial({ color: 0x5aa83a, roughness: 0.6 }));
      leaf.scale.set(1, 0.2, 0.5);
      return leaf;
    },
    decorate: ({ body, add, scene }) => {
      const moss = new THREE.MeshStandardMaterial({ color: 0x4a7a2a, roughness: 1, flatShading: true });
      const vine = new THREE.MeshStandardMaterial({ color: 0x2a4a1a, roughness: 0.8 });
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x5aa83a, roughness: 0.6, side: THREE.DoubleSide });
      const stemMat = new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.7 });
      // Coussins de mousse sur les arêtes.
      [[40, 28, 0, 14], [150, 24, 0, 12], [300, 38, 0, 11], [420, 38, 0, 10], [640, 36, 0, 12], [60, -90, 0, 13]].forEach(([x, y, z, r]) => {
        const m = add(new THREE.IcosahedronGeometry(r, 1), moss, x, y, z);
        m.scale.set(1.8, 0.45, 1.3);
      });
      // Lianes feuillues.
      const leafGeo = new THREE.SphereGeometry(1, 8, 6);
      const liane = (pts) => {
        const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
        body.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 3.2, 8, false), vine));
        const leaves = [];
        for (let k = 1; k < 30; k += 1) {
          const p = curve.getPointAt(k / 30);
          const leaf = new THREE.Mesh(leafGeo, leafMat);
          leaf.position.copy(p);
          leaf.scale.set(10, 1.2, 5);
          leaf.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
          body.add(leaf);
          leaves.push(leaf);
        }
        return leaves;
      };
      const pts = [];
      for (let k = 0; k <= 40; k += 1) {
        const x = 500 + k * 9.5;
        const a = k * 0.55;
        const r = x < 715 ? 32 : 15;
        pts.push([x, 2 + Math.sin(a) * r, Math.cos(a) * r]);
      }
      const leaves = [...liane(pts), ...liane([[20, -100, 18], [80, -50, 20], [150, 0, 19], [220, 26, 10]])];
      // Champignons bioluminescents.
      const mushrooms = [];
      const shroom = (x, y, z, size, hue) => {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        body.add(g);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.18, size * 0.24, size * 1.1, 10), stemMat);
        stem.position.y = size * 0.55;
        g.add(stem);
        const capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.8, 0.45), emissive: new THREE.Color().setHSL(hue, 1, 0.5), emissiveIntensity: 1.2, roughness: 0.4 });
        const cap = new THREE.Mesh(new THREE.SphereGeometry(size * 0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
        cap.position.y = size * 1.05;
        g.add(cap);
        mushrooms.push({ capMat, phase: Math.random() * 6 });
      };
[[30, 30, 6, 30, 0.5], [50, 30, -8, 22, 0.55], [18, 28, -4, 16, 0.6], [70, 28, 4, 14, 0.52], [320, 42, 4, 24, 0.48], [345, 42, -6, 16, 0.58], [300, 40, -3, 12, 0.62], [650, 38, 6, 26, 0.52], [676, 38, -6, 17, 0.6], [630, 38, -2, 12, 0.5], [80, -100, 12, 20, 0.5], [100, -94, -10, 14, 0.56]].forEach(([x, y, z, s, h]) => shroom(x, y, z, s, h));
      // Lucioles errantes.
      const fireflyTex = softDotTexture('sylvan-firefly', 'rgba(255,255,200,1)', 'rgba(180,255,80,0)');
      const flies = Array.from({ length: 16 }, () => {
        const sprite = glowSprite(fireflyTex, 0xd8ff7a, 9);
        body.add(sprite);
        return { sprite, center: new THREE.Vector3(100 + Math.random() * 750, -40 + Math.random() * 110, (Math.random() - 0.5) * 90), phase: Math.random() * 10, speed: 0.4 + Math.random() * 0.5 };
      });
      const spores = particleSystem(scene, softDotTexture('sylvan-spore', 'rgba(220,255,240,1)', 'rgba(90,255,210,0)'), { max: 80 });
      const mouth = anchorAt(body, 905, 4, 0);
      const tmp = new THREE.Vector3();
      return {
        update: (dt, time, flare) => {
          mushrooms.forEach((m) => {
            m.capMat.emissiveIntensity = 0.8 + 0.5 * Math.sin(time * 1.3 + m.phase) + flare * 1.2;
          });
          leaves.forEach((leaf, i) => {
            leaf.rotation.z += Math.sin(time * 2 + i) * 0.002;
          });
          flies.forEach((f) => {
            const a = time * f.speed + f.phase;
            f.sprite.position.set(f.center.x + Math.sin(a * 1.3) * 30, f.center.y + Math.sin(a * 2.1) * 14, f.center.z + Math.cos(a) * 25);
            f.sprite.material.opacity = 0.3 + 0.7 * Math.max(0, Math.sin(time * 3 + f.phase * 2));
          });
          spores.update(dt);
        },
        onFire: () => {
          mouth.getWorldPosition(tmp);
          for (let i = 0; i < 22; i += 1) {
            spores.spawn(tmp, new THREE.Vector3((Math.random() - 0.3) * 0.8, (Math.random() - 0.2) * 0.6, (Math.random() - 0.5) * 0.8), { life: 1300, size: 0.0025 + Math.random() * 0.002, drag: 2, gravity: 0.05 });
          }
        },
      };
    },
  };
}

// =============================================================================
// SPECTRE — le samouraï fantôme. Laque indigo gravée de vagues d'argent, que
// parcourt une flamme spirituelle bleue. Une tsuba de sabre sépare la carcasse
// du garde-main ; la poignée est tressée comme celle d'un katana ; des lames
// d'armure laquées pendent sous le garde-main et oscillent ; une aura fantôme
// double la silhouette de l'arme ; des flammes bleues montent de son dos et
// trois hitodama (feux follets) tournent autour d'elle. Au tir, la flamme
// jaillit et l'aura s'étend.
// =============================================================================

function spectreFinish(env, geo) {
  const paint = (ctx, glow) => {
    ctx.strokeStyle = glow ? 'rgba(120,200,255,1)' : 'rgba(170,200,230,0.8)';
    ctx.lineWidth = glow ? 0.7 : 0.9;
    for (let row = 0; row < 10; row += 1) {
      for (let x = LIVERY.minX; x < LIVERY.maxX; x += 16) {
        const y = LIVERY.minY + row * 30 + ((x / 16) % 2 ? 8 : 0);
        for (let r = 3; r <= 12; r += 3) {
          ctx.beginPath();
          ctx.arc(x, y, r, Math.PI, 0);
          ctx.stroke();
        }
      }
    }
    // Tressage de la poignée (losanges).
    if (!glow) {
      ctx.save();
      tracePolygon(ctx, [[322, -20], [376, -20], [345, -140], [287, -127]]);
      ctx.clip();
      ctx.fillStyle = '#0a0a18';
      ctx.fillRect(280, -145, 100, 130);
      ctx.fillStyle = '#e8e8f0';
      for (let y = -140; y < -18; y += 12) {
        for (let x = 280; x < 380; x += 12) {
          tracePolygon(ctx, [[x, y + 6], [x + 6, y], [x + 12, y + 6], [x + 6, y + 12]]);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  };
  const color = livery('spectre-color', (ctx) => paint(ctx, false), { background: '#141a3a', color: true });
  const glow = livery('spectre-glow', (ctx) => paint(ctx, true), { background: '#000000', color: true });
  const spirit = `
    float flame = pow(0.5 + 0.5 * sin(vEmissiveMapUv.y * 30.0 - uTime * 4.0 + sin(vEmissiveMapUv.x * 40.0 + uTime) * 1.5), 3.0);
    totalEmissiveRadiance *= 0.25 + flame * 1.5 + uFlare * 2.0;
  `;
  const lacquer = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.9, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.2, metalness: 0.1, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04 }),
    geo.uniforms,
    spirit,
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x141a3a, roughness: 0.15, clearcoat: 1 });
  const silver = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.3, color: 0xc8d0dc, metalness: 1, roughness: 0.2 });
  return {
    ...faces([lacquer, wall]),
    buttPad: [wall, wall],
    metal: silver,
    barrel: new THREE.MeshStandardMaterial({ envMap: env, color: 0x1a2040, metalness: 0.9, roughness: 0.2 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x04060c, roughness: 0.6 }),
    sight: new THREE.MeshBasicMaterial({ color: 0x8ad8ff }),
    brass: silver,
    flash: 'frost',
    light: 0x6ab8ff,
    smoke: 0xa8d8ff,
    glow: [],
    decorate: ({ body, add, scene, parts }) => {
      // Tsuba (garde de sabre ajourée) entre carcasse et garde-main.
      const tsuba = new THREE.Shape();
      tsuba.absarc(0, 0, 34, 0, Math.PI * 2, false);
      [0, 1, 2, 3].forEach((k) => {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        const hole = new THREE.Path();
        hole.absarc(Math.cos(a) * 20, Math.sin(a) * 20, 6, 0, Math.PI * 2, true);
        tsuba.holes.push(hole);
      });
      const guard = add(extrude(tsuba, 5, 1.2), silver, 506, -2, 0);
      guard.rotation.y = Math.PI / 2;
      // Lames d'armure laquées (kusazuri) sous le garde-main.
      const lamellae = [];
      [-1, 0, 1].forEach((col) => {
        const pivot = new THREE.Group();
        pivot.position.set(560 + (col + 1) * 52, -28, 0);
        body.add(pivot);
        for (let row = 0; row < 3; row += 1) {
          const plate = new THREE.Mesh(new RoundedBoxGeometry(46, 12, 36, 2, 2), row % 2 ? wall : lacquer);
          plate.position.y = -8 - row * 13;
          pivot.add(plate);
          const cord = new THREE.Mesh(new THREE.BoxGeometry(46, 1.4, 37), new THREE.MeshStandardMaterial({ color: 0xc8202a }));
          cord.position.y = -2 - row * 13;
          pivot.add(cord);
        }
        lamellae.push({ pivot, phase: col });
      });
      // Aura fantôme : doublure agrandie et translucide de la silhouette.
      const auraMat = new THREE.MeshBasicMaterial({ color: 0x4a9aff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide });
      const auras = [parts.stock, parts.handguard, parts.dustCover, parts.magazine].map((p) => {
        const ghost = new THREE.Mesh(p.geometry, auraMat);
        ghost.position.copy(p.position);
        ghost.scale.set(1, 1, 1.6);
        body.add(ghost);
        return ghost;
      });
      // Hitodama : feux follets en orbite.
      const wispTex = softDotTexture('spectre-wisp', 'rgba(220,240,255,1)', 'rgba(60,140,255,0)');
      const wisps = [0, 1, 2].map((i) => {
        const core = glowSprite(wispTex, 0x9ad8ff, 30);
        body.add(core);
        return { core, phase: (i / 3) * Math.PI * 2 };
      });
      const flames = particleSystem(scene, softDotTexture('spectre-flame', 'rgba(200,235,255,1)', 'rgba(40,100,255,0)'), { max: 160 });
      const emitter = anchorAt(body, 0, 0, 0);
      const mouth = anchorAt(body, 905, 4, 0);
      const tmp = new THREE.Vector3();
      const surge = { x: 0, v: 0 };
      let clock = 0;
      return {
        update: (dt, time, flare) => {
          springStep(surge, 0, 12, dt);
          lamellae.forEach(({ pivot, phase }) => {
            pivot.rotation.z = Math.sin(time * 1.6 + phase) * 0.06 + Math.max(0, surge.x) * 0.1;
          });
          auras.forEach((a) => {
            const s = 1 + Math.max(0, surge.x) * 0.15;
            a.scale.set(1, 1, 1.6 * s);
          });
          auraMat.opacity = 0.1 + 0.05 * Math.sin(time * 2.4) + flare * 0.2;
          wisps.forEach((w, i) => {
            const a = time * 0.9 + w.phase;
            w.core.position.set(450 + Math.cos(a) * 420, 30 + Math.sin(a * 2) * 40, Math.sin(a) * 90);
            w.core.material.opacity = 0.7 + 0.3 * Math.sin(time * 6 + i);
            w.core.getWorldPosition(tmp);
            if (Math.random() < dt * 30) flames.spawn(tmp, new THREE.Vector3(0, 0.01, 0), { life: 450, size: 0.006, drag: 0, peak: 0.6 });
          });
          clock += dt;
          while (clock > 0.025) {
            clock -= 0.025;
            emitter.position.set(40 + Math.random() * 820, 30 + Math.random() * 10, (Math.random() - 0.5) * 30);
            emitter.getWorldPosition(tmp);
            flames.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.01, 0.04 + Math.random() * 0.04, 0), { life: 650, size: 0.005 + Math.random() * 0.004, grow: 0.4, drag: 0.5, peak: 0.8 });
          }
          flames.update(dt);
        },
        onFire: () => {
          surge.v += 7;
          mouth.getWorldPosition(tmp);
          for (let i = 0; i < 18; i += 1) {
            flames.spawn(tmp, new THREE.Vector3((Math.random() - 0.2) * 1.4, (Math.random() - 0.2) * 1, (Math.random() - 0.5) * 1.4), { life: 420, size: 0.008, grow: 1, drag: 3 });
          }
        },
      };
    },
  };
}

export const VANDAL_MYTHIC_SKINS = {
  titan: { labelKey: 'aimTrainer.skinTitan', build: titanFinish },
  arcane: { labelKey: 'aimTrainer.skinArcane', build: arcaneFinish },
  mercury: { labelKey: 'aimTrainer.skinMercury', build: mercuryFinish },
  sylvan: { labelKey: 'aimTrainer.skinSylvan', build: sylvanFinish },
  spectre: { labelKey: 'aimTrainer.skinSpectre', build: spectreFinish },
};
