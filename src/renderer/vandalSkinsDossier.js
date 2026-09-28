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
} from './weaponKit.js';
import { LIVERY, livery, tracePolygon, strokeLine, magazineOutline, ringTexture } from './vandalSkins.js';

// Skins « Ultra » de la Vandal issus du dossier de conception : Symbiote,
// Héliopause, Reliquaire, Nullbyte. Règle commune : la silhouette de la Vandal
// reste lisible (on habille et on greffe, on ne remplace pas), rien ne monte dans
// la ligne de mire, et le flanc gauche (-z, celui que voit le joueur) porte les
// éléments vivants.

const W = LIVERY.maxX - LIVERY.minX;
const H = LIVERY.maxY - LIVERY.minY;

function faces(pair) {
  return { receiver: pair, dustCover: pair, magwell: pair, gasBlock: pair, muzzle: pair, stock: pair, grip: pair, handguard: pair, upperGuard: pair, magazine: pair };
}

function glowSprite(texture, color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1);
  return s;
}

function lightningPoints(a, b, depth, spread) {
  if (depth === 0) return [a, b];
  const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread));
  return [...lightningPoints(a, mid, depth - 1, spread * 0.55).slice(0, -1), ...lightningPoints(mid, b, depth - 1, spread * 0.55)];
}

// =============================================================================
// SYMBIOTE — organique abyssal / exosquelette chitiné
// =============================================================================

function symbioteFinish(env, geo) {
  const plates = (ctx, glow) => {
    const rand = seeded(6101);
    ctx.lineWidth = glow ? 0.6 : 1.4;
    // Écailles imbriquées : arcs décalés d'une rangée à l'autre.
    for (let y = LIVERY.minY; y < LIVERY.maxY; y += 12) {
      const off = (Math.round((y - LIVERY.minY) / 12) % 2) * 9;
      for (let x = LIVERY.minX - 18 + off; x < LIVERY.maxX; x += 18) {
        ctx.strokeStyle = glow ? 'rgba(56,242,216,0.55)' : 'rgba(2,4,10,0.85)';
        ctx.beginPath();
        ctx.arc(x, y, 10, Math.PI * 0.05, Math.PI * 0.95);
        ctx.stroke();
      }
    }
    if (!glow) {
      speckle(ctx, LIVERY, 9000, ['rgba(120,160,220,0.12)', 'rgba(0,0,0,0.3)'], 0.6, seeded(6102));
      // Plaques d'os ivoire sur la crosse et la poignée.
      ctx.fillStyle = 'rgba(216,207,184,0.92)';
      for (let i = 0; i < 26; i += 1) {
        const x = 20 + rand() * 200;
        const y = -90 + rand() * 110;
        ctx.beginPath();
        ctx.ellipse(x, y, 10 + rand() * 12, 5 + rand() * 5, rand() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Veines de fluide.
    ctx.lineCap = 'round';
    for (let i = 0; i < 22; i += 1) {
      let x = LIVERY.minX + rand() * W;
      let y = LIVERY.minY + rand() * H;
      let a = rand() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 12; k += 1) {
        a += (rand() - 0.5) * 0.9;
        x += Math.cos(a) * 6;
        y += Math.sin(a) * 6;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = glow ? 'rgba(80,255,225,1)' : 'rgba(40,180,160,0.9)';
      ctx.lineWidth = glow ? 1 : 1.6;
      ctx.stroke();
    }
  };
  const color = livery('symb-color', (ctx) => plates(ctx, false), { background: '#0e1420', color: true });
  const glow = livery('symb-glow', (ctx) => plates(ctx, true), { background: '#000000', color: true });
  const bump = livery('symb-bump', (ctx) => {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.4;
    for (let y = LIVERY.minY; y < LIVERY.maxY; y += 12) {
      const off = (Math.round((y - LIVERY.minY) / 12) % 2) * 9;
      for (let x = LIVERY.minX - 18 + off; x < LIVERY.maxX; x += 18) {
        ctx.beginPath();
        ctx.arc(x, y, 10, Math.PI * 0.05, Math.PI * 0.95);
        ctx.stroke();
      }
    }
  }, { background: '#b0b0b0' });
  // Battement : double pulsation, comme un cœur lent.
  const beat = `
    float b = pow(max(0.0, sin(uTime * 1.8)), 10.0) + 0.5 * pow(max(0.0, sin(uTime * 1.8 - 0.5)), 12.0);
    totalEmissiveRadiance *= 0.25 + b * 1.6 + uFlare * 1.8;
  `;
  const chitin = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1.1, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.3, metalness: 0.2, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12, iridescence: 0.7, iridescenceIOR: 1.4, bumpMap: bump, bumpScale: 2 }),
    geo.uniforms,
    beat,
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x0e1420, metalness: 0.2, roughness: 0.2, clearcoat: 1, iridescence: 0.6 });
  const bone = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.8, color: 0xd8cfb8, roughness: 0.35 });
  return {
    ...faces([chitin, wall]),
    buttPad: [wall, wall],
    metal: bone,
    barrel: wall,
    dark: new THREE.MeshStandardMaterial({ color: 0x03060a, roughness: 0.6 }),
    sight: new THREE.MeshBasicMaterial({ color: 0x38f2d8 }),
    brass: bone,
    flash: 'abyss',
    light: 0x38f2d8,
    smoke: 0x2a5a60,
    glow: [],
    makeShell: () => new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), new THREE.MeshBasicMaterial({ color: 0x38f2d8 })),
    decorate: (ctx) => decorateSymbiote({ ...ctx, geo, bone, wall, env }),
  };
}

function decorateSymbiote({ body, add, scene, parts, geo, bone, wall, env }) {
  const u = geo.uniforms;
  // Cage thoracique autour du garde-main : côtes d'os + membrane translucide qui respire.
  const cage = new THREE.Group();
  cage.position.set(608, -4, 0);
  body.add(cage);
  const membrane = patchShader(
    new THREE.MeshPhysicalMaterial({ color: 0x2a6a70, roughness: 0.3, transmission: 0.55, thickness: 6, transparent: true, opacity: 0.8, side: THREE.DoubleSide, sheen: 0.8, sheenColor: new THREE.Color(0xff9ab8), emissive: 0x0a3a3a, emissiveIntensity: 0.6 }),
    u,
    { vertex: 'transformed += objectNormal * (sin(position.y * 0.08 + uTime * 2.4) * 1.2 + uFlare * -3.0);' },
  );
  const skin = new THREE.Mesh(new THREE.CylinderGeometry(29, 29, 200, 28, 8, true), membrane);
  skin.rotation.z = Math.PI / 2;
  cage.add(skin);
  for (let k = 0; k < 7; k += 1) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(31, 2.6, 8, 28), bone);
    rib.rotation.y = Math.PI / 2;
    rib.position.x = -90 + k * 30;
    cage.add(rib);
  }
  // Fluide sous pression qui circule dans la cage (renflements qui avancent).
  const fluid = patchShader(
    new THREE.MeshStandardMaterial({ color: 0x06302c, emissive: 0x38f2d8, emissiveIntensity: 1.4, roughness: 0.2 }),
    u,
    {
      vertex: 'transformed += objectNormal * (pow(0.5 + 0.5 * sin(position.y * 0.09 + uTime * 5.0 + uFlare * 8.0), 4.0) * 3.5);',
      fragment: 'totalEmissiveRadiance *= 0.7 + 0.5 * sin(uTime * 4.0) + uFlare * 1.5;',
    },
  );
  const vein = add(new THREE.CylinderGeometry(6, 6, 240, 16, 40), fluid, 600, -16, 0);
  vein.rotation.z = Math.PI / 2;

  // Écailles de chitine en relief sur le flanc droit (le gauche porte les yeux).
  [1].forEach((side) => {
    for (let k = 0; k < 7; k += 1) {
      const scale = add(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI), wall, 250 + k * 32, 4, side * 15.5);
      scale.scale.set(18, 22, 5);
      scale.rotation.set(0, side > 0 ? 0 : Math.PI, -0.35);
    }
  });

  // Trois yeux bioluminescents sur le flanc gauche, avec paupières.
  const eyeTex = tiledTexture('symb-iris', 128, (ctx, size) => {
    const c = size / 2;
    const g = ctx.createRadialGradient(c, c, 4, c, c, c);
    g.addColorStop(0, '#fff2b0');
    g.addColorStop(0.45, '#ffb020');
    g.addColorStop(1, '#6a2a00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#050302';
    ctx.beginPath();
    ctx.ellipse(c, c, 6, 30, 0, 0, Math.PI * 2);
    ctx.fill();
  }, { color: true });
  // Chaque œil dans une orbite de chitine en relief.
  const eyes = [[296, -2, 12], [362, 6, 9], [424, -6, 10.5]].map(([x, y, r], i) => {
    const socket = add(new THREE.TorusGeometry(r * 1.2, r * 0.32, 10, 28), wall, x, y, -17);
    socket.scale.set(1.25, 1, 1);
    const g = new THREE.Group();
    g.position.set(x, y, -20);
    body.add(g);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({ map: eyeTex, emissive: 0xffffff, emissiveMap: eyeTex, emissiveIntensity: 0.9 }));
    ball.rotation.y = -Math.PI / 2;
    g.add(ball);
    const cornea = new THREE.Mesh(new THREE.SphereGeometry(r * 1.04, 24, 16), new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xffffff, transparent: true, opacity: 0.2, roughness: 0, clearcoat: 1, depthWrite: false }));
    g.add(cornea);
    const lids = [1, -1].map((s) => {
      const lid = new THREE.Mesh(new THREE.SphereGeometry(r * 1.12, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), wall);
      lid.scale.set(1, 0.15, 1);
      if (s < 0) lid.rotation.x = Math.PI;
      g.add(lid);
      return lid;
    });
    return { g, ball, lids, r, next: 1 + i * 0.7, blink: 0, look: new THREE.Vector2() };
  });

  // Valves de chitine autour de la bouche.
  const valves = [0, 1, 2, 3].map((k) => {
    const pivot = new THREE.Group();
    pivot.position.set(896, 4, 0);
    pivot.rotation.x = (k / 4) * Math.PI * 2 + Math.PI / 4;
    body.add(pivot);
    const lip = new THREE.Mesh(new THREE.ConeGeometry(9, 34, 4, 1, true), wall);
    lip.position.set(14, 12, 0);
    lip.rotation.z = -Math.PI / 2 - 0.25;
    lip.scale.set(1, 1, 0.5);
    pivot.add(lip);
    return pivot;
  });

  // Gouttes de fluide aux jointures.
  const drips = [[520, -32], [700, -32], [470, -44]].map(([x, y], i) => ({ mesh: add(new THREE.SphereGeometry(2.4, 10, 8).translate(0, -2.4, 0), new THREE.MeshBasicMaterial({ color: 0x38f2d8 }), x, y, 0), t: i * 0.3, period: 1.4 + i * 0.5 }));

  const jet = particleSystem(scene, softDotTexture('symb-jet', 'rgba(150,255,240,1)', 'rgba(56,242,216,0)'), { max: 120 });
  const drops = meshBurst(scene, { max: 40 });
  const dropGeo = new THREE.SphereGeometry(0.003, 8, 6);
  const dropMat = new THREE.MeshBasicMaterial({ color: 0x38f2d8 });
  const mouth = anchorAt(body, 920, 4, 0);
  const tmp = new THREE.Vector3();
  const squeeze = { x: 0, v: 0 };
  let time = 0;
  return {
    muzzleX: 928,
    update: (dt, t, flare) => {
      time += dt;
      springStep(squeeze, 0, 26, dt);
      // Respiration (toutes les 3,5 s) + contraction au tir, avec surcompensation.
      const breath = Math.sin((time / 3.5) * Math.PI * 2) * 0.04;
      const s = 1 + breath - squeeze.x * 0.08;
      cage.scale.set(1, s, s);
      eyes.forEach((e) => {
        e.next -= dt;
        if (e.next <= 0) {
          e.blink = 1;
          e.next = 2 + Math.random() * 4;
          e.look.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.4);
        }
        e.blink = Math.max(0, e.blink - dt * 6);
        const closed = Math.max(e.blink > 0.5 ? (1 - e.blink) * 2 : e.blink * 2, Math.min(1, squeeze.x * 1.2));
        e.lids.forEach((lid) => lid.scale.set(1, 0.15 + closed * 0.85, 1));
        e.ball.rotation.x += (e.look.y - e.ball.rotation.x) * dt * 4;
        e.ball.rotation.z += (e.look.x - e.ball.rotation.z) * dt * 4;
      });
      valves.forEach((v) => {
        v.children[0].rotation.x = 0.1 + Math.max(0, squeeze.x) * 0.7 + Math.sin(time * 1.8) * 0.04;
      });
      drips.forEach((d) => {
        d.t += dt / d.period;
        if (d.t >= 1) {
          d.t = 0;
          d.mesh.getWorldPosition(tmp);
          drops.spawn(new THREE.Mesh(dropGeo, dropMat), tmp, new THREE.Vector3(0, -0.05, 0), { life: 600, gravity: -6, drag: 0, spin: 0, shrink: false });
        }
        d.mesh.scale.set(1 - d.t * 0.3, 0.3 + d.t * 1.6, 1 - d.t * 0.3);
      });
      jet.update(dt);
      drops.update(dt);
    },
    onFire: () => {
      squeeze.v += 9;
      mouth.getWorldPosition(tmp);
      // Jet orienté légèrement vers le bas : la cible reste visible pendant le flick.
      for (let i = 0; i < 16; i += 1) {
        jet.spawn(tmp, new THREE.Vector3(1.2 + Math.random() * 1.4, -0.4 - Math.random() * 0.4, (Math.random() - 0.5) * 0.6), { life: 380, size: 0.004, grow: 1, drag: 3, additive: false, peak: 0.85, tint: 0x38f2d8 });
      }
      for (let i = 0; i < 6; i += 1) {
        drops.spawn(new THREE.Mesh(dropGeo, dropMat), tmp, new THREE.Vector3(0.8 + Math.random(), -0.2 - Math.random() * 0.5, (Math.random() - 0.5) * 0.8), { life: 700, gravity: -5, drag: 1, spin: 0 });
      }
    },
  };
}

// =============================================================================
// HÉLIOPAUSE — noyau à plasma céleste
// =============================================================================

function heliopauseFinish(env, geo) {
  const lines = (ctx, glow) => {
    if (!glow) {
      speckle(ctx, LIVERY, 6000, ['rgba(0,0,0,0.04)', 'rgba(255,255,255,0.4)'], 0.6, seeded(6201));
      // Panneaux or brossé (rayures horizontales) sur la carcasse et la crosse.
      [[236, 20, 262, 14], [20, 10, 190, 10], [510, -24, 200, 8]].forEach(([x, y, w, h]) => {
        ctx.fillStyle = '#c9a24a';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255,240,200,0.35)';
        for (let yy = y; yy < y + h; yy += 0.8) ctx.fillRect(x, yy, w, 0.25);
      });
    }
    // Arêtes chanfreinées : filets fins qui soulignent les contours.
    ctx.strokeStyle = glow ? 'rgba(170,220,255,1)' : '#c9a24a';
    ctx.lineWidth = glow ? 0.6 : 1.2;
    [geo.stockOutline, geo.stockHole, geo.handguardOutline, magazineOutline(geo.magazineCurve)].forEach((o) => {
      tracePolygon(ctx, o);
      ctx.stroke();
    });
    if (glow) [[240, -8, 480, -8], [520, 12, 700, 12]].forEach(([x1, y1, x2, y2]) => strokeLine(ctx, [[x1, y1], [x2, y2]]));
  };
  const color = livery('helio-color', (ctx) => lines(ctx, false), { background: '#f2f1ec', color: true });
  const glow = livery('helio-glow', (ctx) => lines(ctx, true), { background: '#000000', color: true });
  const ceramic = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1, metalness: 0.1, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0.25 }),
    geo.uniforms,
    'totalEmissiveRadiance *= 0.4 + 0.8 * pow(0.5 + 0.5 * sin(vEmissiveMapUv.x * 18.0 - uTime * 3.0), 6.0) + uFlare * 1.6;',
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xeceae4, roughness: 0.2, clearcoat: 1 });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.4, color: 0xc9a24a, metalness: 1, roughness: 0.2 });
  return {
    ...faces([ceramic, wall]),
    buttPad: [gold, gold],
    metal: gold,
    barrel: new THREE.MeshStandardMaterial({ envMap: env, color: 0xdfe4ea, metalness: 1, roughness: 0.12 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.5 }),
    sight: new THREE.MeshBasicMaterial({ color: 0x9fdcff }),
    brass: gold,
    flash: 'frost',
    light: 0xbfe9ff,
    smoke: 0xe8f4ff,
    glow: [],
    makeShell: () => new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.022, 10), new THREE.MeshBasicMaterial({ color: 0xbfe9ff })),
    decorate: (ctx) => decorateHeliopause({ ...ctx, geo, gold, wall, env }),
  };
}

function decorateHeliopause({ body, add, scene, parts, geo, gold, wall, env }) {
  const u = geo.uniforms;
  const plasma = patchShader(
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1 }),
    u,
    {
      vertex: 'transformed += objectNormal * sin(position.y * 0.2 + uTime * 6.0) * 0.8;',
      fragment: 'totalEmissiveRadiance = mix(vec3(0.55, 0.85, 1.0), vec3(1.0), 0.5 + 0.5 * sin(gl_FragCoord.x * 0.05 - uTime * 7.0)) * (1.3 + uFlare * 2.0);',
    },
  );
  const glass = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xffffff, roughness: 0.02, transmission: 0.92, thickness: 3, ior: 1.45, transparent: true, depthWrite: false });

  // Tube de confinement le long du canon, devant le garde-main.
  const tube = add(new THREE.CylinderGeometry(12, 12, 118, 28, 1, true), glass, 780, 0, 0);
  tube.rotation.z = Math.PI / 2;
  const stream = add(new THREE.CylinderGeometry(6, 6, 116, 20, 30), plasma, 780, 0, 0);
  stream.rotation.z = Math.PI / 2;
  // Bobines de confinement : trois grandes sur le garde-main, trois autour du tube.
  const coils = [[545, -4, 32], [610, -4, 32], [675, -4, 32], [745, 0, 15], [780, 0, 15], [815, 0, 15]].map(([x, y, r], i) => {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    body.add(g);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r > 20 ? 3.4 : 2.4, 12, 40), gold);
    ring.rotation.y = Math.PI / 2;
    g.add(ring);
    const light = new THREE.Mesh(new THREE.TorusGeometry(r, r > 20 ? 1.1 : 0.8, 8, 40), new THREE.MeshBasicMaterial({ color: 0x9fdcff }));
    light.rotation.y = Math.PI / 2;
    light.position.x = r > 20 ? 3.5 : 2.5;
    g.add(light);
    return { g, light, baseX: x, order: i };
  });

  // Réacteur central sur le flanc gauche de la carcasse.
  const reactor = new THREE.Group();
  reactor.position.set(380, 0, -26);
  body.add(reactor);
  add(new THREE.CylinderGeometry(20, 22, 8, 32), wall, 380, 0, -18).rotation.x = Math.PI / 2;
  const core = new THREE.Mesh(new THREE.SphereGeometry(11, 32, 24), plasma);
  reactor.add(core);
  const halo = glowSprite(softDotTexture('helio-core', 'rgba(230,245,255,1)', 'rgba(80,160,255,0)'), 0xbfe9ff, 70);
  reactor.add(halo);
  const gyros = [0, 1].map((i) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(16 + i * 4, 1.6, 10, 48), gold);
    reactor.add(r);
    return r;
  });
  const reactorLight = new THREE.PointLight(0x9fdcff, 0.6, 0.25, 2);
  reactor.add(reactorLight);

  // Barre de verre lumineuse dans l'évidement de la crosse.
  const bar = add(new THREE.CylinderGeometry(4, 4, 110, 16), plasma, 110, -26, 0);
  bar.rotation.z = -0.55;
  add(new THREE.CylinderGeometry(6, 6, 112, 16, 1, true), glass, 110, -26, 0).rotation.z = -0.55;

  // Anneau d'éjection à la bouche, et « ghost ring » d'or sur la hausse.
  const ejector = add(new THREE.TorusGeometry(15, 2.6, 12, 40), gold, 918, 4, 0);
  ejector.rotation.y = Math.PI / 2;
  const ghost = add(new THREE.TorusGeometry(4.5, 0.9, 10, 32), gold, 470, 48, 0);
  ghost.rotation.y = Math.PI / 2;

  // Arcs électriques qui sautent d'une bobine à l'autre.
  const arcMat = new THREE.MeshBasicMaterial({ color: 0xb8a4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const arc = new THREE.Mesh(new THREE.BufferGeometry(), arcMat);
  body.add(arc);
  const rings = particleSystem(scene, ringTexture('helio', 'rgba(190,230,255,0.9)'), { max: 8 });
  const mouth = anchorAt(body, 924, 4, 0);
  const tmp = new THREE.Vector3();
  let time = 0;
  let spin = 0;
  let nextArc = 1;
  let arcUntil = 0;
  let fireAt = -10;
  return {
    muzzleX: 930,
    update: (dt, t, flare) => {
      time += dt;
      spin = Math.max(0, spin - dt * 1.6);
      gyros[0].rotation.x += dt * (1.4 + spin * 6);
      gyros[1].rotation.y += dt * (1.1 + spin * 6);
      halo.material.opacity = 0.6 + 0.2 * Math.sin(time * 5) + flare * 0.4;
      reactorLight.intensity = 0.5 + flare * 1.5;
      coils.forEach((c) => {
        // Compression magnétique au tir, retour en cascade (avant → arrière).
        const since = time - fireAt - (5 - c.order) * 0.03;
        const back = since > 0 && since < 0.25 ? Math.sin((since / 0.25) * Math.PI) : 0;
        c.g.position.x = c.baseX - back * 6;
        c.g.scale.setScalar(1 - back * 0.08);
        const chase = 0.5 + 0.5 * Math.sin(time * 6 - c.order * 1.1);
        c.light.material.color.setRGB(0.4 + chase * 0.5 + flare * 0.5, 0.75 + chase * 0.25, 1);
      });
      nextArc -= dt;
      if (nextArc <= 0) {
        nextArc = 1.5 + Math.random() * 1.5;
        arcUntil = time + 0.12;
      }
      arc.visible = time < arcUntil || flare > 0.4;
      if (arc.visible) {
        const a = coils[Math.floor(Math.random() * 3)].g.position.clone().add(new THREE.Vector3(0, 28, 0));
        const b = coils[3 + Math.floor(Math.random() * 3)].g.position.clone().add(new THREE.Vector3(0, 14, 0));
        const pts = lightningPoints(a, b, 4, 22);
        arc.geometry.dispose();
        arc.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), pts.length * 2, 0.8, 4, false);
      }
      rings.update(dt);
    },
    onFire: () => {
      spin = 1;
      fireAt = time;
      mouth.getWorldPosition(tmp);
      rings.spawn(tmp, new THREE.Vector3(), { life: 300, size: 0.03, grow: 5, drag: 0 });
    },
  };
}

// =============================================================================
// RELIQUAIRE — nécromancie gothique / relique maudite
// =============================================================================

function reliquaryFinish(env, geo) {
  const paint = (ctx, glow) => {
    if (!glow) {
      const rand = seeded(6301);
      // Marques de martelage.
      for (let i = 0; i < 1600; i += 1) {
        const x = LIVERY.minX + rand() * W;
        const y = LIVERY.minY + rand() * H;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 4);
        g.addColorStop(0, 'rgba(60,54,46,0.5)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 4, y - 4, 8, 8);
      }
      speckle(ctx, LIVERY, 14000, ['rgba(0,0,0,0.35)', 'rgba(110,100,80,0.2)'], 0.6, seeded(6302));
    }
    // Filets et rinceaux d'or terni (vert-de-gris dans les creux).
    ctx.strokeStyle = glow ? 'rgba(156,255,196,0.5)' : '#8a6a2a';
    ctx.lineWidth = glow ? 0.5 : 1.6;
    [geo.stockOutline, geo.stockHole, geo.handguardOutline, magazineOutline(geo.magazineCurve)].forEach((o) => {
      tracePolygon(ctx, o);
      ctx.stroke();
    });
    if (!glow) {
      ctx.strokeStyle = '#3f5a3a';
      ctx.lineWidth = 0.6;
      const rand = seeded(6303);
      for (let i = 0; i < 60; i += 1) {
        const cx = 230 + rand() * 470;
        const cy = -20 + rand() * 50;
        ctx.beginPath();
        for (let k = 0; k <= 24; k += 1) {
          const a = (k / 24) * Math.PI * 3;
          const r = 5 * (1 - k / 30);
          ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        ctx.stroke();
      }
    }
  };
  const color = livery('reliq-color', (ctx) => paint(ctx, false), { background: '#15130f', color: true });
  const glow = livery('reliq-glow', (ctx) => paint(ctx, true), { background: '#000000', color: true });
  const iron = animateEmissive(
    new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.7, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1, metalness: 0.85, roughness: 0.5 }),
    geo.uniforms,
    'totalEmissiveRadiance *= 0.3 + 0.5 * sin(uTime * 1.3 + vEmissiveMapUv.x * 9.0) + uFlare * 1.5;',
  );
  const ironWall = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.6, color: 0x17150f, metalness: 0.85, roughness: 0.5 });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.1, color: 0x8a6a2a, metalness: 1, roughness: 0.4 });
  return {
    ...faces([iron, ironWall]),
    buttPad: [gold, gold],
    metal: gold,
    barrel: ironWall,
    dark: new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 0.8 }),
    sight: new THREE.MeshBasicMaterial({ color: 0x9cffc4 }),
    brass: gold,
    flash: 'venom',
    light: 0x9cffc4,
    smoke: 0x2a1a33,
    glow: [],
    decorate: (ctx) => decorateReliquary({ ...ctx, geo, iron, ironWall, gold, env }),
  };
}

function skullMesh(bone, dark, size) {
  const g = new THREE.Group();
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(size, 18, 14), bone);
  cranium.scale.set(1, 1.05, 0.8);
  g.add(cranium);
  [-1, 1].forEach((s) => {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(size * 0.28, 10, 8), dark);
    socket.position.set(s * size * 0.36, size * 0.05, -size * 0.62);
    g.add(socket);
  });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(size * 0.12, size * 0.25, 3), dark);
  nose.position.set(0, -size * 0.3, -size * 0.72);
  nose.rotation.x = Math.PI;
  g.add(nose);
  const jaw = new THREE.Group();
  jaw.position.set(0, -size * 0.55, 0);
  g.add(jaw);
  const jawMesh = new THREE.Mesh(new RoundedBoxGeometry(size * 1.1, size * 0.45, size * 1.1, 2, size * 0.12), bone);
  jawMesh.position.set(0, -size * 0.2, -size * 0.1);
  jaw.add(jawMesh);
  g.userData.jaw = jaw;
  return g;
}

function decorateReliquary({ body, add, scene, parts, geo, iron, ironWall, gold, env }) {
  const u = geo.uniforms;
  const bone = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.5, color: 0xd8ccb0, roughness: 0.5 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x050302 });

  // Châsse à toit bas sur le couvercle, creusée d'une gouttière au centre (mire libre).
  [-1, 1].forEach((side) => {
    const roof = add(new RoundedBoxGeometry(200, 4, 13, 2, 1.5), ironWall, 356, 38, side * 8);
    roof.rotation.x = side * -0.45;
    add(new RoundedBoxGeometry(200, 1.6, 1.6, 1, 0.5), gold, 356, 41, side * 13.5);
  });
  [262, 450].forEach((x) => {
    const finial = add(new THREE.ConeGeometry(3.5, 12, 4), gold, x, 44, 0);
    finial.rotation.y = Math.PI / 4;
  });

  // Arcatures ogivales ajourées sur le flanc gauche, flamme spectrale derrière.
  const flame = patchShader(
    new THREE.MeshBasicMaterial({ color: 0x9cffc4, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    u,
    {},
  );
  const flameTex = tiledTexture('reliq-flame', 128, (ctx, size) => {
    const g = ctx.createLinearGradient(0, size, 0, 0);
    g.addColorStop(0, 'rgba(156,255,196,1)');
    g.addColorStop(0.6, 'rgba(90,220,150,0.5)');
    g.addColorStop(1, 'rgba(40,120,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(size * 0.1, size);
    ctx.quadraticCurveTo(size * 0.2, size * 0.3, size * 0.5, 0);
    ctx.quadraticCurveTo(size * 0.8, size * 0.3, size * 0.9, size);
    ctx.fill();
  }, { color: true });
  flame.map = flameTex;
  const flames = [300, 360, 420].map((x) => {
    const arch = new THREE.Shape();
    arch.moveTo(-16, -14);
    arch.lineTo(16, -14);
    arch.lineTo(16, 4);
    arch.quadraticCurveTo(16, 18, 0, 26);
    arch.quadraticCurveTo(-16, 18, -16, 4);
    arch.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-11, -10);
    hole.lineTo(11, -10);
    hole.lineTo(11, 4);
    hole.quadraticCurveTo(11, 14, 0, 20);
    hole.quadraticCurveTo(-11, 14, -11, 4);
    hole.closePath();
    arch.holes.push(hole);
    add(extrude(arch, 3, 0.6), gold, x, 0, -16.5);
    const f = add(new THREE.PlaneGeometry(22, 30), flame, x, 3, -16);
    f.rotation.y = Math.PI;
    return f;
  });

  // Trois crânes sur le flanc gauche du garde-main ; le central a la mâchoire mobile.
  const skulls = [540, 610, 680].map((x, i) => {
    const s = skullMesh(bone, dark, i === 1 ? 13 : 10);
    s.position.set(x, -6, -24);
    body.add(s);
    const eyeGlow = [-1, 1].map((side) => {
      const e = glowSprite(softDotTexture('reliq-eye', 'rgba(210,255,220,1)', 'rgba(80,255,150,0)'), 0x9cffc4, 10);
      e.position.set(side * (i === 1 ? 4.7 : 3.6), 0.6, -9);
      s.add(e);
      return e;
    });
    return { s, eyeGlow, phase: i };
  });

  // Bandes de fer rivetées croisées sur le garde-main (flanc droit).
  [-1, 1].forEach((dir) => {
    for (let k = 0; k < 3; k += 1) {
      const band = add(new RoundedBoxGeometry(80, 4, 2, 1, 0.8), ironWall, 560 + k * 60, -5, 23);
      band.rotation.z = dir * 0.5;
    }
  });

  // Manchon torsadé autour du canon.
  const helix = [];
  for (let k = 0; k <= 80; k += 1) helix.push(new THREE.Vector3(740 + k * 1.2, Math.cos(k * 0.7) * 11, Math.sin(k * 0.7) * 11));
  body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 200, 2.2, 6, false), gold));

  // Encensoir ajouré suspendu sous le frein de bouche.
  const censer = new THREE.Group();
  censer.position.set(880, -12, 0);
  body.add(censer);
  [-1, 1].forEach((s) => {
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 24, 4), gold);
    chain.position.set(s * 5, -12, 0);
    chain.rotation.z = s * 0.2;
    censer.add(chain);
  });
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(10, 12, 8), new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 1, roughness: 0.4, wireframe: true }));
  bowl.position.y = -30;
  censer.add(bowl);
  const incense = glowSprite(softDotTexture('reliq-incense', 'rgba(200,255,220,1)', 'rgba(80,255,150,0)'), 0x9cffc4, 20);
  incense.position.y = -30;
  censer.add(incense);

  const smoke = particleSystem(scene, softDotTexture('reliq-smoke', 'rgba(42,26,51,0.9)', 'rgba(42,26,51,0)'), { max: 60 });
  const ash = particleSystem(scene, softDotTexture('reliq-ash', 'rgba(200,255,220,1)', 'rgba(80,255,150,0)'), { max: 60 });
  const rings = particleSystem(scene, ringTexture('reliq', 'rgba(140,255,190,0.9)'), { max: 6 });
  const mouth = anchorAt(body, 916, 4, 0);
  const tmp = new THREE.Vector3();
  const snap = { x: 0, v: 0 };
  const swing = { x: 0, v: 0 };
  let time = 0;
  let smokeClock = 0;
  return {
    muzzleX: 920,
    update: (dt, t, flare) => {
      time += dt;
      springStep(snap, 0, 60, dt);
      springStep(swing, 0, 6, dt);
      skulls.forEach(({ s, eyeGlow, phase }, i) => {
        // Les yeux s'allument l'un après l'autre (boucle de 3 s).
        const on = Math.max(0, Math.sin(((time / 3) * Math.PI * 2) - phase * 2.1));
        eyeGlow.forEach((e) => (e.material.opacity = 0.15 + on * 0.85 + flare * 0.5));
        if (i === 1) s.userData.jaw.rotation.x = Math.max(0, snap.x) * 0.26;
      });
      flames.forEach((f, i) => {
        f.scale.set(1 + Math.sin(time * 9 + i) * 0.06, 1 + Math.sin(time * 7 + i * 2) * 0.12 + flare * 0.4, 1);
      });
      censer.rotation.x = Math.sin(time * 1.4) * 0.12 + swing.x * 0.5;
      incense.material.opacity = 0.6 + 0.3 * Math.sin(time * 4) + flare * 0.4;
      smokeClock += dt;
      while (smokeClock > 0.16) {
        smokeClock -= 0.16;
        const sk = skulls[Math.floor(Math.random() * 3)].s;
        sk.getWorldPosition(tmp);
        // Fumée plafonnée sous le couvercle : ne monte pas dans la ligne de mire.
        smoke.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.01, 0.012, -0.01), { life: 1100, size: 0.008, grow: 2, drag: 0.6, additive: false, peak: 0.35 });
      }
      smoke.update(dt);
      ash.update(dt);
      rings.update(dt);
    },
    onFire: () => {
      snap.v += 10;
      swing.v -= 4;
      mouth.getWorldPosition(tmp);
      rings.spawn(tmp, new THREE.Vector3(), { life: 420, size: 0.03, grow: 5, drag: 0 });
      for (let i = 0; i < 8; i += 1) {
        ash.spawn(tmp, new THREE.Vector3((Math.random() - 0.2) * 0.8, Math.random() * 0.4, (Math.random() - 0.5) * 0.8), { life: 900, size: 0.003, drag: 2, gravity: -0.6 });
      }
      smoke.spawn(tmp, new THREE.Vector3(0.2, 0.02, 0), { life: 900, size: 0.016, grow: 3, drag: 2, additive: false, peak: 0.45 });
    },
  };
}

// =============================================================================
// NULLBYTE — cyber-hacker / glitch holo
// =============================================================================

function pcbTexture() {
  return tiledTexture('null-pcb', 512, (ctx, size) => {
    ctx.fillStyle = '#04150e';
    ctx.fillRect(0, 0, size, size);
    const rand = seeded(6401);
    ctx.lineCap = 'square';
    for (let i = 0; i < 140; i += 1) {
      let x = Math.round((rand() * size) / 8) * 8;
      let y = Math.round((rand() * size) / 8) * 8;
      ctx.strokeStyle = rand() < 0.3 ? '#3df5ff' : '#1a9a6a';
      ctx.lineWidth = rand() < 0.2 ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k += 1) {
        if (rand() < 0.5) x += (rand() < 0.5 ? -1 : 1) * (16 + rand() * 60);
        else y += (rand() < 0.5 ? -1 : 1) * (16 + rand() * 60);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = '#c8d0a0';
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
    for (let i = 0; i < 12; i += 1) {
      ctx.fillStyle = '#101418';
      const w = 30 + rand() * 50;
      const h = 20 + rand() * 30;
      const x = rand() * (size - w);
      const y = rand() * (size - h);
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#9aa0a8';
      for (let p = 0; p < w; p += 6) {
        ctx.fillRect(x + p, y - 4, 3, 4);
        ctx.fillRect(x + p, y + h, 3, 4);
      }
    }
  }, { color: true });
}

function nullbyteFinish(env, geo) {
  const paint = (ctx, glow) => {
    if (!glow) speckle(ctx, LIVERY, 12000, ['rgba(255,255,255,0.04)', 'rgba(0,0,0,0.3)'], 0.6, seeded(6402));
    // Lamelles « mal compressées » : bandes horizontales décalées.
    const rand = seeded(6403);
    for (let y = LIVERY.minY; y < LIVERY.maxY; y += 6 + rand() * 10) {
      if (rand() < 0.75) continue;
      const x = LIVERY.minX + rand() * W;
      ctx.fillStyle = glow ? (rand() < 0.5 ? 'rgba(61,245,255,0.9)' : 'rgba(255,46,154,0.9)') : rand() < 0.5 ? '#0e3a44' : '#3a0e2a';
      ctx.fillRect(x, y, 30 + rand() * 120, 1 + rand() * 2.5);
    }
    ctx.strokeStyle = glow ? 'rgba(61,245,255,1)' : '#3df5ff';
    ctx.lineWidth = glow ? 0.7 : 1;
    [geo.stockOutline, geo.handguardOutline, magazineOutline(geo.magazineCurve)].forEach((o) => {
      tracePolygon(ctx, o);
      ctx.stroke();
    });
    ctx.strokeStyle = glow ? 'rgba(124,255,79,1)' : '#7cff4f';
    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = glow ? 'rgba(124,255,79,1)' : '#7cff4f';
    ctx.save();
    ctx.scale(1, -1);
    ['0xDEADBEEF', 'SEGFAULT', 'ROOT#', 'NULL'].forEach((txt, i) => ctx.fillText(txt, 30 + i * 180, 70 - (i % 2) * 40));
    ctx.restore();
  };
  const color = livery('null-color', (ctx) => paint(ctx, false), { background: '#0b0d12', color: true });
  const glow = livery('null-glow', (ctx) => paint(ctx, true), { background: '#000000', color: true });
  // Glitch : décalage en bandes + séparation RVB, par à-coups (toutes les ~1 à 2 s).
  const glitch = `
    float frame = floor(uTime * 12.0);
    float on = step(0.9, fract(sin(frame * 91.7) * 43758.5453)) + uFlare;
    float band = sign(sin(vEmissiveMapUv.y * 300.0 + frame * 3.0));
    vec2 o = vec2(on * 0.012 * band, 0.0);
    float r = texture2D(emissiveMap, vEmissiveMapUv + o + vec2(0.006 * on, 0.0)).r;
    float g = texture2D(emissiveMap, vEmissiveMapUv + o).g;
    float b = texture2D(emissiveMap, vEmissiveMapUv + o - vec2(0.006 * on, 0.0)).b;
    totalEmissiveRadiance = vec3(r, g, b) * emissive * (0.85 + 0.15 * sin(uTime * 23.0) + uFlare * 1.5);
  `;
  const anodized = animateEmissive(
    new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.9, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.3, metalness: 0.7, roughness: 0.35 }),
    geo.uniforms,
    glitch,
  );
  const wall = new THREE.MeshStandardMaterial({ envMap: env, color: 0x0b0d12, metalness: 0.7, roughness: 0.3 });
  const smoked = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1.2, color: 0x2a3444, roughness: 0.08, transmission: 0.62, thickness: 8, ior: 1.45, transparent: true, clearcoat: 1 });
  return {
    ...faces([anodized, wall]),
    handguard: [smoked, smoked],
    buttPad: [wall, wall],
    metal: new THREE.MeshStandardMaterial({ envMap: env, color: 0x1a1d24, metalness: 0.9, roughness: 0.3 }),
    barrel: wall,
    dark: new THREE.MeshStandardMaterial({ color: 0x020304, roughness: 0.6 }),
    sight: new THREE.MeshBasicMaterial({ color: 0xff2e9a }),
    brass: wall,
    flash: 'plasma',
    light: 0x3df5ff,
    smoke: 0x6a7a8a,
    glow: [],
    makeShell: () => new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.006), new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0x3df5ff : 0xff2e9a })),
    decorate: (ctx) => decorateNullbyte({ ...ctx, geo, wall }),
  };
}

function consoleCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx: canvas.getContext('2d'), texture };
}

function decorateNullbyte({ body, add, scene, parts, geo, wall }) {
  const u = geo.uniforms;
  // Carte électronique visible sous le verre fumé du garde-main (impulsions sur les pistes).
  const pcb = patchShader(
    new THREE.MeshStandardMaterial({ map: pcbTexture(), emissive: 0xffffff, emissiveMap: pcbTexture(), emissiveIntensity: 0.8, side: THREE.DoubleSide }),
    u,
    { fragment: 'totalEmissiveRadiance *= 0.4 + 1.6 * pow(0.5 + 0.5 * sin(vEmissiveMapUv.x * 40.0 - uTime * 6.0), 6.0) + uFlare;' },
  );
  const board = add(new THREE.PlaneGeometry(200, 40), pcb, 608, -6, 0);
  board.rotation.y = 0;
  [-12, 12].forEach((z) => {
    const b2 = add(new THREE.PlaneGeometry(200, 40), pcb, 608, -6, z);
    b2.rotation.y = z < 0 ? Math.PI : 0;
  });
  // Condensateurs et puces en relief sur la carte.
  const cap = new THREE.MeshStandardMaterial({ color: 0x1a4a8a, metalness: 0.4, roughness: 0.3 });
  for (let k = 0; k < 8; k += 1) add(new THREE.CylinderGeometry(3, 3, 9, 12), cap, 530 + k * 22, -22, (k % 2 ? 1 : -1) * 6);

  // Lamelles de la carcasse qui se désynchronisent.
  const lamellas = [0, 1, 2, 3].map((k) => add(new RoundedBoxGeometry(60, 5, 32, 1, 1), wall, 260 + k * 58, 16 - k * 7, 0));
  const neon = new THREE.MeshBasicMaterial({ color: 0x3df5ff });
  const neonPink = new THREE.MeshBasicMaterial({ color: 0xff2e9a });
  [-1, 1].forEach((side) => {
    add(new RoundedBoxGeometry(240, 1.2, 0.8, 1, 0.3), side < 0 ? neon : neonPink, 366, -20, side * 15.5);
    add(new RoundedBoxGeometry(190, 1.2, 0.8, 1, 0.3), side < 0 ? neonPink : neon, 608, 20, side * 22.6);
  });
  // Câbles gainés entre crosse et carcasse.
  [-1, 1].forEach((side) => {
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(120, -40, side * 16), new THREE.Vector3(180, -50, side * 20), new THREE.Vector3(240, -30, side * 17)]);
    body.add(new THREE.Mesh(new THREE.TubeGeometry(path, 20, 2.4, 8, false), new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.5 })));
  });

  // Émetteur carré à 4 ailettes à la bouche.
  const fins = [0, 1, 2, 3].map((k) => {
    const pivot = new THREE.Group();
    pivot.position.set(900, 4, 0);
    pivot.rotation.x = (k * Math.PI) / 2;
    body.add(pivot);
    const fin = new THREE.Mesh(new RoundedBoxGeometry(22, 2, 14, 1, 0.5), wall);
    fin.position.set(8, 11, 0);
    pivot.add(fin);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(20, 0.8, 14.5), k % 2 ? neon : neonPink);
    edge.position.set(8, 12.2, 0);
    pivot.add(edge);
    return fin;
  });

  // Trois fenêtres holo sous l'axe, flanc gauche : console, munitions, latence.
  const panel = (w, h, x, y) => {
    const c = consoleCanvas(256, Math.round((256 * h) / w));
    const mesh = add(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: c.texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), x, y, -30);
    mesh.rotation.y = Math.PI;
    return { ...c, mesh };
  };
  const term = panel(80, 44, 340, -52);
  const ammoPanel = panel(44, 24, 420, -46);
  const ping = panel(60, 28, 560, -58);
  const lines = [];
  let ammo = 30;
  const latency = Array.from({ length: 40 }, () => 20 + Math.random() * 10);
  const drawTerm = () => {
    const { ctx, canvas, texture } = term;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0,40,30,0.35)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#7cff4f';
    ctx.font = '13px monospace';
    lines.slice(-9).forEach((l, i) => ctx.fillText(l, 6, 16 + i * 15));
    texture.needsUpdate = true;
  };
  const drawAmmo = () => {
    const { ctx, canvas, texture } = ammoPanel;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#3df5ff';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
    ctx.fillStyle = ammo <= 6 ? '#ff2e9a' : '#3df5ff';
    ctx.font = 'bold 90px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(ammo).padStart(2, '0'), 30, canvas.height / 2 + 6);
    texture.needsUpdate = true;
  };
  const drawPing = () => {
    const { ctx, canvas, texture } = ping;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#ff2e9a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    latency.forEach((v, i) => ctx.lineTo((i / (latency.length - 1)) * canvas.width, canvas.height - v * 1.6));
    ctx.stroke();
    ctx.fillStyle = '#ff2e9a';
    ctx.font = '20px monospace';
    ctx.fillText(`${Math.round(latency[latency.length - 1])} ms`, 8, 22);
    texture.needsUpdate = true;
  };
  const HEX = '0123456789ABCDEF';
  const pushLine = () => {
    let s = '> ';
    for (let i = 0; i < 18; i += 1) s += HEX[Math.floor(Math.random() * 16)];
    lines.push(Math.random() < 0.15 ? '!! ACCESS VIOLATION' : s);
  };
  for (let i = 0; i < 9; i += 1) pushLine();
  drawTerm();
  drawAmmo();
  drawPing();

  const squareTex = tiledTexture('null-square', 64, (ctx, size) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(size * 0.2, size * 0.2, size * 0.6, size * 0.6);
  }, { color: true });
  const pixels = particleSystem(scene, squareTex, { max: 120 });
  const flashSquares = particleSystem(scene, squareTex, { max: 12 });
  const cubes = meshBurst(scene, { max: 30 });
  const cubeGeo = new THREE.BoxGeometry(0.004, 0.004, 0.004);
  const emitter = anchorAt(body, 0, 0, 0);
  const mouth = anchorAt(body, 926, 4, 0);
  const tmp = new THREE.Vector3();
  const open = { x: 0, v: 0 };
  let baseX = null;
  let time = 0;
  let termClock = 0;
  let pingClock = 0;
  let pixelClock = 0;
  let jumpUntil = 0;
  let desync = { index: -1, until: 0 };
  return {
    muzzleX: 930,
    update: (dt, t, flare) => {
      time += dt;
      if (baseX === null) baseX = body.position.x;
      springStep(open, 0, 50, dt);
      fins.forEach((f) => (f.rotation.z = Math.max(0, open.x) * 0.5));
      // Recul « saccadé » : quelques frames figées sur une position décalée.
      body.position.x = baseX + (time < jumpUntil ? -6 : 0);
      if (time > desync.until && Math.random() < dt * 0.25) desync = { index: Math.floor(Math.random() * lamellas.length), until: time + 0.12 };
      lamellas.forEach((l, i) => (l.position.z = i === desync.index && time < desync.until ? 2 : 0));
      termClock += dt;
      if (termClock > 0.12) {
        termClock = 0;
        pushLine();
        drawTerm();
      }
      pingClock += dt;
      if (pingClock > 0.25) {
        pingClock = 0;
        latency.shift();
        latency.push(18 + Math.random() * 12 + (Math.random() < 0.05 ? 40 : 0));
        drawPing();
      }
      [term, ammoPanel, ping].forEach((p) => (p.mesh.material.opacity = Math.random() < 0.03 ? 0.2 : 0.9));
      pixelClock += dt;
      while (pixelClock > 0.07) {
        pixelClock -= 0.07;
        emitter.position.set(Math.random() * 800, -120 + Math.random() * 130, (Math.random() - 0.5) * 60);
        emitter.getWorldPosition(tmp);
        pixels.spawn(tmp, new THREE.Vector3(0, 0.02, 0), { life: 700, size: 0.0018, drag: 0, tint: [0x3df5ff, 0xff2e9a, 0x7cff4f][Math.floor(Math.random() * 3)] });
      }
      pixels.update(dt);
      flashSquares.update(dt);
      cubes.update(dt);
    },
    onFire: () => {
      open.v += 10;
      jumpUntil = time + 0.034;
      ammo = ammo <= 1 ? 30 : ammo - 1;
      drawAmmo();
      mouth.getWorldPosition(tmp);
      // Flash carré dédoublé (séparation RVB).
      flashSquares.spawn(tmp, new THREE.Vector3(), { life: 60, size: 0.05, drag: 0, tint: 0x3df5ff });
      flashSquares.spawn(tmp.clone().add(new THREE.Vector3(0.004, 0.002, 0)), new THREE.Vector3(), { life: 60, size: 0.05, drag: 0, tint: 0xff2e9a });
      for (let i = 0; i < 12; i += 1) {
        cubes.spawn(new THREE.Mesh(cubeGeo, i % 2 ? new THREE.MeshBasicMaterial({ color: 0x3df5ff }) : new THREE.MeshBasicMaterial({ color: 0xff2e9a })), tmp, new THREE.Vector3(1 + Math.random() * 1.4, (Math.random() - 0.5) * 1, (Math.random() - 0.5) * 1.4), { life: 450, gravity: 0, drag: 3, spin: 0 });
      }
    },
  };
}

export const VANDAL_DOSSIER_SKINS = {
  symbiote: { labelKey: 'aimTrainer.skinSymbiote', build: symbioteFinish },
  heliopause: { labelKey: 'aimTrainer.skinHeliopause', build: heliopauseFinish },
  reliquary: { labelKey: 'aimTrainer.skinReliquary', build: reliquaryFinish },
  nullbyte: { labelKey: 'aimTrainer.skinNullbyte', build: nullbyteFinish },
};
