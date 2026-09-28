import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { seeded, tiledTexture, speckle, animateEmissive, particleSystem, softDotTexture, springStep, anchorAt, meshBurst, extrude } from './weaponKit.js';
import { G_LIVERY, SLIDE, GRIP, FRAME, livery, tracePolygon, pairOf } from './glockSkins.js';
import { gripPoint } from './glockGeometry.js';
import {
  captureParts,
  placePart,
  placePartScaled,
  introRunner,
  orderBy,
  liveCanvas,
  shockRings,
  easeOutCubic,
  easeOutBack,
  easeOutElastic,
  easeInOut,
  clamp01,
} from './transcendentKit.js';

// Skins Transcendants du Glock (suite de Métamorphe) : Arcade, Hanabi, Mirage,
// Confiserie, Kintsugi. Repère : culasse x 0 → 186, y 0 → 30 (suit le recul
// via `slide`), carcasse jusqu'à y ≈ -15, poignée jusqu'à y ≈ -104, axe du
// canon y = 16. Flancs de culasse z = ±12,5, de carcasse ±13,5. Rien au-dessus
// de la culasse : ligne de visée.

const GW = G_LIVERY.maxX - G_LIVERY.minX;
const GH = G_LIVERY.maxY - G_LIVERY.minY;
const ZERO = new THREE.Vector3();
const GUN_CENTER = new THREE.Vector3(80, -40, 0);

function sides(fn) {
  return [-1, 1].map(fn);
}

function captureGlock(model, slide, extra = []) {
  return captureParts([model, slide], [slide, ...extra]);
}

// =============================================================================
// ARCADE — une borne d'arcade de poche : laque noire à bandes néon, carcasse
// violette étoilée, écrans CRT sur les flancs de la culasse où tourne un vrai
// mini-jeu, ampoules de fronton qui défilent, joystick et boutons, fente à
// jetons qui luit. Au tir : le vaisseau tire à l'écran, explosion de pixels,
// « +100 ». Apparition : un jeton tombe dans la fente et l'écran s'allume
// comme un vieux téléviseur (une ligne, puis l'image).
// =============================================================================

function arcadeFinish(env, { uniforms }) {
  const paint = (ctx, glow) => {
    if (!glow) {
      ctx.fillStyle = '#2a1050';
      ctx.fillRect(G_LIVERY.minX, G_LIVERY.minY, GW, GH);
      speckle(ctx, G_LIVERY, 700, ['#ffffff', '#ffe066', '#7ff0ff'], 0.7, seeded(2101));
      ctx.fillStyle = '#0a0a10';
      tracePolygon(ctx, SLIDE);
      ctx.fill();
    }
    // Bandes néon en chevrons sur la culasse et la poignée.
    const neon = ['#ff2e9a', '#3df5ff', '#ffe066'];
    neon.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(0, 4 + i * 3);
      ctx.lineTo(186, 4 + i * 3);
      ctx.lineTo(186, 5.4 + i * 3);
      ctx.lineTo(0, 5.4 + i * 3);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-10, -60 - i * 6);
      ctx.lineTo(56, -48 - i * 6);
      ctx.lineTo(54, -45 - i * 6);
      ctx.lineTo(-10, -57 - i * 6);
      ctx.fill();
    });
    if (!glow) {
      // Damier de poignée.
      ctx.save();
      tracePolygon(ctx, GRIP);
      ctx.clip();
      for (let x = -20; x < 76; x += 6) {
        for (let y = -106; y < -40; y += 6) {
          ctx.fillStyle = ((x + y) / 6) % 2 ? '#1a0a30' : '#3a1a6a';
          ctx.fillRect(x, y, 6, 6);
        }
      }
      ctx.restore();
    }
  };
  const color = livery('arc-color', (ctx) => paint(ctx, false), { color: true });
  const glow = livery('arc-glow', (ctx) => paint(ctx, true), { background: '#000000', color: true });
  const face = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.8, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.6, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }),
    uniforms,
    'totalEmissiveRadiance *= 0.6 + 0.4 * step(0.5, fract(vEmissiveMapUv.x * 6.0 - uTime * 1.5)) + uFlare * 1.5;',
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x120a22, roughness: 0.3, clearcoat: 1 });
  return {
    ...pairOf(face, wall),
    barrel: new THREE.MeshStandardMaterial({ envMap: env, color: 0x3a3a48, metalness: 0.9, roughness: 0.25 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xff2e9a, roughness: 0.4, emissive: 0xff2e9a, emissiveIntensity: 0.3 }),
    sight: new THREE.MeshBasicMaterial({ color: 0x3df5ff }),
    dot: new THREE.MeshBasicMaterial({ color: 0xffe066 }),
    flash: 'plasma',
    light: 0x3df5ff,
    smoke: 0xe0c0ff,
    makeShell: () => new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.0015, 16), new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 1, roughness: 0.3 })),
    decorate: (ctx) => decorateArcade({ ...ctx, env }),
  };
}

function decorateArcade({ model, slide, add, scene, env }) {
  // Écrans CRT : mini-jeu de tir spatial dessiné à la volée.
  const screen = liveCanvas(192, 64);
  screen.texture.magFilter = THREE.NearestFilter;
  const screenMat = new THREE.MeshBasicMaterial({ map: screen.texture });
  const bezelMat = new THREE.MeshStandardMaterial({ envMap: env, color: 0x1a1a22, roughness: 0.4 });
  const glassMat = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.02, clearcoat: 1, depthWrite: false });
  sides((side) => {
    add(new RoundedBoxGeometry(70, 20, 1.4, 2, 0.6), bezelMat, 100, 16, side * 12.9, slide);
    const glass = add(new THREE.PlaneGeometry(64, 16), screenMat, 100, 16, side * 13.7, slide);
    glass.rotation.y = side > 0 ? 0 : Math.PI;
    const cover = add(new THREE.PlaneGeometry(64, 16), glassMat, 100, 16, side * 13.9, slide);
    cover.rotation.y = glass.rotation.y;
    return glass;
  });
  const game = { ship: 96, dir: 1, shots: [], booms: [], invaders: [], score: 0, march: 0, offset: 0, power: 1 };
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 8; c += 1) game.invaders.push({ x: 20 + c * 18, y: 8 + r * 10, alive: true });
  const drawScreen = (time) => {
    const { ctx, canvas, texture } = screen;
    ctx.fillStyle = '#05030c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (game.power < 1) {
      // Allumage CRT : une ligne blanche qui s'ouvre en image.
      const h = Math.max(1, canvas.height * game.power);
      ctx.fillStyle = '#e8f8ff';
      ctx.fillRect(0, canvas.height / 2 - h / 2, canvas.width, h);
      texture.needsUpdate = true;
      return;
    }
    game.invaders.forEach((inv) => {
      if (!inv.alive) return;
      ctx.fillStyle = inv.y < 12 ? '#ff2e9a' : inv.y < 22 ? '#ffe066' : '#3df5ff';
      const x = inv.x + game.offset;
      const frame = Math.floor(time * 3) % 2;
      ctx.fillRect(x, inv.y, 8, 4);
      ctx.fillRect(x + (frame ? 0 : 1), inv.y + 4, 2, 2);
      ctx.fillRect(x + (frame ? 6 : 5), inv.y + 4, 2, 2);
    });
    ctx.fillStyle = '#9dff4a';
    ctx.fillRect(game.ship - 5, 56, 10, 4);
    ctx.fillRect(game.ship - 1, 53, 2, 3);
    ctx.fillStyle = '#ffffff';
    game.shots.forEach((s) => ctx.fillRect(s.x - 0.5, s.y, 1.5, 4));
    game.booms.forEach((b) => {
      ctx.fillStyle = `rgba(255,${160 + b.t * 90},60,${1 - b.t})`;
      for (let k = 0; k < 6; k += 1) ctx.fillRect(b.x + Math.cos(k) * b.t * 8, b.y + Math.sin(k * 1.7) * b.t * 6, 2, 2);
    });
    ctx.fillStyle = '#ffffff';
    ctx.font = '8px monospace';
    ctx.fillText(`1UP ${String(game.score).padStart(5, '0')}`, 4, 62);
    // Lignes de balayage.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < canvas.height; y += 2) ctx.fillRect(0, y, canvas.width, 1);
    texture.needsUpdate = true;
  };
  const stepGame = (dt) => {
    game.march += dt;
    game.offset = Math.sin(game.march * 0.8) * 14;
    game.ship += game.dir * dt * 40;
    if (game.ship > 180 || game.ship < 12) game.dir *= -1;
    game.shots.forEach((s) => (s.y -= dt * 120));
    game.shots = game.shots.filter((s) => {
      const hit = game.invaders.find((inv) => inv.alive && s.x > inv.x + game.offset && s.x < inv.x + game.offset + 8 && s.y < inv.y + 5 && s.y > inv.y);
      if (hit) {
        hit.alive = false;
        game.score += 100;
        game.booms.push({ x: hit.x + game.offset + 4, y: hit.y + 2, t: 0 });
        return false;
      }
      return s.y > 0;
    });
    game.booms.forEach((b) => (b.t += dt * 3));
    game.booms = game.booms.filter((b) => b.t < 1);
    if (game.invaders.every((inv) => !inv.alive)) game.invaders.forEach((inv) => (inv.alive = true));
  };

  // Ampoules de fronton qui défilent le long de la carcasse.
  const bulbs = [];
  sides((side) => {
    for (let k = 0; k < 9; k += 1) {
      const m = add(new THREE.SphereGeometry(1.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe066 }), 118 + k * 6.4, -13, side * 14);
      bulbs.push({ m, k });
    }
  });
  // Joystick et boutons sur les flancs de la carcasse.
  const sticks = sides((side) => {
    const base = add(new THREE.CylinderGeometry(4, 4.5, 2, 16), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }), 58, -19, side * 14.5, model);
    base.rotation.x = Math.PI / 2;
    const pivot = new THREE.Group();
    pivot.position.set(58, -19, side * 15.5);
    model.add(pivot);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 8, 8), new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 1, roughness: 0.3 }));
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = side * 4;
    pivot.add(shaft);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 12), new THREE.MeshPhysicalMaterial({ color: 0xff2e3a, roughness: 0.2, clearcoat: 1 }));
    ball.position.z = side * 8.5;
    pivot.add(ball);
    return { pivot, side };
  });
  const buttons = [];
  sides((side) => [[140, -8, 0x3df5ff], [150, -8, 0xff2e9a]].forEach(([x, y, c]) => {
    const b = add(new THREE.CylinderGeometry(2.4, 2.4, 2, 16), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.3, roughness: 0.3 }), x, y + 22, side * 13.2, slide);
    b.rotation.x = Math.PI / 2;
    buttons.push({ b, side, base: side * 13.2 });
  }));
  // Fente à jetons rétroéclairée sur l'arrière de la poignée.
  const slotGlow = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  sides((side) => {
    add(new RoundedBoxGeometry(12, 14, 1, 1, 0.4), new THREE.MeshStandardMaterial({ color: 0x222228, metalness: 0.8, roughness: 0.3 }), ...gripPoint(8, -106, side * 13.9).toArray(), model);
    add(new THREE.BoxGeometry(1.4, 9, 0.4), slotGlow, ...gripPoint(8, -106, side * 14.5).toArray(), model);
  });

  const cubes = meshBurst(scene, { max: 60 });
  const cubeGeo = new THREE.BoxGeometry(0.004, 0.004, 0.004);
  const cubeMats = ['#ff2e9a', '#3df5ff', '#ffe066', '#9dff4a'].map((c) => new THREE.MeshBasicMaterial({ color: c }));
  const pops = meshBurst(scene, { max: 6 });
  const mouth = anchorAt(slide, 192, 16, 0);
  const tmp = new THREE.Vector3();
  let time = 0;
  let screenClock = 0;
  let pressed = 0;

  const scorePop = (at) => {
    const c = liveCanvas(128, 48);
    c.ctx.font = 'bold 30px monospace';
    c.ctx.textAlign = 'center';
    c.ctx.fillStyle = '#ffe066';
    c.ctx.fillText('+100', 64, 34);
    c.texture.magFilter = THREE.NearestFilter;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: c.texture, transparent: true, depthWrite: false }));
    s.scale.set(0.045, 0.017, 1);
    pops.spawn(s, at, new THREE.Vector3(0, 0.22, 0), { life: 700, gravity: 0, drag: 1, spin: 0, shrink: false, onUpdate: (p, t) => (p.mesh.material.opacity = 1 - t * t) });
  };

  // Apparition : jeton qui tombe, puis allumage CRT de toute l'arme.
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 2, 24), new THREE.MeshStandardMaterial({ envMap: env, color: 0xffc83a, metalness: 1, roughness: 0.25 }));
  coin.visible = false;
  model.add(coin);
  const pieces = captureGlock(model, slide, [coin]);
  const sc = new THREE.Vector3();
  const intro = introRunner(pieces, {
    duration: 1.3,
    start: () => {
      coin.visible = true;
      game.power = 0;
    },
    end: () => {
      coin.visible = false;
      game.power = 1;
    },
    frame: (t) => {
      const c = clamp01(t / 0.35);
      coin.position.set(6, -40 - 48 * easeOutCubic(c), -40 + 40 * c);
      coin.rotation.set(Math.PI / 2, t * 18, 0);
      coin.visible = t < 0.38;
      game.power = clamp01((t - 0.55) / 0.4);
      slotGlow.color.setHex(t > 0.35 && t < 0.6 && Math.floor(t * 20) % 2 ? 0xffffff : 0xff8a2a);
    },
    place: (p, t) => {
      if (t < 0.38) {
        p.object.visible = false;
        return;
      }
      p.object.visible = true;
      const line = clamp01((t - 0.38) / 0.12);
      const open = easeOutBack(clamp01((t - 0.5) / 0.35));
      sc.set(0.2 + 0.8 * line, Math.max(0.015, open), 1);
      placePartScaled(p, sc, ZERO);
    },
  });

  return {
    muzzleX: 192,
    replayIntro: intro.start,
    introDuration: intro.duration,
    update: (dt, t, flare) => {
      time += dt;
      stepGame(dt);
      screenClock += dt;
      if (screenClock > 0.05) {
        screenClock = 0;
        drawScreen(time);
      }
      bulbs.forEach((b) => b.m.material.color.setHex((Math.floor(time * 8) + b.k) % 3 === 0 ? 0xfff4b0 : 0x6a4a10));
      sticks.forEach((s) => {
        s.pivot.rotation.x = Math.sin(time * 5) * 0.3;
        s.pivot.rotation.y = Math.cos(time * 3.7) * 0.3;
      });
      pressed = Math.max(0, pressed - dt * 8);
      buttons.forEach((b) => (b.b.position.z = b.base - b.side * pressed * 0.9));
      cubes.update(dt);
      pops.update(dt);
      intro.update(dt);
    },
    onFire: () => {
      pressed = 1;
      game.shots.push({ x: game.ship, y: 50 });
      mouth.getWorldPosition(tmp);
      for (let i = 0; i < 10; i += 1) {
        cubes.spawn(new THREE.Mesh(cubeGeo, cubeMats[i % 4]), tmp, new THREE.Vector3((Math.random() - 0.3) * 1.2, Math.random() * 1, (Math.random() - 0.5) * 1.2), { life: 550, gravity: -5, drag: 1, spin: 10 });
      }
      if (Math.random() < 0.4) scorePop(tmp.clone().add(new THREE.Vector3(0, 0.03, 0)));
    },
  };
}

// =============================================================================
// HANABI — nuit d'été : laque bleu nuit peinte de chrysanthèmes de feux
// d'artifice qui scintillent, cierges magiques qui crépitent sous la carcasse,
// fusées sanglées sur les flancs, lanterne rouge à la dragonne. Au tir, une
// fusée part et éclate en gerbe colorée haut sur le côté. Apparition : une
// fusée monte, éclate, et les braises retombent en formant l'arme.
// =============================================================================

const HANABI_COLORS = ['#ff4f6a', '#ffd23e', '#6affd0', '#6aa8ff', '#e07aff', '#ffffff'];

function hanabiFinish(env, { uniforms }) {
  const bursts = (ctx, glow) => {
    const rand = seeded(2201);
    for (let i = 0; i < 16; i += 1) {
      const cx = G_LIVERY.minX + rand() * GW;
      const cy = G_LIVERY.minY + rand() * GH;
      const r = 8 + rand() * 16;
      const c = HANABI_COLORS[Math.floor(rand() * HANABI_COLORS.length)];
      const rays = 16 + Math.floor(rand() * 10);
      for (let k = 0; k < rays; k += 1) {
        const a = (k / rays) * Math.PI * 2;
        for (let d = 0.3; d <= 1; d += 0.14) {
          ctx.fillStyle = c;
          ctx.globalAlpha = glow ? d : 0.4 + d * 0.6;
          ctx.fillRect(cx + Math.cos(a) * r * d, cy + Math.sin(a) * r * d, 0.8, 0.8);
        }
      }
    }
    ctx.globalAlpha = 1;
  };
  const color = livery('hana-color', (ctx) => {
    const g = ctx.createLinearGradient(0, G_LIVERY.maxY, 0, G_LIVERY.minY);
    g.addColorStop(0, '#0a1030');
    g.addColorStop(1, '#1a0a2a');
    ctx.fillStyle = g;
    ctx.fillRect(G_LIVERY.minX, G_LIVERY.minY, GW, GH);
    speckle(ctx, G_LIVERY, 900, ['rgba(255,255,255,0.7)'], 0.4, seeded(2202));
    bursts(ctx, false);
  }, { color: true });
  const glow = livery('hana-glow', (ctx) => bursts(ctx, true), { background: '#000000', color: true });
  const lacquer = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.9, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.6, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 }),
    uniforms,
    `
      float tw = 0.5 + 0.5 * sin(uTime * 7.0 + vEmissiveMapUv.x * 90.0 + vEmissiveMapUv.y * 70.0);
      totalEmissiveRadiance *= 0.3 + tw * 1.0 + uFlare * 1.6;
    `,
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x0e1234, roughness: 0.25, clearcoat: 1 });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, color: 0xd9a55a, metalness: 1, roughness: 0.25 });
  return {
    ...pairOf(lacquer, wall),
    barrel: gold,
    steel: gold,
    sight: new THREE.MeshBasicMaterial({ color: 0xffd23e }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff4f6a }),
    flash: 'gold',
    light: 0xffc060,
    smoke: 0xc8c0d8,
    decorate: (ctx) => decorateHanabi({ ...ctx, env, gold }),
  };
}

function decorateHanabi({ model, slide, add, scene, env, gold }) {
  const sparkTex = softDotTexture('hana-spark', 'rgba(255,255,230,1)', 'rgba(255,200,80,0)');
  const sparks = particleSystem(scene, sparkTex, { max: 420 });
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  // Cierges magiques sous l'avant de la carcasse.
  const sparklerTips = sides((side) => {
    const rod = add(new THREE.CylinderGeometry(0.7, 0.7, 40, 6), new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8, roughness: 0.4 }), 168, -26, side * 9, model);
    rod.rotation.z = -0.5;
    const coat = add(new THREE.CylinderGeometry(1.5, 1.5, 18, 8), new THREE.MeshStandardMaterial({ color: 0x3a3230, roughness: 1 }), 176, -38, side * 9, model);
    coat.rotation.z = -0.5;
    const tip = anchorAt(model, 182, -46, side * 9);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, color: 0xffd080, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(18, 18, 1);
    halo.position.set(182, -46, side * 9);
    model.add(halo);
    return { tip, halo };
  });

  // Fusées sanglées sur les flancs de la carcasse.
  const rocketMats = ['#ff4f6a', '#6aa8ff', '#ffd23e'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
  const makeRocket = (mat) => {
    const g = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 26, 12), mat);
    tube.rotation.z = -Math.PI / 2;
    g.add(tube);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.4, 8, 12), gold);
    cone.rotation.z = -Math.PI / 2;
    cone.position.x = 17;
    g.add(cone);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 30, 4), new THREE.MeshStandardMaterial({ color: 0xc9a06a }));
    stick.rotation.z = Math.PI / 2;
    stick.position.set(-26, -2.5, 0);
    g.add(stick);
    return g;
  };
  const rockets = [];
  sides((side) => [0, 1].forEach((k) => {
    const g = makeRocket(rocketMats[(k + (side > 0 ? 1 : 0)) % 3]);
    g.position.set(140, -8 - k * 5.2, side * (16.5 + k * 1.2));
    model.add(g);
    rockets.push({ g, reload: 0 });
  }));
  sides((side) => add(new RoundedBoxGeometry(6, 14, 1.4, 1, 0.4), gold, 140, -10.5, side * 15, model));

  // Lanterne rouge suspendue à la dragonne.
  const lantern = new THREE.Group();
  lantern.position.copy(gripPoint(8, -132, 0));
  model.add(lantern);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 16, 6), new THREE.MeshBasicMaterial({ color: 0xc9a04a }));
  cord.position.y = -8;
  lantern.add(cord);
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xd8262a, emissive: 0xff5a2a, emissiveIntensity: 0.8, roughness: 0.7 });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 12), lanternMat);
  shell.scale.set(1, 1.2, 1);
  shell.position.y = -24;
  lantern.add(shell);
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(2, 10, 8), gold);
  tassel.position.y = -38;
  tassel.rotation.x = Math.PI;
  lantern.add(tassel);
  const swing = { x: 0, v: 0 };

  // Fusées tirées au coup de feu : montent en diagonale et éclatent en gerbe.
  const flying = [];
  const launch = (fromWorld, dirWorld) => {
    const g = makeRocket(rocketMats[Math.floor(Math.random() * 3)]);
    g.scale.setScalar(0.001);
    g.position.copy(fromWorld);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dirWorld.clone().normalize());
    scene.add(g);
    flying.push({ g, vel: dirWorld.clone().multiplyScalar(3.2), born: performance.now(), color: HANABI_COLORS[Math.floor(Math.random() * 5)] });
  };
  const burst = (at, color, count = 70, speed = 1.1) => {
    for (let i = 0; i < count; i += 1) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const v = new THREE.Vector3(r * Math.cos(a), u, r * Math.sin(a)).multiplyScalar(speed * (0.8 + Math.random() * 0.3));
      sparks.spawn(at, v, { life: 900 + Math.random() * 400, size: 0.012, drag: 1.6, gravity: -0.6, tint: i % 5 === 0 ? 0xffffff : color });
    }
  };

  const shock = shockRings(scene, { color: 0xffd080, count: 6, thickness: 0.03 });
  const mouth = anchorAt(slide, 192, 16, 0);
  let time = 0;
  let launchClock = 0;
  let sparkClock = 0;

  // Apparition : fusée qui monte, éclate, braises qui retombent en l'arme.
  const introRocket = makeRocket(rocketMats[1]);
  introRocket.visible = false;
  model.add(introRocket);
  const BLAST = new THREE.Vector3(80, 120, -20);
  const pieces = captureGlock(model, slide, [introRocket, lantern]);
  orderBy(pieces, (p) => Math.random());
  const delta = new THREE.Vector3();
  let blasted = false;
  const intro = introRunner(pieces, {
    duration: 1.7,
    hidden: [lantern],
    start: () => {
      introRocket.visible = true;
      blasted = false;
    },
    end: () => (introRocket.visible = false),
    frame: (t) => {
      const up = clamp01(t / 0.4);
      introRocket.position.set(80, -200 + 320 * easeOutCubic(up), -20);
      introRocket.rotation.z = Math.PI / 2;
      introRocket.visible = t < 0.4;
      if (t < 0.4) {
        model.localToWorld(tmp.set(80, -220 + 320 * easeOutCubic(up), -20));
        sparks.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.1, -0.3, (Math.random() - 0.5) * 0.1), { life: 400, size: 0.006, drag: 1, tint: 0xffc060 });
      }
      if (t >= 0.4 && !blasted) {
        blasted = true;
        model.localToWorld(tmp.copy(BLAST));
        burst(tmp, 0xff4f6a, 90, 0.7);
        burst(tmp, 0xffd23e, 60, 0.5);
      }
    },
    place: (p, t) => {
      const s = clamp01((t - 0.45 - p.order * 0.6) / 0.55);
      p.object.visible = s > 0;
      if (s <= 0) return;
      const e = easeOutCubic(s);
      delta.copy(BLAST).sub(p.center).multiplyScalar(1 - e);
      delta.x += Math.sin(s * 9 + p.order * 20) * 10 * (1 - e);
      placePart(p, 0.1 + 0.9 * e, delta);
      if (Math.random() < 0.08) {
        p.object.parent.localToWorld(tmp.copy(p.center).add(delta));
        sparks.spawn(tmp, new THREE.Vector3(0, -0.05, 0), { life: 300, size: 0.004, tint: 0xffe0a0 });
      }
    },
  });

  return {
    replayIntro: intro.start,
    introDuration: intro.duration,
    update: (dt, t, flare) => {
      time += dt;
      sparkClock += dt;
      while (sparkClock > 0.015) {
        sparkClock -= 0.015;
        sparklerTips.forEach((s) => {
          s.tip.getWorldPosition(tmp);
          sparks.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.3) * 0.5, (Math.random() - 0.5) * 0.5), { life: 180 + Math.random() * 160, size: 0.0022, drag: 2, gravity: -1.5, tint: Math.random() < 0.3 ? 0xffffff : 0xffc860 });
        });
      }
      sparklerTips.forEach((s) => (s.halo.material.opacity = 0.6 + Math.random() * 0.4));
      springStep(swing, 0, 12, dt);
      lantern.rotation.z = Math.sin(time * 1.6) * 0.1 + swing.x * 0.4;
      lanternMat.emissiveIntensity = 0.7 + 0.2 * Math.sin(time * 9) * Math.sin(time * 2.3);
      launchClock -= dt;
      rockets.forEach((r) => {
        r.reload = Math.max(0, r.reload - dt);
        r.g.visible = r.reload <= 0;
      });
      for (let i = flying.length - 1; i >= 0; i -= 1) {
        const f = flying[i];
        f.vel.y -= 0.8 * dt;
        f.g.position.addScaledVector(f.vel, dt);
        sparks.spawn(f.g.position, new THREE.Vector3((Math.random() - 0.5) * 0.1, -0.2, (Math.random() - 0.5) * 0.1), { life: 250, size: 0.004, tint: 0xffc060 });
        if (performance.now() - f.born > 520) {
          burst(f.g.position, new THREE.Color(f.color).getHex());
          scene.remove(f.g);
          flying.splice(i, 1);
        }
      }
      sparks.update(dt);
      shock.update();
      intro.update(dt);
    },
    onFire: () => {
      swing.v += 6;
      mouth.getWorldPosition(tmp);
      slide.getWorldQuaternion(quat);
      shock.spawn(tmp, quat, { reach: 0.035, life: 200, peak: 0.8 });
      for (let i = 0; i < 16; i += 1) {
        sparks.spawn(tmp, new THREE.Vector3((Math.random() - 0.4) * 1.2, (Math.random() - 0.3) * 1.2, (Math.random() - 0.5) * 1.2), { life: 350, size: 0.004, drag: 3, tint: new THREE.Color(HANABI_COLORS[i % 6]).getHex() });
      }
      if (launchClock <= 0) {
        launchClock = 0.3;
        const r = rockets.find((x) => x.reload <= 0);
        if (r) {
          r.reload = 1.2;
          r.g.getWorldPosition(tmp2);
          // Vers le haut, l'avant et l'extérieur : l'éclat reste loin du réticule.
          const dir = new THREE.Vector3(0.9, 1.1, 0.8).applyQuaternion(model.getWorldQuaternion(quat)).normalize();
          launch(tmp2, dir);
        }
      }
    },
  };
}

// =============================================================================
// MIRAGE — grès du désert strié de couches ocre, filets d'or et turquoises.
// Le vent arrache du sable aux arêtes en permanence, un sablier s'écoule puis se
// retourne sur la poignée, un anneau de pierre gravé tourne autour de l'avant.
// Au tir : bouffée de sable et onde de chaleur. Apparition : le sable tombe en
// dune et l'arme en émerge, couche par couche.
// =============================================================================

function mirageFinish(env, { uniforms }) {
  const strata = (ctx, glow) => {
    const rand = seeded(2301);
    if (!glow) {
      for (let y = G_LIVERY.minY; y < G_LIVERY.maxY; y += 1.2 + rand() * 3) {
        const tones = ['#d8b27a', '#c99a5e', '#e2c290', '#b8844a', '#d2a468'];
        ctx.strokeStyle = tones[Math.floor(rand() * tones.length)];
        ctx.lineWidth = 1.2 + rand() * 3;
        const phase = rand() * 6;
        ctx.beginPath();
        for (let x = G_LIVERY.minX; x <= G_LIVERY.maxX; x += 4) ctx.lineTo(x, y + Math.sin(x * 0.03 + phase) * 3 + Math.sin(x * 0.11) * 0.6);
        ctx.stroke();
      }
      speckle(ctx, G_LIVERY, 30000, ['rgba(90,60,30,0.25)', 'rgba(255,240,210,0.3)'], 0.3, seeded(2302));
    }
    // Filets d'or et incrustations turquoise.
    ctx.strokeStyle = glow ? '#ffcf70' : '#d9a55a';
    ctx.lineWidth = 0.8;
    [[4, 22, 182, 22], [4, 8, 182, 8], [120, -9, 170, -9]].forEach(([a, b, c, d]) => {
      ctx.beginPath();
      ctx.moveTo(a, b);
      ctx.lineTo(c, d);
      ctx.stroke();
    });
    for (let x = 12; x < 180; x += 16) {
      ctx.fillStyle = glow ? '#40f0e0' : '#2ab8b0';
      ctx.beginPath();
      ctx.moveTo(x, 15);
      ctx.lineTo(x + 3, 12);
      ctx.lineTo(x + 6, 15);
      ctx.lineTo(x + 3, 18);
      ctx.fill();
    }
  };
  const color = livery('mir-color', (ctx) => strata(ctx, false), { background: '#d2a468', color: true });
  const glow = livery('mir-glow', (ctx) => strata(ctx, true), { background: '#000000', color: true });
  const stone = animateEmissive(
    new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.5, map: color, bumpMap: color, bumpScale: 0.8, roughness: 0.85, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.6 }),
    uniforms,
    'totalEmissiveRadiance *= 0.5 + 0.5 * pow(0.5 + 0.5 * sin(vEmissiveMapUv.x * 12.0 - uTime * 2.0), 4.0) + uFlare * 1.5;',
  );
  const wall = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.4, color: 0xc99a5e, roughness: 0.9 });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, color: 0xd9a55a, metalness: 1, roughness: 0.3 });
  return {
    ...pairOf(stone, wall),
    barrel: gold,
    steel: gold,
    sight: new THREE.MeshBasicMaterial({ color: 0x40f0e0 }),
    dot: new THREE.MeshBasicMaterial({ color: 0x40f0e0 }),
    flash: 'gold',
    light: 0xffc070,
    smoke: 0xe8cc98,
    decorate: (ctx) => decorateMirage({ ...ctx, env, gold, wall }),
  };
}

function decorateMirage({ model, slide, add, scene, env, gold, wall }) {
  const sandTex = softDotTexture('mir-sand', 'rgba(230,200,150,1)', 'rgba(210,170,110,0)');
  const sand = particleSystem(scene, sandTex, { max: 320 });
  const heat = particleSystem(scene, softDotTexture('mir-heat', 'rgba(255,230,190,0.35)', 'rgba(255,230,190,0)'), { max: 30 });
  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const edgeAnchor = anchorAt(model, 0, 0, 0);

  // Sablier sur le flanc de la poignée.
  const glass = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.02, clearcoat: 1, depthWrite: false });
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xe0b878, roughness: 1 });
  const glasses = sides((side) => {
    const g = new THREE.Group();
    g.position.copy(gripPoint(22, -86, side * 17.5));
    model.add(g);
    const bulb = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.6, -15), new THREE.Vector2(7, -12), new THREE.Vector2(6, -4), new THREE.Vector2(1.2, 0), new THREE.Vector2(6, 4), new THREE.Vector2(7, 12), new THREE.Vector2(0.6, 15)], 20), glass);
    g.add(bulb);
    [-16, 16].forEach((y) => {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 2, 16), gold);
      cap.position.y = y;
      g.add(cap);
    });
    const top = new THREE.Mesh(new THREE.ConeGeometry(5.5, 8, 16), sandMat);
    top.rotation.x = Math.PI;
    g.add(top);
    const bottom = new THREE.Mesh(new THREE.ConeGeometry(6.5, 8, 16), sandMat);
    g.add(bottom);
    const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 12, 4), sandMat);
    thread.position.y = -6;
    g.add(thread);
    return { g, top, bottom, thread };
  });
  let sandLevel = 0;
  let flipT = -1;

  // Anneau de pierre gravé qui tourne autour de l'avant de la culasse.
  const ringTex = tiledTexture('mir-ring', 256, (ctx, size) => {
    ctx.fillStyle = '#c99a5e';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#7a5428';
    for (let x = 4; x < size; x += 22) {
      ctx.fillRect(x, size * 0.35, 3, size * 0.3);
      ctx.beginPath();
      ctx.arc(x + 12, size / 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { color: true });
  ringTex.repeat.set(4, 1);
  const stoneRing = new THREE.Mesh(new THREE.TorusGeometry(24, 3.2, 12, 64), new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.9 }));
  const ringPivot = new THREE.Group();
  ringPivot.position.set(150, 12, 0);
  model.add(ringPivot);
  stoneRing.rotation.y = Math.PI / 2;
  ringPivot.add(stoneRing);
  const ringGold = new THREE.Mesh(new THREE.TorusGeometry(24, 0.8, 8, 64), gold);
  ringGold.rotation.y = Math.PI / 2;
  ringGold.position.x = 3.4;
  ringPivot.add(ringGold);

  const shock = shockRings(scene, { color: 0xe8c890, count: 6, thickness: 0.05, additive: false });
  const mouth = anchorAt(slide, 192, 16, 0);
  let time = 0;
  let windClock = 0;

  // Apparition : pluie de sable qui fait une dune, l'arme en sort par couches.
  const dune = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8b27a, roughness: 1 }));
  dune.scale.set(1.4, 0.4, 0.8);
  dune.position.set(60, -116, 0);
  dune.visible = false;
  model.add(dune);
  const pieces = captureGlock(model, slide, [dune]);
  orderBy(pieces, (p) => p.center.y);
  const delta = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const intro = introRunner(pieces, {
    duration: 1.6,
    start: () => (dune.visible = true),
    end: () => (dune.visible = false),
    frame: (t) => {
      dune.scale.set(1.4, 0.4 * clamp01(t / 0.4) * (1 - clamp01((t - 1.1) / 0.45)), 0.8);
      dune.visible = t < 1.55;
      if (t < 1.2) {
        for (let i = 0; i < 6; i += 1) {
          model.localToWorld(tmp.set(40 + Math.random() * 80, 60 + Math.random() * 40, (Math.random() - 0.5) * 40));
          sand.spawn(tmp, new THREE.Vector3(0, -0.5, 0), { life: 500, size: 0.004, drag: 0, gravity: -2, additive: false, peak: 0.9 });
        }
      }
    },
    place: (p, t) => {
      const s = clamp01((t - 0.3 - p.order * 0.7) / 0.5);
      p.object.visible = s > 0;
      if (s <= 0) return;
      const e = easeOutCubic(s);
      delta.set(0, -60 * (1 - e), 0);
      sc.set(1, 0.05 + 0.95 * e, 1);
      placePartScaled(p, sc, delta);
    },
  });

  return {
    replayIntro: intro.start,
    introDuration: intro.duration,
    update: (dt, t, flare) => {
      time += dt;
      // Vent : grains arrachés aux arêtes supérieures, emportés vers l'arrière.
      windClock += dt;
      while (windClock > 0.02) {
        windClock -= 0.02;
        const top = Math.random() < 0.6;
        edgeAnchor.position.set(Math.random() * 186, top ? 29 : -14 - Math.random() * 86, (Math.random() - 0.5) * 26);
        if (!top) edgeAnchor.position.x = -10 + Math.random() * 60;
        edgeAnchor.getWorldPosition(tmp);
        model.getWorldQuaternion(quat);
        sand.spawn(tmp, new THREE.Vector3(-0.35 - Math.random() * 0.3, 0.02 + Math.random() * 0.05, (Math.random() - 0.5) * 0.08).applyQuaternion(quat), { life: 700, size: 0.0022, drag: 0.4, gravity: -0.15, additive: false, peak: 0.8 });
      }
      // Sablier : s'écoule en 5 s puis se retourne.
      if (flipT < 0) {
        sandLevel = Math.min(1, sandLevel + dt / 5);
        if (sandLevel >= 1) flipT = 0;
      } else {
        flipT += dt / 0.6;
        glasses.forEach((g) => (g.g.rotation.z = easeInOut(Math.min(1, flipT)) * Math.PI));
        if (flipT >= 1) {
          flipT = -1;
          sandLevel = 0;
          glasses.forEach((g) => (g.g.rotation.z = 0));
        }
      }
      glasses.forEach((g) => {
        g.top.scale.setScalar(Math.max(0.01, 1 - sandLevel));
        g.top.position.y = 4 + (1 - sandLevel) * 2;
        g.bottom.scale.setScalar(Math.max(0.01, sandLevel));
        g.bottom.position.y = -12 + sandLevel * 4;
        g.thread.visible = flipT < 0 && sandLevel < 0.98;
      });
      ringPivot.rotation.x = time * 0.5 + flare;
      sand.update(dt);
      heat.update(dt);
      shock.update();
      intro.update(dt);
    },
    onFire: () => {
      mouth.getWorldPosition(tmp);
      slide.getWorldQuaternion(quat);
      shock.spawn(tmp, quat, { reach: 0.045, life: 300, peak: 0.5 });
      for (let i = 0; i < 22; i += 1) {
        sand.spawn(tmp, new THREE.Vector3(0.4 + Math.random() * 0.8, (Math.random() - 0.3) * 0.7, (Math.random() - 0.5) * 0.9).applyQuaternion(quat), { life: 800, size: 0.004, drag: 2, gravity: -1, additive: false, peak: 0.85 });
      }
      for (let i = 0; i < 3; i += 1) heat.spawn(tmp, new THREE.Vector3(0.1, 0.12, 0), { life: 600, size: 0.02, grow: 2, drag: 1, additive: true, peak: 0.5 });
    },
  };
}

// =============================================================================
// CONFISERIE — la boutique de bonbons : culasse rose nappée de glaçage qui
// coule, vermicelles colorés, carcasse en sucre d'orge, poignée en chocolat
// gaufré, beignet glacé à la bouche, oursons en gélatine qui gigotent, sucette
// qui tourne, bonbons en orbite. Au tir : pluie de vermicelles et de
// dragées. Apparition : chaque pièce surgit en gelée qui rebondit.
// =============================================================================

const CANDY_COLORS = ['#ff6fae', '#6fd8ff', '#ffe36f', '#8dff8a', '#c89bff', '#ffffff'];

function candyFinish(env, { uniforms }) {
  const color = livery('candy-color', (ctx) => {
    const rand = seeded(2401);
    // Sucre d'orge (carcasse), chocolat gaufré (poignée), rose glacé (culasse).
    ctx.save();
    tracePolygon(ctx, FRAME);
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-20, -60, 220, 70);
    ctx.fillStyle = '#ff4f7a';
    for (let x = -80; x < 220; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x, -60);
      ctx.lineTo(x + 5, -60);
      ctx.lineTo(x + 65, 10);
      ctx.lineTo(x + 60, 10);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    tracePolygon(ctx, GRIP);
    ctx.clip();
    ctx.fillStyle = '#5a3018';
    ctx.fillRect(-20, -140, 100, 100);
    ctx.strokeStyle = '#3a1c0a';
    ctx.lineWidth = 1.2;
    for (let k = -140; k < 100; k += 8) {
      ctx.beginPath();
      ctx.moveTo(-20, k);
      ctx.lineTo(80, k + 100);
      ctx.moveTo(-20, k + 100);
      ctx.lineTo(80, k);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#ff9cc8';
    tracePolygon(ctx, SLIDE);
    ctx.fill();
    // Glaçage blanc qui coule sur le haut de la culasse.
    ctx.fillStyle = '#fff6fb';
    ctx.beginPath();
    ctx.moveTo(0, 30);
    for (let x = 0; x <= 186; x += 6) {
      const drop = 20 - rand() * 12;
      ctx.lineTo(x, 22);
      ctx.quadraticCurveTo(x + 1.5, drop, x + 3, drop);
      ctx.quadraticCurveTo(x + 4.5, drop, x + 6, 22);
    }
    ctx.lineTo(186, 30);
    ctx.fill();
    // Vermicelles.
    for (let i = 0; i < 260; i += 1) {
      ctx.save();
      ctx.translate(rand() * 186, 4 + rand() * 25);
      ctx.rotate(rand() * Math.PI);
      ctx.fillStyle = CANDY_COLORS[Math.floor(rand() * 5)];
      ctx.fillRect(-1.4, -0.4, 2.8, 0.8);
      ctx.restore();
    }
  }, { color: true });
  const glossy = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.9, map: color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.4, sheenColor: new THREE.Color(0xffffff) });
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xff9cc8, roughness: 0.3, clearcoat: 1 });
  const choco = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x5a3018, roughness: 0.35, clearcoat: 0.8 });
  return {
    slide: glossy,
    slideWall: wall,
    frame: glossy,
    frameWall: new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xffffff, roughness: 0.3, clearcoat: 1 }),
    barrel: choco,
    steel: new THREE.MeshPhysicalMaterial({ color: 0x6fd8ff, roughness: 0.25, clearcoat: 1 }),
    sight: new THREE.MeshBasicMaterial({ color: 0xff4f7a }),
    dot: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    flash: 'powder',
    light: 0xffb0d8,
    smoke: 0xffe0f0,
    makeShell: () => new THREE.Mesh(new THREE.CapsuleGeometry(0.003, 0.004, 4, 8), new THREE.MeshPhysicalMaterial({ color: CANDY_COLORS[Math.floor(Math.random() * 5)], roughness: 0.2, clearcoat: 1 })),
    decorate: (ctx) => decorateCandy({ ...ctx, env, choco }),
  };
}

function gummyBear(color, env) {
  const mat = new THREE.MeshPhysicalMaterial({ envMap: env, color, roughness: 0.15, transmission: 0.6, thickness: 6, clearcoat: 1, transparent: true, opacity: 0.95 });
  const g = new THREE.Group();
  const ball = (r, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    g.add(m);
  };
  ball(5, 0, 5, 0, 1, 1.25, 0.85);
  ball(4, 0, 13, 0, 1.05, 0.95, 0.9);
  ball(1.6, -3, 16.5, 0);
  ball(1.6, 3, 16.5, 0);
  ball(1.8, -5, 7, 0, 1, 1.4, 1);
  ball(1.8, 5, 7, 0, 1, 1.4, 1);
  ball(2, -2.6, 0.5, 0, 1, 0.9, 1.2);
  ball(2, 2.6, 0.5, 0, 1, 0.9, 1.2);
  return g;
}

function decorateCandy({ model, slide, add, scene, env, choco }) {
  // Beignet glacé autour de la bouche.
  const donutTex = tiledTexture('candy-donut', 256, (ctx, size) => {
    ctx.fillStyle = '#ff6fae';
    ctx.fillRect(0, 0, size, size);
    const rand = seeded(2402);
    for (let i = 0; i < 220; i += 1) {
      ctx.save();
      ctx.translate(rand() * size, rand() * size);
      ctx.rotate(rand() * Math.PI);
      ctx.fillStyle = CANDY_COLORS[Math.floor(rand() * 6)];
      ctx.fillRect(-4, -1, 8, 2);
      ctx.restore();
    }
  }, { color: true });
  donutTex.repeat.set(3, 1);
  const donut = add(new THREE.TorusGeometry(10.5, 5.5, 16, 40), new THREE.MeshPhysicalMaterial({ envMap: env, map: donutTex, roughness: 0.3, clearcoat: 1 }), 190, 16, 0, slide);
  donut.rotation.y = Math.PI / 2;

  // Oursons en gélatine sur la carcasse et la poignée.
  const bears = [[150, -15, 13.5, 0xff4f6a], [150, -15, -13.5, 0x8dff8a], [30, -128, 0, 0xffc83a]].map(([x, y, z, c], i) => {
    const b = gummyBear(c, env);
    b.position.copy(gripPoint(x, y, z));
    if (i === 2) b.rotation.x = Math.PI;
    b.scale.setScalar(0.85);
    model.add(b);
    return { b, base: 0.85, jiggle: { x: 0, v: 0 }, phase: i * 1.7 };
  });

  // Sucette à spirale sur chaque flanc de la poignée.
  const swirl = tiledTexture('candy-swirl', 256, (ctx, size) => {
    const c = size / 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(c, c, c - 2, 0, Math.PI * 2);
    ctx.fill();
    ['#ff4f7a', '#6fd8ff', '#ffe36f'].forEach((col, k) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 14;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 8; a += 0.05) {
        const r = (a / (Math.PI * 8)) * (c - 8);
        ctx.lineTo(c + Math.cos(a + (k * Math.PI * 2) / 3) * r, c + Math.sin(a + (k * Math.PI * 2) / 3) * r);
      }
      ctx.stroke();
    });
  }, { color: true });
  const lollipops = sides((side) => {
    const disc = add(new THREE.CylinderGeometry(13, 13, 3, 40), [new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, clearcoat: 1 }), new THREE.MeshPhysicalMaterial({ map: swirl, roughness: 0.2, clearcoat: 1 }), new THREE.MeshPhysicalMaterial({ map: swirl, roughness: 0.2, clearcoat: 1 })], ...gripPoint(24, -78, side * 16).toArray(), model);
    disc.rotation.x = Math.PI / 2;
    return disc;
  });

  // Bonbons emballés et dragées en orbite sous l'arme.
  const orbit = new THREE.Group();
  model.add(orbit);
  const candies = Array.from({ length: 10 }, (_, i) => {
    const g = new THREE.Group();
    const col = CANDY_COLORS[i % 5];
    const mat = new THREE.MeshPhysicalMaterial({ envMap: env, color: col, roughness: 0.15, clearcoat: 1 });
    if (i % 2) {
      g.add(new THREE.Mesh(new THREE.CapsuleGeometry(3, 4, 6, 12), mat));
      g.children[0].rotation.z = Math.PI / 2;
    } else {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(4, 14, 10), mat));
      [-1, 1].forEach((s) => {
        const w = new THREE.Mesh(new THREE.ConeGeometry(3.5, 6, 8), mat);
        w.rotation.z = (s * Math.PI) / 2;
        w.position.x = s * 6;
        g.add(w);
      });
    }
    orbit.add(g);
    return { g, a: (i / 10) * Math.PI * 2 };
  });

  const sprinkles = meshBurst(scene, { max: 80 });
  const sprinkleGeo = new THREE.CapsuleGeometry(0.0008, 0.004, 2, 6);
  const beanGeo = new THREE.CapsuleGeometry(0.0022, 0.0025, 4, 8);
  const candyMats = CANDY_COLORS.map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.2, clearcoat: 1 }));
  const mouth = anchorAt(slide, 196, 16, 0);
  const tmp = new THREE.Vector3();
  let time = 0;

  const pieces = captureGlock(model, slide, [orbit]);
  const rand = seeded(2403);
  pieces.forEach((p) => (p.order = rand()));
  const sc = new THREE.Vector3();
  const intro = introRunner(pieces, {
    duration: 1.5,
    hidden: [orbit],
    frame: (t) => {
      if (t < 1.2 && Math.random() < 0.7) {
        model.localToWorld(tmp.set(Math.random() * 190, 110, (Math.random() - 0.5) * 60));
        sprinkles.spawn(new THREE.Mesh(sprinkleGeo, candyMats[Math.floor(Math.random() * 6)]), tmp, new THREE.Vector3(0, -0.8, 0), { life: 700, gravity: -3, drag: 0, spin: 10, shrink: false });
      }
    },
    place: (p, t) => {
      const s = clamp01((t - 0.1 - p.order * 0.8) / 0.55);
      p.object.visible = s > 0;
      if (s <= 0) return;
      // Gelée : écrasée puis étirée autour de 1 en rebondissant.
      const e = easeOutElastic(s);
      sc.set(e * (1 + (1 - s) * 0.3), e, e * (1 + (1 - s) * 0.3));
      placePartScaled(p, sc, ZERO);
    },
  });

  return {
    muzzleX: 200,
    replayIntro: intro.start,
    introDuration: intro.duration,
    update: (dt, t, flare) => {
      time += dt;
      bears.forEach((b) => {
        springStep(b.jiggle, 0, 160, dt);
        const j = b.jiggle.x + Math.sin(time * 3 + b.phase) * 0.04;
        b.b.scale.set(b.base * (1 - j * 0.5), b.base * (1 + j), b.base * (1 - j * 0.5));
      });
      lollipops.forEach((l, i) => (l.rotation.y = time * (i ? -1.2 : 1.2)));
      donut.rotation.x = time * 0.8;
      candies.forEach((c, i) => {
        c.a += dt * 0.7;
        c.g.position.set(90 + Math.cos(c.a) * 110, -70 + Math.sin(c.a * 2 + i) * 14, Math.sin(c.a) * 55);
        c.g.rotation.set(time * 1.3 + i, time * 0.9, 0);
      });
      sprinkles.update(dt);
      intro.update(dt);
    },
    onFire: () => {
      bears.forEach((b) => (b.jiggle.v += 6));
      mouth.getWorldPosition(tmp);
      for (let i = 0; i < 18; i += 1) {
        sprinkles.spawn(new THREE.Mesh(i < 5 ? beanGeo : sprinkleGeo, candyMats[i % 6]), tmp, new THREE.Vector3((Math.random() - 0.3) * 1.3, Math.random() * 1.2, (Math.random() - 0.5) * 1.3), { life: 800, gravity: -6, drag: 1, spin: 14, shrink: false });
      }
    },
  };
}

// =============================================================================
// KINTSUGI — porcelaine blanche peinte au bleu de cobalt (vagues et fleurs),
// brisée puis réparée à l'or : les fêlures d'or luisent et une lueur les
// parcourt. Des éclats de porcelaine bordés d'or flottent autour de l'arme, la
// bouche s'évase comme un col de vase. Au tir : poussière d'or et éclats.
// Apparition : l'arme éclatée se recompose, puis l'or coule dans les fêlures.
// =============================================================================

function kintsugiCracks() {
  const rand = seeded(2501);
  const lines = [];
  const walk = (x, y, a, n, w) => {
    const pts = [[x, y]];
    for (let i = 0; i < n; i += 1) {
      a += (rand() - 0.5) * 1.1;
      x += Math.cos(a) * 5;
      y += Math.sin(a) * 5;
      pts.push([x, y]);
      if (rand() < 0.1 && w > 0.5) walk(x, y, a + (rand() < 0.5 ? 1 : -1), Math.floor(n / 2), w * 0.6);
    }
    lines.push({ pts, w });
  };
  [[0, 15, 0.1, 40], [60, -30, -1.2, 20], [20, -80, -0.3, 14], [120, -5, 0.3, 14], [100, 25, -0.2, 18]].forEach(([x, y, a, n]) => walk(x, y, a, n, 1.4));
  return lines;
}

function kintsugiFinish(env, { uniforms }) {
  const gold = { value: 1 };
  const cracks = kintsugiCracks();
  const drawCracks = (ctx, color, extra = 0) => {
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    cracks.forEach(({ pts, w }) => {
      ctx.lineWidth = w + extra;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    });
  };
  const color = livery('kin-color', (ctx) => {
    const rand = seeded(2502);
    // Vagues stylisées au cobalt.
    ctx.strokeStyle = 'rgba(30,60,160,0.85)';
    ctx.lineWidth = 0.9;
    for (let y = -130; y < 40; y += 11) {
      for (let x = -20; x < 200; x += 16) {
        for (let r = 2; r <= 7; r += 2.5) {
          ctx.beginPath();
          ctx.arc(x + ((y / 11) % 2) * 8, y, r, Math.PI, 0);
          ctx.stroke();
        }
      }
    }
    // Fleurs au pinceau.
    for (let i = 0; i < 12; i += 1) {
      const cx = -10 + rand() * 200;
      const cy = -120 + rand() * 150;
      ctx.fillStyle = 'rgba(25,50,150,0.9)';
      for (let k = 0; k < 5; k += 1) {
        const a = (k / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4, 3.4, 1.8, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#f7f7f4';
      ctx.beginPath();
      ctx.arc(cx, cy, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    drawCracks(ctx, '#d9a55a', 0.4);
  }, { background: '#f7f7f4', color: true });
  const glow = livery('kin-glow', (ctx) => drawCracks(ctx, '#ffcf70'), { background: '#000000', color: true });
  const porcelain = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1.1, map: color, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1 });
  // L'or circule dans les fêlures ; `uGold` le fait couler pendant l'apparition.
  porcelain.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uFlare = uniforms.uFlare;
    shader.uniforms.uGold = gold;
    shader.fragmentShader = `uniform float uTime;\nuniform float uFlare;\nuniform float uGold;\n${shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float run = 0.35 + 0.9 * pow(0.5 + 0.5 * sin(vEmissiveMapUv.x * 20.0 + vEmissiveMapUv.y * 8.0 - uTime * 2.4), 6.0);
      totalEmissiveRadiance *= step(vEmissiveMapUv.x, uGold * 1.1) * (run + uFlare * 2.0);`,
    )}`;
  };
  porcelain.customProgramCacheKey = () => 'kintsugi';
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xf7f7f4, roughness: 0.08, clearcoat: 1 });
  const goldMat = new THREE.MeshStandardMaterial({ envMap: env, color: 0xe0b050, metalness: 1, roughness: 0.18 });
  return {
    ...pairOf(porcelain, wall),
    barrel: goldMat,
    steel: goldMat,
    sight: new THREE.MeshBasicMaterial({ color: 0xffcf70 }),
    dot: new THREE.MeshBasicMaterial({ color: 0x1e3ca0 }),
    flash: 'gold',
    light: 0xffd080,
    smoke: 0xfff4e0,
    makeShell: () => new THREE.Mesh(new THREE.TetrahedronGeometry(0.004), new THREE.MeshPhysicalMaterial({ color: 0xf7f7f4, roughness: 0.1, clearcoat: 1 })),
    decorate: (ctx) => decorateKintsugi({ ...ctx, env, gold, wall, goldMat }),
  };
}

function decorateKintsugi({ model, slide, add, scene, env, gold, wall, goldMat }) {
  // Col de vase évasé à la bouche, bord doré.
  const vase = add(new THREE.LatheGeometry([new THREE.Vector2(8, 0), new THREE.Vector2(9, 8), new THREE.Vector2(12, 14), new THREE.Vector2(15, 16)], 32), new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xf7f7f4, roughness: 0.08, clearcoat: 1, side: THREE.DoubleSide }), 186, 16, 0, slide);
  vase.rotation.z = -Math.PI / 2;
  const rim = add(new THREE.TorusGeometry(15, 0.9, 8, 40), goldMat, 202, 16, 0, slide);
  rim.rotation.y = Math.PI / 2;

  // Éclats de porcelaine bordés d'or qui flottent autour de l'arme.
  const shardMat = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xf7f7f4, roughness: 0.08, clearcoat: 1, side: THREE.DoubleSide });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xffcf70 });
  const drift = new THREE.Group();
  model.add(drift);
  const rand = seeded(2503);
  const shards = Array.from({ length: 12 }, (_, i) => {
    const s = new THREE.Shape();
    const n = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k += 1) {
      const a = (k / n) * Math.PI * 2 + rand() * 0.6;
      const r = 5 + rand() * 7;
      if (k) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const geo = extrude(s, 1.2, 0.3, { bevelSegments: 1 });
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, shardMat));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat));
    drift.add(g);
    return { g, a: (i / 12) * Math.PI * 2, r: 60 + rand() * 40, y: -80 + rand() * 90, spin: new THREE.Vector3(rand(), rand(), rand()), push: { x: 0, v: 0 } };
  });

  const dust = particleSystem(scene, softDotTexture('kin-dust', 'rgba(255,235,170,1)', 'rgba(255,190,80,0)'), { max: 150 });
  const chips = meshBurst(scene, { max: 40 });
  const chipGeo = new THREE.TetrahedronGeometry(0.003);
  const mouth = anchorAt(slide, 204, 16, 0);
  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  let time = 0;

  // Apparition : les morceaux éclatés reviennent ensemble, puis l'or coule.
  const pieces = captureGlock(model, slide, [drift]);
  const r2 = seeded(2504);
  pieces.forEach((p) => {
    p.order = r2();
    p.scatter = p.center.clone().sub(GUN_CENTER).normalize().multiplyScalar(140 + r2() * 90).add(new THREE.Vector3((r2() - 0.5) * 60, (r2() - 0.5) * 60, (r2() - 0.5) * 80));
    p.tumble = new THREE.Quaternion().setFromEuler(new THREE.Euler(r2() * 4, r2() * 4, r2() * 4));
  });
  const delta = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const ID = new THREE.Quaternion();
  const intro = introRunner(pieces, {
    duration: 1.7,
    hidden: [drift],
    start: () => (gold.value = 0),
    end: () => (gold.value = 1),
    frame: (t) => {
      gold.value = clamp01((t - 1.0) / 0.6);
      if (t > 1 && t < 1.6) {
        model.localToWorld(tmp.set(-10 + gold.value * 210, -40 + Math.random() * 60, (Math.random() - 0.5) * 30));
        dust.spawn(tmp, new THREE.Vector3(0, 0.05, 0), { life: 500, size: 0.004, drag: 1 });
      }
    },
    place: (p, t) => {
      const s = clamp01((t - 0.05 - p.order * 0.35) / 0.65);
      p.object.visible = true;
      const e = easeInOut(s);
      delta.copy(p.scatter).multiplyScalar(1 - e);
      rot.copy(p.tumble).slerp(ID, e);
      placePart(p, 1, delta, rot);
      if (s >= 1 && !p.done) {
        p.done = true;
        p.object.parent.localToWorld(tmp.copy(p.center));
        for (let i = 0; i < 3; i += 1) dust.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.3, (Math.random() - 0.5) * 0.4), { life: 400, size: 0.003, drag: 2 });
      }
    },
  });
  const baseStart = intro.start;
  intro.start = () => {
    pieces.forEach((p) => (p.done = false));
    baseStart();
  };

  return {
    muzzleX: 206,
    replayIntro: intro.start,
    introDuration: intro.duration,
    update: (dt, t, flare) => {
      time += dt;
      shards.forEach((s, i) => {
        springStep(s.push, 0, 25, dt);
        s.a += dt * 0.25;
        const r = s.r + s.push.x;
        s.g.position.set(90 + Math.cos(s.a) * r * 1.3, s.y + Math.sin(time * 0.8 + i) * 6, Math.sin(s.a) * r * 0.8);
        s.g.rotation.x += s.spin.x * dt * 0.6;
        s.g.rotation.y += s.spin.y * dt * 0.6;
      });
      edgeMat.color.setRGB(1, 0.81, 0.44).multiplyScalar(1 + flare);
      dust.update(dt);
      chips.update(dt);
      intro.update(dt);
    },
    onFire: () => {
      shards.forEach((s) => (s.push.v += 60));
      mouth.getWorldPosition(tmp);
      slide.getWorldQuaternion(quat);
      for (let i = 0; i < 18; i += 1) {
        dust.spawn(tmp, new THREE.Vector3(0.3 + Math.random() * 0.8, (Math.random() - 0.3) * 0.8, (Math.random() - 0.5) * 0.9).applyQuaternion(quat), { life: 600, size: 0.0028, drag: 2.5, gravity: -0.5 });
      }
      for (let i = 0; i < 6; i += 1) {
        chips.spawn(new THREE.Mesh(chipGeo, i % 3 ? wall : goldMat), tmp, new THREE.Vector3((Math.random() - 0.3) * 1.2, Math.random() * 0.9, (Math.random() - 0.5) * 1.2), { life: 700, gravity: -6, drag: 1, spin: 14 });
      }
    },
  };
}

export const GLOCK_TRANSCENDENT_SET = {
  arcade: { build: arcadeFinish },
  hanabi: { build: hanabiFinish },
  mirage: { build: mirageFinish },
  candy: { build: candyFinish },
  kintsugi: { build: kintsugiFinish },
};
