import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { seeded, drawnTexture, tiledTexture, speckle, animateEmissive, particleSystem, softDotTexture, roundedShape, extrude, extrudeAlongX, ribbonShape, springStep } from './weaponKit.js';

// Skins de la Vandal. Chaque skin peint une « livrée » unique : une grande toile
// qui couvre toute l'arme vue de profil, en millimètres. Comme les faces planes
// de toutes les pièces extrudées ont des UV en millimètres dans le même repère,
// une seule toile habille l'arme entière d'un seul tenant, sans raccord.
//
// `geo` (fourni par vandalModel.js) : contours des pièces utiles au dessin
// (crosse, garde-main, chargeur) et points d'ancrage.

export const LIVERY = { minX: -16, maxX: 906, minY: -222, maxY: 74 };
const LIVERY_PX = 3;

export function livery(key, draw, { background = '#ffffff', color = false } = {}) {
  return drawnTexture(key, LIVERY, LIVERY_PX, draw, { background, color });
}

export function tracePolygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

export function strokeLine(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
}

// Contour du chargeur courbé, échantillonné (même épaisseur que le modèle).
export function magazineOutline(curve) {
  const left = [];
  const right = [];
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const w = (64 - 6 * t) / 2;
    left.push([p.x - tan.y * w, p.y + tan.x * w]);
    right.push([p.x + tan.y * w, p.y - tan.x * w]);
  }
  return [...left, ...right.reverse()];
}

// =============================================================================
// MAGMA — obsidienne fissurée parcourue de lave. Les fissures sont une seule
// carte de lumière animée dans le shader (la lave « coule » le long de l'arme),
// le canon rougeoie à travers les lumières du garde-main, une poche de lave
// remplit l'évidement de la crosse, le frein de bouche devient une griffe
// d'obsidienne, et l'arme laisse échapper des braises (en rafale au tir).
// =============================================================================

function crackNetwork(seed) {
  const rand = seeded(seed);
  const lines = [];
  const grow = (x0, y0, angle, steps, width, depth) => {
    let x = x0;
    let y = y0;
    let a = angle;
    const pts = [[x, y]];
    for (let i = 0; i < steps; i += 1) {
      a += (rand() - 0.5) * 0.85;
      const step = 3 + rand() * 3;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      pts.push([x, y]);
      if (depth < 3 && rand() < 0.1) {
        grow(x, y, a + (rand() < 0.5 ? 1 : -1) * (0.5 + rand() * 0.7), Math.floor(steps * 0.55), width * 0.62, depth + 1);
      }
    }
    lines.push({ pts, width });
  };
  // Grandes fissures qui courent le long de l'arme, puis une multitude de petites.
  for (let i = 0; i < 7; i += 1) {
    grow(LIVERY.minX + i * 130 + rand() * 60, -100 + rand() * 130, (rand() - 0.5) * 0.6 + (rand() < 0.5 ? 0 : Math.PI), 35 + Math.floor(rand() * 30), 2.2 + rand() * 1.2, 1);
  }
  for (let i = 0; i < 22; i += 1) {
    grow(LIVERY.minX + rand() * 920, LIVERY.minY + rand() * 290, rand() * Math.PI * 2, 5 + Math.floor(rand() * 10), 0.8 + rand() * 0.7, 2);
  }
  return lines;
}

function rockFacets(ctx, rand, palette, count) {
  for (let i = 0; i < count; i += 1) {
    const cx = LIVERY.minX + rand() * 922;
    const cy = LIVERY.minY + rand() * 296;
    const r = 2 + rand() * 9;
    ctx.fillStyle = palette[Math.floor(rand() * palette.length)];
    ctx.beginPath();
    const sides = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < sides; k += 1) {
      const a = (k / sides) * Math.PI * 2 + rand() * 0.8;
      const rr = r * (0.6 + rand() * 0.5);
      if (k === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
}

function magmaFinish(env, geo) {
  const cracks = crackNetwork(7);
  const uniforms = geo.uniforms;

  const color = livery(
    'magma-color',
    (ctx) => {
      rockFacets(ctx, seeded(3), ['#1a1514', '#211a18', '#0c0a09', '#2a211e', '#161211'], 5200);
      speckle(ctx, LIVERY, 26000, ['#2f2724', '#080606', '#3a2c26'], 0.45, seeded(4));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Bords calcinés des fissures, puis leur fond (la lueur vient de la carte de lumière).
      cracks.forEach(({ pts, width }) => {
        ctx.strokeStyle = 'rgba(58,14,4,0.85)';
        ctx.lineWidth = width * 3;
        strokeLine(ctx, pts);
      });
      cracks.forEach(({ pts, width }) => {
        ctx.strokeStyle = '#a3310b';
        ctx.lineWidth = width * 1.1;
        strokeLine(ctx, pts);
      });
    },
    { background: '#120e0d', color: true },
  );

  const glow = livery(
    'magma-glow',
    (ctx) => {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      cracks.forEach(({ pts, width }) => {
        ctx.shadowColor = 'rgba(255,50,0,0.8)';
        ctx.shadowBlur = 5;
        ctx.strokeStyle = 'rgba(230,50,8,0.85)';
        ctx.lineWidth = width * 1.3;
        strokeLine(ctx, pts);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,160,40,1)';
        ctx.lineWidth = width * 0.6;
        strokeLine(ctx, pts);
        ctx.strokeStyle = 'rgba(255,244,196,1)';
        ctx.lineWidth = width * 0.28;
        strokeLine(ctx, pts);
      });
      // Chaleur qui remonte du canon : halo autour des lumières et de la bouche.
      [[610, -6, 90], [880, 0, 45], [470, 10, 30]].forEach(([x, y, r]) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,60,8,0.18)');
        g.addColorStop(1, 'rgba(255,70,10,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      });
    },
    { background: '#000000', color: true },
  );

  const bump = livery('magma-bump', (ctx) => {
    rockFacets(ctx, seeded(3), ['#9a9a9a', '#cfcfcf', '#7c7c7c', '#e6e6e6', '#b0b0b0'], 5200);
    speckle(ctx, LIVERY, 20000, ['#6a6a6a', '#dadada'], 0.45, seeded(5));
    ctx.lineCap = 'round';
    cracks.forEach(({ pts, width }) => {
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = width * 1.5;
      strokeLine(ctx, pts);
    });
  });

  const rough = livery('magma-rough', (ctx) => {
    speckle(ctx, LIVERY, 12000, ['#b8b8b8', '#e8e8e8'], 1, seeded(6));
    ctx.lineCap = 'round';
    cracks.forEach(({ pts, width }) => {
      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = width * 1.4;
      strokeLine(ctx, pts);
    });
  });

  // La lave « coule » : une onde lente parcourt les fissures, plus un sursaut au tir.
  const lavaFlow = `
    float flowA = sin(vEmissiveMapUv.x * 26.0 - uTime * 1.1 + vEmissiveMapUv.y * 9.0);
    float flowB = sin(vEmissiveMapUv.x * 61.0 + uTime * 0.7 - vEmissiveMapUv.y * 23.0);
    totalEmissiveRadiance *= 0.62 + 0.3 * flowA + 0.14 * flowB + uFlare * 1.6;
  `;
  const rock = animateEmissive(
    new THREE.MeshStandardMaterial({
      envMap: env,
      envMapIntensity: 0.55,
      map: color,
      emissive: 0xffffff,
      emissiveMap: glow,
      emissiveIntensity: 1.7,
      metalness: 0.15,
      roughness: 1,
      roughnessMap: rough,
      bumpMap: bump,
      bumpScale: 1.6,
    }),
    uniforms,
    lavaFlow,
  );
  const wallRough = tiledTexture('magma-wall', 256, (ctx, size) => {
    ctx.fillStyle = '#b5b5b5';
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, { minX: 0, maxX: size, minY: 0, maxY: size }, 7000, ['#707070', '#e0e0e0'], 1.4, seeded(8));
  }, { repeat: 0.03 });
  const rockWall = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.5, color: 0x17110f, metalness: 0.15, roughness: 1, roughnessMap: wallRough });

  // Métal forgé noirci, reflets cuivrés.
  const iron = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.8, color: 0x3b2a22, metalness: 0.85, roughness: 0.42 });
  // Canon chauffé au rouge : visible à travers les lumières du garde-main.
  const molten = animateEmissive(
    new THREE.MeshStandardMaterial({
      color: 0x2a0c04,
      emissive: 0xff4a10,
      emissiveMap: livery('magma-barrel', (ctx) => {
        const g = ctx.createLinearGradient(480, 0, 900, 0);
        g.addColorStop(0, '#ff5a12');
        g.addColorStop(1, '#ffb040');
        ctx.fillStyle = g;
        ctx.fillRect(LIVERY.minX, LIVERY.minY, 922, 296);
      }, { color: true }),
      emissiveIntensity: 1.8,
      roughness: 0.5,
    }),
    uniforms,
    'totalEmissiveRadiance *= 0.75 + 0.25 * sin(uTime * 2.3) + uFlare * 1.2;',
  );
  const glowSight = new THREE.MeshBasicMaterial({ color: 0xffa040 });

  const pair = [rock, rockWall];
  return {
    receiver: pair,
    dustCover: pair,
    magwell: pair,
    gasBlock: pair,
    muzzle: pair,
    stock: pair,
    buttPad: [rockWall, rockWall],
    grip: pair,
    handguard: pair,
    upperGuard: pair,
    magazine: pair,
    metal: iron,
    barrel: molten,
    dark: new THREE.MeshStandardMaterial({ color: 0x0a0605, roughness: 0.9 }),
    sight: glowSight,
    brass: iron,
    flash: 'ember',
    light: 0xff5a1a,
    smoke: 0x6b5a54,
    hotShells: true,
    glow: [],
    decorate: (ctx) => decorateMagmaPlus({ ...ctx, geo, rock, rockWall, molten, uniforms }),
  };
}

function shard(radius, height, material) {
  const geometry = new THREE.ConeGeometry(radius, height, 4, 1);
  geometry.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geometry, material);
  return mesh;
}

function decorateMagma({ body, add, scene, geo, rock, rockWall, molten, uniforms }) {
  const obsidian = new THREE.MeshStandardMaterial({ color: 0x050404, metalness: 0.2, roughness: 0.22, flatShading: true });
  obsidian.envMap = rock.envMap;
  obsidian.envMapIntensity = 0.45;
  // Gaine de fer noirci sur la partie du canon hors du garde-main : seul le cœur
  // visible par les lumières reste chauffé au rouge.
  const sleeve = add(new THREE.CylinderGeometry(9.6, 9.6, 84, 24), rockWall, 794, 0, 0);
  sleeve.rotation.z = Math.PI / 2;

  // Griffe d'obsidienne autour du frein de bouche : cinq éclats inclinés vers l'avant.
  const claw = new THREE.Group();
  claw.position.set(896, 0, 0);
  body.add(claw);
  [0, 1, 2, 3, 4].forEach((i) => {
    const angle = (i / 5) * Math.PI * 2 + 0.3;
    const piece = shard(7, 26 + (i % 2) * 10, obsidian);
    const holder = new THREE.Group();
    holder.rotation.x = angle;
    piece.position.set(0, 17, 0);
    piece.rotation.z = -0.75;
    holder.add(piece);
    claw.add(holder);
  });
  // Éclats le long du dos de la crosse et sur le couvercle.
  [[70, 26, 0.9, 20], [110, 25, 0.95, 16], [148, 23, 1.0, 13], [300, 35, 1.15, 10], [330, 34, 1.2, 8]].forEach(([x, y, tilt, h]) => {
    const piece = shard(4.5, h, obsidian);
    piece.position.set(x, y, 0);
    piece.rotation.z = tilt;
    body.add(piece);
  });

  // Poche de lave dans l'évidement de la crosse, avec sa croûte qui dérive.
  const poolTexture = livery('magma-pool', (ctx) => {
    // Croûte refroidie en plaques serrées : seuls les joints laissent voir la lave.
    const rand = seeded(12);
    const cell = 9;
    for (let gx = 30; gx < 215; gx += cell) {
      for (let gy = -95; gy < 30; gy += cell) {
        const cx = gx + rand() * 3;
        const cy = gy + rand() * 3;
        const r = cell * (0.52 + rand() * 0.12);
        ctx.fillStyle = ['#1f0703', '#2d0b05', '#3a1208'][Math.floor(rand() * 3)];
        ctx.beginPath();
        for (let k = 0; k < 6; k += 1) {
          const a = (k / 6) * Math.PI * 2 + rand() * 0.4;
          const rr = r * (0.8 + rand() * 0.25);
          if (k === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
          else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
  }, { background: '#ff6a14', color: true });
  const lava = animateEmissive(
    new THREE.MeshStandardMaterial({ color: 0x1a0502, emissive: 0xffffff, emissiveMap: poolTexture, emissiveIntensity: 1.6, roughness: 0.4, side: THREE.DoubleSide }),
    uniforms,
    `
      vec2 drift = vEmissiveMapUv + vec2(uTime * 0.004, sin(uTime * 0.6) * 0.002);
      totalEmissiveRadiance = texture2D(emissiveMap, drift).rgb * emissive * (0.85 + 0.15 * sin(uTime * 3.0) + uFlare);
    `,
  );
  const pool = new THREE.Mesh(new THREE.ShapeGeometry(roundedShape(geo.stockHole), 12), lava);
  body.add(pool);
  const poolLight = new THREE.PointLight(0xff5a14, 0.4, 0.25, 2);
  poolLight.position.set(115, -25, 0);
  body.add(poolLight);

  // Braises : un filet continu par les lumières du garde-main, une gerbe au tir.
  const embers = particleSystem(scene, softDotTexture('ember', 'rgba(255,230,170,1)', 'rgba(255,90,10,0)'), { max: 220 });
  const emitters = [560, 600, 640, 680].map((x) => {
    const o = new THREE.Object3D();
    o.position.set(x, -4, 23);
    body.add(o);
    return o;
  });
  const muzzle = new THREE.Object3D();
  muzzle.position.set(905, 4, 0);
  body.add(muzzle);
  const tmp = new THREE.Vector3();
  let idle = 0;

  return {
    update: (dt) => {
      idle += dt;
      while (idle > 0.09) {
        idle -= 0.09;
        emitters[Math.floor(Math.random() * emitters.length)].getWorldPosition(tmp);
        embers.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.03, 0.05 + Math.random() * 0.06, (Math.random() - 0.5) * 0.03), {
          life: 900 + Math.random() * 700,
          size: 0.0022 + Math.random() * 0.002,
          drag: 0.4,
          gravity: 0.02,
        });
      }
      embers.update(dt);
    },
    onFire: () => {
      muzzle.getWorldPosition(tmp);
      for (let i = 0; i < 14; i += 1) {
        const v = new THREE.Vector3((Math.random() - 0.5) * 1.4, Math.random() * 1.2, (Math.random() - 0.5) * 1.4);
        embers.spawn(tmp, v, { life: 380 + Math.random() * 420, size: 0.003 + Math.random() * 0.003, drag: 2.2, gravity: -1.4 });
      }
    },
  };
}

// =============================================================================
// CIRCUIT — céramique blanche et graphite, circuits imprimés gravés où courent
// des impulsions de données (animées dans le shader), anneaux holographiques
// devant la bouche, cristal d'énergie qui flotte dans l'évidement de la crosse,
// liserés néon, et un compteur de munitions holographique sur le flanc gauche
// qui décompte à chaque tir.
// =============================================================================

function circuitPaths(seed, count) {
  const rand = seeded(seed);
  const paths = [];
  const dirs = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]);
  for (let i = 0; i < count; i += 1) {
    let x = Math.round((LIVERY.minX + rand() * 920) / 2) * 2;
    let y = Math.round((LIVERY.minY + rand() * 290) / 2) * 2;
    let d = rand() < 0.7 ? (rand() < 0.5 ? 0 : 4) : Math.floor(rand() * 8);
    const pts = [[x, y]];
    const segments = 2 + Math.floor(rand() * 4);
    for (let s = 0; s < segments; s += 1) {
      const len = 6 + rand() * 28;
      x += dirs[d][0] * len;
      y += dirs[d][1] * len;
      pts.push([x, y]);
      d = (d + (rand() < 0.5 ? 1 : 7)) % 8;
      if (d % 2 === 1 && rand() < 0.5) d = (d + (rand() < 0.5 ? 1 : 7)) % 8;
    }
    paths.push({ pts, width: rand() < 0.2 ? 1.1 : 0.55 });
  }
  return paths;
}

function circuitFinish(env, geo) {
  const uniforms = geo.uniforms;
  const paths = circuitPaths(17, 260);
  const WHITE = '#dfe3ea';
  const GRAPHITE = '#1a1f27';
  const whiteZones = (ctx) => {
    ctx.fillStyle = WHITE;
    tracePolygon(ctx, geo.stockOutline);
    ctx.fill();
    tracePolygon(ctx, geo.handguardOutline);
    ctx.fill();
    // Bandeau blanc sur le couvercle et le haut de la carcasse.
    ctx.fillRect(236, 20, 262, 20);
  };

  const color = livery(
    'circuit-color',
    (ctx) => {
      whiteZones(ctx);
      // Évidement de la crosse cerclé de graphite.
      ctx.strokeStyle = GRAPHITE;
      ctx.lineWidth = 7;
      tracePolygon(ctx, geo.stockHole);
      ctx.stroke();
      // Lignes de panneaux (joints entre plaques).
      ctx.strokeStyle = 'rgba(20,24,30,0.55)';
      ctx.lineWidth = 0.7;
      [[40, 28, 40, -80], [190, 22, 190, -40], [560, 20, 560, -30], [650, 20, 650, -30], [300, 22, 300, -26], [420, 22, 420, -26]].forEach(([x1, y1, x2, y2]) => strokeLine(ctx, [[x1, y1], [x2, y2]]));
      // Chevrons graphite sur la crosse.
      ctx.fillStyle = GRAPHITE;
      [0, 1, 2].forEach((i) => {
        const x = 150 + i * 14;
        tracePolygon(ctx, [[x, 0], [x + 6, 0], [x + 14, -10], [x + 6, -20], [x, -20], [x + 8, -10]]);
        ctx.fill();
      });
      // Circuits gravés (plus sombres sur le blanc, plus clairs sur le graphite).
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      paths.forEach(({ pts, width }) => {
        ctx.strokeStyle = 'rgba(70,86,104,0.9)';
        ctx.lineWidth = width + 0.6;
        strokeLine(ctx, pts);
        const [ex, ey] = pts[pts.length - 1];
        ctx.fillStyle = 'rgba(70,86,104,0.9)';
        ctx.beginPath();
        ctx.arc(ex, ey, 1.6, 0, Math.PI * 2);
        ctx.fill();
      });
      speckle(ctx, LIVERY, 12000, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.05)'], 0.5, seeded(18));
    },
    { background: GRAPHITE, color: true },
  );

  const glow = livery(
    'circuit-glow',
    (ctx) => {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      paths.forEach(({ pts, width }, i) => {
        // Une piste sur trois seulement est « sous tension ».
        if (i % 3 !== 0) return;
        ctx.shadowColor = 'rgba(80,240,255,0.9)';
        ctx.shadowBlur = 6;
        ctx.strokeStyle = 'rgba(110,248,255,1)';
        ctx.lineWidth = width * 0.8;
        strokeLine(ctx, pts);
        const [ex, ey] = pts[pts.length - 1];
        ctx.fillStyle = 'rgba(200,255,255,1)';
        ctx.beginPath();
        ctx.arc(ex, ey, 1.2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.shadowBlur = 0;
      // Liseré lumineux au bord des zones blanches du garde-main.
      ctx.strokeStyle = 'rgba(95,247,255,0.9)';
      ctx.lineWidth = 0.9;
      tracePolygon(ctx, geo.handguardOutline);
      ctx.stroke();
      // Témoins magenta près du sélecteur.
      ctx.fillStyle = '#ff4fd8';
      [0, 1, 2].forEach((i) => ctx.fillRect(340 + i * 6, -14, 3.5, 2));
    },
    { background: '#000000', color: true },
  );

  const bump = livery('circuit-bump', (ctx) => {
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(LIVERY.minX, LIVERY.minY, 922, 296);
    ctx.fillStyle = '#ffffff';
    whiteZones(ctx);
    ctx.lineCap = 'round';
    paths.forEach(({ pts, width }) => {
      ctx.strokeStyle = '#6a6a6a';
      ctx.lineWidth = width + 0.5;
      strokeLine(ctx, pts);
    });
    ctx.strokeStyle = '#303030';
    ctx.lineWidth = 0.8;
    tracePolygon(ctx, geo.handguardOutline);
    ctx.stroke();
  });

  const rough = livery('circuit-rough', (ctx) => {
    // Céramique brillante, graphite satiné.
    ctx.fillStyle = '#4a4a4a';
    whiteZones(ctx);
  }, { background: '#8c8c8c' });

  const pulses = `
    float lane = floor(vEmissiveMapUv.y * 40.0);
    float p = fract(vEmissiveMapUv.x * 2.2 - uTime * (0.35 + fract(lane * 0.37) * 0.3) + lane * 0.21);
    float band = smoothstep(0.0, 0.015, p) * (1.0 - smoothstep(0.015, 0.09, p));
    totalEmissiveRadiance *= 0.45 + band * 3.2 + uFlare * 1.8;
  `;
  const shell = animateEmissive(
    new THREE.MeshPhysicalMaterial({
      envMap: env,
      envMapIntensity: 0.9,
      map: color,
      emissive: 0xffffff,
      emissiveMap: glow,
      emissiveIntensity: 1.6,
      metalness: 0.1,
      roughness: 1,
      roughnessMap: rough,
      clearcoat: 0.8,
      clearcoatRoughness: 0.12,
      bumpMap: bump,
      bumpScale: 0.9,
    }),
    uniforms,
    pulses,
  );
  const wall = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.6, color: 0x1a1f27, metalness: 0.3, roughness: 0.45 });
  const anodized = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.9, color: 0x1597b0, metalness: 0.85, roughness: 0.28 });
  const neon = new THREE.MeshBasicMaterial({ color: 0x5ff7ff });
  const pair = [shell, wall];

  return {
    receiver: pair,
    dustCover: pair,
    magwell: pair,
    gasBlock: pair,
    muzzle: pair,
    stock: pair,
    buttPad: [wall, wall],
    grip: pair,
    handguard: pair,
    upperGuard: pair,
    magazine: pair,
    metal: anodized,
    barrel: new THREE.MeshStandardMaterial({ envMap: env, color: 0x232a33, metalness: 1, roughness: 0.15, emissive: 0x0b5b66, emissiveIntensity: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.8 }),
    sight: neon,
    brass: anodized,
    flash: 'plasma',
    light: 0x5ff0ff,
    smoke: 0xaef9ff,
    glow: [{ material: neon, base: 1, kind: 'color', color: new THREE.Color(0x5ff7ff) }],
    makeShell: () => {
      const cell = new THREE.Group();
      cell.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0056, 0.0056, 0.03, 12), wall));
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 12), neon);
      cell.add(ring);
      return cell;
    },
    decorate: (ctx) => decorateCircuitPlus({ ...ctx, geo, neon, anodized, wall, env }),
  };
}

function ammoCounterTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const draw = (count, max) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 128);
    ctx.fillStyle = 'rgba(40,220,255,0.12)';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = 'rgba(110,248,255,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 248, 120);
    const low = count <= max * 0.2;
    ctx.fillStyle = low ? '#ff4fd8' : '#b8fbff';
    ctx.font = 'bold 72px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count).padStart(2, '0'), 18, 66);
    // Jauge : une barre par tranche de 3 balles.
    for (let i = 0; i < 10; i += 1) {
      ctx.fillStyle = i < Math.ceil((count / max) * 10) ? (low ? '#ff4fd8' : '#5ff7ff') : 'rgba(95,247,255,0.18)';
      ctx.fillRect(130 + (i % 5) * 23, i < 5 ? 34 : 70, 17, 24);
    }
    texture.needsUpdate = true;
  };
  return { texture, draw };
}

function decorateCircuit({ body, add, scene, geo, neon, anodized, wall }) {
  // Anneaux holographiques devant la bouche.
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x5ff7ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const rings = [0, 1, 2].map((i) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(9 + i * 3, 10.2 + i * 3, 6 - (i % 2), 1), ringMaterial.clone());
    ring.rotation.y = Math.PI / 2;
    ring.position.set(918 + i * 13, 4, 0);
    body.add(ring);
    return ring;
  });

  // Cristal d'énergie en lévitation dans l'évidement de la crosse.
  const coreMaterial = new THREE.MeshPhysicalMaterial({ color: 0x9ff6ff, emissive: 0x2ad8f0, emissiveIntensity: 1.4, metalness: 0, roughness: 0.05, transmission: 0.3, thickness: 4, clearcoat: 1 });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(19, 0), coreMaterial);
  core.scale.set(1.25, 0.8, 0.8);
  core.position.set(98, -22, 0);
  body.add(core);
  const coreLight = new THREE.PointLight(0x5ff7ff, 0.5, 0.22, 2);
  coreLight.position.copy(core.position);
  body.add(coreLight);
  // Supports du cristal (deux fins bras anodisés).
  [[-1, 58, 4], [1, 140, -4]].forEach(([, x, y]) => {
    const arm = add(new RoundedBoxGeometry(34, 2.2, 2.2, 1, 0.8), anodized, x + (x < 100 ? 14 : -14), y - 22, 0);
    arm.rotation.z = x < 100 ? -0.35 : 0.3;
  });

  // Liserés néon : bas du garde-main, dos du couvercle, avant du chargeur.
  [-1, 1].forEach((side) => {
    add(new RoundedBoxGeometry(170, 1.2, 0.8, 1, 0.3), neon, 606, -24, side * 22.6);
    add(new RoundedBoxGeometry(200, 1, 0.8, 1, 0.3), neon, 370, 19.6, side * 15.3);
  });

  // Compteur de munitions holographique, flanc gauche (celui que voit le joueur).
  const MAX = 30;
  let ammo = MAX;
  const counter = ammoCounterTexture();
  counter.draw(ammo, MAX);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(52, 26),
    new THREE.MeshBasicMaterial({ map: counter.texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  screen.position.set(456, 2, -(geo.receiverWidth / 2 + 2.5));
  screen.rotation.y = Math.PI;
  body.add(screen);

  let spin = 0;
  let time = 0;
  let burst = 0;
  return {
    update: (dt) => {
      time += dt;
      spin += dt;
      burst = Math.max(0, burst - dt * 3);
      rings.forEach((ring, i) => {
        ring.rotation.x = spin * (0.8 + i * 0.5) * (i % 2 ? -1 : 1);
        const s = 1 + burst * (0.6 + i * 0.4);
        ring.scale.set(s, s, 1);
        ring.material.opacity = 0.5 + 0.25 * Math.sin(time * 3 + i) + burst * 0.5;
      });
      core.rotation.y += dt * 1.2;
      core.rotation.x = Math.sin(time * 0.9) * 0.3;
      core.position.y = -22 + Math.sin(time * 1.8) * 2.5;
      coreMaterial.emissiveIntensity = 1.2 + Math.sin(time * 2.6) * 0.3 + burst * 2;
      coreLight.intensity = 0.4 + burst * 1.2;
      screen.material.opacity = 0.85 + Math.sin(time * 14) * 0.05;
    },
    onFire: () => {
      burst = 1;
      ammo = ammo <= 1 ? MAX : ammo - 1;
      counter.draw(ammo, MAX);
    },
    getAmmo: () => ammo,
    maxAmmo: MAX,
  };
}


// =============================================================================
// Outils de volume partagés par les skins
// =============================================================================

// Bloc de roche irrégulier : dodécaèdre dont chaque sommet est déplacé selon sa
// position (les sommets partagés par plusieurs faces bougent ensemble : le bloc
// reste fermé, sans trou).
function rockGeometry(radius, seed) {
  const geometry = new THREE.DodecahedronGeometry(radius, 0);
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    const h = Math.sin((v.x * 12.9898 + v.y * 78.233 + v.z * 37.719) / radius + seed) * 43758.5453;
    v.multiplyScalar(0.72 + (h - Math.floor(h)) * 0.5);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Place un objet le long du chargeur courbé : t ∈ [0, 1] le long de la courbe,
// `across` en travers (mm), `side` sur le flanc (z).
export function alongMagazine(curve, t, across, z) {
  const p = curve.getPoint(t);
  const tan = curve.getTangent(t);
  return {
    position: new THREE.Vector3(p.x - tan.y * across, p.y + tan.x * across, z),
    angle: Math.atan2(tan.y, tan.x),
  };
}

export function ringTexture(key, color) {
  return tiledTexture(
    `ring-${key}`,
    256,
    (ctx, size) => {
      const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.55, color);
      g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    },
    { color: true },
  );
}

// =============================================================================
// MAGMA+ — l'arme devient une roche en fusion : blocs de basalte soudés au
// garde-main et à la crosse, colonnes de basalte sur le chargeur, bouche en
// cratère fumant, gouttes de lave qui se forment et tombent sous l'arme, bulles
// dans la poche de lave de la crosse.
// =============================================================================

function decorateMagmaPlus(args) {
  const { body, add, scene, parts, geo, uniforms } = args;
  const base = decorateMagma(args);

  const chunkGlow = tiledTexture(
    'magma-chunk-glow',
    256,
    (ctx, size) => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, size, size);
      const rand = seeded(44);
      ctx.lineCap = 'round';
      for (let i = 0; i < 14; i += 1) {
        let x = rand() * size;
        let y = rand() * size;
        let a = rand() * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 9; s += 1) {
          a += (rand() - 0.5) * 1.1;
          x += Math.cos(a) * 9;
          y += Math.sin(a) * 9;
          ctx.lineTo(x, y);
        }
        ctx.shadowColor = '#ff3a00';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = 'rgba(255,90,20,0.95)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,220,140,1)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    },
    { color: true },
  );
  const basalt = animateEmissive(
    new THREE.MeshStandardMaterial({
      envMap: args.rock.envMap,
      envMapIntensity: 0.5,
      color: 0x2a211d,
      metalness: 0.2,
      roughness: 0.62,
      flatShading: true,
      emissive: 0xffffff,
      emissiveMap: chunkGlow,
      emissiveIntensity: 1.5,
    }),
    uniforms,
    'totalEmissiveRadiance *= 0.6 + 0.35 * sin(uTime * 1.4 + vEmissiveMapUv.x * 9.0) + uFlare * 1.6;',
  );

  // Blocs de roche soudés sur l'arme (garde-main, crosse, carcasse).
  const chunks = [
    [522, 18, 22, 10], [562, 20, -23, 9], [604, 19, 23, 11], [646, 20, -22, 9], [688, 16, 22, 10],
    [522, 18, -22, 8], [606, 19, -23, 10], [690, 15, -21, 11],
    [708, -20, 18, 11], [704, -24, -18, 10], [690, -30, 0, 12],
    [22, 24, 0, 13], [58, -86, 15, 10], [64, -90, -14, 11], [112, -62, 16, 9], [116, -64, -15, 8], [156, -44, 14, 8],
    [238, -22, 14, 8], [244, -20, -14, 9],
    // Crête de roche sur le couvercle : la zone la plus visible en vue joueur.
    [292, 36, -4, 7], [338, 38, 5, 8], [384, 37, -6, 7], [428, 36, 4, 6], [466, 35, -3, 5],
  ];
  chunks.forEach(([x, y, z, r], i) => {
    const mesh = new THREE.Mesh(rockGeometry(r * 1.9, i * 3.7), basalt);
    mesh.position.set(x, y, z);
    mesh.rotation.set(i * 0.7, i * 1.3, i * 0.4);
    body.add(mesh);
  });

  // Colonnes de basalte hexagonales, couchées le long des flancs du chargeur.
  const curve = geo.magazineCurve;
  [[0.3, -12, 30], [0.52, 8, 38], [0.74, -6, 26], [0.88, 12, 20]].forEach(([t, across, len], i) => {
    [-1, 1].forEach((side) => {
      const { position, angle } = alongMagazine(curve, t, across, side * 15.5);
      const column = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.2, len, 6), basalt);
      column.position.copy(position);
      column.rotation.z = angle - Math.PI / 2;
      column.rotation.y = side * 0.08 + i * 0.3;
      body.add(column);
    });
  });

  // Bouche en cratère : cône de roche avec lèvre, cœur de lave au fond.
  parts.muzzle.visible = false;
  const crater = new THREE.Mesh(
    new THREE.LatheGeometry(
      [[9, 0], [15, 6], [19, 28], [17, 48], [21, 56], [23, 60], [17, 63], [12, 57], [9.5, 40]].map(([r, h]) => new THREE.Vector2(r, h)),
      9,
    ),
    basalt,
  );
  crater.rotation.z = -Math.PI / 2;
  crater.position.set(836, 2, 0);
  body.add(crater);
  const core = new THREE.Mesh(new THREE.CircleGeometry(11, 20), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
  core.rotation.y = Math.PI / 2;
  core.position.set(885, 2, 0);
  body.add(core);
  const craterLight = new THREE.PointLight(0xff6a20, 0.5, 0.2, 2);
  craterLight.position.set(900, 2, 0);
  body.add(craterLight);

  // Gouttes de lave qui gonflent sous l'arme puis se détachent.
  const dropMaterial = new THREE.MeshBasicMaterial({ color: 0xff7a24 });
  const dropGeometry = new THREE.SphereGeometry(3.6, 12, 10).translate(0, -3.6, 0);
  const endT = alongMagazine(curve, 1, 0, 0);
  const drips = [[548, -30], [612, -31], [668, -29], [endT.position.x + 4, endT.position.y - 6]].map(([x, y], i) => {
    const mesh = new THREE.Mesh(dropGeometry, dropMaterial);
    mesh.position.set(x, y, 0);
    body.add(mesh);
    return { mesh, t: Math.random(), period: 1.6 + i * 0.35 + Math.random() * 0.8 };
  });

  const smoke = particleSystem(scene, softDotTexture('magma-smoke', 'rgba(70,60,56,0.9)', 'rgba(70,60,56,0)'), { max: 40 });
  const drops = particleSystem(scene, softDotTexture('ember', 'rgba(255,230,170,1)', 'rgba(255,90,10,0)'), { max: 30 });
  const bubbles = particleSystem(scene, softDotTexture('ember', 'rgba(255,230,170,1)', 'rgba(255,90,10,0)'), { max: 30 });
  const mouth = new THREE.Object3D();
  mouth.position.set(898, 6, 0);
  body.add(mouth);
  const bubbleSpot = new THREE.Object3D();
  body.add(bubbleSpot);
  const tmp = new THREE.Vector3();
  let smokeClock = 0;
  let bubbleClock = 0;
  let time = 0;

  return {
    muzzleX: 905,
    update: (dt, t, flare) => {
      base.update(dt);
      time += dt;
      core.material.color.setHSL(0.07, 1, 0.55 + 0.1 * Math.sin(time * 4) + flare * 0.2);
      craterLight.intensity = 0.4 + 0.2 * Math.sin(time * 5) + flare * 1.5;

      smokeClock += dt;
      while (smokeClock > 0.14) {
        smokeClock -= 0.14;
        mouth.getWorldPosition(tmp);
        smoke.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.01, 0.035 + Math.random() * 0.02, (Math.random() - 0.5) * 0.01), {
          life: 1500,
          size: 0.012,
          grow: 3,
          drag: 0.2,
          additive: false,
          peak: 0.3,
        });
      }
      bubbleClock += dt;
      while (bubbleClock > 0.22) {
        bubbleClock -= 0.22;
        bubbleSpot.position.set(80 + Math.random() * 80, -50 + Math.random() * 45, (Math.random() < 0.5 ? -1 : 1) * 3);
        bubbleSpot.getWorldPosition(tmp);
        bubbles.spawn(tmp, new THREE.Vector3(0, 0.012, 0), { life: 450, size: 0.0025 + Math.random() * 0.002, drag: 0 });
      }

      drips.forEach((drip) => {
        drip.t += dt / drip.period;
        if (drip.t >= 1) {
          drip.t = 0;
          drip.period = 1.6 + Math.random() * 1.2;
          drip.mesh.getWorldPosition(tmp);
          tmp.y -= 0.009;
          drops.spawn(tmp, new THREE.Vector3(0, -0.05, 0), { life: 650, size: 0.0045, drag: 0, gravity: -7 });
        }
        const g = drip.t ** 1.6;
        drip.mesh.scale.set(1 - g * 0.3, 0.35 + g * 1.8, 1 - g * 0.3);
      });
      smoke.update(dt);
      drops.update(dt);
      bubbles.update(dt);
    },
    onFire: () => {
      base.onFire();
      // Bouffée de fumée plus dense au tir.
      mouth.getWorldPosition(tmp);
      for (let i = 0; i < 3; i += 1) {
        smoke.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.05 + Math.random() * 0.06, (Math.random() - 0.5) * 0.12), {
          life: 1100,
          size: 0.018,
          grow: 3.5,
          drag: 1.5,
          additive: false,
          peak: 0.4,
        });
      }
    },
  };
}

// =============================================================================
// CIRCUIT+ — l'arme devient une machine : chargeur en verre qui montre ses 30
// cellules d'énergie (elles s'éteignent une à une en tirant), plaques de blindage
// en lévitation sur le garde-main, volets de refroidissement qui s'ouvrent au tir,
// viseur holographique, câbles d'alimentation, émetteur prismatique à la bouche
// et fragments de données en orbite autour du cristal de la crosse.
// =============================================================================

function reticleTexture() {
  return tiledTexture(
    'circuit-reticle',
    256,
    (ctx, size) => {
      const c = size / 2;
      ctx.strokeStyle = 'rgba(110,248,255,1)';
      ctx.shadowColor = 'rgba(110,248,255,1)';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(c, c, size * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      [0, 1, 2, 3].forEach((k) => {
        const a = (k * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * size * 0.36, c + Math.sin(a) * size * 0.36);
        ctx.lineTo(c + Math.cos(a) * size * 0.46, c + Math.sin(a) * size * 0.46);
        ctx.stroke();
      });
      ctx.fillStyle = '#ff4fd8';
      ctx.shadowColor = '#ff4fd8';
      ctx.beginPath();
      ctx.arc(c, c, 9, 0, Math.PI * 2);
      ctx.fill();
    },
    { color: true },
  );
}

function decorateCircuitPlus(args) {
  const { body, add, scene, parts, geo, neon, anodized, wall, env } = args;
  const base = decorateCircuit(args);
  const ceramic = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.9, color: 0xe3e7ee, metalness: 0.05, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 });

  // Chargeur en verre et ses cellules d'énergie.
  const curve = geo.magazineCurve;
  parts.magazine.visible = false;
  parts.basePlate.material = wall;
  const glass = new THREE.Mesh(
    extrude(ribbonShape(curve, (t) => 64 - 6 * t, 48), 24, 2.2, { curveSegments: 4 }),
    new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xa8ecff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.2, clearcoat: 1, depthWrite: false }),
  );
  glass.renderOrder = 2;
  body.add(glass);
  // Montants graphite le long des deux bords, des deux côtés.
  [-1, 1].forEach((edge) => {
    [-1, 1].forEach((side) => {
      const pts = [];
      for (let i = 0; i <= 16; i += 1) {
        const t = i / 16;
        pts.push(alongMagazine(curve, t, edge * ((64 - 6 * t) / 2 - 1.5), side * 12.5).position);
      }
      body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 2.2, 8, false), wall));
    });
  });
  const cellMaterial = new THREE.MeshBasicMaterial({ color: 0x5ff7ff });
  const cellGeometry = new RoundedBoxGeometry(40, 3.6, 14, 1, 1);
  const cells = [];
  for (let i = 0; i < base.maxAmmo; i += 1) {
    const t = 0.07 + (i / (base.maxAmmo - 1)) * 0.86;
    const { position, angle } = alongMagazine(curve, t, 0, 0);
    const cell = new THREE.Mesh(cellGeometry, cellMaterial);
    cell.position.copy(position);
    cell.rotation.z = angle + Math.PI / 2;
    cell.scale.x = (64 - 6 * t) / 64;
    body.add(cell);
    cells.push(cell);
  }

  // Plaques de blindage en lévitation au-dessus des flancs du garde-main, avec la
  // lumière qui filtre dessous.
  const plates = [];
  [548, 612, 676].forEach((x, i) => {
    [-1, 1].forEach((side) => {
      const plate = add(new RoundedBoxGeometry(50, 20, 2.4, 2, 1), wall, x, -4, side * 29);
      // Cadre néon sur la face extérieure de la plaque, et chevron central.
      [[0, 9.4, 44, 0.9], [0, -9.4, 44, 0.9], [-24.4, 0, 0.9, 17], [24.4, 0, 0.9, 17]].forEach(([dx, dy, w, h]) => {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.6), neon);
        strip.position.set(dx, dy, side * 1.4);
        plate.add(strip);
      });
      const chevron = new THREE.Mesh(new THREE.BoxGeometry(14, 1.6, 0.6), ceramic);
      chevron.position.set(0, 0, side * 1.4);
      plate.add(chevron);
      add(new RoundedBoxGeometry(48, 1.2, 0.6, 1, 0.3), neon, x, -4, side * 26.4);
      add(new RoundedBoxGeometry(1.2, 16, 0.6, 1, 0.3), neon, x - 20, -4, side * 26.4);
      plates.push({ plate, side, phase: i * 1.3 + (side > 0 ? 0 : 0.7) });
    });
  });

  // Volets de refroidissement sur le dessus du garde-main.
  const flaps = [];
  [0, 1, 2, 3].forEach((i) => {
    const x0 = 548 + i * 26;
    const hinge = new THREE.Group();
    hinge.position.set(x0, 37.5, 0);
    body.add(hinge);
    const flap = new THREE.Mesh(new RoundedBoxGeometry(15, 1.6, 22, 1, 0.5), ceramic);
    flap.position.set(7.5, 0, 0);
    hinge.add(flap);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(13, 18), new THREE.MeshBasicMaterial({ color: 0x5ff7ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(x0 + 7.5, 36.8, 0);
    body.add(glow);
    flaps.push({ hinge, glow });
  });

  // Viseur holographique sur le couvercle.
  add(new RoundedBoxGeometry(44, 6, 22, 2, 1.5), wall, 414, 38, 0);
  [-1, 1].forEach((side) => add(new RoundedBoxGeometry(5, 26, 3, 1, 1), wall, 430, 53, side * 11.5));
  add(new RoundedBoxGeometry(5, 3, 26, 1, 1), wall, 430, 66, 0);
  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 22),
    new THREE.MeshBasicMaterial({ map: reticleTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  pane.rotation.y = Math.PI / 2;
  pane.position.set(430, 53, 0);
  body.add(pane);

  // Câbles d'alimentation (des deux côtés) entre carcasse et garde-main.
  [-1, 1].forEach((side) => {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(470, -14, side * 16),
      new THREE.Vector3(488, -34, side * 22),
      new THREE.Vector3(512, -34, side * 26),
      new THREE.Vector3(532, -22, side * 26),
    ]);
    body.add(new THREE.Mesh(new THREE.TubeGeometry(path, 24, 2.6, 8, false), wall));
    [0.25, 0.5, 0.75].forEach((t) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.7, 6, 16), neon);
      ring.position.copy(path.getPoint(t));
      // Axe du tore (son +Z) aligné sur le câble.
      ring.lookAt(ring.position.clone().add(path.getTangent(t)));
      body.add(ring);
    });
  });

  // Émetteur prismatique à la place du frein de bouche.
  parts.muzzle.visible = false;
  const prism = add(new THREE.CylinderGeometry(14, 16, 56, 6), wall, 866, 3, 0);
  prism.rotation.z = -Math.PI / 2;
  [0, 1, 2].forEach((k) => {
    const fin = new THREE.Group();
    fin.position.set(866, 3, 0);
    fin.rotation.x = (k * Math.PI * 2) / 3;
    body.add(fin);
    const blade = new THREE.Mesh(new RoundedBoxGeometry(38, 7, 2, 1, 0.8), ceramic);
    blade.position.set(2, 17.5, 0);
    fin.add(blade);
    const edge = new THREE.Mesh(new RoundedBoxGeometry(34, 0.9, 2.4, 1, 0.3), neon);
    edge.position.set(2, 21.2, 0);
    fin.add(edge);
  });
  const mouthRing = add(new THREE.TorusGeometry(12, 1.8, 8, 6), neon, 895, 3, 0);
  mouthRing.rotation.y = Math.PI / 2;
  const mouthCore = add(new THREE.CircleGeometry(10, 6), new THREE.MeshBasicMaterial({ color: 0xc8fdff }), 894.5, 3, 0);
  mouthCore.rotation.y = Math.PI / 2;

  // Fragments de données en orbite autour du cristal.
  const orbit = new THREE.Group();
  orbit.position.set(98, -22, 0);
  body.add(orbit);
  const bits = [0, 1, 2, 3, 4, 5].map((i) => {
    const bit = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), i % 2 ? neon : new THREE.MeshBasicMaterial({ color: 0xff4fd8 }));
    orbit.add(bit);
    return bit;
  });

  const kick = { x: 0, v: 0 };
  const vent = { x: 0, v: 0 };
  let time = 0;
  return {
    muzzleX: 905,
    update: (dt, t, flare) => {
      base.update(dt);
      time += dt;
      springStep(kick, 0, 60, dt);
      springStep(vent, 0, 18, dt);
      plates.forEach(({ plate, side, phase }) => {
        plate.position.z = side * (29 + 0.9 * Math.sin(time * 2.1 + phase) + kick.x * 4);
      });
      flaps.forEach(({ hinge, glow }, i) => {
        hinge.rotation.z = Math.min(1.1, Math.max(0, vent.x)) * (0.9 + i * 0.05);
        glow.material.opacity = 0.25 + Math.max(0, vent.x) * 0.9;
      });
      const ammo = base.getAmmo();
      cells.forEach((cell, i) => {
        cell.visible = i >= base.maxAmmo - ammo;
      });
      cellMaterial.color.setRGB(0.37 + flare * 0.5, 0.97, 1);
      pane.material.opacity = 0.75 + 0.2 * Math.sin(time * 6);
      mouthRing.rotation.x = time * 2;
      mouthCore.material.color.setRGB(0.75 + flare * 0.25, 0.99, 1);
      bits.forEach((bit, i) => {
        const a = time * (1.1 + (i % 3) * 0.3) + (i * Math.PI * 2) / bits.length;
        bit.position.set(Math.cos(a) * 30, Math.sin(a) * 18, Math.sin(a * 2) * 6);
        bit.rotation.set(time * 2 + i, time * 3, 0);
      });
    },
    onFire: () => {
      base.onFire();
      kick.v += 6;
      vent.v += 9;
    },
  };
}

// =============================================================================
// CÉLESTE — un fragment de ciel nocturne. Laque bleu nuit habitée d'une nébuleuse
// et d'étoiles qui scintillent et dérivent en parallaxe (deux couches du même
// ciel qui glissent à des vitesses différentes), constellations et filets d'or,
// système solaire miniature dans la crosse, planète à anneaux en orbite autour du
// canon, lame en croissant de lune, couronne d'étoile à la bouche, poussière
// d'étoiles qui s'échappe de l'arme et supernova à chaque tir.
// =============================================================================

function starField(seed, count) {
  const rand = seeded(seed);
  return Array.from({ length: count }, () => ({
    x: LIVERY.minX + rand() * 922,
    y: LIVERY.minY + rand() * 296,
    r: rand() ** 6 * 1.6 + 0.2,
    hue: rand(),
  }));
}

function starShape(points, outer, inner) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= points * 2; i += 1) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return shape;
}

function celesteFinish(env, geo) {
  const uniforms = geo.uniforms;
  const stars = starField(91, 2600);
  const bright = stars.filter((s) => s.r > 1).slice(0, 60);
  const constellations = [];
  const rand = seeded(92);
  for (let c = 0; c < 9; c += 1) {
    const start = bright[Math.floor(rand() * bright.length)];
    const group = [start];
    for (let k = 0; k < 4; k += 1) {
      const last = group[group.length - 1];
      group.push({ x: last.x + (rand() - 0.5) * 70, y: last.y + (rand() - 0.5) * 45, r: 1.1 });
    }
    constellations.push(group);
  }
  const magOutline = magazineOutline(geo.magazineCurve);
  const goldTrims = (ctx, width, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    [geo.stockOutline, geo.handguardOutline, magOutline, geo.stockHole].forEach((outline) => {
      tracePolygon(ctx, outline);
      ctx.stroke();
    });
  };
  const nebula = (ctx, alpha) => {
    const r = seeded(93);
    for (let i = 0; i < 38; i += 1) {
      const x = LIVERY.minX + r() * 922;
      const y = LIVERY.minY + r() * 296;
      const rad = 25 + r() * 80;
      const hue = ['110,50,190', '40,150,190', '190,50,140', '70,60,200'][Math.floor(r() * 4)];
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(${hue},${alpha})`);
      g.addColorStop(1, `rgba(${hue},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  };

  const color = livery(
    'celeste-color',
    (ctx) => {
      nebula(ctx, 0.45);
      stars.forEach((s) => {
        ctx.fillStyle = s.hue < 0.7 ? '#e8ecff' : '#ffd9f4';
        ctx.fillRect(s.x, s.y, s.r * 0.6, s.r * 0.6);
      });
      ctx.lineCap = 'round';
      constellations.forEach((group) => {
        ctx.strokeStyle = 'rgba(217,178,90,0.8)';
        ctx.lineWidth = 0.5;
        strokeLine(ctx, group.map((s) => [s.x, s.y]));
      });
      goldTrims(ctx, 2.2, '#c9a24c');
    },
    { background: '#070816', color: true },
  );
  const glow = livery(
    'celeste-glow',
    (ctx) => {
      nebula(ctx, 0.16);
      stars.forEach((s) => {
        ctx.fillStyle = s.hue < 0.7 ? '#dfe6ff' : '#ffc4ee';
        if (s.r > 1) {
          // Étoiles brillantes : petite croix de diffraction.
          ctx.fillRect(s.x - s.r * 2, s.y - 0.12, s.r * 4, 0.24);
          ctx.fillRect(s.x - 0.12, s.y - s.r * 2, 0.24, s.r * 4);
        }
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.lineCap = 'round';
      constellations.forEach((group) => {
        ctx.shadowColor = '#ffd27a';
        ctx.shadowBlur = 4;
        ctx.strokeStyle = 'rgba(255,214,130,0.9)';
        ctx.lineWidth = 0.4;
        strokeLine(ctx, group.map((s) => [s.x, s.y]));
        group.forEach((s) => {
          ctx.fillStyle = '#fff4d0';
          ctx.beginPath();
          ctx.arc(s.x, s.y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        });
      });
      ctx.shadowBlur = 0;
      goldTrims(ctx, 0.6, 'rgba(255,210,120,0.8)');
    },
    { background: '#000000', color: true },
  );
  const rough = livery('celeste-rough', (ctx) => goldTrims(ctx, 2.2, '#303030'), { background: '#5a5a5a' });

  // Scintillement + second ciel qui dérive par-dessus : effet de profondeur.
  const sky = `
    float twinkle = 0.7 + 0.3 * sin(uTime * 3.1 + vEmissiveMapUv.x * 900.0 + vEmissiveMapUv.y * 470.0);
    vec3 far = texture2D(emissiveMap, vEmissiveMapUv * 1.6 + vec2(uTime * 0.006, uTime * 0.002)).rgb;
    totalEmissiveRadiance = totalEmissiveRadiance * twinkle + far * emissive * 0.45 + totalEmissiveRadiance * uFlare * 1.4;
  `;
  const lacquer = animateEmissive(
    new THREE.MeshPhysicalMaterial({
      envMap: env,
      envMapIntensity: 0.8,
      map: color,
      emissive: 0xffffff,
      emissiveMap: glow,
      emissiveIntensity: 1.5,
      metalness: 0.1,
      roughness: 1,
      roughnessMap: rough,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    }),
    uniforms,
    sky,
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.8, color: 0x0b0d24, metalness: 0.2, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.06 });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.2, color: 0xd9b25a, metalness: 1, roughness: 0.22 });
  const pair = [lacquer, wall];
  return {
    receiver: pair,
    dustCover: pair,
    magwell: pair,
    gasBlock: pair,
    muzzle: pair,
    stock: pair,
    buttPad: [wall, wall],
    grip: pair,
    handguard: pair,
    upperGuard: pair,
    magazine: pair,
    metal: gold,
    barrel: new THREE.MeshStandardMaterial({ envMap: env, color: 0x2a2440, metalness: 1, roughness: 0.2, emissive: 0x3a2a80, emissiveIntensity: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x04040c, roughness: 0.8 }),
    sight: new THREE.MeshBasicMaterial({ color: 0xffe6a0 }),
    brass: gold,
    flash: 'void',
    light: 0xb88cff,
    smoke: 0xc9b8ff,
    glow: [],
    makeShell: () => {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.006, 0), new THREE.MeshBasicMaterial({ color: 0xfff1c0 }));
      star.scale.set(1, 1.6, 1);
      return star;
    },
    decorate: (ctx) => decorateCeleste({ ...ctx, geo, gold, wall, env }),
  };
}

export function glowSprite(texture, color, size) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sprite.scale.set(size, size, 1);
  return sprite;
}

function decorateCeleste({ body, add, scene, parts, geo, gold, wall, env }) {
  const dot = softDotTexture('celeste-glow', 'rgba(255,255,255,1)', 'rgba(255,255,255,0)');

  // Système solaire dans l'évidement de la crosse.
  const system = new THREE.Group();
  system.position.set(100, -26, 0);
  body.add(system);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
  system.add(sun);
  const corona = glowSprite(dot, 0xffb860, 46);
  system.add(corona);
  const sunLight = new THREE.PointLight(0xffc88a, 0.5, 0.25, 2);
  system.add(sunLight);
  const planets = [
    { radius: 22, size: 3.4, color: 0x5aa8ff, speed: 1.3 },
    { radius: 34, size: 4.6, color: 0xff7a9a, speed: 0.8, ring: true },
  ].map((p, i) => {
    const orbitLine = new THREE.Mesh(new THREE.TorusGeometry(p.radius, 0.35, 4, 64), gold);
    system.add(orbitLine);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(p.size, 18, 12), new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.6, emissive: p.color, emissiveIntensity: 0.25 }));
    system.add(planet);
    if (p.ring) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(p.size * 1.8, 0.5, 4, 32), gold);
      ring.rotation.x = 1.2;
      planet.add(ring);
    }
    return { ...p, planet, phase: i * 2.1 };
  });

  // Planète à anneaux en orbite autour du canon.
  const barrelOrbit = new THREE.Group();
  barrelOrbit.position.set(790, 0, 0);
  body.add(barrelOrbit);
  const moonlet = new THREE.Mesh(new THREE.SphereGeometry(5, 18, 12), new THREE.MeshStandardMaterial({ color: 0x9a7bff, roughness: 0.5, emissive: 0x5a3aff, emissiveIntensity: 0.4 }));
  barrelOrbit.add(moonlet);
  const moonRing = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.6, 4, 32), gold);
  moonRing.rotation.x = 1.1;
  moonlet.add(moonRing);

  // Lame en croissant de lune sous le canon.
  const crescent = new THREE.Shape();
  crescent.absarc(0, 0, 40, 0.25 * Math.PI, 1.05 * Math.PI, false);
  crescent.absarc(-12, 8, 34, 1.05 * Math.PI, 0.25 * Math.PI, true);
  const blade = add(extrude(crescent, 3, 0.8), gold, 820, -6, 0);
  blade.rotation.z = Math.PI + 0.35;
  // Fixations de la lame sur le canon.
  add(new THREE.CylinderGeometry(10.5, 10.5, 8, 24), gold, 776, 0, 0).rotation.z = Math.PI / 2;

  // Couronne d'étoile à la bouche.
  parts.muzzle.visible = false;
  const sleeve = add(new THREE.CylinderGeometry(11, 12.5, 50, 24), wall, 860, 2, 0);
  sleeve.rotation.z = Math.PI / 2;
  const crown = add(extrudeAlongX(starShape(8, 24, 11), 5, 0.8), gold, 886, 2, 0);
  const crownCore = glowSprite(dot, 0xd8c0ff, 30);
  crownCore.position.set(893, 2, 0);
  body.add(crownCore);

  // Arête d'or et gemmes-étoiles sur le dessus du couvercle (visibles en vue joueur).
  add(new RoundedBoxGeometry(236, 1.6, 5, 1, 0.6), gold, 370, 35.2, 0);
  const gems = [300, 360, 420].map((x) => {
    const gem = add(new THREE.OctahedronGeometry(4.5, 0), new THREE.MeshBasicMaterial({ color: 0xe8dcff }), x, 39, 0);
    gem.scale.set(1, 1.5, 1);
    const halo = glowSprite(dot, 0xb89cff, 22);
    halo.position.set(x, 39, 0);
    body.add(halo);
    return { gem, halo };
  });

  // Filets d'or le long du couvercle et de la carcasse.
  [-1, 1].forEach((side) => {
    add(new RoundedBoxGeometry(250, 1.4, 1, 1, 0.4), gold, 370, 20, side * 15.4);
    add(new RoundedBoxGeometry(270, 1.4, 1, 1, 0.4), gold, 362, -23, side * 16.2);
  });

  const dust = particleSystem(scene, dot, { max: 200 });
  const novae = particleSystem(scene, ringTexture('nova', 'rgba(200,160,255,0.9)'), { max: 12 });
  const emitter = new THREE.Object3D();
  body.add(emitter);
  const mouth = new THREE.Object3D();
  mouth.position.set(900, 2, 0);
  body.add(mouth);
  const tmp = new THREE.Vector3();
  let dustClock = 0;
  let time = 0;

  return {
    muzzleX: 900,
    update: (dt, t, flare) => {
      time += dt;
      sun.material.color.setHSL(0.11, 1, 0.78 + flare * 0.15);
      corona.material.opacity = 0.75 + 0.2 * Math.sin(time * 2.2) + flare * 0.3;
      sunLight.intensity = 0.4 + flare;
      planets.forEach((p) => {
        const a = time * p.speed + p.phase;
        p.planet.position.set(Math.cos(a) * p.radius, Math.sin(a) * p.radius * 0.72, 0);
        p.planet.rotation.y += dt;
      });
      const oa = time * 1.6;
      moonlet.position.set(0, Math.cos(oa) * 24, Math.sin(oa) * 24);
      crown.rotation.x = time * 0.8;
      crownCore.material.opacity = 0.6 + 0.3 * Math.sin(time * 4) + flare;
      gems.forEach(({ gem, halo }, i) => {
        gem.rotation.y = time * 1.5 + i;
        halo.material.opacity = 0.5 + 0.35 * Math.sin(time * 3 + i * 2) + flare * 0.5;
      });

      dustClock += dt;
      while (dustClock > 0.035) {
        dustClock -= 0.035;
        emitter.position.set(40 + Math.random() * 840, -30 + Math.random() * 60, (Math.random() - 0.5) * 50);
        emitter.getWorldPosition(tmp);
        dust.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.02, 0.01 + Math.random() * 0.015, (Math.random() - 0.5) * 0.02), {
          life: 1000 + Math.random() * 900,
          size: 0.0012 + Math.random() * 0.0022,
          drag: 0.3,
          tint: Math.random() < 0.7 ? 0xffffff : 0xd6b8ff,
        });
      }
      dust.update(dt);
      novae.update(dt);
    },
    onFire: () => {
      mouth.getWorldPosition(tmp);
      novae.spawn(tmp, new THREE.Vector3(0, 0, 0), { life: 320, size: 0.02, grow: 5, drag: 0 });
      for (let i = 0; i < 10; i += 1) {
        dust.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8), {
          life: 500,
          size: 0.0025,
          drag: 3,
          tint: 0xfff1c0,
        });
      }
    },
  };
}

export const VANDAL_SKIN_BUILDERS = {
  magma: { labelKey: 'aimTrainer.skinMagma', build: magmaFinish },
  circuit: { labelKey: 'aimTrainer.skinCircuit', build: circuitFinish },
  celeste: { labelKey: 'aimTrainer.skinCeleste', build: celesteFinish },
};
