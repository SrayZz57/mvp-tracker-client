import * as THREE from 'three';
import {
  seeded,
  tiledTexture,
  speckle,
  animateEmissive,
  particleSystem,
  softDotTexture,
  extrude,
  springStep,
  anchorAt,
  meshBurst,
} from './weaponKit.js';
import { LIVERY, livery, strokeLine } from './vandalSkins.js';

// LITHOSPHÈRE — géode magnétique. La Vandal garde sa silhouette (carcasse, couvercle,
// crosse évidée, chargeur courbé, garde-main ajouré, frein de bouche), taillée dans un
// basalte poreux fendu de lave. Quelques pièces se détachent et lévitent, tenues par des
// lignes de force ambrées qui vibrent : la crosse, la poignée, le garde-main redécoupé en
// trois plaques et le chargeur en cinq tranches qui suivent sa courbe. Une géode de
// cristaux prismatiques occupe l'évidement de la crosse, une âme de quartz sort du frein.
//
// Tir : les pièces flottantes s'écartent (sur les côtés et vers le bas, jamais au-dessus
// de la ligne de mire) puis se réaimantent en cascade du canon vers la crosse ; éclats de
// quartz à la bouche. Mire : cristaux en V sur la hausse, guidon lumineux ambre.

// Blocs (profil en mm dans le repère de la Vandal) : épaisseur, direction
// d'écartement au tir (côté z ; toujours avec une composante vers le bas).
const BLOCKS = [
  { id: 'butt', pts: [[4, 28], [80, 24], [76, -40], [70, -100], [4, -108]], depth: 32, side: 1 },
  { id: 'stockTop', pts: [[86, 26], [172, 22], [170, 4], [88, 8]], depth: 28, side: -1 },
  { id: 'stockStrut', pts: [[90, -62], [168, -28], [176, -42], [98, -84]], depth: 28, side: 1 },
  { id: 'stockFront', pts: [[178, 22], [226, 20], [226, -20], [180, -34]], depth: 30, side: -1 },
  { id: 'receiverRear', pts: [[232, 34], [330, 34], [328, -24], [234, -24]], depth: 32, side: 1 },
  { id: 'receiverFront', pts: [[336, 36], [430, 36], [428, -24], [338, -24]], depth: 32, side: -1 },
  { id: 'magwell', pts: [[436, 34], [502, 32], [500, -42], [438, -40]], depth: 34, side: 1 },
  { id: 'guardRear', pts: [[508, 36], [606, 36], [604, -28], [510, -28]], depth: 44, side: -1 },
  { id: 'guardFront', pts: [[612, 34], [712, 30], [714, -8], [692, -28], [614, -28]], depth: 44, side: 1 },
  { id: 'gasBlock', pts: [[718, 30], [756, 28], [756, -12], [718, -14]], depth: 30, side: -1 },
  { id: 'grip', pts: [[322, -28], [372, -28], [352, -100], [340, -136], [296, -140], [290, -120], [310, -60]], depth: 30, side: 1 },
];

// Contour rocheux : chaque arête est redécoupée et ses points déplacés.
function rockyShape(pts, rand) {
  const out = [];
  pts.forEach(([x1, y1], i) => {
    const [x2, y2] = pts[(i + 1) % pts.length];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const nx = -(y2 - y1) / len;
    const ny = (x2 - x1) / len;
    const steps = Math.max(2, Math.round(len / 11));
    for (let k = 0; k < steps; k += 1) {
      const t = k / steps;
      const j = k === 0 ? (rand() - 0.5) * 3 : (rand() - 0.5) * 9;
      out.push(new THREE.Vector2(x1 + (x2 - x1) * t + nx * j, y1 + (y2 - y1) * t + ny * j));
    }
  });
  return new THREE.Shape(out);
}

function crystalGeometry(radius, length) {
  const prism = new THREE.CylinderGeometry(radius, radius * 0.92, length, 6);
  prism.translate(0, length / 2, 0);
  const tip = new THREE.ConeGeometry(radius, length * 0.55, 6);
  tip.translate(0, length + length * 0.275, 0);
  return [prism, tip];
}

function crystal(material, radius, length) {
  const g = new THREE.Group();
  crystalGeometry(radius, length).forEach((geo) => g.add(new THREE.Mesh(geo, material)));
  return g;
}

function pointAlong(object, dir) {
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
}

function lithosphereFinish(env, geo) {
  const rand = seeded(5101);
  const fissures = [];
  for (let i = 0; i < 40; i += 1) {
    let x = LIVERY.minX + rand() * (LIVERY.maxX - LIVERY.minX);
    let y = LIVERY.minY + rand() * (LIVERY.maxY - LIVERY.minY);
    let a = rand() * Math.PI * 2;
    const pts = [[x, y]];
    for (let k = 0; k < 10; k += 1) {
      a += (rand() - 0.5) * 1.1;
      x += Math.cos(a) * 5;
      y += Math.sin(a) * 5;
      pts.push([x, y]);
    }
    fissures.push({ pts, width: 0.8 + rand() * 1.4 });
  }
  const color = livery('litho-color', (ctx) => {
    const r2 = seeded(5102);
    for (let i = 0; i < 60; i += 1) {
      const x = LIVERY.minX + r2() * 922;
      const y = LIVERY.minY + r2() * 296;
      const rad = 15 + r2() * 50;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const tone = ['52,46,42', '24,21,19', '70,60,52'][Math.floor(r2() * 3)];
      g.addColorStop(0, `rgba(${tone},0.7)`);
      g.addColorStop(1, `rgba(${tone},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // Pores du basalte.
    for (let i = 0; i < 2200; i += 1) {
      ctx.fillStyle = r2() < 0.7 ? 'rgba(6,5,4,0.8)' : 'rgba(120,108,98,0.5)';
      ctx.beginPath();
      ctx.arc(LIVERY.minX + r2() * 922, LIVERY.minY + r2() * 296, 0.3 + r2() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    speckle(ctx, LIVERY, 20000, ['rgba(0,0,0,0.35)', 'rgba(140,130,120,0.25)'], 0.5, seeded(5103));
    ctx.lineCap = 'round';
    fissures.forEach(({ pts, width }) => {
      ctx.strokeStyle = '#3a1a0a';
      ctx.lineWidth = width * 2;
      strokeLine(ctx, pts);
      ctx.strokeStyle = '#8a3a10';
      ctx.lineWidth = width * 0.7;
      strokeLine(ctx, pts);
    });
  }, { background: '#23201e', color: true });
  const glow = livery('litho-glow', (ctx) => {
    ctx.lineCap = 'round';
    fissures.forEach(({ pts, width }) => {
      ctx.shadowColor = 'rgba(255,140,40,0.9)';
      ctx.shadowBlur = 5;
      ctx.strokeStyle = 'rgba(255,130,40,0.9)';
      ctx.lineWidth = width * 0.8;
      strokeLine(ctx, pts);
    });
  }, { background: '#000000', color: true });
  const bump = livery('litho-bump', (ctx) => {
    const r2 = seeded(5102);
    for (let i = 0; i < 60; i += 1) r2();
    for (let i = 0; i < 2200; i += 1) {
      ctx.fillStyle = r2() < 0.7 ? '#000000' : '#ffffff';
      ctx.beginPath();
      ctx.arc(LIVERY.minX + r2() * 922, LIVERY.minY + r2() * 296, 0.3 + r2() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineCap = 'round';
    fissures.forEach(({ pts, width }) => {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = width * 1.6;
      strokeLine(ctx, pts);
    });
  }, { background: '#909090' });
  const basalt = animateEmissive(
    new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.5, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.3, metalness: 0.05, roughness: 0.92, bumpMap: bump, bumpScale: 2.2, flatShading: true }),
    geo.uniforms,
    'totalEmissiveRadiance *= 0.35 + 0.35 * sin(uTime * 1.2 + vEmissiveMapUv.x * 11.0) + uFlare * 2.2;',
  );
  const wallRough = tiledTexture('litho-wall', 256, (ctx, size) => {
    ctx.fillStyle = '#d0d0d0';
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, { minX: 0, maxX: size, minY: 0, maxY: size }, 9000, ['#808080', '#f0f0f0'], 1.5, seeded(5104));
  }, { repeat: 0.04 });
  const basaltWall = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.4, color: 0x2a2623, roughness: 1, roughnessMap: wallRough, flatShading: true });
  const rail = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.1, color: 0x2a2d33, metalness: 0.95, roughness: 0.28 });
  const pair = [basalt, basaltWall];
  return {
    receiver: pair,
    dustCover: pair,
    magwell: pair,
    gasBlock: pair,
    muzzle: pair,
    stock: pair,
    buttPad: [basaltWall, basaltWall],
    grip: pair,
    handguard: pair,
    upperGuard: pair,
    magazine: pair,
    metal: rail,
    barrel: rail,
    dark: new THREE.MeshStandardMaterial({ color: 0x080706, roughness: 0.9 }),
    sight: new THREE.MeshBasicMaterial({ color: 0xffc070 }),
    brass: rail,
    flash: 'gold',
    light: 0xffb347,
    smoke: 0xd8c8b0,
    glow: [],
    makeShell: () => {
      const s = crystal(new THREE.MeshStandardMaterial({ color: 0xcdb8ff, roughness: 0.1, emissive: 0x6a4aff, emissiveIntensity: 0.5, flatShading: true }), 0.0025, 0.01);
      return s;
    },
    decorate: (ctx) => decorateLithosphere({ ...ctx, geo, basalt, basaltWall, rail, env }),
  };
}

function decorateLithosphere({ body, add, scene, parts, geo, basalt, basaltWall, rail, env }) {
  // La silhouette de la Vandal est conservée (carcasse, couvercle, crosse évidée,
  // chargeur courbé, garde-main ajouré, frein de bouche) : seules quelques pièces
  // se détachent et lévitent, tenues par le champ.
  const crystalMat = new THREE.MeshPhysicalMaterial({
    envMap: env,
    envMapIntensity: 1.8,
    color: 0xcdb8ff,
    metalness: 0,
    roughness: 0.02,
    transmission: 0.93,
    thickness: 10,
    ior: 1.6,
    dispersion: 5,
    clearcoat: 1,
    emissive: 0x5a3aa0,
    emissiveIntensity: 0.25,
    flatShading: true,
  });
  const rand = seeded(5201);

  // Pièce flottante : un groupe (à l'origine du repère de l'arme) qu'on décale.
  const floaters = [];
  const floater = (id, meshes, side, anchorX, anchorY) => {
    const group = new THREE.Group();
    body.add(group);
    meshes.forEach((m) => group.add(m));
    const f = { id, group, side, anchor: new THREE.Vector3(anchorX, anchorY, 0), dir: new THREE.Vector3(0, -0.55, side).normalize(), phase: floaters.length * 0.9, push: { x: 0, v: 0 }, kickAt: -1, gap: new THREE.Vector3() };
    floaters.push(f);
    return f;
  };

  // Crosse détachée de la carcasse (avec plaque de couche et appui-joue).
  const stock = floater('stock', [parts.stock, parts.cheekRiser, parts.buttPad], 1, 120, -20);
  stock.gap.set(-16, -3, 0);

  // Poignée.
  const grip = floater('grip', [parts.grip], -1, 330, -80);
  grip.gap.set(-3, -12, 0);

  // Garde-main redécoupé en trois plaques (avec une lumière chacune).
  parts.handguard.visible = false;
  const slabs = [
    { pts: [[504, 18], [568, 18], [568, -28], [522, -28], [504, -24]], vent: 532 },
    { pts: [[574, 18], [640, 18], [640, -28], [574, -28]], vent: 596 },
    { pts: [[646, 18], [712, 18], [714, -8], [692, -27], [646, -28]], vent: 662 },
  ].map((s, i) => {
    const shape = new THREE.Shape(s.pts.map(([x, y]) => new THREE.Vector2(x + (rand() - 0.5) * 2, y + (rand() - 0.5) * 2)));
    const hole = new THREE.Path();
    [[s.vent, 4], [s.vent + 22, 4], [s.vent + 13, -15], [s.vent - 9, -15]].forEach(([x, y], k) => (k === 0 ? hole.moveTo(x, y) : hole.lineTo(x, y)));
    hole.closePath();
    shape.holes.push(hole);
    const mesh = new THREE.Mesh(extrude(shape, 44, 3, { bevelSegments: 1 }), [basalt, basaltWall]);
    const f = floater(`guard${i}`, [mesh], i % 2 ? 1 : -1, s.vent + 6, -6);
    // Chaque plaque décalée vers l'avant et vers le bas : on voit le canon entre elles.
    f.gap.set(i * 7 + 4, -5 - i * 2, 0);
    return f;
  });

  // Chargeur courbé redécoupé en tranches qui gardent sa courbe.
  parts.magazine.visible = false;
  const curve = geo.magazineCurve;
  const magSlice = (t0, t1) => {
    const left = [];
    const right = [];
    for (let k = 0; k <= 8; k += 1) {
      const t = t0 + ((t1 - t0) * k) / 8;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const w = (64 - 6 * t) / 2;
      left.push(new THREE.Vector2(p.x - tan.y * w, p.y + tan.x * w));
      right.push(new THREE.Vector2(p.x + tan.y * w, p.y - tan.x * w));
    }
    return new THREE.Shape([...left, ...right.reverse()]);
  };
  const cuts = [[0.1, 0.28], [0.31, 0.47], [0.5, 0.65], [0.68, 0.83], [0.86, 1]];
  const magSlices = cuts.map(([t0, t1], i) => {
    const mesh = new THREE.Mesh(extrude(magSlice(t0, t1), 24, 2.2, { bevelSegments: 1 }), [basalt, basaltWall]);
    const members = [mesh];
    if (i === cuts.length - 1) members.push(parts.basePlate);
    const mid = curve.getPoint((t0 + t1) / 2);
    const f = floater(`mag${i}`, members, i % 2 ? 1 : -1, mid.x, mid.y);
    // Tranches légèrement écartées le long de la courbe, de plus en plus vers le bas.
    const tan = curve.getTangent((t0 + t1) / 2);
    f.gap.set(tan.x * (i + 1) * 8, tan.y * (i + 1) * 8, 0);
    return f;
  });
  // Haut du chargeur, fixe dans le puits.
  add(extrude(magSlice(0, 0.08), 24, 2.2, { bevelSegments: 1 }), [basalt, basaltWall]);

  // Géode de cristaux dans l'évidement de la crosse (suit la crosse).
  const geode = new THREE.Group();
  geode.position.set(108, -24, 0);
  stock.group.add(geode);
  const micro = crystalMat.clone();
  micro.transmission = 0.6;
  micro.emissiveIntensity = 0.7;
  for (let k = 0; k < 22; k += 1) {
    const dir = new THREE.Vector3((rand() - 0.5) * 2, (rand() - 0.5) * 2, (rand() - 0.5) * 0.8).normalize();
    const c = crystal(micro, 3 + rand() * 3, 12 + rand() * 16);
    c.position.copy(dir.clone().multiplyScalar(4));
    pointAlong(c, dir);
    geode.add(c);
  }
  const geodeLight = new THREE.PointLight(0xa080ff, 1.2, 0.3, 2);
  const geodeHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture('litho-geode', 'rgba(220,200,255,1)', 'rgba(120,80,255,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  geodeHalo.scale.set(80, 80, 1);
  geode.add(geodeHalo);
  geode.add(geodeLight);

  // Quelques cristaux vers les côtés et le bas (jamais dans la ligne de mire).
  [
    [stock, 12, -96, 12, new THREE.Vector3(-0.3, -1, 0.5), 4.5, 16],
    [stock, 8, 24, -12, new THREE.Vector3(-0.8, 0.5, -0.5), 4, 14],
    [slabs[1], 600, -28, 22, new THREE.Vector3(0.2, -0.8, 1), 4.5, 18],
    [slabs[2], 680, -26, -22, new THREE.Vector3(0.3, -0.9, -1), 4, 16],
    [magSlices[4], 536, -200, 8, new THREE.Vector3(0.6, -1, 0.3), 4.5, 18],
    [magSlices[4], 526, -206, -8, new THREE.Vector3(0.2, -1, -0.5), 3.5, 14],
    [grip, 305, -138, 10, new THREE.Vector3(-0.4, -1, 0.4), 3.5, 12],
  ].forEach(([f, x, y, z, dir, r, len]) => {
    const c = crystal(crystalMat, r, len);
    c.position.set(x, y, z);
    pointAlong(c, dir);
    f.group.add(c);
  });

  // Âme de quartz qui sort du frein de bouche d'origine.
  const quartz = new THREE.Group();
  quartz.position.set(902, 4, 0);
  body.add(quartz);
  const qTip = new THREE.Mesh(new THREE.ConeGeometry(7, 30, 6), crystalMat);
  qTip.rotation.z = -Math.PI / 2;
  qTip.position.x = 12;
  quartz.add(qTip);
  const quartzCore = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffc070 }));
  quartz.add(quartzCore);

  // Organes de visée : cristaux en V sur la hausse, guidon lumineux.
  parts.rearSight.visible = false;
  [-1, 1].forEach((side) => {
    const c = crystal(crystalMat, 2.2, 10);
    c.position.set(476, 34, side * 4);
    pointAlong(c, new THREE.Vector3(0, 1, side * 0.55));
    body.add(c);
  });
  add(new THREE.ConeGeometry(2, 12, 6), new THREE.MeshBasicMaterial({ color: 0xffc070 }), 730, 58, 0);

  // Lignes de force entre les pièces flottantes et la carcasse.
  const fieldMat = new THREE.LineBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const fixed = (x, y) => ({ group: { position: new THREE.Vector3(0, 0, 0) }, anchor: new THREE.Vector3(x, y, 0) });
  const endpoint = (f) => f.anchor.clone().add(f.group.position);
  const pairs = [
    [stock, fixed(232, -2)],
    [stock, fixed(232, 14)],
    [grip, fixed(340, -24)],
    [slabs[0], fixed(496, -6)],
    [slabs[0], slabs[1]],
    [slabs[1], slabs[2]],
    [magSlices[0], fixed(466, -40)],
    ...magSlices.slice(1).map((m, i) => [magSlices[i], m]),
  ].map(([a, b]) => {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 12 }, () => new THREE.Vector3())), fieldMat);
    body.add(line);
    return { line, a, b, seed: rand() * 10 };
  });
  const pulseTex = softDotTexture('litho-pulse', 'rgba(255,230,180,1)', 'rgba(255,160,50,0)');
  const pulses = pairs.map((p, i) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: pulseTex, color: 0xffb347, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.scale.set(8, 8, 1);
    body.add(sprite);
    return { sprite, line: p.line, offset: (i * 0.37) % 1 };
  });

  const dust = particleSystem(scene, softDotTexture('litho-dust', 'rgba(255,230,190,1)', 'rgba(255,170,70,0)'), { max: 70 });
  const shards = meshBurst(scene, { max: 40 });
  const emitter = anchorAt(body, 0, 0, 0);
  const mouth = anchorAt(body, 920, 4, 0);
  const tmp = new THREE.Vector3();
  const shardGeos = crystalGeometry(0.0022, 0.01);
  let time = 0;
  let dustClock = 0;
  let strain = 0;

  const writeLine = (line, from, to, seed, amp) => {
    const p = line.geometry.attributes.position;
    for (let k = 0; k < 12; k += 1) {
      const t = k / 11;
      const bow = Math.sin(t * Math.PI);
      p.setXYZ(
        k,
        from.x + (to.x - from.x) * t,
        from.y + (to.y - from.y) * t + Math.sin(time * 9 + seed + t * 8) * amp * bow,
        from.z + (to.z - from.z) * t + Math.cos(time * 7 + seed + t * 6) * amp * bow,
      );
    }
    p.needsUpdate = true;
  };

  return {
    muzzleX: 930,
    update: (dt, t, flare) => {
      time += dt;
      strain = Math.max(0, strain - dt * 2.2);
      floaters.forEach((f) => {
        if (f.kickAt >= 0 && time >= f.kickAt) {
          f.push.v += 24 + Math.random() * 8;
          f.kickAt = -1;
        }
        // Raideur plus faible vers la crosse : réalignement en cascade du canon vers l'arrière.
        springStep(f.push, 0, 60 + (f.anchor.x / 760) * 110, dt);
        const bob = Math.sin(time * 1.3 + f.phase) * 1.2;
        f.group.position.copy(f.gap).add(new THREE.Vector3(0, bob * 1.6, 0)).addScaledVector(f.dir, Math.max(0, f.push.x) * 0.55);
        f.group.rotation.x = Math.sin(time * 0.9 + f.phase) * 0.006 + f.push.x * 0.002 * f.side;
      });
      geode.rotation.z += dt * 0.3;
      quartzCore.material.color.setHSL(0.09, 1, 0.6 + 0.1 * Math.sin(time * 3) + flare * 0.3);
      const amp = 1.2 + strain * 5;
      fieldMat.color.setRGB(1, 0.7 + strain * 0.3, 0.28 + strain * 0.7);
      fieldMat.opacity = 0.55 + 0.2 * Math.sin(time * 4) + strain * 0.4;
      pairs.forEach(({ line, a, b, seed }) => writeLine(line, endpoint(a), endpoint(b), seed, amp));
      pulses.forEach((p) => {
        const u = (time * 0.8 + p.offset) % 1;
        const k = Math.min(10, Math.floor(u * 11));
        const arr = p.line.geometry.attributes.position;
        p.sprite.position.set(arr.getX(k), arr.getY(k), arr.getZ(k));
        p.sprite.material.opacity = Math.sin(u * Math.PI) * (0.8 + strain * 0.4);
        p.sprite.scale.setScalar(8 + strain * 8);
      });
      dustClock += dt;
      while (dustClock > 0.08) {
        dustClock -= 0.08;
        // Jamais au-dessus du couvercle : le cône de visée reste propre.
        emitter.position.set(Math.random() * 760, -130 + Math.random() * 130, (Math.random() - 0.5) * 80);
        emitter.getWorldPosition(tmp);
        dust.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.006, (Math.random() - 0.5) * 0.006, (Math.random() - 0.5) * 0.006), { life: 1800, size: 0.0012 + Math.random() * 0.0012, drag: 0 });
      }
      dust.update(dt);
      shards.update(dt);
    },
    onFire: () => {
      strain = 1;
      floaters.forEach((f) => {
        f.kickAt = time + (1 - f.anchor.x / 760) * 0.03;
      });
      mouth.getWorldPosition(tmp);
      for (let i = 0; i < 10; i += 1) {
        const s = new THREE.Group();
        shardGeos.forEach((g) => s.add(new THREE.Mesh(g, crystalMat)));
        shards.spawn(s, tmp, new THREE.Vector3((Math.random() - 0.1) * 1.8, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.8), { life: 700, gravity: -4, drag: 1.5, spin: 16 });
      }
    },
  };
}

export const VANDAL_LITHOSPHERE_SKIN = {
  lithosphere: { labelKey: 'aimTrainer.skinLithosphere', build: lithosphereFinish },
};
