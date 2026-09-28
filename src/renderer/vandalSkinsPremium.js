import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { seeded, tiledTexture, speckle, animateEmissive, particleSystem, softDotTexture, extrude, springStep } from './weaponKit.js';
import { LIVERY, livery, tracePolygon, strokeLine, magazineOutline, glowSprite } from './vandalSkins.js';

// Skins « pièce maîtresse » de la Vandal : ils ne se contentent pas de peindre
// l'arme, ils en changent la silhouette (dragon enroulé, mécanique apparente)
// avec des pièces animées indépendantes.

// Contour de la poignée (même profil que gripShape() dans vandalModel.js).
const GRIP_OUTLINE = [
  [322, -20], [376, -20], [371, -46], [362, -60], [364, -74], [354, -88],
  [355, -102], [345, -118], [341, -136], [297, -141], [287, -127], [309, -52],
];

// Tube dont l'épaisseur varie le long du chemin (corps de dragon, cornes...).
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

// Volute (motif de nuage chinois / de ferronnerie) : spirale posée dans le plan
// du flanc, en tube fin.
function scrollCurve(cx, cy, z, size, turns, flip = 1) {
  const pts = [];
  const steps = 40;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const r = size * (1 - t * 0.8);
    pts.push(new THREE.Vector3(cx + Math.cos(a) * r * flip, cy + Math.sin(a) * r, z));
  }
  return new THREE.CatmullRomCurve3(pts);
}

// =============================================================================
// DRAGON DE JADE
// Jade veiné, translucide, traversé d'une lumière intérieure qui ondule ; filets
// d'or et volutes de nuages. Un dragon d'or aux écailles ciselées s'enroule en
// spirale autour du garde-main et du canon ; sa tête forme la bouche de l'arme
// et sa mâchoire s'ouvre à chaque tir, crachant une flamme émeraude. Ses
// moustaches ondulent, ses yeux luisent, une crête d'épines court sur son dos.
// La perle du dragon flotte dans la crosse, entourée de flammèches.
// =============================================================================

function jadeVeins(seed) {
  const rand = seeded(seed);
  return Array.from({ length: 120 }, () => {
    const x = LIVERY.minX + rand() * 922;
    const y = LIVERY.minY + rand() * 296;
    const len = 30 + rand() * 120;
    const a = (rand() - 0.5) * 1.2;
    return {
      pts: [
        [x, y],
        [x + Math.cos(a) * len * 0.33, y + Math.sin(a) * len * 0.33 + (rand() - 0.5) * 20],
        [x + Math.cos(a) * len * 0.66, y + Math.sin(a) * len * 0.66 + (rand() - 0.5) * 20],
        [x + Math.cos(a) * len, y + Math.sin(a) * len],
      ],
      width: 0.4 + rand() * 2.2,
      light: rand() < 0.5,
    };
  });
}

function drawVein(ctx, { pts }) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  ctx.bezierCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
  ctx.stroke();
}

// Volutes de nuage dessinées en or le long des contours.
function cloudScrolls(ctx, outline, every, size) {
  let acc = 0;
  for (let i = 0; i < outline.length; i += 1) {
    const [x1, y1] = outline[i];
    const [x2, y2] = outline[(i + 1) % outline.length];
    const len = Math.hypot(x2 - x1, y2 - y1);
    for (let d = every - acc; d < len; d += every) {
      const t = d / len;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      const nx = -(y2 - y1) / len;
      const ny = (x2 - x1) / len;
      const cx = x - nx * size * 1.3;
      const cy = y - ny * size * 1.3;
      ctx.beginPath();
      for (let k = 0; k <= 30; k += 1) {
        const a = (k / 30) * Math.PI * 3.2;
        const r = size * (1 - (k / 30) * 0.8);
        if (k === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.stroke();
    }
    acc = (acc + len) % every;
  }
}

function jadeFinish(env, geo) {
  const uniforms = geo.uniforms;
  const veins = jadeVeins(71);
  const outlines = [geo.stockOutline, geo.handguardOutline, magazineOutline(geo.magazineCurve), GRIP_OUTLINE];

  const color = livery(
    'jade-color',
    (ctx) => {
      // Nuages de teinte : le jade n'est jamais uniforme.
      const rand = seeded(72);
      for (let i = 0; i < 70; i += 1) {
        const x = LIVERY.minX + rand() * 922;
        const y = LIVERY.minY + rand() * 296;
        const r = 20 + rand() * 70;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const tone = ['30,120,82', '8,52,34', '70,160,115', '4,34,22', '120,200,160'][Math.floor(rand() * 5)];
        g.addColorStop(0, `rgba(${tone},0.6)`);
        g.addColorStop(1, `rgba(${tone},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.lineCap = 'round';
      veins.forEach((vein) => {
        ctx.strokeStyle = vein.light ? 'rgba(170,235,200,0.2)' : 'rgba(2,24,14,0.55)';
        ctx.lineWidth = vein.width * (vein.light ? 0.6 : 1.3);
        drawVein(ctx, vein);
      });
      speckle(ctx, LIVERY, 9000, ['rgba(220,255,235,0.25)', 'rgba(0,40,20,0.3)'], 0.6, seeded(73));
      // Filets et volutes d'or.
      ctx.strokeStyle = '#d6a940';
      ctx.lineWidth = 2.4;
      outlines.forEach((o) => {
        tracePolygon(ctx, o);
        ctx.stroke();
      });
      ctx.lineWidth = 1.1;
      outlines.forEach((o) => cloudScrolls(ctx, o, 46, 5));
      // Bandes d'or sur la carcasse (bagues ciselées).
      ctx.fillStyle = '#d6a940';
      [[246, 8], [498, 6], [428, 5]].forEach(([x, w]) => ctx.fillRect(x - w / 2, -40, w, 80));
    },
    { background: '#0f5438', color: true },
  );

  const glow = livery(
    'jade-glow',
    (ctx) => {
      ctx.lineCap = 'round';
      veins.forEach((vein) => {
        if (!vein.light) return;
        ctx.strokeStyle = 'rgba(90,255,170,0.55)';
        ctx.lineWidth = vein.width * 1.6;
        ctx.shadowColor = 'rgba(60,255,150,0.8)';
        ctx.shadowBlur = 6;
        drawVein(ctx, vein);
      });
      ctx.shadowBlur = 0;
      const rand = seeded(74);
      for (let i = 0; i < 26; i += 1) {
        const x = LIVERY.minX + rand() * 922;
        const y = LIVERY.minY + rand() * 296;
        const r = 30 + rand() * 60;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(40,200,120,0.22)');
        g.addColorStop(1, 'rgba(40,200,120,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    },
    { background: '#000000', color: true },
  );
  const rough = livery('jade-rough', (ctx) => {
    ctx.strokeStyle = '#6a6a6a';
    ctx.lineWidth = 2.6;
    outlines.forEach((o) => {
      tracePolygon(ctx, o);
      ctx.stroke();
    });
  }, { background: '#3a3a3a' });
  const bump = livery('jade-bump', (ctx) => {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.4;
    outlines.forEach((o) => {
      tracePolygon(ctx, o);
      ctx.stroke();
    });
    ctx.lineWidth = 1.1;
    outlines.forEach((o) => cloudScrolls(ctx, o, 46, 5));
  }, { background: '#b0b0b0' });

  // Lumière intérieure qui ondule lentement dans la pierre, flambée au tir.
  const inner = `
    float wave = sin(vEmissiveMapUv.x * 18.0 - uTime * 0.9 + sin(vEmissiveMapUv.y * 30.0 + uTime) * 0.8);
    totalEmissiveRadiance *= 0.55 + 0.45 * wave + uFlare * 1.5;
  `;
  const jade = animateEmissive(
    new THREE.MeshPhysicalMaterial({
      envMap: env,
      envMapIntensity: 0.7,
      map: color,
      emissive: 0xffffff,
      emissiveMap: glow,
      emissiveIntensity: 1.1,
      metalness: 0,
      roughness: 1,
      roughnessMap: rough,
      bumpMap: bump,
      bumpScale: 1.2,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      sheen: 0.15,
      sheenColor: new THREE.Color(0x6affb8),
    }),
    uniforms,
    inner,
  );
  const jadeWall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x0f5438, metalness: 0, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x0a3a24, emissiveIntensity: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.3, color: 0xd9a93c, metalness: 1, roughness: 0.25 });
  const pair = [jade, jadeWall];
  return {
    receiver: pair,
    dustCover: pair,
    magwell: pair,
    gasBlock: pair,
    muzzle: pair,
    stock: pair,
    buttPad: [gold, gold],
    grip: pair,
    handguard: pair,
    upperGuard: pair,
    magazine: pair,
    metal: gold,
    barrel: gold,
    dark: new THREE.MeshStandardMaterial({ color: 0x06140e, roughness: 0.7 }),
    sight: new THREE.MeshBasicMaterial({ color: 0x7dffc0 }),
    brass: gold,
    flash: 'jade',
    light: 0x4dffa0,
    smoke: 0xa8ffd6,
    glow: [],
    // Pièce de monnaie ancienne à trou carré, en guise de douille.
    makeShell: () => {
      const coin = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.0016, 20), gold);
      disc.rotation.x = Math.PI / 2;
      coin.add(disc);
      const hole = new THREE.Mesh(new THREE.BoxGeometry(0.0045, 0.0045, 0.002), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
      coin.add(hole);
      return coin;
    },
    decorate: (ctx) => decorateJade({ ...ctx, geo, gold, jade, env }),
  };
}

function scaleTextures() {
  const draw = (ctx, size, mode) => {
    const rows = 8;
    const cell = size / rows;
    for (let row = -1; row <= rows; row += 1) {
      for (let col = -1; col <= rows; col += 1) {
        const x = col * cell + (row % 2 ? cell / 2 : 0);
        const y = row * cell * 0.7;
        const g = ctx.createRadialGradient(x + cell / 2, y + cell * 0.2, 0, x + cell / 2, y + cell * 0.2, cell * 0.75);
        if (mode === 'color') {
          g.addColorStop(0, '#ffe08a');
          g.addColorStop(0.7, '#c08a28');
          g.addColorStop(1, '#5a3a0c');
        } else if (mode === 'bump') {
          g.addColorStop(0, '#ffffff');
          g.addColorStop(0.85, '#8a8a8a');
          g.addColorStop(1, '#000000');
        } else {
          g.addColorStop(0, 'rgba(0,0,0,0)');
          g.addColorStop(0.86, 'rgba(0,0,0,0)');
          g.addColorStop(0.95, 'rgba(80,255,170,0.9)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell * 0.2, cell * 0.72, 0, Math.PI);
        ctx.lineTo(x + cell / 2 - cell * 0.72, y + cell * 0.2);
        ctx.fill();
      }
    }
  };
  const make = (mode, background, isColor) => {
    const tex = tiledTexture(`dragon-scale-${mode}`, 256, (ctx, size) => {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, size, size);
      draw(ctx, size, mode);
    }, { color: isColor });
    tex.repeat.set(70, 5);
    return tex;
  };
  return { color: make('color', '#5a3a0c', true), bump: make('bump', '#000000', false), glow: make('glow', '#000000', true) };
}

function decorateJade({ body, add, scene, parts, geo, gold, jade, env }) {
  const uniforms = geo.uniforms;
  const scales = scaleTextures();
  const dragonSkin = animateEmissive(
    new THREE.MeshStandardMaterial({
      envMap: env,
      envMapIntensity: 1.4,
      map: scales.color,
      bumpMap: scales.bump,
      bumpScale: 1.5,
      emissive: 0xffffff,
      emissiveMap: scales.glow,
      emissiveIntensity: 0.9,
      metalness: 0.95,
      roughness: 0.3,
    }),
    uniforms,
    // Reflet émeraude qui remonte le long du corps, de la queue vers la tête.
    'totalEmissiveRadiance *= 0.25 + 1.4 * pow(0.5 + 0.5 * sin(vEmissiveMapUv.x * 0.25 - uTime * 2.2), 8.0) + uFlare * 1.2;',
  );

  // Corps du dragon : spirale autour du garde-main puis du canon, qui se resserre
  // vers la tête.
  const pts = [];
  for (let i = 0; i <= 90; i += 1) {
    const t = i / 90;
    const x = 430 + t * 425;
    const a = t * 2.4 * Math.PI * 2 + Math.PI * 0.6;
    const k = x < 715 ? 1 : Math.max(0, 1 - (x - 715) / 150);
    const ry = 16 + 26 * k;
    const rz = 16 + 18 * k;
    const cy = x < 715 ? 4 : 4 - (1 - k) * 2;
    const toAxis = t > 0.93 ? (t - 0.93) / 0.07 : 0;
    pts.push(new THREE.Vector3(x, cy + Math.sin(a) * ry * (1 - toAxis * 0.8), Math.cos(a) * rz * (1 - toAxis * 0.8)));
  }
  const path = new THREE.CatmullRomCurve3(pts);
  const dragonBody = new THREE.Mesh(
    taperedTube(path, 260, 13, 16, (t) => 0.25 + 0.75 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5) * (t > 0.9 ? 1 - (t - 0.9) * 2 : 1)),
    dragonSkin,
  );
  body.add(dragonBody);

  // Crête dorsale : épines tournées vers l'extérieur de la spirale.
  const spineMat = new THREE.MeshStandardMaterial({ envMap: env, color: 0x3fd98f, metalness: 0.3, roughness: 0.25, emissive: 0x0f6a3c, emissiveIntensity: 0.5 });
  for (let i = 10; i < 88; i += 3) {
    const t = i / 90;
    const p = path.getPointAt(t);
    const out = new THREE.Vector3(0, p.y - 4, p.z).normalize();
    const size = 0.4 + 0.6 * Math.sin(t * Math.PI);
    const spine = new THREE.Mesh(new THREE.ConeGeometry(3.2 * size, 16 * size, 4), spineMat);
    spine.position.copy(p).addScaledVector(out, 8 * size);
    spine.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out.clone().add(new THREE.Vector3(-0.5, 0, 0)).normalize());
    body.add(spine);
  }
  // Pattes griffues agrippées au garde-main.
  [0.3, 0.55].forEach((t) => {
    const p = path.getPointAt(t);
    const inward = new THREE.Vector3(0, 4 - p.y, -p.z).normalize();
    for (let c = -1; c <= 1; c += 1) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(1.8, 12, 5), gold);
      claw.position.copy(p).addScaledVector(inward, 9).add(new THREE.Vector3(c * 5, 0, 0));
      claw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), inward);
      body.add(claw);
    }
  });

  // --- Tête (forme la bouche de l'arme) ---------------------------------------
  parts.muzzle.visible = false;
  const head = new THREE.Group();
  head.position.set(852, 4, 0);
  head.scale.setScalar(1.35);
  body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), dragonSkin);
  skull.scale.set(24, 17, 19);
  skull.position.set(0, 6, 0);
  head.add(skull);
  const snout = new THREE.Mesh(new RoundedBoxGeometry(46, 13, 22, 3, 5), dragonSkin);
  snout.position.set(28, 5, 0);
  snout.rotation.z = 0.06;
  head.add(snout);
  // Naseaux et arcade.
  [-1, 1].forEach((side) => {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0x061a10 }));
    nostril.position.set(49, 9, side * 6);
    head.add(nostril);
    const brow = new THREE.Mesh(new THREE.ConeGeometry(4, 16, 4), gold);
    brow.position.set(8, 19, side * 9);
    brow.rotation.z = 1.2;
    head.add(brow);
  });
  // Mâchoire inférieure articulée, qui s'ouvre au tir.
  const jaw = new THREE.Group();
  jaw.position.set(-4, -4, 0);
  head.add(jaw);
  const jawMesh = new THREE.Mesh(new RoundedBoxGeometry(46, 8, 19, 3, 3), dragonSkin);
  jawMesh.position.set(26, -3, 0);
  jaw.add(jawMesh);
  const tooth = new THREE.ConeGeometry(1.5, 6, 5);
  const ivory = new THREE.MeshStandardMaterial({ color: 0xf4efe0, roughness: 0.35 });
  for (let x = 14; x <= 50; x += 6) {
    [-1, 1].forEach((side) => {
      const upper = new THREE.Mesh(tooth, ivory);
      upper.position.set(x, -2, side * 8.5);
      upper.rotation.z = Math.PI;
      head.add(upper);
      const lower = new THREE.Mesh(tooth, ivory);
      lower.position.set(x + 4, 2, side * 7.5);
      jaw.add(lower);
    });
  }
  // Langue de flamme au fond de la gueule.
  const throat = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 10), new THREE.MeshBasicMaterial({ color: 0x7dffc0 }));
  throat.position.set(40, 0, 0);
  throat.scale.set(1.6, 0.6, 1);
  head.add(throat);
  // Yeux luisants.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x8dffd0 });
  const eyeHalo = softDotTexture('jade-eye', 'rgba(140,255,200,1)', 'rgba(40,255,140,0)');
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(3.4, 14, 10), eyeMat);
    eye.position.set(12, 12, side * 12.5);
    eye.scale.set(1.3, 0.8, 0.6);
    head.add(eye);
    const halo = glowSprite(eyeHalo, 0x6dffb8, 20);
    halo.position.copy(eye.position);
    head.add(halo);
    return halo;
  });
  // Cornes : tubes effilés qui partent vers l'arrière.
  [-1, 1].forEach((side) => {
    const horn = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-4, 18, side * 8),
      new THREE.Vector3(-22, 30, side * 13),
      new THREE.Vector3(-46, 36, side * 20),
      new THREE.Vector3(-66, 32, side * 26),
    ]);
    head.add(new THREE.Mesh(taperedTube(horn, 24, 4, 8, (t) => 1 - t * 0.9), gold));
  });
  // Crinière : mèches de jade autour de la nuque.
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2;
    const lock = new THREE.Mesh(new THREE.ConeGeometry(3, 20, 4), spineMat);
    lock.position.set(-18, 6 + Math.sin(a) * 14, Math.cos(a) * 14);
    lock.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, Math.sin(a) * 0.9, Math.cos(a) * 0.9).normalize());
    head.add(lock);
  }
  // Moustaches : lignes d'or qui ondulent vers l'arrière.
  const whiskerMat = new THREE.LineBasicMaterial({ color: 0xffd36a });
  const whiskers = [-1, 1].map((side) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 20 }, () => new THREE.Vector3()));
    const line = new THREE.Line(geometry, whiskerMat);
    head.add(line);
    return { line, side };
  });

  // --- Perle du dragon dans la crosse -----------------------------------------
  const pearl = new THREE.Mesh(
    new THREE.SphereGeometry(12, 32, 24),
    new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xf6fffa, metalness: 0, roughness: 0.08, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6, emissive: 0x3aff9a, emissiveIntensity: 0.25 }),
  );
  pearl.position.set(100, -24, 0);
  body.add(pearl);
  const flameTex = softDotTexture('jade-flame', 'rgba(170,255,210,1)', 'rgba(20,220,120,0)');
  const flames = [0, 1, 2, 3].map(() => {
    const sprite = glowSprite(flameTex, 0x5dffa8, 16);
    body.add(sprite);
    return sprite;
  });
  const pearlHalo = glowSprite(flameTex, 0x3aff9a, 60);
  pearlHalo.position.copy(pearl.position);
  body.add(pearlHalo);

  // Volutes d'or en relief sur les flancs de la crosse et de la carcasse.
  [-1, 1].forEach((side) => {
    [[30, 5, 10, 2.2], [200, -2, 8, 2], [40, -92, 8, 1.8], [280, -12, 7, 2]].forEach(([x, y, size, turns], i) => {
      const z = side * (x < 230 ? 19.2 : 17.3);
      body.add(new THREE.Mesh(new THREE.TubeGeometry(scrollCurve(x, y, z, size, turns, i % 2 ? -1 : 1), 60, 1.3, 6, false), gold));
    });
  });

  const motes = particleSystem(scene, flameTex, { max: 160 });
  const breath = particleSystem(scene, flameTex, { max: 90 });
  const mouth = new THREE.Object3D();
  mouth.position.set(54, 0, 0);
  head.add(mouth);
  const emitter = new THREE.Object3D();
  body.add(emitter);
  const tmp = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const jawSpring = { x: 0, v: 0 };
  let moteClock = 0;
  let time = 0;

  return {
    muzzleX: 928,
    update: (dt, t, flare) => {
      time += dt;
      springStep(jawSpring, 0, 70, dt);
      jaw.rotation.z = -Math.min(0.55, Math.max(0, jawSpring.x)) - 0.04 - Math.sin(time * 1.3) * 0.02;
      throat.material.color.setRGB(0.4 + flare * 0.6, 1, 0.75 + flare * 0.25);
      eyes.forEach((halo) => {
        halo.material.opacity = 0.6 + 0.3 * Math.sin(time * 2.5) + flare * 0.4;
      });
      whiskers.forEach(({ line, side }) => {
        const pos = line.geometry.attributes.position;
        for (let k = 0; k < 20; k += 1) {
          const s = k / 19;
          pos.setXYZ(
            k,
            46 - s * 110,
            4 + Math.sin(time * 3 - s * 5) * s * 9 - s * 8,
            side * (10 + s * 26 + Math.cos(time * 2.2 - s * 4) * s * 6),
          );
        }
        pos.needsUpdate = true;
      });
      pearl.rotation.y += dt * 0.8;
      pearl.position.y = -24 + Math.sin(time * 1.6) * 2;
      pearlHalo.material.opacity = 0.35 + 0.15 * Math.sin(time * 2) + flare * 0.4;
      flames.forEach((f, i) => {
        const a = time * 2.4 + (i * Math.PI) / 2;
        f.position.set(100 + Math.cos(a) * 20, -24 + Math.sin(a) * 20, Math.sin(a * 2) * 4);
        f.material.opacity = 0.6 + 0.3 * Math.sin(time * 7 + i);
      });

      moteClock += dt;
      while (moteClock > 0.05) {
        moteClock -= 0.05;
        emitter.position.set(430 + Math.random() * 440, -30 + Math.random() * 70, (Math.random() - 0.5) * 70);
        emitter.getWorldPosition(tmp);
        motes.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.01, 0.012 + Math.random() * 0.01, (Math.random() - 0.5) * 0.01), {
          life: 900 + Math.random() * 800,
          size: 0.0014 + Math.random() * 0.0016,
          drag: 0.3,
        });
      }
      motes.update(dt);
      breath.update(dt);
    },
    onFire: () => {
      jawSpring.v += 11;
      mouth.getWorldPosition(tmp);
      // L'avant de la tête est son +X local.
      dir.set(1, 0, 0).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
      for (let i = 0; i < 9; i += 1) {
        const v = dir.clone().multiplyScalar(1.4 + Math.random() * 1.2).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5));
        breath.spawn(tmp, v, { life: 260 + Math.random() * 200, size: 0.008 + Math.random() * 0.008, grow: 1.5, drag: 5 });
      }
    },
  };
}

// =============================================================================
// HORLOGER — mécanique d'horlogerie à nu. Crosse et garde-main en noyer veiné,
// carcasse en laiton gravé de rinceaux, chargeur en cuivre riveté, poignée gainée
// de cuir cousu. Des trains d'engrenages tournent sur les flancs et dans la
// crosse (et s'emballent à chaque tir), un manomètre dont l'aiguille bondit au
// tir, deux pistons qui pompent, une fiole d'éther lumineux où montent des
// bulles, une cheminée qui lâche de la vapeur, et une bouche en pavillon de
// cuivre.
// =============================================================================

function gearShape(radius, teeth, { hole = 0.18, windows = 5 } = {}) {
  const shape = new THREE.Shape();
  const depth = Math.min(4, radius * 0.18);
  const root = radius - depth;
  for (let i = 0; i < teeth; i += 1) {
    const a = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    const p = [
      [root, a],
      [radius, a + step * 0.18],
      [radius, a + step * 0.5],
      [root, a + step * 0.68],
    ];
    p.forEach(([r, ang], k) => {
      if (i === 0 && k === 0) shape.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
      else shape.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    });
  }
  shape.closePath();
  const axle = new THREE.Path();
  axle.absarc(0, 0, radius * hole, 0, Math.PI * 2, true);
  shape.holes.push(axle);
  if (radius > 9) {
    for (let w = 0; w < windows; w += 1) {
      const a = (w / windows) * Math.PI * 2;
      const win = new THREE.Path();
      win.absarc(Math.cos(a) * radius * 0.55, Math.sin(a) * radius * 0.55, radius * 0.2, 0, Math.PI * 2, true);
      shape.holes.push(win);
    }
  }
  return shape;
}

function woodGrain(ctx, clip, rand) {
  ctx.save();
  clip();
  ctx.clip();
  ctx.fillStyle = '#5b3419';
  ctx.fillRect(LIVERY.minX, LIVERY.minY, 922, 296);
  for (let y = LIVERY.minY; y < LIVERY.maxY; y += 1.1) {
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(40,20,8,0.45)' : 'rgba(150,95,50,0.3)';
    ctx.lineWidth = 0.3 + rand() * 0.8;
    ctx.beginPath();
    const phase = rand() * 10;
    for (let x = LIVERY.minX; x <= LIVERY.maxX; x += 6) {
      const yy = y + Math.sin(x * 0.02 + phase) * 2.5 + Math.sin(x * 0.07 + phase * 2) * 0.8;
      if (x === LIVERY.minX) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // Nœuds du bois.
  for (let i = 0; i < 12; i += 1) {
    const x = LIVERY.minX + rand() * 922;
    const y = LIVERY.minY + rand() * 296;
    for (let r = 1; r < 9; r += 1.4) {
      ctx.strokeStyle = 'rgba(35,16,6,0.5)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 2.2, r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function engraving(ctx, rand, count) {
  // Rinceaux : spirales et tiges feuillues gravées dans le laiton.
  ctx.strokeStyle = 'rgba(70,45,10,0.7)';
  ctx.lineWidth = 0.45;
  for (let i = 0; i < count; i += 1) {
    const cx = 225 + rand() * 280;
    const cy = -22 + rand() * 60;
    const size = 3 + rand() * 6;
    ctx.beginPath();
    for (let k = 0; k <= 30; k += 1) {
      const a = (k / 30) * Math.PI * 3;
      const r = size * (1 - (k / 30) * 0.85);
      if (k === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.stroke();
  }
}

function clockworkFinish(env, geo) {
  const magOutline = magazineOutline(geo.magazineCurve);
  const woodZones = (ctx) => {
    ctx.beginPath();
    [geo.stockOutline, geo.handguardOutline].forEach((o) => {
      o.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
    });
  };
  const color = livery(
    'clock-color',
    (ctx) => {
      // Laiton brossé, gravé.
      speckle(ctx, LIVERY, 20000, ['rgba(255,230,160,0.12)', 'rgba(90,60,10,0.12)'], 0.5, seeded(61));
      engraving(ctx, seeded(62), 90);
      woodGrain(ctx, () => woodZones(ctx), seeded(63));
      // Chargeur en cuivre riveté.
      ctx.fillStyle = '#9a5530';
      tracePolygon(ctx, magOutline);
      ctx.fill();
      ctx.fillStyle = '#e0a070';
      magOutline.forEach(([x, y], i) => {
        if (i % 2) return;
        ctx.beginPath();
        ctx.arc(x + (x > 480 ? -3 : 3), y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      });
      // Poignée gainée de cuir cousu.
      ctx.fillStyle = '#3b2215';
      tracePolygon(ctx, GRIP_OUTLINE);
      ctx.fill();
      ctx.strokeStyle = 'rgba(220,190,140,0.8)';
      ctx.setLineDash([2, 1.6]);
      ctx.lineWidth = 0.5;
      for (let y = -40; y > -135; y -= 12) strokeLine(ctx, [[300, y], [362, y + 3]]);
      ctx.setLineDash([]);
      // Filets de laiton autour du bois.
      ctx.strokeStyle = '#c9a044';
      ctx.lineWidth = 2;
      [geo.stockOutline, geo.handguardOutline].forEach((o) => {
        tracePolygon(ctx, o);
        ctx.stroke();
      });
    },
    { background: '#b58c3c', color: true },
  );
  const rough = livery('clock-rough', (ctx) => {
    ctx.fillStyle = '#b0b0b0';
    woodZones(ctx);
    ctx.fill();
    ctx.fillStyle = '#c8c8c8';
    tracePolygon(ctx, GRIP_OUTLINE);
    ctx.fill();
  }, { background: '#5a5a5a' });
  const metalness = livery('clock-metal', (ctx) => {
    ctx.fillStyle = '#000000';
    woodZones(ctx);
    ctx.fill();
    tracePolygon(ctx, GRIP_OUTLINE);
    ctx.fill();
  }, { background: '#ffffff' });
  const bump = livery('clock-bump', (ctx) => {
    ctx.strokeStyle = '#303030';
    engraving(ctx, seeded(62), 90);
    woodGrain(ctx, () => woodZones(ctx), seeded(63));
  }, { background: '#b0b0b0' });

  const skin = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.1, map: color, metalness: 1, metalnessMap: metalness, roughness: 1, roughnessMap: rough, bumpMap: bump, bumpScale: 1.3 });
  const brass = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.2, color: 0xc9a044, metalness: 1, roughness: 0.3 });
  const copper = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.1, color: 0xb86a3c, metalness: 1, roughness: 0.32 });
  const steel = new THREE.MeshStandardMaterial({ envMap: env, color: 0x8a8f96, metalness: 1, roughness: 0.25 });
  const walnut = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.4, color: 0x4a2a14, metalness: 0, roughness: 0.55 });
  return {
    receiver: [skin, brass],
    dustCover: [skin, brass],
    magwell: [skin, brass],
    gasBlock: [skin, brass],
    muzzle: [skin, brass],
    stock: [skin, walnut],
    buttPad: [walnut, walnut],
    grip: [skin, new THREE.MeshStandardMaterial({ color: 0x3b2215, roughness: 0.7 })],
    handguard: [skin, walnut],
    upperGuard: [skin, brass],
    magazine: [skin, copper],
    metal: brass,
    barrel: steel,
    dark: new THREE.MeshStandardMaterial({ color: 0x120c06, roughness: 0.8 }),
    sight: new THREE.MeshBasicMaterial({ color: 0xffd98a }),
    brass,
    flash: 'gold',
    light: 0xffc06a,
    smoke: 0xf4efe6,
    glow: [],
    decorate: (ctx) => decorateClockwork({ ...ctx, geo, brass, copper, steel, env }),
  };
}

function gaugeTexture() {
  return tiledTexture('clock-gauge', 256, (ctx, size) => {
    const c = size / 2;
    ctx.fillStyle = '#f3ead2';
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a1c0c';
    ctx.fillStyle = '#2a1c0c';
    for (let i = 0; i <= 20; i += 1) {
      const a = Math.PI * 0.75 + (i / 20) * Math.PI * 1.5;
      const inner = i % 5 === 0 ? c * 0.68 : c * 0.78;
      ctx.lineWidth = i % 5 === 0 ? 5 : 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
      ctx.lineTo(c + Math.cos(a) * c * 0.88, c + Math.sin(a) * c * 0.88);
      ctx.stroke();
      if (i % 5 === 0) {
        ctx.font = 'bold 26px Georgia';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i / 5), c + Math.cos(a) * c * 0.5, c + Math.sin(a) * c * 0.5);
      }
    }
    // Zone rouge.
    ctx.strokeStyle = '#b3261e';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(c, c, c * 0.83, Math.PI * 1.95, Math.PI * 2.25);
    ctx.stroke();
  }, { color: true });
}

function decorateClockwork({ body, add, scene, parts, geo, brass, copper, steel, env }) {
  const gears = [];
  const gear = (radius, teeth, x, y, z, speed, material, thickness = 3) => {
    const mesh = new THREE.Mesh(extrude(gearShape(radius, teeth), thickness, 0.4, { curveSegments: 6 }), material);
    mesh.position.set(x, y, z);
    body.add(mesh);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, thickness + 2, 16), steel);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(x, y, z);
    body.add(hub);
    gears.push({ mesh, speed });
    return mesh;
  };

  // Trains d'engrenages sur les deux flancs de la carcasse (vitesses inverses et
  // proportionnelles aux rayons : ils « engrènent » vraiment).
  [-1, 1].forEach((side) => {
    const z = side * 18.2;
    gear(17, 16, 292, -2, z, 1 * side, brass);
    gear(10, 10, 292 + 25, -2 + 6, z, (-17 / 10) * side, copper);
    gear(13, 12, 292 + 25 + 21, -2 - 6, z, (17 / 13) * side, brass);
    gear(6, 8, 250, 10, z, 2.4 * side, steel);
  });
  // Le rail de lunette du flanc gauche laisse la place aux engrenages.
  [parts.rail, ...(parts.railGrooves ?? [])].forEach((mesh) => {
    if (mesh) mesh.visible = false;
  });

  // Grand train dans l'évidement de la crosse.
  gear(26, 24, 96, -30, 0, 0.6, brass, 6);
  gear(13, 12, 96 + 36, -30 + 11, 0, -1.2, copper, 6);
  gear(9, 9, 96 - 22, -30 + 26, 0, -1.8, steel, 6);

  // Manomètre sur le flanc gauche (côté visible en vue joueur).
  const gauge = new THREE.Group();
  gauge.position.set(470, 2, -21);
  body.add(gauge);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(14, 2.4, 10, 32), brass);
  gauge.add(bezel);
  const face = new THREE.Mesh(new THREE.CircleGeometry(13, 32), new THREE.MeshStandardMaterial({ map: gaugeTexture(), roughness: 0.6 }));
  face.rotation.y = Math.PI;
  face.position.z = 0.5;
  gauge.add(face);
  const needlePivot = new THREE.Group();
  needlePivot.position.z = -0.6;
  gauge.add(needlePivot);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(1.2, 10, 0.6), new THREE.MeshStandardMaterial({ color: 0xb3261e }));
  needle.position.y = 5;
  needlePivot.add(needle);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(13.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0.02, clearcoat: 1, depthWrite: false }));
  dome.rotation.x = -Math.PI / 2;
  dome.scale.z = 0.25;
  gauge.add(dome);
  add(new THREE.CylinderGeometry(3, 3, 8, 12), brass, 470, 2, -17).rotation.x = Math.PI / 2;

  // Pistons verticaux sur le garde-main.
  const pistons = [566, 626].map((x, i) => {
    add(new THREE.CylinderGeometry(7, 7, 18, 16), copper, x, 44, 0);
    add(new THREE.TorusGeometry(7.2, 1, 6, 20), brass, x, 52, 0).rotation.x = Math.PI / 2;
    const rod = add(new THREE.CylinderGeometry(2.6, 2.6, 22, 12), steel, x, 58, 0);
    const cap = add(new THREE.CylinderGeometry(5, 5, 3, 16), brass, x, 68, 0);
    return { rod, cap, phase: i * Math.PI };
  });

  // Fiole d'éther lumineux (flanc gauche du garde-main) et ses bulles.
  const vialZ = -30;
  add(new THREE.CylinderGeometry(8, 8, 120, 20, 1, true), new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xffffff, transparent: true, opacity: 0.2, roughness: 0.02, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }), 610, -4, vialZ).rotation.z = Math.PI / 2;
  const ether = add(new THREE.CylinderGeometry(6.4, 6.4, 116, 16), new THREE.MeshBasicMaterial({ color: 0xffb347 }), 610, -4, vialZ);
  ether.rotation.z = Math.PI / 2;
  [548, 672].forEach((x) => {
    add(new THREE.CylinderGeometry(9.5, 9.5, 8, 20), brass, x, -4, vialZ).rotation.z = Math.PI / 2;
  });
  const etherLight = new THREE.PointLight(0xffa640, 0.35, 0.2, 2);
  etherLight.position.set(610, -4, vialZ - 8);
  body.add(etherLight);

  // Cheminée de vapeur à l'arrière du garde-main.
  add(new THREE.CylinderGeometry(4.5, 5.5, 26, 14), copper, 690, 46, 8);
  add(new THREE.TorusGeometry(5, 1.2, 6, 16), brass, 690, 59, 8).rotation.x = Math.PI / 2;

  // Bouche en pavillon de cuivre, cerclée de laiton.
  parts.muzzle.visible = false;
  const bell = add(
    new THREE.LatheGeometry([[9, 0], [10, 20], [12, 40], [16, 54], [24, 64], [25, 66], [22, 66], [14, 56], [8, 40]].map(([r, h]) => new THREE.Vector2(r, h)), 32),
    copper,
    836,
    2,
    0,
  );
  bell.rotation.z = -Math.PI / 2;
  [846, 866].forEach((x) => {
    add(new THREE.TorusGeometry(x === 846 ? 10.5 : 12.5, 1.4, 8, 24), brass, x, 2, 0).rotation.y = Math.PI / 2;
  });

  // Rivets en relief tout le long du garde-main et de la crosse.
  const rivet = new THREE.SphereGeometry(1.8, 10, 8);
  [-1, 1].forEach((side) => {
    for (let x = 512; x <= 704; x += 16) {
      add(rivet, brass, x, 14, side * 24.6);
      add(rivet, brass, x, -24, side * 24.6);
    }
  });

  const steamTex = softDotTexture('clock-steam', 'rgba(245,240,230,0.85)', 'rgba(245,240,230,0)');
  const steam = particleSystem(scene, steamTex, { max: 50 });
  const bubbles = particleSystem(scene, softDotTexture('ember', 'rgba(255,230,170,1)', 'rgba(255,90,10,0)'), { max: 40 });
  const chimney = new THREE.Object3D();
  chimney.position.set(690, 62, 8);
  body.add(chimney);
  const bubbleSpot = new THREE.Object3D();
  body.add(bubbleSpot);
  const tmp = new THREE.Vector3();
  const pressure = { x: 0, v: 0 };
  const pump = { x: 0, v: 0 };
  let spinBoost = 0;
  let steamClock = 0;
  let bubbleClock = 0;
  let time = 0;

  const puff = (count, strength) => {
    chimney.getWorldPosition(tmp);
    for (let i = 0; i < count; i += 1) {
      steam.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.02, 0.05 + Math.random() * 0.04 * strength, (Math.random() - 0.5) * 0.02), {
        life: 1300,
        size: 0.008,
        grow: 4,
        drag: 0.8,
        additive: false,
        peak: 0.45,
      });
    }
  };

  return {
    muzzleX: 904,
    update: (dt, t, flare) => {
      time += dt;
      spinBoost = Math.max(0, spinBoost - dt * 2.5);
      gears.forEach((g) => {
        g.mesh.rotation.z += g.speed * dt * (0.6 + spinBoost * 6);
      });
      springStep(pressure, 0, 12, dt);
      springStep(pump, 0, 90, dt);
      // Aiguille : légère vibration au repos, bond vers la zone rouge au tir.
      needlePivot.rotation.z = 2.2 - Math.min(1, Math.max(0, pressure.x)) * 3.4 + Math.sin(time * 23) * 0.015;
      pistons.forEach(({ rod, cap, phase }) => {
        const stroke = Math.sin(time * 3 + phase) * 1.5 - Math.max(0, pump.x) * 9;
        rod.position.y = 58 + stroke;
        cap.position.y = 68 + stroke;
      });
      ether.material.color.setHSL(0.09, 1, 0.6 + 0.08 * Math.sin(time * 2) + flare * 0.2);
      etherLight.intensity = 0.3 + flare * 0.8;

      steamClock += dt;
      if (steamClock > 0.9) {
        steamClock = 0;
        puff(2, 1);
      }
      bubbleClock += dt;
      while (bubbleClock > 0.12) {
        bubbleClock -= 0.12;
        bubbleSpot.position.set(560 + Math.random() * 100, -9, -30);
        bubbleSpot.getWorldPosition(tmp);
        bubbles.spawn(tmp, new THREE.Vector3(0, 0.02, 0), { life: 350, size: 0.0018, drag: 0 });
      }
      steam.update(dt);
      bubbles.update(dt);
    },
    onFire: () => {
      spinBoost = 1;
      pressure.v += 5;
      pump.v += 12;
      puff(3, 2);
    },
  };
}

export const VANDAL_PREMIUM_SKINS = {
  jade: { labelKey: 'aimTrainer.skinJade', build: jadeFinish },
  clockwork: { labelKey: 'aimTrainer.skinClockwork', build: clockworkFinish },
};
