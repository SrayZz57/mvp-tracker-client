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
} from './weaponKit.js';
import { S_LIVERY, livery, tracePolygon, strokeLine, blobs, branches, allOutlines, ringTexture, pointAlong } from './sniperSkins.js';

// Skins « Ultimes » de l'Operator (palier au-dessus des légendaires) : chacun
// transforme la silhouette du fusil en créature, en engin ou en édifice.

const W = S_LIVERY.maxX - S_LIVERY.minX;
const H = S_LIVERY.maxY - S_LIVERY.minY;

function glowSprite(texture, color, size) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sprite.scale.set(size, size, 1);
  return sprite;
}

function faces(pair) {
  return { stock: pair, grip: pair, chassis: pair, forend: pair, muzzle: pair };
}

// =============================================================================
// ORBITAL — un satellite de reconnaissance. Céramique blanche à joints de
// panneaux, feuilles d'or thermiques froissées sur la crosse, tuiles noires
// sous le garde-main. Deux ailes de panneaux solaires se déploient depuis la
// lunette ; une parabole tourne sur la crosse ; un anneau orbital entoure le
// canon avec deux mini-satellites ; deux tuyères à la plaque de couche crachent
// une flamme bleue. Au tir, les tuyères s'allument à fond et les panneaux
// s'ouvrent en grand.
// =============================================================================

function orbitalFinish(env, geo) {
  const color = livery('orbital-color', (ctx) => {
    speckle(ctx, S_LIVERY, 8000, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.4)'], 0.6, seeded(3101));
    ctx.strokeStyle = 'rgba(40,50,60,0.55)';
    ctx.lineWidth = 0.7;
    const rand = seeded(3102);
    for (let x = S_LIVERY.minX; x < S_LIVERY.maxX; x += 30 + rand() * 40) strokeLine(ctx, [[x, S_LIVERY.minY], [x, S_LIVERY.maxY]]);
    for (let y = S_LIVERY.minY; y < S_LIVERY.maxY; y += 24) strokeLine(ctx, [[S_LIVERY.minX, y], [S_LIVERY.maxX, y]]);
    // Feuille d'or thermique froissée sur la crosse.
    ctx.save();
    tracePolygon(ctx, geo.shapes.stock);
    ctx.clip();
    for (let i = 0; i < 1400; i += 1) {
      const x = -10 + rand() * 340;
      const y = -90 + rand() * 130;
      const r = 3 + rand() * 7;
      ctx.fillStyle = ['#d8a83a', '#f0c860', '#a87a1a', '#ffe08a'][Math.floor(rand() * 4)];
      ctx.beginPath();
      for (let k = 0; k < 4; k += 1) {
        const a = (k / 4) * Math.PI * 2 + rand();
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.fill();
    }
    ctx.restore();
    // Tuiles thermiques noires sous le garde-main.
    for (let x = 650; x < 930; x += 11) {
      for (let y = -28; y < -12; y += 11) {
        ctx.fillStyle = rand() < 0.5 ? '#1a1c20' : '#24272c';
        ctx.fillRect(x, y, 10, 10);
      }
    }
    ctx.fillStyle = '#2a6ad8';
    ctx.fillRect(640, 4, 300, 3);
  }, { background: '#e8ebef', color: true });
  const ceramic = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1, map: color, metalness: 0.2, roughness: 0.35, clearcoat: 0.6 });
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xdfe3e8, roughness: 0.35, clearcoat: 0.6 });
  const silver = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.3, color: 0xc8ced6, metalness: 1, roughness: 0.18 });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.3, color: 0xe0b04a, metalness: 1, roughness: 0.3 });
  return {
    ...faces([ceramic, wall]),
    buttPad: [wall, wall],
    receiver: silver,
    barrel: silver,
    scope: new THREE.MeshStandardMaterial({ envMap: env, color: 0xf0f2f5, metalness: 0.3, roughness: 0.3 }),
    lens: new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 2, color: 0x6a4a10, metalness: 1, roughness: 0.05 }),
    metal: silver,
    dark: new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.6 }),
    brass: gold,
    flash: 'frost',
    light: 0x9ad8ff,
    smoke: 0xffffff,
    decorate: ({ body, add, scene, parts, geo: g }) => {
      const cellTex = tiledTexture('orbital-cells', 128, (ctx, size) => {
        ctx.fillStyle = '#0c1a3a';
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = '#9ab4d8';
        ctx.lineWidth = 2;
        for (let i = 0; i <= size; i += 32) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, size);
          ctx.moveTo(0, i);
          ctx.lineTo(size, i);
          ctx.stroke();
        }
        const g2 = ctx.createLinearGradient(0, 0, size, size);
        g2.addColorStop(0, 'rgba(120,180,255,0.25)');
        g2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, size, size);
      }, { color: true });
      const cellMat = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.5, map: cellTex, metalness: 0.6, roughness: 0.2, side: THREE.DoubleSide });
      // Ailes solaires de part et d'autre de la lunette.
      const wings = [-1, 1].map((side) => {
        const arm = add(new THREE.CylinderGeometry(2, 2, 40, 8), silver, 540, g.scopeY, side * 34);
        arm.rotation.x = Math.PI / 2;
        const hinge = new THREE.Group();
        hinge.position.set(540, g.scopeY, side * 54);
        body.add(hinge);
        const panels = [0, 1, 2].map((k) => {
          const pivot = new THREE.Group();
          pivot.position.set(0, 0, side * k * 44);
          hinge.add(pivot);
          const panel = new THREE.Mesh(new THREE.BoxGeometry(110, 1.4, 42), cellMat);
          panel.position.set(0, 0, side * 22);
          pivot.add(panel);
          const frame = new THREE.Mesh(new THREE.BoxGeometry(112, 2, 2), silver);
          frame.position.set(0, 0, side * 43);
          pivot.add(frame);
          return pivot;
        });
        return { hinge, panels, side };
      });
      // Parabole tournante sur la crosse.
      const dishPivot = new THREE.Group();
      dishPivot.position.set(120, 48, 0);
      body.add(dishPivot);
      add(new THREE.CylinderGeometry(2.5, 3, 16, 10), silver, 120, 40, 0);
      const dish = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [10, 1.5], [20, 6], [26, 11], [27, 12]].map(([r, h]) => new THREE.Vector2(r, h)), 32), new THREE.MeshStandardMaterial({ envMap: env, color: 0xf4f4f4, metalness: 0.3, roughness: 0.3, side: THREE.DoubleSide }));
      dish.rotation.z = -1.1;
      dishPivot.add(dish);
      const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 22, 6), silver);
      feed.position.set(8, 5, 0);
      feed.rotation.z = -1.1;
      dishPivot.add(feed);
      // Anneau orbital et mini-satellites.
      const orbit = new THREE.Group();
      orbit.position.set(1000, g.boreY, 0);
      orbit.rotation.set(0.3, 0, 0.25);
      body.add(orbit);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(46, 0.8, 6, 96), new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.6 }));
      ring.rotation.y = Math.PI / 2;
      orbit.add(ring);
      const sats = [0, 1].map((i) => {
        const sat = new THREE.Group();
        sat.add(new THREE.Mesh(new RoundedBoxGeometry(8, 8, 8, 1, 1), gold));
        [-1, 1].forEach((s) => {
          const p = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 16), cellMat);
          p.position.z = s * 13;
          sat.add(p);
        });
        orbit.add(sat);
        return { sat, phase: i * Math.PI };
      });
      // Tuyères à l'arrière.
      const flameTex = softDotTexture('orbital-thrust', 'rgba(230,245,255,1)', 'rgba(60,140,255,0)');
      const thrusters = [-1, 1].map((side) => {
        const nozzle = add(new THREE.LatheGeometry([[5, 0], [6, 4], [11, 16], [12, 18]].map(([r, h]) => new THREE.Vector2(r, h)), 24), silver, -12, -20 + side * 22, 0);
        nozzle.rotation.z = Math.PI / 2;
        const flame = glowSprite(flameTex, 0x7ac8ff, 26);
        flame.position.set(-44, -20 + side * 22, 0);
        body.add(flame);
        return flame;
      });
      const rings = particleSystem(scene, ringTexture('orbital', 'rgba(150,210,255,0.9)'), { max: 6 });
      const mouth = anchorAt(body, 1196, g.boreY, 0);
      const tmp = new THREE.Vector3();
      const deploy = { x: 0.6, v: 0 };
      return {
        update: (dt, time, flare) => {
          springStep(deploy, 0.62 + Math.sin(time * 0.6) * 0.05, 14, dt);
          const d = Math.min(1.1, Math.max(0, deploy.x));
          wings.forEach(({ panels, side }) => {
            panels.forEach((p, k) => {
              if (k > 0) p.rotation.x = side * (1 - d) * 1.2 * (k % 2 ? 1 : -1);
            });
          });
          dishPivot.rotation.y += dt * 0.8;
          sats.forEach(({ sat, phase }) => {
            const a = time * 1.1 + phase;
            sat.position.set(0, Math.sin(a) * 46, Math.cos(a) * 46);
            sat.rotation.x = a;
          });
          thrusters.forEach((f) => {
            const s = 22 + Math.random() * 8 + flare * 40;
            f.scale.set(s * 1.6, s, 1);
            f.material.opacity = 0.6 + flare * 0.4;
          });
          rings.update(dt);
        },
        onFire: () => {
          deploy.v += 5;
          mouth.getWorldPosition(tmp);
          rings.spawn(tmp, new THREE.Vector3(), { life: 380, size: 0.035, grow: 5, drag: 0 });
        },
      };
    },
  };
}

// =============================================================================
// OSSUAIRE — l'arme d'un chasseur de dragons, taillée dans les os de sa proie.
// Os ivoire fissuré et taché, lanières de cuir rouge, fer noirci. Le crâne du
// dragon forme la bouche (mâchoire qui claque à chaque tir, orbites rouges qui
// brûlent, fumée qui sort des naseaux), une colonne vertébrale court sur le
// canon, une cage thoracique enserre le garde-main, des épines d'os hérissent la
// crosse. Des braises rougeoyantes montent en permanence.
// =============================================================================

function ossuaryFinish(env, geo) {
  const cracks = branches(3201, { roots: 30, steps: 14, stepLen: 5, jitter: 1, branchChance: 0.2, width: 1 });
  const color = livery('ossuary-color', (ctx) => {
    blobs(ctx, seeded(3202), 60, ['180,160,120', '120,100,70', '230,220,195'], 0.45, 10, 50);
    speckle(ctx, S_LIVERY, 14000, ['rgba(90,70,40,0.3)', 'rgba(255,250,235,0.3)'], 0.6, seeded(3203));
    ctx.lineCap = 'round';
    cracks.forEach(({ pts, width }) => {
      ctx.strokeStyle = 'rgba(60,40,20,0.8)';
      ctx.lineWidth = width;
      strokeLine(ctx, pts);
    });
    // Lanières de cuir rouge.
    ctx.fillStyle = '#6a1418';
    [[290, 350, -124, -24], [700, 730, -30, 14], [820, 850, -30, 14]].forEach(([x0, x1, y0, y1]) => {
      for (let y = y0; y < y1; y += 9) {
        tracePolygon(ctx, [[x0, y], [x1, y + 4], [x1, y + 9], [x0, y + 5]]);
        ctx.fill();
      }
    });
  }, { background: '#d8ccb0', color: true });
  const glow = livery('ossuary-glow', (ctx) => {
    ctx.lineCap = 'round';
    cracks.forEach(({ pts, width }, i) => {
      if (i % 3) return;
      ctx.strokeStyle = 'rgba(255,60,20,0.8)';
      ctx.lineWidth = width * 0.6;
      strokeLine(ctx, pts);
    });
  }, { background: '#000000', color: true });
  const bone = animateEmissive(
    new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.6, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.2, metalness: 0, roughness: 0.55 }),
    geo.uniforms,
    'totalEmissiveRadiance *= 0.4 + 0.5 * sin(uTime * 1.8 + vEmissiveMapUv.x * 12.0) + uFlare * 2.0;',
  );
  const boneWall = new THREE.MeshStandardMaterial({ envMap: env, color: 0xcfc2a4, roughness: 0.55 });
  const iron = new THREE.MeshStandardMaterial({ envMap: env, color: 0x2a2624, metalness: 0.85, roughness: 0.45 });
  return {
    ...faces([bone, boneWall]),
    buttPad: [iron, iron],
    receiver: iron,
    barrel: iron,
    scope: iron,
    lens: new THREE.MeshBasicMaterial({ color: 0xff3a1a }),
    metal: iron,
    dark: new THREE.MeshStandardMaterial({ color: 0x0a0604, roughness: 0.8 }),
    brass: iron,
    flash: 'ember',
    light: 0xff4a1a,
    smoke: 0x6a5a50,
    makeShell: () => {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.02, 6), boneWall);
      return tooth;
    },
    decorate: ({ body, add, scene, parts, geo: g }) => {
      const boneMat = new THREE.MeshStandardMaterial({ envMap: env, color: 0xe8dcc0, roughness: 0.5 });
      // Crâne de dragon à la bouche.
      parts.muzzle.visible = false;
      const skull = new THREE.Group();
      skull.position.set(1110, g.boreY + 6, 0);
      body.add(skull);
      const cranium = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), boneMat);
      cranium.scale.set(38, 24, 28);
      skull.add(cranium);
      const snout = new THREE.Mesh(new RoundedBoxGeometry(70, 20, 32, 3, 8), boneMat);
      snout.position.set(48, -2, 0);
      skull.add(snout);
      const jaw = new THREE.Group();
      jaw.position.set(-8, -12, 0);
      skull.add(jaw);
      const jawMesh = new THREE.Mesh(new RoundedBoxGeometry(80, 10, 30, 3, 4), boneMat);
      jawMesh.position.set(46, -4, 0);
      jaw.add(jawMesh);
      const toothGeo = new THREE.ConeGeometry(2.2, 12, 6);
      for (let x = 20; x <= 78; x += 8) {
        [-1, 1].forEach((side) => {
          const up = new THREE.Mesh(toothGeo, boneMat);
          up.position.set(x, -14, side * 13);
          up.rotation.z = Math.PI;
          skull.add(up);
          const low = new THREE.Mesh(toothGeo, boneMat);
          low.position.set(x + 30, 4, side * 12);
          jaw.add(low);
        });
      }
      [-1, 1].forEach((side) => {
        const horn = new THREE.CatmullRomCurve3([
          new THREE.Vector3(-10, 14, side * 16),
          new THREE.Vector3(-40, 34, side * 26),
          new THREE.Vector3(-80, 40, side * 34),
          new THREE.Vector3(-110, 30, side * 38),
        ]);
        skull.add(new THREE.Mesh(taperedTube(horn, 30, 8, 10, (t) => 1 - t * 0.9), boneMat));
      });
      const eyeTex = softDotTexture('ossuary-eye', 'rgba(255,200,120,1)', 'rgba(255,30,0,0)');
      const eyes = [-1, 1].map((side) => {
        const socket = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 10), new THREE.MeshBasicMaterial({ color: 0x1a0402 }));
        socket.position.set(10, 8, side * 22);
        skull.add(socket);
        const fire = glowSprite(eyeTex, 0xff4a1a, 22);
        fire.position.set(12, 8, side * 24);
        skull.add(fire);
        return fire;
      });
      const nostrils = [-1, 1].map((side) => anchorAt(skull, 82, 8, side * 8));
      // Colonne vertébrale sur le canon.
      for (let x = 660; x <= 1060; x += 24) {
        const s = 1 - (x - 660) / 700;
        add(new THREE.SphereGeometry(7 * s, 12, 10), boneMat, x, g.boreY + 16, 0).scale.set(1.3, 0.8, 1);
        const spike = add(new THREE.ConeGeometry(3 * s, 20 * s, 6), boneMat, x, g.boreY + 26 * s + 4, 0);
        spike.rotation.z = 0.45;
      }
      // Cage thoracique autour du garde-main.
      for (let x = 660; x <= 920; x += 36) {
        const rib = add(new THREE.TorusGeometry(40, 3, 8, 24, Math.PI * 1.1), boneMat, x, -6, 0);
        rib.rotation.y = Math.PI / 2;
        rib.rotation.x = -0.3;
      }
      // Épines d'os sur la crosse.
      [[40, 38], [90, 36], [140, 33], [190, 30], [240, 27]].forEach(([x, y], i) => {
        const spike = add(new THREE.ConeGeometry(4, 26 - i * 2, 6), boneMat, x, y + 10, 0);
        spike.rotation.z = 0.6;
      });
      const embers = particleSystem(scene, softDotTexture('ossuary-ember', 'rgba(255,220,160,1)', 'rgba(255,50,0,0)'), { max: 120 });
      const smoke = particleSystem(scene, softDotTexture('ossuary-smoke', 'rgba(60,50,46,0.9)', 'rgba(60,50,46,0)'), { max: 30 });
      const emitter = anchorAt(body, 0, 0, 0);
      const mouth = anchorAt(skull, 90, -8, 0);
      const tmp = new THREE.Vector3();
      const snap = { x: 0, v: 0 };
      let clock = 0;
      let smokeClock = 0;
      return {
        muzzleX: 1200,
        update: (dt, time, flare) => {
          springStep(snap, 0, 60, dt);
          jaw.rotation.z = -0.08 - Math.min(0.6, Math.max(0, snap.x)) - Math.sin(time * 1.1) * 0.03;
          eyes.forEach((e) => {
            e.material.opacity = 0.7 + 0.3 * Math.sin(time * 5) + flare * 0.5;
            e.scale.setScalar(22 + flare * 18);
          });
          clock += dt;
          while (clock > 0.06) {
            clock -= 0.06;
            emitter.position.set(Math.random() * 1150, -30 + Math.random() * 80, (Math.random() - 0.5) * 60);
            emitter.getWorldPosition(tmp);
            embers.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.02, 0.04 + Math.random() * 0.04, 0), { life: 1100, size: 0.002 + Math.random() * 0.002, drag: 0.4 });
          }
          smokeClock += dt;
          if (smokeClock > 0.5) {
            smokeClock = 0;
            nostrils.forEach((n) => {
              n.getWorldPosition(tmp);
              smoke.spawn(tmp, new THREE.Vector3(0.01, 0.02, 0), { life: 1300, size: 0.008, grow: 2.5, drag: 0.3, additive: false, peak: 0.35 });
            });
          }
          embers.update(dt);
          smoke.update(dt);
        },
        onFire: () => {
          snap.v += 12;
          mouth.getWorldPosition(tmp);
          for (let i = 0; i < 20; i += 1) {
            embers.spawn(tmp, new THREE.Vector3((Math.random() - 0.2) * 1.8, (Math.random() - 0.3) * 1.2, (Math.random() - 0.5) * 1.8), { life: 500, size: 0.004, drag: 2.5, gravity: -1.5 });
          }
        },
      };
    },
  };
}

// =============================================================================
// VITRAIL — la verrière d'une cathédrale. Crosse et garde-main sont un vitrail
// de verres colorés sertis de plomb, éclairés par derrière : la lumière y passe
// lentement comme le soleil derrière une verrière. Arcs gothiques dorés sur le
// garde-main, rosace rayonnante sur la crosse d'où tombent des rayons de
// lumière, cloche d'or suspendue qui sonne et se balance à chaque tir, et
// poussière dorée qui flotte dans les rayons.
// =============================================================================

function stainedGlassCells(seed) {
  const rand = seeded(seed);
  const cells = [];
  const palette = ['#c8202a', '#1f4ab8', '#1f8a4a', '#e8b020', '#7a2ab0', '#1fa0c8', '#e86a1a'];
  for (let gx = S_LIVERY.minX; gx < S_LIVERY.maxX; gx += 16) {
    for (let gy = S_LIVERY.minY; gy < S_LIVERY.maxY; gy += 16) {
      const cx = gx + rand() * 8;
      const cy = gy + rand() * 8;
      const pts = [];
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * Math.PI * 2 + rand() * 0.4;
        const r = 9 + rand() * 3;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      cells.push({ pts, color: palette[Math.floor(rand() * palette.length)] });
    }
  }
  return cells;
}

function stainedFinish(env, geo) {
  const cells = stainedGlassCells(3301);
  const paint = (ctx, glow) => {
    cells.forEach(({ pts, color }) => {
      tracePolygon(ctx, pts);
      ctx.fillStyle = color;
      ctx.fill();
    });
    ctx.strokeStyle = glow ? '#000000' : '#16161a';
    ctx.lineWidth = 1.6;
    cells.forEach(({ pts }) => {
      tracePolygon(ctx, pts);
      ctx.stroke();
    });
    if (!glow) {
      ctx.strokeStyle = '#d6aa45';
      ctx.lineWidth = 2.4;
      allOutlines(geo).forEach((o) => {
        tracePolygon(ctx, o);
        ctx.stroke();
      });
    }
  };
  const color = livery('stained-color', (ctx) => paint(ctx, false), { color: true });
  const glow = livery('stained-glow', (ctx) => paint(ctx, true), { background: '#000000', color: true });
  const sun = `
    float sweep = 0.35 + 0.9 * pow(max(0.0, 1.0 - abs(fract(vEmissiveMapUv.x * 0.9 - uTime * 0.07) - 0.5) * 3.0), 2.0);
    totalEmissiveRadiance *= sweep + uFlare * 1.4;
  `;
  const glass = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.9, metalness: 0, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 }),
    geo.uniforms,
    sun,
  );
  const lead = new THREE.MeshStandardMaterial({ envMap: env, color: 0x2a2a30, metalness: 0.8, roughness: 0.4 });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.4, color: 0xe2b24a, metalness: 1, roughness: 0.2 });
  return {
    ...faces([glass, lead]),
    buttPad: [gold, gold],
    receiver: gold,
    barrel: lead,
    scope: gold,
    lens: new THREE.MeshBasicMaterial({ color: 0xfff0c0 }),
    metal: gold,
    dark: new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.6 }),
    brass: gold,
    flash: 'gold',
    light: 0xffe0a0,
    smoke: 0xfff4dc,
    decorate: ({ body, add, scene, parts, geo: g }) => {
      // Arcs gothiques (ogives) sur les flancs du garde-main.
      [-1, 1].forEach((side) => {
        [680, 760, 840].forEach((x) => {
          const pts = [];
          for (let k = 0; k <= 16; k += 1) {
            const t = k / 16;
            const a = Math.PI - t * Math.PI;
            const leftHalf = t < 0.5;
            const cx = leftHalf ? x + 12 : x - 12;
            pts.push(new THREE.Vector3(cx + Math.cos(a) * 30 * (leftHalf ? 1 : 1) - (leftHalf ? 0 : 0), -26 + Math.sin(a) * 36, side * 29));
          }
          body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 1.6, 6, false), gold));
        });
      });
      // Rosace sur les flancs de la crosse.
      const roseTex = tiledTexture('stained-rose', 256, (ctx, size) => {
        const c = size / 2;
        const colors = ['#c8202a', '#1f4ab8', '#e8b020', '#1f8a4a', '#7a2ab0', '#1fa0c8'];
        for (let ring = 3; ring >= 1; ring -= 1) {
          const petals = ring * 8;
          for (let k = 0; k < petals; k += 1) {
            ctx.fillStyle = colors[(k + ring) % colors.length];
            ctx.beginPath();
            ctx.moveTo(c, c);
            ctx.arc(c, c, (size * 0.48 * ring) / 3, (k / petals) * Math.PI * 2, ((k + 1) / petals) * Math.PI * 2);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 4;
            ctx.stroke();
          }
        }
        ctx.fillStyle = '#ffe08a';
        ctx.beginPath();
        ctx.arc(c, c, size * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }, { color: true });
      const roseMat = new THREE.MeshBasicMaterial({ map: roseTex });
      const roses = [-1, 1].map((side) => {
        const rose = add(new THREE.CircleGeometry(30, 48), roseMat, 110, -12, side * 19.5);
        if (side < 0) rose.rotation.y = Math.PI;
        add(new THREE.TorusGeometry(31, 2.2, 8, 48), gold, 110, -12, side * 19.5);
        return rose;
      });
      // Rayons de lumière depuis la rosace.
      const rayTex = tiledTexture('stained-ray', 128, (ctx, size) => {
        const g2 = ctx.createLinearGradient(0, 0, 0, size);
        g2.addColorStop(0, 'rgba(255,230,170,0.9)');
        g2.addColorStop(1, 'rgba(255,230,170,0)');
        ctx.fillStyle = g2;
        ctx.fillRect(size * 0.3, 0, size * 0.4, size);
      }, { color: true });
      const rays = [0, 1, 2, 3, 4].map((k) => {
        const ray = new THREE.Mesh(new THREE.PlaneGeometry(20, 180), new THREE.MeshBasicMaterial({ map: rayTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        ray.geometry.translate(0, -90, 0);
        ray.position.set(110, -12, -24);
        ray.rotation.set(0.6, 0, -0.5 + k * 0.25);
        body.add(ray);
        return ray;
      });
      // Cloche d'or suspendue sous le garde-main.
      const bellPivot = new THREE.Group();
      bellPivot.position.set(800, -30, 0);
      body.add(bellPivot);
      const yoke = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 16, 6), gold);
      yoke.position.y = -8;
      bellPivot.add(yoke);
      const bell = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [7, -1], [10, -8], [11, -18], [15, -26], [16, -28], [0, -28]].map(([r, h]) => new THREE.Vector2(r, h)), 32), gold);
      bell.position.y = -14;
      bellPivot.add(bell);
      const dust = particleSystem(scene, softDotTexture('stained-dust', 'rgba(255,240,200,1)', 'rgba(255,200,100,0)'), { max: 60 });
      const emitter = anchorAt(body, 0, 0, 0);
      const tmp = new THREE.Vector3();
      const swing = { x: 0, v: 0 };
      let clock = 0;
      return {
        update: (dt, time, flare) => {
          springStep(swing, 0, 5, dt);
          bellPivot.rotation.x = swing.x * 0.6 + Math.sin(time * 1.2) * 0.03;
          rays.forEach((ray, k) => {
            ray.material.opacity = 0.18 + 0.12 * Math.sin(time * 0.7 + k) + flare * 0.3;
          });
          roses.forEach((r) => r.rotation.z += dt * 0.08);
          clock += dt;
          while (clock > 0.12) {
            clock -= 0.12;
            emitter.position.set(60 + Math.random() * 120, -80 - Math.random() * 60, -40 - Math.random() * 60);
            emitter.getWorldPosition(tmp);
            dust.spawn(tmp, new THREE.Vector3(0, 0.003, 0), { life: 1500, size: 0.0014, drag: 0 });
          }
          dust.update(dt);
        },
        onFire: () => {
          swing.v += 4;
        },
      };
    },
  };
}

// =============================================================================
// ABYSSAL — le poisson-lanterne des grandes fosses. Peau noire bleutée tachetée,
// ligne latérale de photophores qui s'allument en vague. Un leurre lumineux se
// balance au bout d'une tige recourbée qui part de la lunette ; des nageoires
// membraneuses ondulent sur la crosse et le garde-main, une grande nageoire
// caudale prolonge la crosse ; des mâchoires à dents-aiguilles entourent la
// bouche et claquent au tir. Des bulles remontent sans cesse.
// =============================================================================

function abyssalFinish(env, geo) {
  const rand = seeded(3401);
  const dots = [];
  for (let x = 10; x < 1180; x += 14) dots.push([x, -6 + Math.sin(x * 0.02) * 6, 1.4]);
  for (let i = 0; i < 120; i += 1) dots.push([S_LIVERY.minX + rand() * W, S_LIVERY.minY + rand() * H, 0.6 + rand()]);
  const color = livery('abyssal-color', (ctx) => {
    blobs(ctx, seeded(3402), 50, ['20,40,70', '6,10,20', '40,60,90'], 0.6, 20, 70);
    const r2 = seeded(3403);
    for (let i = 0; i < 260; i += 1) {
      ctx.fillStyle = 'rgba(120,150,190,0.35)';
      ctx.beginPath();
      ctx.arc(S_LIVERY.minX + r2() * W, S_LIVERY.minY + r2() * H, 0.8 + r2() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    dots.forEach(([x, y, r]) => {
      ctx.fillStyle = '#7ae8ff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }, { background: '#0a1220', color: true });
  const glow = livery('abyssal-glow', (ctx) => {
    dots.forEach(([x, y, r]) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      g.addColorStop(0, 'rgba(160,250,255,1)');
      g.addColorStop(1, 'rgba(40,200,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    });
  }, { background: '#000000', color: true });
  const skin = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.8, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.4, metalness: 0.1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.2 }),
    geo.uniforms,
    'totalEmissiveRadiance *= 0.15 + 1.4 * pow(0.5 + 0.5 * sin(vEmissiveMapUv.x * 40.0 - uTime * 3.0), 5.0) + uFlare * 1.5;',
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x0a1220, roughness: 0.3, clearcoat: 1 });
  const dark = new THREE.MeshStandardMaterial({ envMap: env, color: 0x121a2a, metalness: 0.6, roughness: 0.35 });
  return {
    ...faces([skin, wall]),
    buttPad: [wall, wall],
    receiver: dark,
    barrel: dark,
    scope: dark,
    lens: new THREE.MeshBasicMaterial({ color: 0x7ae8ff }),
    metal: dark,
    dark: new THREE.MeshStandardMaterial({ color: 0x03050a, roughness: 0.6 }),
    brass: dark,
    flash: 'abyss',
    light: 0x7ae8ff,
    smoke: 0x2a3a50,
    decorate: ({ body, add, scene, parts, geo: g }) => {
      const membrane = new THREE.MeshPhysicalMaterial({ color: 0x2a4a7a, roughness: 0.3, transparent: true, opacity: 0.7, side: THREE.DoubleSide, emissive: 0x0a3a6a, emissiveIntensity: 0.6 });
      const needle = new THREE.MeshStandardMaterial({ color: 0xe8f0f8, roughness: 0.3 });
      // Tige et leurre.
      const lureCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(700, g.scopeY + 26, 0),
        new THREE.Vector3(820, g.scopeY + 110, 0),
        new THREE.Vector3(980, g.scopeY + 120, 0),
        new THREE.Vector3(1060, g.scopeY + 60, 0),
      ]);
      const stalkPivot = new THREE.Group();
      stalkPivot.position.set(700, g.scopeY + 26, 0);
      body.add(stalkPivot);
      const stalk = new THREE.Mesh(taperedTube(lureCurve, 50, 4, 8, (t) => 1 - t * 0.7), dark);
      stalk.position.set(-700, -(g.scopeY + 26), 0);
      stalkPivot.add(stalk);
      const bulbPos = lureCurve.getPointAt(1).clone().sub(new THREE.Vector3(700, g.scopeY + 26, 0));
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 16), new THREE.MeshBasicMaterial({ color: 0xc8fcff }));
      bulb.position.copy(bulbPos).add(new THREE.Vector3(0, -10, 0));
      stalkPivot.add(bulb);
      const bulbHalo = glowSprite(softDotTexture('abyssal-lure', 'rgba(220,255,255,1)', 'rgba(40,200,255,0)'), 0x9af0ff, 90);
      bulbHalo.position.copy(bulb.position);
      stalkPivot.add(bulbHalo);
      const lureLight = new THREE.PointLight(0x7ae8ff, 0.8, 0.5, 2);
      lureLight.position.copy(bulb.position);
      stalkPivot.add(lureLight);
      // Nageoires membraneuses.
      const finShape = (len, height) => {
        const s = new THREE.Shape();
        s.moveTo(0, 0);
        s.quadraticCurveTo(len * 0.3, height, len, height * 0.6);
        s.lineTo(len * 0.9, 0);
        s.closePath();
        return s;
      };
      const fins = [];
      const fin = (x, y, z, len, height, rotX, rotZ) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, y, z);
        pivot.rotation.set(rotX, 0, rotZ);
        body.add(pivot);
        pivot.add(new THREE.Mesh(extrude(finShape(len, height), 0.8, 0.3), membrane));
        for (let k = 1; k < 6; k += 1) {
          const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, height, 5), dark);
          ray.position.set((len * k) / 6, height * 0.4, 0);
          pivot.add(ray);
        }
        fins.push({ pivot, base: rotX, phase: x * 0.01 });
      };
      fin(200, 30, 0, 110, 50, 0, 0.1);
      fin(760, 12, 0, 120, 40, 0, 0.05);
      [-1, 1].forEach((side) => fin(120, -30, side * 20, 80, 36, side * 1.2, -0.6));
      // Nageoire caudale.
      const tail = new THREE.Group();
      tail.position.set(-10, -20, 0);
      body.add(tail);
      [-1, 1].forEach((s) => {
        const lobe = new THREE.Mesh(extrude(finShape(90, 44), 0.8, 0.3), membrane);
        lobe.rotation.z = Math.PI + s * 0.5;
        tail.add(lobe);
      });
      // Mâchoires à dents-aiguilles.
      parts.muzzle.visible = false;
      const jaws = [1, -1].map((dir) => {
        const pivot = new THREE.Group();
        pivot.position.set(1090, g.boreY + dir * 10, 0);
        body.add(pivot);
        const plate = new THREE.Mesh(new RoundedBoxGeometry(90, 8, 46, 2, 3), dark);
        plate.position.set(40, dir * 6, 0);
        pivot.add(plate);
        for (let k = 0; k < 9; k += 1) {
          [-1, 1].forEach((side) => {
            const t = new THREE.Mesh(new THREE.ConeGeometry(1.3, 18 - Math.abs(k - 4) * 2, 5), needle);
            t.position.set(10 + k * 9, -dir * 6, side * 18);
            if (dir > 0) t.rotation.z = Math.PI;
            pivot.add(t);
          });
        }
        return { pivot, dir };
      });
      const bubbles = particleSystem(scene, softDotTexture('abyssal-bubble', 'rgba(220,250,255,0.9)', 'rgba(120,200,255,0)'), { max: 80 });
      const emitter = anchorAt(body, 0, 0, 0);
      const tmp = new THREE.Vector3();
      const snap = { x: 0, v: 0 };
      let clock = 0;
      return {
        muzzleX: 1180,
        update: (dt, time, flare) => {
          springStep(snap, 0, 50, dt);
          stalkPivot.rotation.z = Math.sin(time * 0.9) * 0.08;
          stalkPivot.rotation.x = Math.sin(time * 0.7) * 0.1;
          const pulse = 0.8 + 0.2 * Math.sin(time * 2.4) + flare;
          bulbHalo.material.opacity = Math.min(1, pulse);
          bulbHalo.scale.setScalar(80 + flare * 60);
          lureLight.intensity = 0.6 + flare * 1.5;
          fins.forEach((f) => {
            f.pivot.rotation.x = f.base + Math.sin(time * 3 + f.phase) * 0.15;
          });
          tail.rotation.y = Math.sin(time * 2.2) * 0.35;
          jaws.forEach(({ pivot, dir }) => {
            pivot.rotation.z = dir * (0.28 - Math.min(0.26, Math.max(0, snap.x) * 0.5));
          });
          clock += dt;
          while (clock > 0.1) {
            clock -= 0.1;
            emitter.position.set(Math.random() * 1150, -60 + Math.random() * 60, (Math.random() - 0.5) * 60);
            emitter.getWorldPosition(tmp);
            bubbles.spawn(tmp, new THREE.Vector3(0, 0.03 + Math.random() * 0.02, 0), { life: 1400, size: 0.002 + Math.random() * 0.002, drag: 0 });
          }
          bubbles.update(dt);
        },
        onFire: () => {
          snap.v += 10;
        },
      };
    },
  };
}

// =============================================================================
// SUPERNOVA — une étoile qui s'effondre. Croûte sombre refroidie, fendue sur un
// plasma stellaire qui bouillonne (motif calculé en continu dans le shader).
// La bouche est une étoile en fusion à la surface agitée, auréolée d'une
// couronne et de rayons ; trois arches d'éruption solaire enjambent la carcasse
// et le canon, parcourues de plasma qui circule. Au tir : onde de choc et
// éjection de matière incandescente.
// =============================================================================

function supernovaFinish(env, geo) {
  const cells = branches(3501, { roots: 40, steps: 16, stepLen: 7, jitter: 0.8, branchChance: 0.18, width: 2.4 });
  const crust = livery('nova-crust', (ctx) => {
    blobs(ctx, seeded(3502), 60, ['40,24,20', '18,10,8', '60,34,24'], 0.7, 20, 60);
    speckle(ctx, S_LIVERY, 14000, ['rgba(0,0,0,0.4)', 'rgba(120,70,40,0.3)'], 0.7, seeded(3503));
  }, { background: '#1a0f0a', color: true });
  const mask = livery('nova-mask', (ctx) => {
    ctx.lineCap = 'round';
    cells.forEach(({ pts, width }) => {
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 6;
      ctx.lineWidth = width;
      strokeLine(ctx, pts);
    });
  }, { background: '#000000', color: true });
  const plasma = `
    vec2 p = vEmissiveMapUv * vec2(60.0, 24.0);
    float n = sin(p.x + uTime * 2.1) * sin(p.y - uTime * 1.6) + sin((p.x + p.y) * 0.7 + uTime * 1.3) * 0.6;
    vec3 hot = mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.95, 0.7), 0.5 + 0.5 * n);
    totalEmissiveRadiance = totalEmissiveRadiance * hot * (1.3 + 0.4 * n) * (1.0 + uFlare * 2.0);
  `;
  const surface = patchShader(
    new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.6, map: crust, emissive: 0xffffff, emissiveMap: mask, emissiveIntensity: 1.6, metalness: 0.4, roughness: 0.6 }),
    geo.uniforms,
    { fragment: plasma },
  );
  const wall = new THREE.MeshStandardMaterial({ envMap: env, color: 0x1a0f0a, metalness: 0.4, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ envMap: env, color: 0x2a1a14, metalness: 0.8, roughness: 0.4 });
  return {
    ...faces([surface, wall]),
    buttPad: [wall, wall],
    receiver: dark,
    barrel: dark,
    scope: dark,
    lens: new THREE.MeshBasicMaterial({ color: 0xffb040 }),
    metal: dark,
    dark: new THREE.MeshStandardMaterial({ color: 0x080404, roughness: 0.7 }),
    brass: dark,
    flash: 'ember',
    light: 0xffa040,
    smoke: 0xffc890,
    decorate: ({ body, add, scene, parts, geo: g }) => {
      // Étoile en fusion à la bouche : surface agitée (déformation) et plasma.
      parts.muzzle.visible = false;
      const starMat = patchShader(
        new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1 }),
        g.uniforms,
        {
          vertex: 'transformed += objectNormal * (sin(position.x * 0.3 + uTime * 4.0) * sin(position.y * 0.35 - uTime * 3.0) * 2.2 + sin(position.z * 0.4 + uTime * 5.0) * 1.2);',
          fragment: `
            vec3 q = normalize(vViewPosition);
            float n = sin(gl_FragCoord.x * 0.06 + uTime * 3.0) * sin(gl_FragCoord.y * 0.07 - uTime * 2.2);
            totalEmissiveRadiance = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.97, 0.8), 0.5 + 0.5 * n) * (1.4 + uFlare * 2.0);
          `,
        },
      );
      const star = add(new THREE.SphereGeometry(28, 48, 32), starMat, 1130, g.boreY, 0);
      const corona = glowSprite(softDotTexture('nova-corona', 'rgba(255,240,200,1)', 'rgba(255,90,10,0)'), 0xffa040, 200);
      corona.position.copy(star.position);
      body.add(corona);
      const rayTex = tiledTexture('nova-rays', 256, (ctx, size) => {
        const c = size / 2;
        for (let k = 0; k < 16; k += 1) {
          const a = (k / 16) * Math.PI * 2;
          const g2 = ctx.createLinearGradient(c, c, c + Math.cos(a) * c, c + Math.sin(a) * c);
          g2.addColorStop(0, 'rgba(255,220,150,0.9)');
          g2.addColorStop(1, 'rgba(255,120,20,0)');
          ctx.strokeStyle = g2;
          ctx.lineWidth = 4 + (k % 2) * 4;
          ctx.beginPath();
          ctx.moveTo(c, c);
          ctx.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c);
          ctx.stroke();
        }
      }, { color: true });
      const rays = glowSprite(rayTex, 0xffc070, 260);
      rays.position.copy(star.position);
      body.add(rays);
      const starLight = new THREE.PointLight(0xff9a40, 1.2, 0.6, 2);
      starLight.position.copy(star.position);
      body.add(starLight);
      // Arches d'éruption : tubes de plasma qui circule.
      const loopMat = patchShader(
        new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
        g.uniforms,
        { fragment: 'totalEmissiveRadiance = mix(vec3(1.0, 0.3, 0.05), vec3(1.0, 0.9, 0.5), 0.5 + 0.5 * sin(gl_FragCoord.x * 0.05 + gl_FragCoord.y * 0.03 - uTime * 6.0)) * (1.3 + uFlare * 2.0);' },
      );
      [[380, 520, 70], [700, 860, 60], [930, 1060, 50]].forEach(([x0, x1, h]) => {
        const pts = [];
        for (let k = 0; k <= 20; k += 1) {
          const t = k / 20;
          pts.push(new THREE.Vector3(x0 + (x1 - x0) * t, g.boreY + 20 + Math.sin(t * Math.PI) * h, Math.sin(t * Math.PI * 2) * 14));
        }
        body.add(new THREE.Mesh(taperedTube(new THREE.CatmullRomCurve3(pts), 40, 4, 8, (t) => 0.4 + 0.6 * Math.sin(t * Math.PI)), loopMat));
      });
      const ejecta = particleSystem(scene, softDotTexture('nova-ejecta', 'rgba(255,240,200,1)', 'rgba(255,90,10,0)'), { max: 120 });
      const shocks = particleSystem(scene, ringTexture('nova', 'rgba(255,180,80,0.9)'), { max: 6 });
      const emitter = anchorAt(body, 0, 0, 0);
      const tmp = new THREE.Vector3();
      let clock = 0;
      return {
        muzzleX: 1160,
        update: (dt, time, flare) => {
          rays.material.rotation += dt * 0.15;
          rays.material.opacity = 0.55 + 0.2 * Math.sin(time * 2) + flare * 0.4;
          corona.scale.setScalar(190 + Math.sin(time * 3) * 12 + flare * 90);
          starLight.intensity = 1 + flare * 3;
          clock += dt;
          while (clock > 0.05) {
            clock -= 0.05;
            emitter.position.set(1130 + (Math.random() - 0.5) * 40, g.boreY + (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);
            emitter.getWorldPosition(tmp);
            ejecta.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.3) * 0.15, (Math.random() - 0.5) * 0.15), { life: 700, size: 0.003, drag: 1, gravity: -0.2 });
          }
          ejecta.update(dt);
          shocks.update(dt);
        },
        onFire: () => {
          star.getWorldPosition(tmp);
          shocks.spawn(tmp, new THREE.Vector3(), { life: 450, size: 0.05, grow: 5, drag: 0 });
          for (let i = 0; i < 30; i += 1) {
            ejecta.spawn(tmp, new THREE.Vector3((Math.random() - 0.3) * 2.4, (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4), { life: 550, size: 0.004, drag: 2.5 });
          }
        },
      };
    },
  };
}

export const SNIPER_MYTHIC_SKINS = {
  orbital: { labelKey: 'aimTrainer.skinOrbital', build: orbitalFinish },
  ossuary: { labelKey: 'aimTrainer.skinOssuary', build: ossuaryFinish },
  stained: { labelKey: 'aimTrainer.skinStained', build: stainedFinish },
  abyssal: { labelKey: 'aimTrainer.skinAbyssal', build: abyssalFinish },
  supernova: { labelKey: 'aimTrainer.skinSupernova', build: supernovaFinish },
};
