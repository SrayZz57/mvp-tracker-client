import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { seeded, tiledTexture, speckle, animateEmissive, patchShader, particleSystem, softDotTexture, springStep, anchorAt, meshBurst, extrude } from './weaponKit.js';
import { LIVERY, livery, tracePolygon, magazineOutline, alongMagazine } from './vandalSkins.js';
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
  easeOutBounce,
  easeOutElastic,
  clamp01,
} from './transcendentKit.js';

// Skins Transcendants de la Vandal (suite de Singularité) : Origami, Essaim,
// Voxel, Maelström, Sumi. Chacun a une apparition propre (`replayIntro`), des
// animations au repos et un gros effet au tir. Repère : x vers la bouche
// (crosse à 0, bouche ≈ 905), axe du canon y = 0, flanc gauche (vu par le
// joueur) vers -z. Rien au-dessus du couvercle (y > 35) : ligne de mire.

const W = LIVERY.maxX - LIVERY.minX;
const H = LIVERY.maxY - LIVERY.minY;
const ZERO = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

function faces(face, wall) {
  const pair = [face, wall];
  return { receiver: pair, dustCover: pair, magwell: pair, gasBlock: pair, muzzle: pair, stock: pair, grip: pair, handguard: pair, upperGuard: pair, magazine: pair, buttPad: [wall, wall] };
}

function hideBore(body) {
  body.children.forEach((m) => {
    if (m.geometry?.type === 'CircleGeometry' && m.position.x > 900) m.visible = false;
  });
}

function outlinesOf(geo) {
  return {
    stock: geo.stockOutline.map(([x, y]) => [x, y]),
    handguard: geo.handguardOutline.map(([x, y]) => [x, y]),
    receiver: [[220, 22], [504, 22], [504, -24], [220, -24]],
    magazine: magazineOutline(geo.magazineCurve),
  };
}

function triMesh(points, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

// Oriente un objet (axe long +x) dans la direction `dir`.
const tmpQ = new THREE.Quaternion();
function faceAlong(object, dir) {
  if (dir.lengthSq() < 1e-8) return;
  tmpQ.setFromUnitVectors(X, dir.clone().normalize());
  object.quaternion.copy(tmpQ);
}

// =============================================================================
// ORIGAMI — l'arme est pliée dans du papier : washi indigo à motif d'étoiles,
// papier vermillon, plis marqués, sceau rouge. Grues qui planent autour, plissé
// en accordéon qui respire, banderoles de papier, lotus plié à la bouche qui
// s'ouvre au tir. Au tir, des grues s'envolent. Apparition : chaque pièce se
// déplie comme une feuille.
// =============================================================================

function origamiFinish(env, geo) {
  const o = outlinesOf(geo);
  const creases = (ctx, rand, dark, light) => {
    const pts = [];
    for (let y = LIVERY.minY; y <= LIVERY.maxY + 40; y += 38) {
      for (let x = LIVERY.minX; x <= LIVERY.maxX + 40; x += 44) pts.push([x + (rand() - 0.5) * 22, y + (rand() - 0.5) * 18]);
    }
    const cols = Math.ceil((W + 40) / 44) + 1;
    ctx.lineWidth = 0.5;
    pts.forEach((p, i) => {
      [1, cols, cols + 1].forEach((d) => {
        const q = pts[i + d];
        if (!q || (d === 1 && (i + 1) % cols === 0)) return;
        ctx.strokeStyle = dark;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(q[0], q[1]);
        ctx.stroke();
        if (light) {
          ctx.strokeStyle = light;
          ctx.beginPath();
          ctx.moveTo(p[0], p[1] + 0.6);
          ctx.lineTo(q[0], q[1] + 0.6);
          ctx.stroke();
        }
      });
    });
  };
  const color = livery('ori-color', (ctx) => {
    const rand = seeded(1201);
    // Papier vermillon sur la crosse, washi indigo sur garde-main et chargeur.
    ctx.fillStyle = '#c8372d';
    tracePolygon(ctx, o.stock);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    [o.handguard, o.magazine].forEach((poly) => poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))));
    ctx.fillStyle = '#2d3f73';
    ctx.fill();
    ctx.clip();
    // Motif d'étoiles en treillis (lignes à 0°, 60°, 120°).
    ctx.strokeStyle = 'rgba(235,228,210,0.55)';
    ctx.lineWidth = 0.45;
    for (let k = -80; k < 80; k += 1) {
      [0, Math.PI / 3, (2 * Math.PI) / 3].forEach((a) => {
        const cx = 500 + Math.cos(a + Math.PI / 2) * k * 7;
        const cy = -80 + Math.sin(a + Math.PI / 2) * k * 7;
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(a) * 600, cy - Math.sin(a) * 600);
        ctx.lineTo(cx + Math.cos(a) * 600, cy + Math.sin(a) * 600);
        ctx.stroke();
      });
    }
    ctx.restore();
    // Fibres du papier.
    for (let i = 0; i < 9000; i += 1) {
      ctx.strokeStyle = rand() < 0.5 ? 'rgba(120,105,80,0.1)' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 0.2;
      const x = LIVERY.minX + rand() * W;
      const y = LIVERY.minY + rand() * H;
      const a = rand() * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3);
      ctx.stroke();
    }
    // Flocons d'or sur le vermillon.
    ctx.save();
    tracePolygon(ctx, o.stock);
    ctx.clip();
    speckle(ctx, LIVERY, 1400, ['rgba(230,190,90,0.9)'], 0.8, seeded(1202));
    ctx.restore();
    creases(ctx, seeded(1203), 'rgba(60,45,30,0.22)', 'rgba(255,255,255,0.35)');
    // Sceau rouge.
    ctx.fillStyle = '#b8261e';
    ctx.fillRect(250, -20, 16, 16);
    ctx.strokeStyle = '#f1ece1';
    ctx.lineWidth = 1.1;
    [[253, -8, 263, -8], [258, -17, 258, -7], [253, -14, 263, -14], [255, -17, 255, -11]].forEach(([a, b, c, d]) => {
      ctx.beginPath();
      ctx.moveTo(a, b);
      ctx.lineTo(c, d);
      ctx.stroke();
    });
  }, { background: '#f1ece1', color: true });
  const bump = livery('ori-bump', (ctx) => creases(ctx, seeded(1203), 'rgba(0,0,0,0.6)', null), { background: '#9a9a9a' });
  const paper = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.35, map: color, bumpMap: bump, bumpScale: 1.4, roughness: 0.85, sheen: 0.5, sheenColor: new THREE.Color(0xffffff), flatShading: true });
  const wall = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.3, color: 0xefe8da, roughness: 0.9, flatShading: true });
  const kraft = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.3, color: 0xa8865c, roughness: 0.9, flatShading: true });
  return {
    ...faces(paper, wall),
    metal: wall,
    barrel: kraft,
    dark: new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 1 }),
    sight: new THREE.MeshBasicMaterial({ color: 0xc8372d }),
    brass: wall,
    flash: 'powder',
    light: 0xfff0d0,
    smoke: 0xffffff,
    glow: [],
    makeShell: () => new THREE.Mesh(new THREE.TetrahedronGeometry(0.005), new THREE.MeshStandardMaterial({ color: 0xf1ece1, roughness: 0.9, flatShading: true })),
    decorate: (ctx) => decorateOrigami({ ...ctx, geo, env }),
  };
}

// Grue en papier (mm) : corps en losange, cou, queue, deux ailes qui battent.
function makeCrane(material, wingMaterial = material) {
  const g = new THREE.Group();
  g.add(triMesh([[-9, 0, 0], [9, 0, 0], [0, 5, 2.5], [-9, 0, 0], [0, 5, -2.5], [9, 0, 0], [-9, 0, 0], [0, -3, 0], [9, 0, 0]], material));
  g.add(triMesh([[6, 1, 0], [18, 15, 0], [9, 4, 0]], material));
  g.add(triMesh([[18, 15, 0], [23, 12.5, 0], [19, 13, 0]], material));
  g.add(triMesh([[-6, 1, 0], [-18, 13, 0], [-9, 4, 0]], material));
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, 3, 0);
    g.add(pivot);
    pivot.add(triMesh([[-6, 0, 0], [6, 0, 0], [-1, 0, side * 22]], wingMaterial));
    return { pivot, side };
  });
  const flap = (angle) => wings.forEach((w) => (w.pivot.rotation.x = -w.side * angle));
  return { group: g, flap };
}

function decorateOrigami({ body, add, scene, parts, carrier, geo, env }) {
  const paperMat = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.3, color: 0xf4efe4, roughness: 0.85, side: THREE.DoubleSide, flatShading: true });
  const redMat = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.3, color: 0xc8372d, roughness: 0.85, side: THREE.DoubleSide, flatShading: true });
  const indigoMat = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.3, color: 0x2d3f73, roughness: 0.85, side: THREE.DoubleSide, flatShading: true });

  // Grues qui planent en boucle sous le garde-main et près de la crosse.
  const flock = new THREE.Group();
  body.add(flock);
  const gliders = [
    { c: new THREE.Vector3(600, -80, -70), r: 40, speed: 0.7, mat: paperMat, wing: redMat },
    { c: new THREE.Vector3(200, -70, -64), r: 32, speed: -0.55, mat: redMat, wing: paperMat },
    { c: new THREE.Vector3(420, -130, -58), r: 50, speed: 0.45, mat: indigoMat, wing: paperMat },
  ].map((g, i) => {
    const crane = makeCrane(g.mat, g.wing);
    crane.group.scale.setScalar(2);
    flock.add(crane.group);
    return { ...g, crane, a: i * 2 };
  });

  // Lanternes de papier qui luisent et se balancent sous le garde-main.
  const lanternTex = tiledTexture('ori-lantern', 64, (ctx, size) => {
    ctx.fillStyle = '#fff1d6';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(160,90,40,0.5)';
    for (let y = 0; y < size; y += 8) ctx.fillRect(0, y, size, 1.5);
  }, { color: true });
  const lanternMat = new THREE.MeshStandardMaterial({ map: lanternTex, emissive: 0xffa050, emissiveMap: lanternTex, emissiveIntensity: 0.9, roughness: 0.8 });
  const lanternGlow = softDotTexture('ori-lantern-glow', 'rgba(255,190,110,1)', 'rgba(255,140,60,0)');
  const lanterns = [[560, -30, -20], [668, -30, -16]].map(([x, y, z], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    body.add(pivot);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 26, 6), new THREE.MeshBasicMaterial({ color: 0x3a2a1a }));
    string.position.y = -13;
    pivot.add(string);
    const shell = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(4, 0), new THREE.Vector2(10, 4), new THREE.Vector2(12, 12), new THREE.Vector2(10, 20), new THREE.Vector2(4, 24)], 20), lanternMat);
    shell.position.y = -50;
    pivot.add(shell);
    [-50, -26].forEach((yy) => {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 2, 12), redMat);
      cap.position.y = yy;
      pivot.add(cap);
    });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: lanternGlow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
    halo.scale.set(60, 60, 1);
    halo.position.y = -38;
    pivot.add(halo);
    return { pivot, swing: { x: 0, v: 0 }, phase: i * 1.3 };
  });

  // Plissé en accordéon contre le garde-main.
  const pleatGeo = new THREE.BufferGeometry();
  const pleatPts = [];
  const N = 14;
  for (let i = 0; i < N; i += 1) {
    const x0 = (i / N) * 170;
    const x1 = ((i + 1) / N) * 170;
    const z0 = i % 2 ? -4 : 0;
    const z1 = i % 2 ? 0 : -4;
    pleatPts.push([x0, -14, z0], [x1, -14, z1], [x1, 14, z1], [x0, -14, z0], [x1, 14, z1], [x0, 14, z0]);
  }
  pleatGeo.setAttribute('position', new THREE.Float32BufferAttribute(pleatPts.flat(), 3));
  pleatGeo.computeVertexNormals();
  const pleat = new THREE.Mesh(pleatGeo, indigoMat);
  const pleatHolder = new THREE.Group();
  pleatHolder.position.set(522, -6, -26);
  pleatHolder.add(pleat);
  body.add(pleatHolder);

  // Banderoles de papier en zigzag suspendues à l'anneau de crosse.
  const shide = new THREE.Group();
  shide.position.set(20, -38, 0);
  body.add(shide);
  const strips = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.z = side * 5;
    shide.add(pivot);
    const pts = [];
    let y = 0;
    for (let k = 0; k < 4; k += 1) {
      const dx = k % 2 ? -6 : 6;
      pts.push([0, y, 0], [dx, y - 10, 0], [dx + 5, y - 10, 0], [0, y, 0], [dx + 5, y - 10, 0], [5, y, 0]);
      y -= 10;
    }
    pivot.add(triMesh(pts, paperMat));
    return pivot;
  });

  // Lotus plié autour du frein de bouche.
  const petalShape = new THREE.Shape();
  petalShape.moveTo(0, 0);
  petalShape.lineTo(9, 10);
  petalShape.lineTo(0, 30);
  petalShape.lineTo(-9, 10);
  petalShape.closePath();
  const petalGeo = extrude(petalShape, 0.8, 0.2, { bevelSegments: 1 });
  const petals = Array.from({ length: 8 }, (_, k) => {
    const ring = new THREE.Group();
    ring.position.set(884, 2, 0);
    ring.rotation.x = (k / 8) * Math.PI * 2;
    body.add(ring);
    const pivot = new THREE.Group();
    pivot.position.set(0, 14, 0);
    pivot.scale.setScalar(1.35);
    ring.add(pivot);
    const petal = new THREE.Mesh(petalGeo, k % 2 ? paperMat : redMat);
    petal.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
    pivot.add(petal);
    return pivot;
  });
  const bloom = { x: 0, v: 0 };

  // Au tir : grues qui s'envolent, confettis de papier.
  const flyers = meshBurst(scene, { max: 12 });
  const confetti = meshBurst(scene, { max: 50 });
  const confettiGeo = new THREE.PlaneGeometry(0.006, 0.006);
  const mouth = anchorAt(body, 905, 4, 0);
  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  let time = 0;
  let flyerClock = 0;

  const launchCrane = () => {
    const crane = makeCrane(Math.random() < 0.5 ? paperMat : redMat, paperMat);
    const holder = new THREE.Group();
    holder.add(crane.group);
    holder.scale.setScalar(0.0011);
    mouth.getWorldPosition(tmp);
    body.getWorldQuaternion(quat);
    const vel = new THREE.Vector3(1, 0.25 + Math.random() * 0.3, -0.35 - Math.random() * 0.3).applyQuaternion(quat).multiplyScalar(1.4);
    faceAlong(crane.group, new THREE.Vector3(1, 0, 0));
    holder.quaternion.setFromUnitVectors(X, vel.clone().normalize());
    const phase = Math.random() * 6;
    flyers.spawn(holder, tmp, vel, { life: 1400, gravity: 0.3, drag: 0.6, spin: 0, shrink: true, onUpdate: (p, t) => crane.flap(Math.sin(t * 40 + phase) * 0.9) });
  };
  const puff = (worldPos, n = 6) => {
    for (let i = 0; i < n; i += 1) {
      const m = new THREE.Mesh(confettiGeo, [paperMat, redMat, indigoMat][i % 3]);
      confetti.spawn(m, worldPos, new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 1, (Math.random() - 0.5) * 1.2), { life: 900, gravity: -2.5, drag: 1.5, spin: 12, shrink: false });
    }
  };

  // Apparition : chaque pièce se déplie comme une feuille, du centre vers les bouts.
  const pieces = captureParts([body], [carrier, flock]);
  orderBy(pieces, (p) => Math.abs(p.center.x - 345));
  pieces.forEach((p, i) => (p.axis = i % 2));
  const rot = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const intro = introRunner(pieces, {
    duration: 1.4,
    hidden: [carrier, flock],
    place: (p, t) => {
      const s = clamp01((t - 0.05 - p.order * 0.8) / 0.42);
      p.object.visible = s > 0;
      if (s <= 0) return;
      if (s >= 1 && !p.done) {
        p.done = true;
        body.localToWorld(tmp.copy(p.center));
        puff(tmp, 3);
      }
      const e = easeOutCubic(s);
      rot.setFromAxisAngle(p.axis ? X : Y, (1 - e) * Math.PI * 0.5);
      if (p.axis) sc.set(1, 0.03 + 0.97 * e, 1);
      else sc.set(0.03 + 0.97 * e, 1, 1);
      placePartScaled(p, sc, ZERO, rot);
    },
    start: () => pieces.forEach((p) => (p.done = false)),
  });

  return {
    replayIntro: intro.start,
    introDuration: intro.duration,
    update: (dt) => {
      time += dt;
      gliders.forEach((g) => {
        g.a += g.speed * dt;
        const p = new THREE.Vector3(g.c.x + Math.cos(g.a) * g.r * 1.6, g.c.y + Math.sin(g.a * 2) * 6, g.c.z + Math.sin(g.a) * g.r * 0.5);
        const next = new THREE.Vector3(g.c.x + Math.cos(g.a + 0.05 * Math.sign(g.speed)) * g.r * 1.6, g.c.y + Math.sin((g.a + 0.05 * Math.sign(g.speed)) * 2) * 6, g.c.z + Math.sin(g.a + 0.05 * Math.sign(g.speed)) * g.r * 0.5);
        g.crane.group.position.copy(p);
        faceAlong(g.crane.group, next.sub(p));
        g.crane.flap(0.3 + Math.sin(time * 5 + g.a) * 0.55);
      });
      pleat.scale.x = 0.92 + 0.08 * Math.sin(time * 1.6);
      lanterns.forEach((l) => {
        springStep(l.swing, 0, 10, dt);
        l.pivot.rotation.z = Math.sin(time * 1.4 + l.phase) * 0.12 + l.swing.x * 0.3;
        l.pivot.rotation.x = Math.sin(time * 1.1 + l.phase) * 0.08;
      });
      lanternMat.emissiveIntensity = 0.8 + 0.15 * Math.sin(time * 7) * Math.sin(time * 3.1);
      strips.forEach((s, i) => (s.rotation.x = Math.sin(time * 1.4 + i) * 0.18));
      shide.rotation.z = Math.sin(time * 0.9) * 0.1;
      springStep(bloom, 0, 40, dt);
      petals.forEach((p) => (p.rotation.z = -(0.35 + Math.max(0, bloom.x) * 0.9 + Math.sin(time * 1.2) * 0.04)));
      flyerClock -= dt;
      flyers.update(dt);
      confetti.update(dt);
      intro.update(dt);
    },
    onFire: () => {
      bloom.v += 14;
      lanterns.forEach((l) => (l.swing.v += 6 + Math.random() * 4));
      if (flyerClock <= 0) {
        flyerClock = 0.18;
        launchCrane();
      }
      mouth.getWorldPosition(tmp);
      puff(tmp, 5);
    },
  };
}

// =============================================================================
// ESSAIM — une ruche vivante : alvéoles de cire, miel qui luit et coule, rayons
// en relief sur le garde-main et la crosse, abeilles qui tournent autour de
// l'arme. Au tir, l'essaim s'affole puis revient, le miel éclabousse.
// Apparition : l'essaim arrive de loin pendant que la cire bâtit l'arme,
// alvéole par alvéole.
// =============================================================================

function hexCells(ctx, r, fill) {
  const rand = seeded(1301);
  for (let row = 0; row * r * 1.5 < H + r * 2; row += 1) {
    for (let col = 0; col * r * 1.732 < W + r * 2; col += 1) {
      const cx = LIVERY.minX + col * r * 1.732 + (row % 2 ? r * 0.866 : 0);
      const cy = LIVERY.minY + row * r * 1.5;
      ctx.beginPath();
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        ctx.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
      }
      ctx.closePath();
      fill(ctx, rand(), cx, cy);
    }
  }
}

function hiveFinish(env, geo) {
  const u = geo.uniforms;
  const color = livery('hive-color', (ctx) => {
    hexCells(ctx, 4.5, (c, k, cx, cy) => {
      if (k < 0.28) {
        const g = c.createRadialGradient(cx - 1, cy + 1, 0, cx, cy, 4.5);
        g.addColorStop(0, '#ffcf5a');
        g.addColorStop(1, '#b85a08');
        c.fillStyle = g;
      } else if (k < 0.62) c.fillStyle = '#f2cf78';
      else if (k < 0.9) c.fillStyle = '#d99a2b';
      else c.fillStyle = '#5a3a10';
      c.fill();
    });
  }, { background: '#f6d98a', color: true });
  const glow = livery('hive-glow', (ctx) => {
    hexCells(ctx, 4.5, (c, k) => {
      c.fillStyle = k < 0.28 ? '#ff9a1a' : '#000000';
      c.fill();
    });
  }, { background: '#000000', color: true });
  const bump = livery('hive-bump', (ctx) => {
    hexCells(ctx, 4.5, (c, k) => {
      c.fillStyle = k < 0.62 ? '#9a9a9a' : '#555555';
      c.fill();
    });
  }, { background: '#ffffff' });
  // Lueur du miel qui ondule le long de l'arme.
  const wax = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.8, map: color, bumpMap: bump, bumpScale: 1.2, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.9 }),
    u,
    'totalEmissiveRadiance *= 0.35 + 0.8 * pow(0.5 + 0.5 * sin(vEmissiveMapUv.x * 28.0 - uTime * 1.6 + vEmissiveMapUv.y * 6.0), 3.0) + uFlare * 1.6;',
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.7, color: 0xe8b33a, roughness: 0.4, clearcoat: 0.6 });
  const bronze = new THREE.MeshStandardMaterial({ envMap: env, color: 0x5a3a16, metalness: 0.8, roughness: 0.35 });
  return {
    ...faces(wax, wall),
    metal: bronze,
    barrel: new THREE.MeshStandardMaterial({ envMap: env, color: 0x2a1c0c, metalness: 0.8, roughness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1a0f04, roughness: 0.9 }),
    sight: new THREE.MeshBasicMaterial({ color: 0xffc040 }),
    brass: bronze,
    flash: 'gold',
    light: 0xffb040,
    smoke: 0xffe0a0,
    glow: [],
    makeShell: () => new THREE.Mesh(new THREE.SphereGeometry(0.0035, 10, 8), new THREE.MeshPhysicalMaterial({ color: 0xe09a1a, roughness: 0.1, clearcoat: 1 })),
    decorate: (ctx) => decorateHive({ ...ctx, geo, env, wall }),
  };
}

function makeBee(stripes, wingMat, eyeMat) {
  const g = new THREE.Group();
  const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.5 }));
  bodyMesh.scale.set(1, 1.7, 1);
  bodyMesh.rotation.z = Math.PI / 2;
  g.add(bodyMesh);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 10), eyeMat);
  head.position.x = 5;
  g.add(head);
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(1, 2, side * 0.8);
    g.add(pivot);
    const w = new THREE.Mesh(new THREE.CircleGeometry(3.4, 12), wingMat);
    w.scale.set(1.3, 0.6, 1);
    w.rotation.x = Math.PI / 2;
    w.position.set(-1, 0, side * 3.2);
    pivot.add(w);
    return { pivot, side };
  });
  return { group: g, wings };
}

function decorateHive({ body, add, scene, parts, carrier, geo, env, wall }) {
  const waxMat = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.7, color: 0xf0c050, roughness: 0.35, clearcoat: 0.7 });
  const honeyMat = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xd98010, roughness: 0.08, clearcoat: 1, emissive: 0xff8a10, emissiveIntensity: 0.6 });
  const stripes = tiledTexture('hive-bee', 64, (ctx, size) => {
    for (let k = 0; k < 6; k += 1) {
      ctx.fillStyle = k % 2 ? '#1a1206' : '#f2b21e';
      ctx.fillRect(0, (k / 6) * size, size, size / 6);
    }
  }, { color: true });
  const wingMat = new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x120c06, roughness: 0.3 });

  // Rayons de cire en relief (prismes hexagonaux, certains remplis de miel).
  const cluster = (cx, cy, z, rows, cols, seed) => {
    const g = new THREE.Group();
    body.add(g);
    const rand = seeded(seed);
    const cells = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (rand() < 0.18) continue;
        const x = cx + c * 10.4 + (r % 2 ? 5.2 : 0);
        const y = cy - r * 9;
        const depth = 3 + rand() * 6;
        const prism = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, depth, 6, 1, true), waxMat);
        prism.rotation.set(Math.PI / 2, 0, Math.PI / 6);
        prism.position.set(x, y, z - depth / 2);
        g.add(prism);
        const cap = new THREE.Mesh(new THREE.CircleGeometry(5, 6), rand() < 0.45 ? honeyMat : waxMat);
        cap.rotation.set(0, Math.PI, Math.PI / 6);
        cap.position.set(x, y, z - depth + 1.2 + rand() * 1.5);
        g.add(cap);
        cells.push(cap);
      }
    }
    return g;
  };
  cluster(532, 6, -25, 3, 16, 1311);
  cluster(40, 18, -19, 2, 15, 1312);

  // Gouttes de miel qui s'allongent et tombent.
  const drips = [[300, -24], [455, -42], [640, -28], [150, -58], [540, -150]].map(([x, y], i) => ({
    mesh: add(new THREE.SphereGeometry(2.8, 12, 10).translate(0, -2.8, 0), honeyMat, x, y, i === 4 ? -12 : 0),
    t: i * 0.27,
    period: 1.7 + i * 0.4,
  }));
  const drops = meshBurst(scene, { max: 50 });
  const dropGeo = new THREE.SphereGeometry(0.0028, 10, 8);

  // Essaim : trajectoires en lissajous autour de l'arme, sous la ligne de mire.
  const swarm = new THREE.Group();
  body.add(swarm);
  const bees = Array.from({ length: 18 }, (_, i) => {
    const bee = makeBee(stripes, wingMat, eyeMat);
    bee.group.scale.setScalar(1.8);
    swarm.add(bee.group);
    const left = i % 3 !== 0;
    return {
      ...bee,
      c: new THREE.Vector3(120 + ((i * 97) % 760), -40 - (i % 4) * 14, left ? -55 - (i % 3) * 10 : 45),
      a: new THREE.Vector3(40 + (i % 5) * 10, 18 + (i % 3) * 6, 18),
      w: new THREE.Vector3(0.9 + (i % 4) * 0.25, 1.7 + (i % 3) * 0.3, 1.2 + (i % 5) * 0.2),
      phase: i * 1.37,
      offset: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      prev: new THREE.Vector3(),
    };
  });
  const beePos = (b, t, out) => out.set(
    b.c.x + Math.sin(t * b.w.x + b.phase) * b.a.x,
    Math.min(24, b.c.y + Math.sin(t * b.w.y + b.phase * 2) * b.a.y),
    b.c.z + Math.cos(t * b.w.z + b.phase) * b.a.z,
  );

  const splash = particleSystem(scene, softDotTexture('hive-splash', 'rgba(255,220,140,1)', 'rgba(255,150,30,0)'), { max: 80 });
  const shock = shockRings(scene, { color: 0xffb040, count: 6, thickness: 0.03 });
  const mouth = anchorAt(body, 905, 4, 0);
  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const p = new THREE.Vector3();
  let time = 0;

  // Apparition : la cire bâtit l'arme au hasard, l'essaim arrive de loin.
  const pieces = captureParts([body], [carrier, swarm]);
  const rand = seeded(1320);
  pieces.forEach((pc) => (pc.order = rand()));
  let swarmIn = 1;
  const intro = introRunner(pieces, {
    duration: 1.5,
    hidden: [carrier],
    start: () => {
      swarmIn = 0;
      bees.forEach((b) => b.offset.set((Math.random() - 0.5) * 900, 200 + Math.random() * 300, -300 - Math.random() * 400));
    },
    frame: (t) => {
      swarmIn = clamp01(t / 1.2);
    },
    place: (pc, t) => {
      const s = clamp01((t - 0.2 - pc.order * 0.9) / 0.35);
      pc.object.visible = s > 0;
      if (s > 0) placePart(pc, easeOutBack(s), ZERO);
    },
  });

  return {
    replayIntro: intro.start,
    introDuration: intro.duration,
    update: (dt, t, flare) => {
      time += dt;
      bees.forEach((b) => {
        b.prev.copy(b.group.position);
        beePos(b, time, p);
        // Écart ramené à zéro par un ressort (affolement au tir, arrivée de l'essaim).
        b.vel.addScaledVector(b.offset, -60 * dt).multiplyScalar(Math.max(0, 1 - 5 * dt));
        b.offset.addScaledVector(b.vel, dt);
        if (swarmIn < 1) b.offset.multiplyScalar(1 - dt * 2.5);
        b.group.position.copy(p).add(b.offset);
        faceAlong(b.group, tmp.copy(b.group.position).sub(b.prev));
        const flap = Math.sin(time * 70 + b.phase) * 0.9;
        b.wings.forEach((w) => (w.pivot.rotation.x = w.side * flap));
      });
      drips.forEach((d) => {
        d.t += dt / d.period;
        if (d.t >= 1) {
          d.t = 0;
          d.mesh.getWorldPosition(tmp);
          drops.spawn(new THREE.Mesh(dropGeo, honeyMat), tmp, new THREE.Vector3(0, -0.05, 0), { life: 700, gravity: -6, drag: 0, spin: 0, shrink: false });
        }
        d.mesh.scale.set(1 - d.t * 0.25, 0.4 + d.t * 1.8, 1 - d.t * 0.25);
      });
      honeyMat.emissiveIntensity = 0.5 + 0.2 * Math.sin(time * 1.8) + flare * 1.2;
      drops.update(dt);
      splash.update(dt);
      shock.update();
      intro.update(dt);
    },
    onFire: () => {
      bees.forEach((b) => b.vel.add(new THREE.Vector3((Math.random() - 0.3) * 900, (Math.random() - 0.5) * 500, (Math.random() - 0.5) * 700)));
      mouth.getWorldPosition(tmp);
      body.getWorldQuaternion(quat);
      shock.spawn(tmp, quat, { reach: 0.045, life: 220, peak: 0.8 });
      for (let i = 0; i < 10; i += 1) {
        splash.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 1, Math.random() * 0.7, (Math.random() - 0.5) * 1), { life: 420, size: 0.003, drag: 2, gravity: -3, tint: 0xffc060 });
      }
      for (let i = 0; i < 4; i += 1) {
        drops.spawn(new THREE.Mesh(dropGeo, honeyMat), tmp, new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8), { life: 800, gravity: -6, drag: 0.5, spin: 0, shrink: false });
      }
    },
  };
}

// =============================================================================
// VOXEL — l'arme d'un jeu rétro : blocs de 6 mm en pixel art (bleu nuit, violet,
// rose, cyan), pixels qui clignotent, motifs en cubes (cœur sur la crosse,
// éclair sur le garde-main), cubes en orbite, HUD à cœurs et munitions. Au tir,
// explosion de cubes et « +100 ». Apparition : les pièces tombent du ciel en
// rebondissant, par paliers de pixels, puis « READY! ».
// =============================================================================

const VOXEL_PALETTE = ['#20244a', '#53347a', '#ff4f8b', '#3ee3ff', '#9dff4a', '#ffd23e'];

function voxelFinish(env, geo) {
  const u = geo.uniforms;
  const cellColor = (i, j, rand) => {
    if (j === 8 || j === 9) return 3;
    if ((i + j) % 9 === 0) return 1;
    if ((i + 2 * j) % 13 === 0) return 1;
    const r = rand();
    if (r < 0.025) return 2;
    if (r < 0.04) return 4;
    return 0;
  };
  const paint = (ctx, glow) => {
    const rand = seeded(1401);
    const s = 6;
    for (let i = Math.floor(LIVERY.minX / s); i * s < LIVERY.maxX; i += 1) {
      for (let j = Math.floor(LIVERY.minY / s); j * s < LIVERY.maxY; j += 1) {
        const k = cellColor(i, j - Math.floor(LIVERY.minY / s) - 28, rand);
        if (glow) {
          ctx.fillStyle = k >= 2 ? VOXEL_PALETTE[k] : '#000000';
          ctx.fillRect(i * s, j * s, s, s);
        } else {
          ctx.fillStyle = VOXEL_PALETTE[k];
          ctx.fillRect(i * s, j * s, s, s);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(i * s, j * s + s - 1, s, 1);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(i * s + s - 0.6, j * s, 0.6, s);
        }
      }
    }
  };
  const color = livery('vox-color', (ctx) => paint(ctx, false), { color: true });
  const glow = livery('vox-glow', (ctx) => paint(ctx, true), { background: '#000000', color: true });
  [color, glow].forEach((tex) => {
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
  });
  // Pixels lumineux qui clignotent par cellule, comme un vieil écran.
  const block = animateEmissive(
    new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.5, map: color, roughness: 0.55, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.2, flatShading: true }),
    u,
    `
      vec2 cell = floor(vEmissiveMapUv * vec2(${(W / 6).toFixed(1)}, ${(H / 6).toFixed(1)}));
      float tw = step(0.35, fract(sin(dot(cell, vec2(12.9898, 78.233)) + floor(uTime * 5.0)) * 43758.5453));
      totalEmissiveRadiance *= 0.35 + tw * 0.9 + uFlare * 1.5;
    `,
  );
  const wall = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.4, color: 0x20244a, roughness: 0.6, flatShading: true });
  const pink = new THREE.MeshStandardMaterial({ color: 0xff4f8b, roughness: 0.5, emissive: 0xff4f8b, emissiveIntensity: 0.25, flatShading: true });
  return {
    ...faces(block, wall),
    metal: new THREE.MeshStandardMaterial({ color: 0x53347a, roughness: 0.5, flatShading: true }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x3ee3ff, roughness: 0.5, emissive: 0x3ee3ff, emissiveIntensity: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b0c1a, roughness: 0.9 }),
    sight: new THREE.MeshBasicMaterial({ color: 0x9dff4a }),
    brass: pink,
    flash: 'plasma',
    light: 0x3ee3ff,
    smoke: 0xc0a0ff,
    glow: [],
    makeShell: () => new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.006), new THREE.MeshStandardMaterial({ color: 0xffd23e, flatShading: true })),
    decorate: (ctx) => decorateVoxel({ ...ctx, geo, env }),
  };
}

function pixelSprite(text, color) {
  const c = liveCanvas(128, 48);
  c.ctx.imageSmoothingEnabled = false;
  c.ctx.font = 'bold 30px monospace';
  c.ctx.textAlign = 'center';
  c.ctx.textBaseline = 'middle';
  c.ctx.fillStyle = '#000000';
  c.ctx.fillText(text, 66, 27);
  c.ctx.fillStyle = color;
  c.ctx.fillText(text, 64, 25);
  c.texture.magFilter = THREE.NearestFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: c.texture, transparent: true, depthWrite: false }));
  return s;
}

function decorateVoxel({ body, add, scene, parts, carrier, geo, env }) {
  const mats = VOXEL_PALETTE.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, emissive: c, emissiveIntensity: 0.18, flatShading: true }));
  const cube = new THREE.BoxGeometry(6, 6, 6);
  parts.rail.visible = false;
  parts.railGrooves.forEach((g) => (g.visible = false));

  // Motifs en cubes sur le flanc gauche.
  const motif = (rows, x0, y0, z, material) => {
    const g = new THREE.Group();
    body.add(g);
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === '#') {
        const m = new THREE.Mesh(cube, material);
        m.position.set(x0 + i * 6, y0 - j * 6, z);
        g.add(m);
      }
    }));
    return g;
  };
  const heart = motif([' ## ## ', '#######', '#######', ' ##### ', '  ###  ', '   #   '], 64, 12, -21, mats[2]);
  motif(['   ##', '  ## ', ' ####', '  ## ', ' ##  ', '##   '], 580, 8, -27, mats[5]);
  // Couronne de cubes autour de la bouche.
  const crown = new THREE.Group();
  crown.position.set(892, 2, 0);
  body.add(crown);
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2;
    const m = new THREE.Mesh(cube, mats[k % 2 ? 3 : 2]);
    m.position.set(0, Math.cos(a) * 17, Math.sin(a) * 17);
    crown.add(m);
  }

  // Cubes en orbite sous le garde-main, côté joueur.
  const orbit = new THREE.Group();
  body.add(orbit);
  const orbiters = Array.from({ length: 12 }, (_, i) => {
    const m = new THREE.Mesh(cube, mats[2 + (i % 4)]);
    orbit.add(m);
    return { m, a: (i / 12) * Math.PI * 2 };
  });

  // HUD rétro : cœurs + munitions.
  const hud = liveCanvas(160, 48);
  hud.texture.magFilter = THREE.NearestFilter;
  let ammo = 25;
  const drawHud = (hurt = false) => {
    const { ctx, canvas, texture } = hud;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const heartPx = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
    for (let h = 0; h < 3; h += 1) {
      heartPx.forEach((row, j) => [...row].forEach((ch, i) => {
        if (ch === '#') {
          ctx.fillStyle = hurt && h === 2 ? '#553344' : '#ff4f8b';
          ctx.fillRect(4 + h * 26 + i * 3, 8 + j * 3, 3, 3);
        }
      }));
    }
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`x${String(ammo).padStart(2, '0')}`, 86, 30);
    texture.needsUpdate = true;
  };
  drawHud();
  const hudMesh = add(new THREE.PlaneGeometry(80, 24), new THREE.MeshBasicMaterial({ map: hud.texture, transparent: true, side: THREE.DoubleSide }), 300, -84, -42);
  hudMesh.rotation.y = Math.PI;

  const cubes = meshBurst(scene, { max: 60 });
  const worldCube = new THREE.BoxGeometry(0.005, 0.005, 0.005);
  const floaters = meshBurst(scene, { max: 8 });
  const mouth = anchorAt(body, 905, 4, 0);
  const tmp = new THREE.Vector3();
  let time = 0;

  const scorePop = (text, color, at, life = 700) => {
    const s = pixelSprite(text, color);
    s.scale.set(0.06, 0.0225, 1);
    floaters.spawn(s, at, new THREE.Vector3(0, 0.25, 0), { life, gravity: 0, drag: 1, spin: 0, shrink: false, onUpdate: (p, t) => (p.mesh.material.opacity = 1 - t * t) });
  };

  // Apparition : pièces qui tombent en rebondissant, grossies par paliers.
  const pieces = captureParts([body], [carrier, orbit]);
  orderBy(pieces, (p) => p.center.x);
  const delta = new THREE.Vector3();
  const intro = introRunner(pieces, {
    duration: 1.5,
    hidden: [carrier, orbit],
    frame: (t) => {
      if (t < 1.1 && Math.random() < 0.5) {
        body.localToWorld(tmp.set(Math.random() * 900, 220, -40 + Math.random() * 60));
        cubes.spawn(new THREE.Mesh(worldCube, mats[Math.floor(Math.random() * 6)]), tmp, new THREE.Vector3(0, -1, 0), { life: 700, gravity: -6, drag: 0, spin: 6 });
      }
    },
    end: () => {
      mouth.getWorldPosition(tmp);
      scorePop('READY!', '#9dff4a', tmp.clone().add(new THREE.Vector3(0, 0.05, 0)), 1000);
    },
    place: (p, t) => {
      const s = clamp01((t - 0.05 - p.order * 0.85) / 0.45);
      p.object.visible = s > 0;
      if (s <= 0) return;
      delta.set(0, 260 * (1 - easeOutBounce(s)), 0);
      placePart(p, Math.max(0.25, Math.ceil(s * 4) / 4), delta);
    },
  });

  return {
    muzzleX: 912,
    replayIntro: intro.start,
    introDuration: intro.duration,
    update: (dt, t, flare) => {
      time += dt;
      orbiters.forEach((o, i) => {
        o.a += dt * 0.8;
        o.m.position.set(560 + Math.cos(o.a) * 190, -62 + Math.sin(o.a * 2 + i) * 10, -52 + Math.sin(o.a) * 22);
        o.m.rotation.set(time * 2 + i, time * 1.5, 0);
      });
      crown.rotation.x = time * 1.2 + flare * 2;
      heart.position.y = Math.round(Math.sin(time * 3) * 1.5);
      cubes.update(dt);
      floaters.update(dt);
      intro.update(dt);
    },
    onFire: () => {
      ammo = ammo <= 1 ? 25 : ammo - 1;
      drawHud(ammo < 6);
      mouth.getWorldPosition(tmp);
      for (let i = 0; i < 10; i += 1) {
        cubes.spawn(new THREE.Mesh(worldCube, mats[2 + (i % 4)]), tmp, new THREE.Vector3((Math.random() - 0.3) * 1.4, Math.random() * 1.2, (Math.random() - 0.5) * 1.4), { life: 650, gravity: -5, drag: 1, spin: 10 });
      }
      if (Math.random() < 0.35) scorePop('+100', '#ffd23e', tmp.clone().add(new THREE.Vector3(0, 0.03, 0)));
    },
  };
}

// =============================================================================
// MAELSTRÖM — une arme faite d'eau tenue en forme : transmission réelle, rides
// et caustiques qui glissent sur la surface, carpes koï qui nagent dedans,
// bulles qui montent, tourbillon autour du canon. Au tir, gerbe et anneau
// d'éclaboussure, les poissons filent. Apparition : l'eau monte d'un
// tourbillon et prend la forme de l'arme.
// =============================================================================

function maelstromFinish(env, geo) {
  const u = geo.uniforms;
  const ripple = tiledTexture('mael-ripple', 256, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const a = (x / size) * Math.PI * 2;
        const b = (y / size) * Math.PI * 2;
        const nx = Math.cos(a * 3 + Math.sin(b * 2) * 2) * 0.5 + Math.cos(a * 5 + b * 3) * 0.25;
        const ny = Math.cos(b * 4 + Math.sin(a * 3) * 2) * 0.5 + Math.sin(b * 2 - a * 5) * 0.25;
        const i = (y * size + x) * 4;
        img.data[i] = 128 + nx * 90;
        img.data[i + 1] = 128 + ny * 90;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: 1 / 60 });
  const caustic = tiledTexture('mael-caustic', 256, (ctx, size) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(160,240,255,0.9)';
    ctx.lineWidth = 2;
    const rand = seeded(1501);
    for (let i = 0; i < 40; i += 1) {
      const cx = rand() * size;
      const cy = rand() * size;
      const r = 14 + rand() * 26;
      ctx.beginPath();
      for (let k = 0; k <= 7; k += 1) {
        const a = (k / 7) * Math.PI * 2;
        const rr = r * (0.7 + rand() * 0.5);
        ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.stroke();
    }
  }, { color: true, repeat: 1 / 45 });
  const water = new THREE.MeshPhysicalMaterial({
    envMap: env,
    envMapIntensity: 1.4,
    color: 0xd6fbff,
    metalness: 0,
    roughness: 0.04,
    transmission: 1,
    thickness: 16,
    ior: 1.33,
    attenuationColor: new THREE.Color(0x3fc6e0),
    attenuationDistance: 140,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    normalMap: ripple,
    normalScale: new THREE.Vector2(0.35, 0.35),
    emissive: 0xffffff,
    emissiveMap: caustic,
    emissiveIntensity: 1,
  });
  // Lueur interne turquoise + caustiques ; la surface respire (ondes qui la parcourent).
  patchShader(water, u, {
    vertex: 'transformed += objectNormal * (sin(position.x * 0.07 + uTime * 3.0) * 0.5 + sin(position.y * 0.11 - uTime * 2.3) * 0.4) * (1.0 + uFlare * 2.0);',
    fragment: 'totalEmissiveRadiance = vec3(0.02, 0.2, 0.28) * (1.0 + uFlare) + totalEmissiveRadiance * vec3(0.45, 0.85, 1.0) * (0.35 + uFlare * 0.6);',
  });
  const steel = new THREE.MeshStandardMaterial({ envMap: env, color: 0x2c3a46, metalness: 0.9, roughness: 0.3 });
  return {
    ...faces(water, water),
    metal: steel,
    barrel: steel,
    dark: new THREE.MeshStandardMaterial({ color: 0x06121a, roughness: 0.8 }),
    sight: new THREE.MeshBasicMaterial({ color: 0x9ff0ff }),
    brass: steel,
    flash: 'frost',
    light: 0x7fe0ff,
    smoke: 0xe0f8ff,
    glow: [],
    makeShell: () => new THREE.Mesh(new THREE.SphereGeometry(0.0035, 10, 8), new THREE.MeshPhysicalMaterial({ color: 0xbfefff, roughness: 0, transmission: 0.9, thickness: 0.004 })),
    decorate: (ctx) => decorateMaelstrom({ ...ctx, geo, env, ripple, caustic, water }),
  };
}

function makeKoi(seed) {
  const rand = seeded(seed);
  const skin = tiledTexture(`mael-koi-${seed}`, 64, (ctx, size) => {
    ctx.fillStyle = '#f4f0ea';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = rand() < 0.75 ? '#ff5a1a' : '#1a1a1a';
      ctx.beginPath();
      ctx.ellipse(rand() * size, rand() * size, 6 + rand() * 12, 5 + rand() * 9, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { color: true });
  const mat = new THREE.MeshStandardMaterial({ map: skin, roughness: 0.4, emissive: 0xff6a2a, emissiveIntensity: 0.25 });
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(3.4, 16, 10), mat);
  b.scale.set(2.4, 1, 0.8);
  g.add(b);
  const tailPivot = new THREE.Group();
  tailPivot.position.x = -7;
  g.add(tailPivot);
  const finMat = new THREE.MeshStandardMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, emissive: 0xff5a1a, emissiveIntensity: 0.3 });
  tailPivot.add(triMesh([[0, 0, 0], [-8, 5, 0], [-6, 0, 0], [0, 0, 0], [-6, 0, 0], [-8, -5, 0]], finMat));
  [-1, 1].forEach((s) => g.add(triMesh([[2, -1, s * 2], [-2, -5, s * 5], [-3, -1, s * 2]], finMat)));
  return { group: g, tail: tailPivot };
}

function decorateMaelstrom({ body, add, scene, parts, carrier, geo, env, ripple, caustic, water }) {
  const u = geo.uniforms;
  // Poissons dans les volumes d'eau (carcasse, garde-main, crosse).
  const school = new THREE.Group();
  body.add(school);
  const tanks = [
    { c: new THREE.Vector3(370, -2, 0), a: new THREE.Vector3(110, 10, 8) },
    { c: new THREE.Vector3(610, -6, 0), a: new THREE.Vector3(80, 12, 14) },
    { c: new THREE.Vector3(120, 14, 0), a: new THREE.Vector3(70, 5, 8) },
    { c: new THREE.Vector3(420, 0, 0), a: new THREE.Vector3(150, 9, 7) },
    { c: new THREE.Vector3(640, -10, 0), a: new THREE.Vector3(60, 8, 12) },
  ];
  const fish = tanks.map((tank, i) => {
    const koi = makeKoi(1510 + i);
    koi.group.scale.setScalar(0.8);
    school.add(koi.group);
    return { ...koi, tank, a: i * 1.3, speed: 0.6 + (i % 3) * 0.2, dash: 0, prev: new THREE.Vector3() };
  });
  // Bulles qui montent dans l'eau.
  const bubbleMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0, clearcoat: 1, envMap: env });
  const bubbles = Array.from({ length: 22 }, (_, i) => {
    const tank = tanks[i % tanks.length];
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.7 + (i % 3) * 0.5, 10, 8), bubbleMat);
    school.add(m);
    return { m, tank, x: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 2, y: Math.random(), speed: 0.3 + Math.random() * 0.5 };
  });

  // Tourbillon autour du canon, devant le garde-main.
  const helix = new THREE.CatmullRomCurve3(Array.from({ length: 60 }, (_, k) => {
    const t = k / 59;
    const a = t * Math.PI * 2 * 2.6;
    return new THREE.Vector3(720 + t * 120, Math.cos(a) * (15 - t * 3), Math.sin(a) * (15 - t * 3));
  }));
  const swirlMat = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x8fe4ff, transparent: true, opacity: 0.7, roughness: 0.05, clearcoat: 1, emissive: 0x2a9fd0, emissiveIntensity: 0.4 });
  const vortex = new THREE.Group();
  vortex.position.set(0, 2, 0);
  body.add(vortex);
  const swirlMesh = new THREE.Mesh(new THREE.TubeGeometry(helix, 160, 2.2, 8, false), swirlMat);
  vortex.add(swirlMesh);
  const foam = particleSystem(scene, softDotTexture('mael-foam', 'rgba(255,255,255,0.9)', 'rgba(200,240,255,0)'), { max: 90 });
  const droplets = meshBurst(scene, { max: 50 });
  const dropGeo = new THREE.SphereGeometry(0.0025, 8, 6);
  const dropMat = new THREE.MeshPhysicalMaterial({ color: 0xcff4ff, roughness: 0, clearcoat: 1, transparent: true, opacity: 0.85, envMap: env });
  const shock = shockRings(scene, { color: 0xbff0ff, count: 8, thickness: 0.035 });
  const mouth = anchorAt(body, 905, 4, 0);
  const foamPoint = anchorAt(body, 780, 2, 0);
  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const spin = { x: 0, v: 0 };
  let time = 0;
  let foamClock = 0;

  // Tourbillon d'apparition sous l'arme.
  const whirlTex = tiledTexture('mael-whirl', 256, (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const c = size / 2;
    for (let k = 0; k < 5; k += 1) {
      ctx.strokeStyle = `rgba(${150 + k * 20},230,255,${0.8 - k * 0.12})`;
      ctx.lineWidth = 6 - k;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 6; a += 0.1) {
        const r = (a / (Math.PI * 6)) * c * 0.95;
        ctx.lineTo(c + Math.cos(a + k * 1.25) * r, c + Math.sin(a + k * 1.25) * r);
      }
      ctx.stroke();
    }
  }, { color: true });
  const whirl = add(new THREE.CircleGeometry(160, 48), new THREE.MeshBasicMaterial({ map: whirlTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), 450, -170, -10);
  whirl.rotation.x = -Math.PI / 2;
  whirl.visible = false;

  const pieces = captureParts([body], [carrier, school, whirl]);
  orderBy(pieces, (p) => Math.abs(p.center.x - 450));
  const delta = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const intro = introRunner(pieces, {
    duration: 1.6,
    hidden: [carrier, school],
    start: () => (whirl.visible = true),
    end: () => (whirl.visible = false),
    frame: (t) => {
      whirl.rotation.z = -t * 6;
      whirl.scale.setScalar(Math.max(0.01, clamp01(t / 0.25) * (1 - clamp01((t - 1.1) / 0.4))));
      if (t < 1.2) {
        whirl.getWorldPosition(tmp);
        for (let i = 0; i < 2; i += 1) droplets.spawn(new THREE.Mesh(dropGeo, dropMat), tmp.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.1)), new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.9 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4), { life: 700, gravity: -4, drag: 0.5, spin: 0 });
      }
    },
    place: (p, t) => {
      const s = clamp01((t - 0.25 - p.order * 0.75) / 0.6);
      p.object.visible = s > 0;
      if (s <= 0) return;
      const e = easeOutElastic(s);
      delta.set(0, -170 * (1 - Math.min(1, e)), 0);
      sc.set(1, 0.08 + 0.92 * e, 1);
      placePartScaled(p, sc, delta);
    },
  });

  return {
    replayIntro: intro.start,
    introDuration: intro.duration,
    update: (dt, t, flare) => {
      time += dt;
      ripple.offset.set(time * 0.05, time * 0.03);
      caustic.offset.set(-time * 0.04, time * 0.05);
      fish.forEach((f) => {
        f.dash = Math.max(0, f.dash - dt * 1.5);
        f.a += f.speed * (1 + f.dash * 3) * dt;
        f.prev.copy(f.group.position);
        const { c, a } = f.tank;
        f.group.position.set(c.x + Math.sin(f.a) * a.x, c.y + Math.sin(f.a * 2.3) * a.y * 0.5, c.z + Math.sin(f.a * 2) * a.z * 0.5);
        faceAlong(f.group, tmp.copy(f.group.position).sub(f.prev));
        f.tail.rotation.y = Math.sin(time * (8 + f.dash * 20) + f.a) * 0.5;
      });
      bubbles.forEach((b) => {
        b.y += b.speed * dt;
        if (b.y > 1) b.y = 0;
        const { c, a } = b.tank;
        b.m.position.set(c.x + b.x * a.x * 0.8, c.y - a.y + b.y * a.y * 2, c.z + b.z * a.z * 0.6);
      });
      springStep(spin, 0, 5, dt);
      vortex.rotation.x -= (2.2 + Math.max(0, spin.x) * 6) * dt;
      foamClock += dt;
      if (foamClock > 0.06) {
        foamClock = 0;
        foamPoint.position.set(720 + Math.random() * 120, 2, 0);
        const a = Math.random() * Math.PI * 2;
        foamPoint.position.y += Math.cos(a) * 15;
        foamPoint.position.z = Math.sin(a) * 15;
        foamPoint.getWorldPosition(tmp);
        foam.spawn(tmp, new THREE.Vector3(0, 0.02, 0), { life: 500, size: 0.0025, drag: 1 });
      }
      foam.update(dt);
      droplets.update(dt);
      shock.update();
      intro.update(dt);
    },
    onFire: () => {
      spin.v += 12;
      fish.forEach((f) => (f.dash = 1));
      mouth.getWorldPosition(tmp);
      body.getWorldQuaternion(quat);
      shock.spawn(tmp, quat, { reach: 0.05, life: 220, peak: 0.9 });
      shock.spawn(tmp, quat, { reach: 0.08, life: 360, peak: 0.4, delay: 40 });
      for (let i = 0; i < 9; i += 1) {
        droplets.spawn(new THREE.Mesh(dropGeo, dropMat), tmp, new THREE.Vector3(0.6 + Math.random() * 0.8, (Math.random() - 0.2) * 0.9, (Math.random() - 0.5) * 1.2).applyQuaternion(quat), { life: 600, gravity: -7, drag: 0.8, spin: 0 });
      }
    },
  };
}

// =============================================================================
// SUMI — peinture à l'encre : papier washi, traits de pinceau secs, montagnes
// au lavis sur la crosse, soleil rouge, sceau. Rubans d'encre qui ondulent
// autour de l'arme, gouttes d'encre en lévitation, pétales rouges. La bouche est
// la tête d'un pinceau de calligraphie. Au tir, éclaboussure d'encre et ensō.
// Apparition : un pinceau passe le long de l'arme et la peint.
// =============================================================================

function drybrush(ctx, pts, width, rand, color = '10,10,12') {
  for (let o = -width / 2; o <= width / 2; o += 0.35) {
    const alpha = 0.55 + rand() * 0.4;
    const cut = 0.75 + rand() * 0.25;
    ctx.strokeStyle = `rgba(${color},${alpha})`;
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    const n = Math.floor(pts.length * cut);
    for (let i = 0; i < n; i += 1) {
      const [x, y] = pts[i];
      const t = i / pts.length;
      const taper = Math.sin(Math.min(1, t * 1.3) * Math.PI) * 0.4 + 0.6;
      ctx.lineTo(x, y + o * taper);
    }
    ctx.stroke();
  }
}

function strokePath(x0, y0, x1, y1, bend, n = 40) {
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * bend]);
  }
  return pts;
}

function sumiFinish(env, geo) {
  const u = geo.uniforms;
  const o = outlinesOf(geo);
  const color = livery('sumi-color', (ctx) => {
    const rand = seeded(1601);
    for (let i = 0; i < 7000; i += 1) {
      ctx.strokeStyle = 'rgba(140,120,90,0.1)';
      ctx.lineWidth = 0.2;
      const x = LIVERY.minX + rand() * W;
      const y = LIVERY.minY + rand() * H;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 6, y + (rand() - 0.5) * 6);
      ctx.stroke();
    }
    // Montagnes au lavis sur la crosse (couches de plus en plus sombres).
    ctx.save();
    tracePolygon(ctx, o.stock);
    ctx.clip();
    [[-60, 'rgba(40,40,45,0.12)'], [-72, 'rgba(30,30,35,0.22)'], [-86, 'rgba(15,15,18,0.4)']].forEach(([base, fill], k) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(0, -120);
      for (let x = 0; x <= 240; x += 6) ctx.lineTo(x, base + 30 * Math.abs(Math.sin(x * 0.02 + k * 1.7)) + 14 * Math.sin(x * 0.07 + k));
      ctx.lineTo(240, -120);
      ctx.fill();
    });
    ctx.restore();
    // Grands traits de pinceau.
    drybrush(ctx, strokePath(236, 12, 500, 6, -6), 9, rand);
    drybrush(ctx, strokePath(520, -4, 712, -12, 8), 12, rand);
    drybrush(ctx, strokePath(250, -14, 420, -18, 4), 5, rand);
    drybrush(ctx, strokePath(470, -40, 530, -190, 10), 7, rand);
    drybrush(ctx, strokePath(30, 22, 220, 14, -8), 10, rand);
    drybrush(ctx, strokePath(300, -60, 360, -130, 6), 9, rand);
    drybrush(ctx, strokePath(560, 14, 700, 10, -3), 4, rand);
    drybrush(ctx, strokePath(236, -2, 330, 4, -4), 3, rand, '198,42,34');
    // Soleil rouge et sceau.
    ctx.fillStyle = '#c62a22';
    ctx.beginPath();
    ctx.arc(150, 10, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b8261e';
    ctx.fillRect(660, -26, 12, 12);
  }, { background: '#efe6d2', color: true });
  const glow = livery('sumi-glow', (ctx) => {
    ctx.fillStyle = '#ff3a2a';
    ctx.beginPath();
    ctx.arc(150, 10, 11, 0, Math.PI * 2);
    ctx.fill();
  }, { background: '#000000', color: true });
  const washi = animateEmissive(
    new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.3, map: color, roughness: 0.92, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.4 }),
    u,
    'totalEmissiveRadiance *= 0.6 + 0.4 * sin(uTime * 1.2) + uFlare * 2.0;',
  );
  const wall = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.3, color: 0xe8dcc4, roughness: 0.9 });
  const lacquer = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x0c0c0e, roughness: 0.2, clearcoat: 1 });
  const bamboo = tiledTexture('sumi-bamboo', 128, (ctx, size) => {
    const g = ctx.createLinearGradient(0, 0, size, 0);
    g.addColorStop(0, '#9e8a48');
    g.addColorStop(0.5, '#c9b670');
    g.addColorStop(1, '#9e8a48');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#6a5a28';
    ctx.fillRect(0, size * 0.48, size, size * 0.06);
  }, { color: true });
  bamboo.repeat.set(1, 6);
  return {
    ...faces(washi, wall),
    metal: lacquer,
    barrel: new THREE.MeshStandardMaterial({ map: bamboo, roughness: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.9 }),
    sight: new THREE.MeshBasicMaterial({ color: 0xc62a22 }),
    brass: lacquer,
    flash: 'ember',
    light: 0xff8060,
    smoke: 0x1a1a1e,
    glow: [],
    makeShell: () => new THREE.Mesh(new THREE.SphereGeometry(0.003, 10, 8), new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.1, clearcoat: 1 })),
    decorate: (ctx) => decorateSumi({ ...ctx, geo, env, lacquer }),
  };
}

function decorateSumi({ body, add, scene, parts, carrier, geo, env, lacquer }) {
  const u = geo.uniforms;
  parts.muzzle.visible = false;
  hideBore(body);
  const inkMat = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x060607, roughness: 0.15, clearcoat: 1 });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, color: 0xc9a04a, metalness: 1, roughness: 0.25 });

  // Tête de pinceau à la bouche : virole laquée + touffe de poils effilée.
  add(new THREE.CylinderGeometry(12, 10, 36, 28), lacquer, 852, 2, 0).rotation.z = Math.PI / 2;
  add(new THREE.CylinderGeometry(12.6, 12.6, 3, 28), gold, 868, 2, 0).rotation.z = Math.PI / 2;
  const bristleTex = tiledTexture('sumi-bristle', 64, (ctx, size) => {
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 2) {
      ctx.fillStyle = `rgba(90,90,95,${0.2 + Math.random() * 0.3})`;
      ctx.fillRect(x, 0, 1, size);
    }
  }, { color: true });
  const brush = new THREE.Group();
  brush.position.set(870, 2, 0);
  body.add(brush);
  const tuft = new THREE.Mesh(
    new THREE.LatheGeometry([new THREE.Vector2(11, 0), new THREE.Vector2(13, 12), new THREE.Vector2(11, 30), new THREE.Vector2(5, 48), new THREE.Vector2(0.5, 62)], 32),
    new THREE.MeshStandardMaterial({ map: bristleTex, roughness: 0.6 }),
  );
  tuft.rotation.z = -Math.PI / 2;
  brush.add(tuft);

  // Rubans d'encre qui ondulent sous l'arme (côté joueur).
  const ribbonAlpha = tiledTexture('sumi-ribbon', 256, (ctx, size) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);
    const g = ctx.createLinearGradient(0, 0, size, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.15, '#ffffff');
    g.addColorStop(0.8, '#ffffff');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    for (let y = 0; y < size; y += 3) if (Math.random() < 0.85) ctx.fillRect(0, y, size * (0.7 + Math.random() * 0.3), 2);
  });
  const ribbons = [
    { y: -70, z: -60, len: 520, width: 16, color: 0x0a0a0c, speed: 1.4, x: 460 },
    { y: -110, z: -40, len: 380, width: 10, color: 0x0a0a0c, speed: -1.1, x: 330 },
    { y: -50, z: -72, len: 300, width: 5, color: 0xc62a22, speed: 1.8, x: 620 },
  ].map((r) => {
    const m = patchShader(
      new THREE.MeshBasicMaterial({ color: r.color, alphaMap: ribbonAlpha, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
      u,
      { vertex: `transformed.y += sin(position.x * 0.018 + uTime * ${r.speed.toFixed(2)}) * 12.0 + uFlare * sin(position.x * 0.05) * 6.0; transformed.z += cos(position.x * 0.012 + uTime * ${(r.speed * 0.7).toFixed(2)}) * 16.0;` },
    );
    m.customProgramCacheKey = () => `sumi-ribbon-${r.speed}`;
    const mesh = add(new THREE.PlaneGeometry(r.len, r.width, 80, 1), m, r.x, r.y, r.z);
    mesh.rotation.x = Math.PI / 2.4;
    return mesh;
  });

  // Gouttes d'encre en lévitation et pétales rouges qui dérivent.
  const drift = new THREE.Group();
  body.add(drift);
  const blobs = Array.from({ length: 10 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.5 + (i % 4) * 0.9, 14, 10), inkMat);
    drift.add(m);
    return { m, base: new THREE.Vector3(200 + i * 65, -70 - (i % 3) * 20, -50 - (i % 4) * 8), phase: i * 1.1 };
  });
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xc62a22, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x5a0a06, emissiveIntensity: 0.3 });
  const petalShape = new THREE.Shape();
  petalShape.moveTo(0, 0);
  petalShape.quadraticCurveTo(5, 4, 0, 10);
  petalShape.quadraticCurveTo(-5, 4, 0, 0);
  const petalGeo = new THREE.ShapeGeometry(petalShape);
  const petals = Array.from({ length: 7 }, (_, i) => {
    const m = new THREE.Mesh(petalGeo, petalMat);
    drift.add(m);
    return { m, x: Math.random(), y: Math.random(), phase: i * 0.9, spin: 1 + Math.random() };
  });

  // Ensō : cercle au pinceau (texture), pour l'apparition et au tir.
  const ensoTex = tiledTexture('sumi-enso', 256, (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const c = size / 2;
    const rand = seeded(1602);
    for (let o = -10; o <= 10; o += 1.2) {
      ctx.strokeStyle = `rgba(8,8,10,${0.5 + rand() * 0.45})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      const end = Math.PI * (1.7 + rand() * 0.2);
      for (let a = 0; a < end; a += 0.03) ctx.lineTo(c + Math.cos(a - 1.2) * (c * 0.8 + o * (0.5 + a / 8)), c + Math.sin(a - 1.2) * (c * 0.8 + o * (0.5 + a / 8)));
      ctx.stroke();
    }
  }, { color: true });
  const ensoGeo = new THREE.PlaneGeometry(1, 1).rotateY(-Math.PI / 2);
  const ensoPool = Array.from({ length: 4 }, () => {
    const m = new THREE.Mesh(ensoGeo, new THREE.MeshBasicMaterial({ map: ensoTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 }));
    m.visible = false;
    m.frustumCulled = false;
    scene.add(m);
    return { m, born: -1 };
  });
  let ensoCursor = 0;
  const splat = meshBurst(scene, { max: 60 });
  const splatGeo = new THREE.SphereGeometry(0.0028, 10, 8);
  const mouth = anchorAt(body, 935, 2, 0);
  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const flick = { x: 0, v: 0 };
  let time = 0;

  // Apparition : un pinceau géant peint l'arme d'arrière en avant.
  const painter = new THREE.Group();
  painter.visible = false;
  body.add(painter);
  const painterTuft = tuft.clone();
  painterTuft.scale.setScalar(1.6);
  painterTuft.rotation.z = Math.PI;
  painter.add(painterTuft);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 180, 20), new THREE.MeshStandardMaterial({ map: tiledTexture('sumi-bamboo', 128, () => {}, { color: true }), roughness: 0.6 }));
  handle.position.y = 190;
  painter.add(handle);
  const pieces = captureParts([body], [carrier, drift, painter]);
  const PAINT = 1.2;
  let brushX = -100;
  const sc = new THREE.Vector3();
  const intro = introRunner(pieces, {
    duration: 1.6,
    hidden: [carrier, drift],
    start: () => (painter.visible = true),
    end: () => (painter.visible = false),
    frame: (t) => {
      brushX = -80 + (1040 * easeOutCubic(clamp01(t / PAINT)));
      painter.position.set(brushX, -10 + Math.sin(t * 14) * 12, -70);
      painter.rotation.set(0, 0, -0.5 + Math.sin(t * 7) * 0.2);
      painter.visible = t < PAINT + 0.15;
      if (t < PAINT && Math.random() < 0.6) {
        body.localToWorld(tmp.set(brushX, -10, -60));
        splat.spawn(new THREE.Mesh(splatGeo, inkMat), tmp, new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6), { life: 600, gravity: -4, drag: 1, spin: 0 });
      }
    },
    place: (p, t) => {
      const s = clamp01((brushX - p.center.x + 40) / 110);
      p.object.visible = s > 0;
      if (s <= 0) return;
      const e = easeOutBack(s);
      sc.set(0.3 + 0.7 * e, 0.3 + 0.7 * e, 1);
      placePartScaled(p, sc, ZERO);
    },
  });

  const enso = (scale, life) => {
    const e = ensoPool[ensoCursor];
    ensoCursor = (ensoCursor + 1) % ensoPool.length;
    mouth.getWorldPosition(e.m.position);
    body.getWorldQuaternion(e.m.quaternion);
    e.born = performance.now();
    e.life = life;
    e.scale = scale;
  };

  return {
    muzzleX: 940,
    replayIntro: intro.start,
    introDuration: intro.duration,
    update: (dt, t, flare) => {
      time += dt;
      springStep(flick, 0, 120, dt);
      brush.rotation.z = Math.sin(time * 1.3) * 0.03 + flick.x * 0.12;
      blobs.forEach((b) => b.m.position.set(b.base.x + Math.sin(time * 0.6 + b.phase) * 10, b.base.y + Math.sin(time * 0.9 + b.phase) * 6, b.base.z + Math.cos(time * 0.5 + b.phase) * 6));
      petals.forEach((p) => {
        p.y -= dt * 0.08;
        if (p.y < 0) {
          p.y = 1;
          p.x = Math.random();
        }
        p.m.position.set(150 + p.x * 700 + Math.sin(time + p.phase) * 20, -150 + p.y * 160, -60 + Math.cos(time * 0.7 + p.phase) * 15);
        p.m.rotation.set(time * p.spin, time * 0.7 * p.spin, p.phase);
      });
      const now = performance.now();
      ensoPool.forEach((e) => {
        if (e.born < 0) return;
        const k = (now - e.born) / e.life;
        if (k >= 1) {
          e.born = -1;
          e.m.visible = false;
          return;
        }
        e.m.visible = true;
        e.m.scale.setScalar(e.scale * (0.4 + easeOutCubic(k) * 0.6));
        e.m.material.opacity = 1 - k * k;
      });
      splat.update(dt);
      intro.update(dt);
    },
    onFire: () => {
      flick.v += 18;
      enso(0.09, 420);
      mouth.getWorldPosition(tmp);
      body.getWorldQuaternion(quat);
      for (let i = 0; i < 12; i += 1) {
        splat.spawn(new THREE.Mesh(splatGeo, i < 3 ? petalMat : inkMat), tmp, new THREE.Vector3(0.5 + Math.random() * 0.8, (Math.random() - 0.3) * 0.9, (Math.random() - 0.5) * 1.1).applyQuaternion(quat), { life: 650, gravity: -6, drag: 1, spin: 0 });
      }
    },
  };
}

export const VANDAL_TRANSCENDENT_SKINS = {
  origami: { labelKey: 'aimTrainer.skinOrigami', build: origamiFinish },
  hive: { labelKey: 'aimTrainer.skinHive', build: hiveFinish },
  voxel: { labelKey: 'aimTrainer.skinVoxel', build: voxelFinish },
  maelstrom: { labelKey: 'aimTrainer.skinMaelstrom', build: maelstromFinish },
  sumi: { labelKey: 'aimTrainer.skinSumi', build: sumiFinish },
};
