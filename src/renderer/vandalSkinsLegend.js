import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { seeded, tiledTexture, speckle, animateEmissive, particleSystem, softDotTexture, extrude, springStep } from './weaponKit.js';
import { LIVERY, livery, tracePolygon, strokeLine, magazineOutline, alongMagazine, glowSprite, ringTexture } from './vandalSkins.js';

// Deuxième série de skins légendaires de la Vandal. Mêmes outils que
// vandalSkins.js : livrée d'un seul tenant, émissif animé dans le shader,
// volumes ajoutés via `decorate`.

const W = LIVERY.maxX - LIVERY.minX;
const H = LIVERY.maxY - LIVERY.minY;

function anchorAt(parent, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

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

function allOutlines(geo) {
  return [geo.stockOutline, geo.stockHole, geo.handguardOutline, magazineOutline(geo.magazineCurve)];
}

function allFaces(pair) {
  return {
    receiver: pair,
    dustCover: pair,
    magwell: pair,
    gasBlock: pair,
    muzzle: pair,
    stock: pair,
    grip: pair,
    handguard: pair,
    upperGuard: pair,
    magazine: pair,
  };
}

// =============================================================================
// AURORE — une nuit polaire. Acier bleu nuit gravé de flocons, sur lequel danse
// une aurore boréale calculée dans le shader (rideaux verts et violets qui
// ondulent et glissent le long de l'arme). Trois rubans d'aurore flottent autour
// de l'arme et ondoient ; une étoile polaire brille sur la crosse. Au tir,
// l'aurore s'embrase et les rubans se déchaînent.
// =============================================================================

function snowflake(ctx, x, y, r) {
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2;
    const ex = x + Math.cos(a) * r;
    const ey = y + Math.sin(a) * r;
    strokeLine(ctx, [[x, y], [ex, ey]]);
    [0.5, 0.75].forEach((t) => {
      const bx = x + Math.cos(a) * r * t;
      const by = y + Math.sin(a) * r * t;
      strokeLine(ctx, [[bx, by], [bx + Math.cos(a + 0.7) * r * 0.25, by + Math.sin(a + 0.7) * r * 0.25]]);
      strokeLine(ctx, [[bx, by], [bx + Math.cos(a - 0.7) * r * 0.25, by + Math.sin(a - 0.7) * r * 0.25]]);
    });
  }
}

function auroraFinish(env, geo) {
  const rand = seeded(1101);
  const flakes = Array.from({ length: 60 }, () => [LIVERY.minX + rand() * W, LIVERY.minY + rand() * H, 3 + rand() * 6]);
  const color = livery('aurora-color', (ctx) => {
    const g = ctx.createLinearGradient(0, LIVERY.minY, 0, LIVERY.maxY);
    g.addColorStop(0, '#060c18');
    g.addColorStop(1, '#13283e');
    ctx.fillStyle = g;
    ctx.fillRect(LIVERY.minX, LIVERY.minY, W, H);
    speckle(ctx, LIVERY, 3000, ['rgba(255,255,255,0.7)'], 0.4, seeded(1102));
    ctx.strokeStyle = 'rgba(170,220,255,0.55)';
    ctx.lineWidth = 0.5;
    flakes.forEach(([x, y, r]) => snowflake(ctx, x, y, r));
    ctx.strokeStyle = '#bfe8ff';
    ctx.lineWidth = 1.4;
    allOutlines(geo).forEach((o) => {
      tracePolygon(ctx, o);
      ctx.stroke();
    });
  }, { color: true });
  // Masque de l'aurore : partout, un peu plus fort sur les flocons.
  const mask = livery('aurora-mask', (ctx) => {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.8;
    flakes.forEach(([x, y, r]) => snowflake(ctx, x, y, r));
  }, { background: '#8a8a8a', color: true });
  const aurora = `
    vec2 uvA = vEmissiveMapUv;
    float band = sin(uvA.x * 13.0 + uTime * 0.55 + sin(uvA.x * 4.0 - uTime * 0.3) * 2.2);
    float curtain = smoothstep(0.15, 1.0, band) * (0.55 + 0.45 * sin(uvA.y * 38.0 + uvA.x * 9.0 + uTime * 1.3));
    vec3 hue = mix(vec3(0.12, 1.0, 0.62), vec3(0.72, 0.32, 1.0), 0.5 + 0.5 * sin(uvA.x * 5.0 + uTime * 0.35));
    totalEmissiveRadiance = totalEmissiveRadiance * hue * (curtain * 1.2 + 0.08) * (1.0 + uFlare * 2.0);
  `;
  const steel = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1, map: color, emissive: 0xffffff, emissiveMap: mask, emissiveIntensity: 1.2, metalness: 0.5, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }),
    geo.uniforms,
    aurora,
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x0c1a2c, metalness: 0.5, roughness: 0.2, clearcoat: 1 });
  const frost = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.2, color: 0xc8e6f4, metalness: 0.9, roughness: 0.2 });
  return {
    ...allFaces([steel, wall]),
    buttPad: [wall, wall],
    metal: frost,
    barrel: new THREE.MeshStandardMaterial({ envMap: env, color: 0x1a2c44, metalness: 0.9, roughness: 0.2 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x04070c, roughness: 0.6 }),
    sight: new THREE.MeshBasicMaterial({ color: 0x9affd8 }),
    brass: frost,
    flash: 'jade',
    light: 0x5affc0,
    smoke: 0xc8f0ff,
    glow: [],
    decorate: ({ body, add, scene }) => {
      // Rubans d'aurore : plans souples dont les sommets ondulent à chaque image.
      const ribbonTex = tiledTexture('aurora-ribbon', 256, (ctx, size) => {
        const g = ctx.createLinearGradient(0, 0, 0, size);
        g.addColorStop(0, 'rgba(160,80,255,0)');
        g.addColorStop(0.35, 'rgba(160,90,255,0.7)');
        g.addColorStop(0.7, 'rgba(40,255,160,0.9)');
        g.addColorStop(1, 'rgba(40,255,160,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
        for (let x = 0; x < size; x += 6) {
          ctx.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.1})`;
          ctx.fillRect(x, 0, 2, size);
        }
      }, { color: true });
      const ribbons = [
        { x: 450, y: 70, z: 0, len: 520, h: 50, phase: 0 },
        { x: 600, y: 10, z: 42, len: 380, h: 36, phase: 1.7 },
        { x: 600, y: 10, z: -42, len: 380, h: 36, phase: 3.1 },
      ].map((r) => {
        const geometry = new THREE.PlaneGeometry(r.len, r.h, 48, 1);
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: ribbonTex, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        mesh.position.set(r.x, r.y, r.z);
        body.add(mesh);
        return { ...r, mesh, base: Float32Array.from(geometry.attributes.position.array) };
      });
      // Étoile polaire sur la crosse.
      const star = new THREE.Shape();
      for (let i = 0; i <= 8; i += 1) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? 14 : 4;
        if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const starMat = new THREE.MeshBasicMaterial({ color: 0xe8fbff });
      [-1, 1].forEach((side) => add(extrude(star, 2, 0.4), starMat, 60, 2, side * 19));
      const halo = glowSprite(softDotTexture('aurora-halo', 'rgba(200,255,240,1)', 'rgba(80,255,190,0)'), 0x9affd8, 60);
      halo.position.set(60, 2, 0);
      body.add(halo);
      const sparkles = particleSystem(scene, softDotTexture('aurora-spark', 'rgba(255,255,255,1)', 'rgba(150,255,220,0)'), { max: 80 });
      const rings = particleSystem(scene, ringTexture('aurora', 'rgba(90,255,190,0.9)'), { max: 6 });
      const emitter = anchorAt(body, 0, 0, 0);
      const mouth = anchorAt(body, 905, 4, 0);
      const tmp = new THREE.Vector3();
      const surge = { x: 0, v: 0 };
      let clock = 0;
      return {
        update: (dt, time, flare) => {
          springStep(surge, 0, 10, dt);
          const amp = 1 + Math.max(0, surge.x) * 2.5;
          ribbons.forEach((r) => {
            const pos = r.mesh.geometry.attributes.position;
            for (let i = 0; i < pos.count; i += 1) {
              const bx = r.base[i * 3];
              const by = r.base[i * 3 + 1];
              pos.setY(i, by + Math.sin(bx * 0.018 + time * 1.6 + r.phase) * 8 * amp);
              pos.setZ(i, Math.sin(bx * 0.011 - time * 1.1 + r.phase) * 10 * amp);
            }
            pos.needsUpdate = true;
            r.mesh.material.opacity = 0.55 + 0.25 * Math.sin(time * 0.8 + r.phase) + flare * 0.4;
          });
          halo.material.opacity = 0.6 + 0.3 * Math.sin(time * 2) + flare * 0.4;
          clock += dt;
          while (clock > 0.1) {
            clock -= 0.1;
            emitter.position.set(Math.random() * 900, -60 + Math.random() * 140, (Math.random() - 0.5) * 80);
            emitter.getWorldPosition(tmp);
            sparkles.spawn(tmp, new THREE.Vector3(0, 0.008, 0), { life: 900, size: 0.002 + Math.random() * 0.002, drag: 0 });
          }
          sparkles.update(dt);
          rings.update(dt);
        },
        onFire: () => {
          surge.v += 6;
          mouth.getWorldPosition(tmp);
          rings.spawn(tmp, new THREE.Vector3(), { life: 380, size: 0.03, grow: 5, drag: 0 });
        },
      };
    },
  };
}

// =============================================================================
// SAKURA — l'esprit du cerisier. Laque noire profonde filetée d'or, peinte de
// branches de cerisier en fleurs. De vraies branches en relief poussent le long
// de la crosse et du garde-main, couvertes de fleurs à cinq pétales ; les pétales
// tombent en tournoyant ; une lanterne de papier pend sous le garde-main et se
// balance. Au tir, bourrasque de pétales.
// =============================================================================

function sakuraBranches(seed) {
  const rand = seeded(seed);
  const out = [];
  for (let i = 0; i < 9; i += 1) {
    const x0 = LIVERY.minX + rand() * W;
    const y0 = -110 + rand() * 60;
    const pts = [[x0, y0]];
    let x = x0;
    let y = y0;
    let a = -0.3 + rand() * 0.6 + (rand() < 0.5 ? Math.PI * 0.35 : Math.PI * 0.15);
    for (let k = 0; k < 12; k += 1) {
      a += (rand() - 0.5) * 0.6;
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      pts.push([x, y]);
    }
    out.push(pts);
  }
  return out;
}

function blossom(ctx, x, y, r, fill, center) {
  ctx.fillStyle = fill;
  for (let k = 0; k < 5; k += 1) {
    const a = (k / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.55, r * 0.38, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = center;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function sakuraFinish(env, geo) {
  const branches = sakuraBranches(1201);
  const flowers = [];
  const rand = seeded(1202);
  branches.forEach((pts) => pts.forEach(([x, y], k) => {
    if (k > 2 && rand() < 0.7) flowers.push([x + (rand() - 0.5) * 10, y + (rand() - 0.5) * 10, 3 + rand() * 3]);
  }));
  const paint = (ctx, glow) => {
    if (!glow) {
      const wash = ctx.createLinearGradient(0, 0, 900, 0);
      wash.addColorStop(0, 'rgba(120,30,60,0.35)');
      wash.addColorStop(0.5, 'rgba(0,0,0,0)');
      ctx.fillStyle = wash;
      ctx.fillRect(LIVERY.minX, LIVERY.minY, W, H);
      ctx.lineCap = 'round';
      branches.forEach((pts) => {
        ctx.strokeStyle = '#3a1e14';
        ctx.lineWidth = 3;
        strokeLine(ctx, pts);
        ctx.strokeStyle = '#6a3a24';
        ctx.lineWidth = 1;
        strokeLine(ctx, pts);
      });
    }
    flowers.forEach(([x, y, r]) => blossom(ctx, x, y, r, glow ? 'rgba(255,150,200,0.55)' : '#ffc6dc', glow ? 'rgba(255,220,120,0.8)' : '#e8b64a'));
    if (!glow) {
      ctx.strokeStyle = '#d6aa45';
      ctx.lineWidth = 1.2;
      allOutlines(geo).forEach((o) => {
        tracePolygon(ctx, o);
        ctx.stroke();
      });
    }
  };
  const color = livery('sakura-color', (ctx) => paint(ctx, false), { background: '#0d0a0c', color: true });
  const glow = livery('sakura-glow', (ctx) => paint(ctx, true), { background: '#000000', color: true });
  const lacquer = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1, map: color, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.9, metalness: 0.05, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03 }),
    geo.uniforms,
    'totalEmissiveRadiance *= 0.6 + 0.25 * sin(uTime * 1.2 + vEmissiveMapUv.x * 20.0) + uFlare;',
  );
  const wall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x0d0a0c, roughness: 0.12, clearcoat: 1 });
  const gold = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.3, color: 0xd6aa45, metalness: 1, roughness: 0.25 });
  return {
    ...allFaces([lacquer, wall]),
    buttPad: [gold, gold],
    metal: gold,
    barrel: new THREE.MeshStandardMaterial({ envMap: env, color: 0x1a1214, metalness: 0.9, roughness: 0.25 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x050304, roughness: 0.6 }),
    sight: new THREE.MeshBasicMaterial({ color: 0xffc6dc }),
    brass: gold,
    flash: 'void',
    light: 0xff9ac8,
    smoke: 0xffd6e6,
    glow: [],
    decorate: ({ body, add, scene }) => {
      const bark = new THREE.MeshStandardMaterial({ color: 0x3a2014, roughness: 0.85 });
      const petalMat = new THREE.MeshStandardMaterial({ color: 0xffc6dc, roughness: 0.5, emissive: 0xff7aa8, emissiveIntensity: 0.25, side: THREE.DoubleSide });
      const centerMat = new THREE.MeshStandardMaterial({ color: 0xe8b64a, roughness: 0.4 });
      const petalGeo = new THREE.SphereGeometry(1, 8, 6);
      const flower = (p, size) => {
        const group = new THREE.Group();
        group.position.copy(p);
        group.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        for (let k = 0; k < 5; k += 1) {
          const petal = new THREE.Mesh(petalGeo, petalMat);
          const a = (k / 5) * Math.PI * 2;
          petal.position.set(Math.cos(a) * size * 0.6, Math.sin(a) * size * 0.6, 0);
          petal.scale.set(size * 0.6, size * 0.4, size * 0.12);
          petal.rotation.z = a;
          group.add(petal);
        }
        const c = new THREE.Mesh(petalGeo, centerMat);
        c.scale.setScalar(size * 0.25);
        group.add(c);
        body.add(group);
      };
      const branch = (points, radius) => {
        const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
        body.add(new THREE.Mesh(taperedTube(curve, 60, radius, 8, (t) => 1 - t * 0.85), bark));
        for (let k = 3; k <= 20; k += 1) {
          const p = curve.getPointAt(k / 20);
          p.add(new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.2) * 10, (Math.random() - 0.5) * 8));
          flower(p, 4 + Math.random() * 3);
        }
      };
      [-1, 1].forEach((side) => {
        branch([[20, -80, side * 18], [60, -30, side * 20], [120, 10, side * 19], [190, 30, side * 16], [230, 40, side * 12]], 3.2);
        branch([[520, -30, side * 25], [580, -6, side * 27], [640, 12, side * 26], [700, 26, side * 20]], 2.6);
      });
      // Lanterne de papier sous le garde-main.
      const lantern = new THREE.Group();
      lantern.position.set(660, -28, 0);
      body.add(lantern);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 18, 6), bark);
      cord.position.y = -9;
      lantern.add(cord);
      const paper = new THREE.Mesh(new THREE.SphereGeometry(11, 20, 14), new THREE.MeshStandardMaterial({ color: 0xff6a4a, emissive: 0xff7a3a, emissiveIntensity: 0.9, roughness: 0.8 }));
      paper.scale.set(1, 1.25, 1);
      paper.position.y = -30;
      lantern.add(paper);
      [-44, -16].forEach((y) => {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 3, 16), new THREE.MeshStandardMaterial({ color: 0x1a0a08 }));
        cap.position.y = y;
        lantern.add(cap);
      });
      const lanternLight = new THREE.PointLight(0xff8a4a, 0.5, 0.2, 2);
      lanternLight.position.y = -30;
      lantern.add(lanternLight);

      const petalTex = tiledTexture('sakura-petal', 64, (ctx, size) => {
        ctx.fillStyle = '#ffc6dc';
        ctx.beginPath();
        ctx.ellipse(size / 2, size / 2, size * 0.42, size * 0.26, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }, { color: true });
      const petals = particleSystem(scene, petalTex, { max: 160 });
      const emitter = anchorAt(body, 0, 0, 0);
      const mouth = anchorAt(body, 905, 4, 0);
      const tmp = new THREE.Vector3();
      let clock = 0;
      return {
        update: (dt, time) => {
          lantern.rotation.z = Math.sin(time * 1.5) * 0.18;
          lantern.rotation.x = Math.sin(time * 1.1) * 0.12;
          clock += dt;
          while (clock > 0.07) {
            clock -= 0.07;
            emitter.position.set(Math.random() * 720, 20 + Math.random() * 50, (Math.random() - 0.5) * 60);
            emitter.getWorldPosition(tmp);
            petals.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.03, -0.02 - Math.random() * 0.02, (Math.random() - 0.5) * 0.03), {
              life: 2200,
              size: 0.004 + Math.random() * 0.003,
              drag: 0,
              additive: false,
              peak: 0.95,
            });
          }
          petals.update(dt);
        },
        onFire: () => {
          mouth.getWorldPosition(tmp);
          for (let i = 0; i < 16; i += 1) {
            petals.spawn(tmp, new THREE.Vector3((Math.random() - 0.2) * 1.4, (Math.random() - 0.2) * 1, (Math.random() - 0.5) * 1.4), {
              life: 1100,
              size: 0.005,
              drag: 2.5,
              gravity: -0.4,
              additive: false,
              peak: 0.95,
            });
          }
        },
      };
    },
  };
}

// =============================================================================
// IRRADIÉ — sorti d'une zone contaminée. Acier rouillé, bandes de danger jaunes
// et noires usées, trèfle de radioactivité peint sur la crosse. Des fioles de
// liquide vert fluorescent sont sanglées au garde-main et dans la crosse, reliées
// à la carcasse par des tuyaux ; du ruban adhésif rafistole la poignée ; la bouche
// est un filtre de masque à gaz d'où s'échappent des fumées toxiques. Un voyant
// clignote au rythme d'un compteur Geiger.
// =============================================================================

function radiationFinish(env, geo) {
  const paint = (ctx) => {
    const rand = seeded(1301);
    for (let i = 0; i < 90; i += 1) {
      const x = LIVERY.minX + rand() * W;
      const y = LIVERY.minY + rand() * H;
      const r = 5 + rand() * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const tone = ['140,70,30', '90,60,40', '170,100,40'][Math.floor(rand() * 3)];
      g.addColorStop(0, `rgba(${tone},0.7)`);
      g.addColorStop(1, `rgba(${tone},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Bandes de danger sur le garde-main et le bas de la crosse.
    [geo.handguardOutline, [[20, -60], [180, -40], [180, -110], [20, -110]]].forEach((zone) => {
      ctx.save();
      tracePolygon(ctx, zone);
      ctx.clip();
      for (let x = -200; x < 1000; x += 16) {
        ctx.fillStyle = '#e8c21a';
        tracePolygon(ctx, [[x, 80], [x + 8, 80], [x + 108, -220], [x + 100, -220]]);
        ctx.fill();
      }
      ctx.restore();
    });
    // Trèfle de radioactivité.
    const cx = 110;
    const cy = -18;
    ctx.fillStyle = '#e8c21a';
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#141414';
    for (let k = 0; k < 3; k += 1) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, 18, a - 0.52, a + 0.52);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#e8c21a';
    ctx.beginPath();
    ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#141414';
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // Éraflures et usure (le jaune s'écaille).
    ctx.strokeStyle = 'rgba(60,50,40,0.8)';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 260; i += 1) {
      const x = LIVERY.minX + rand() * W;
      const y = LIVERY.minY + rand() * H;
      strokeLine(ctx, [[x, y], [x + (rand() - 0.5) * 16, y + (rand() - 0.5) * 6]]);
    }
    speckle(ctx, LIVERY, 20000, ['rgba(30,20,10,0.35)', 'rgba(200,150,90,0.2)'], 0.6, seeded(1302));
  };
  const color = livery('rad-color', paint, { background: '#5a4a38', color: true });
  const bump = livery('rad-bump', (ctx) => speckle(ctx, LIVERY, 30000, ['#606060', '#d0d0d0'], 0.8, seeded(1303)), { background: '#999999' });
  const rusted = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.6, map: color, metalness: 0.45, roughness: 0.75, bumpMap: bump, bumpScale: 1.4 });
  const wall = new THREE.MeshStandardMaterial({ envMap: env, color: 0x4a3c2c, metalness: 0.45, roughness: 0.7 });
  const iron = new THREE.MeshStandardMaterial({ envMap: env, color: 0x4a4640, metalness: 0.85, roughness: 0.5 });
  return {
    ...allFaces([rusted, wall]),
    buttPad: [wall, wall],
    metal: iron,
    barrel: iron,
    dark: new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 0.8 }),
    sight: new THREE.MeshBasicMaterial({ color: 0x9aff4a }),
    brass: iron,
    flash: 'venom',
    light: 0x7dff4a,
    smoke: 0x7a9a4a,
    glow: [],
    decorate: ({ body, add, scene, parts }) => {
      const glass = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.05, clearcoat: 1, depthWrite: false });
      const ooze = new THREE.MeshBasicMaterial({ color: 0x8aff3a });
      const tape = new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 0.6 });
      const vial = (x, y, z, length, radius, vertical = false) => {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        if (!vertical) g.rotation.z = Math.PI / 2;
        body.add(g);
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 20, 1, true), glass));
        const liquid = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.85, radius * 0.85, length * 0.9, 16), ooze);
        g.add(liquid);
        [-1, 1].forEach((end) => {
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius + 1.5, radius + 1.5, 6, 20), iron);
          cap.position.y = (end * length) / 2;
          g.add(cap);
        });
        return liquid;
      };
      const liquids = [];
      [-1, 1].forEach((side) => {
        liquids.push(vial(608, -8, side * 32, 150, 8));
        // Sangles qui tiennent la fiole au garde-main.
        [560, 656].forEach((x) => add(new RoundedBoxGeometry(10, 26, 3, 1, 1), tape, x, -8, side * 27));
        // Tuyau vers la carcasse.
        const hose = new THREE.CatmullRomCurve3([
          new THREE.Vector3(532, -8, side * 32),
          new THREE.Vector3(500, -34, side * 30),
          new THREE.Vector3(470, -30, side * 20),
          new THREE.Vector3(452, -12, side * 16),
        ]);
        body.add(new THREE.Mesh(new THREE.TubeGeometry(hose, 24, 2.6, 8, false), new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7 })));
      });
      liquids.push(vial(110, -24, 0, 50, 13, true));
      // Ruban adhésif autour de la poignée.
      [-40, -70, -100].forEach((y, i) => {
        const band = add(new RoundedBoxGeometry(56, 9, 34, 2, 2), tape, 338 - i * 9, y, 0);
        band.rotation.z = -0.28;
      });
      // Filtre de masque à gaz à la bouche.
      parts.muzzle.visible = false;
      const filter = add(new THREE.CylinderGeometry(20, 20, 40, 28), iron, 870, 4, 0);
      filter.rotation.z = Math.PI / 2;
      for (let k = 0; k < 5; k += 1) {
        const rib = add(new THREE.TorusGeometry(20.5, 1.2, 6, 28), iron, 854 + k * 8, 4, 0);
        rib.rotation.y = Math.PI / 2;
      }
      const grill = add(new THREE.CircleGeometry(17, 28), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 }), 890.5, 4, 0);
      grill.rotation.y = Math.PI / 2;
      for (let k = 0; k < 12; k += 1) {
        const a = (k / 12) * Math.PI * 2;
        const hole = add(new THREE.CircleGeometry(1.8, 10), ooze, 891, 4 + Math.sin(a) * 11, Math.cos(a) * 11);
        hole.rotation.y = Math.PI / 2;
      }
      // Voyant du compteur Geiger.
      const lamp = add(new THREE.SphereGeometry(3, 12, 10), new THREE.MeshBasicMaterial({ color: 0x9aff4a }), 470, 20, -17);

      const fumes = particleSystem(scene, softDotTexture('rad-fume', 'rgba(150,255,80,0.9)', 'rgba(80,160,30,0)'), { max: 60 });
      const bubbles = particleSystem(scene, softDotTexture('rad-bubble', 'rgba(230,255,200,1)', 'rgba(120,255,60,0)'), { max: 40 });
      const mouth = anchorAt(body, 892, 4, 0);
      const bubbleSpot = anchorAt(body, 0, 0, 0);
      const tmp = new THREE.Vector3();
      let clock = 0;
      let bubbleClock = 0;
      let nextClick = 0;
      let lampOn = 0;
      let time0 = 0;
      return {
        muzzleX: 894,
        update: (dt, time, flare) => {
          time0 += dt;
          liquids.forEach((l) => l.material.color.setHSL(0.27, 1, 0.55 + 0.08 * Math.sin(time * 3) + flare * 0.25));
          // Clignotement irrégulier, comme les tics d'un compteur Geiger.
          if (time0 > nextClick) {
            lampOn = 0.08;
            nextClick = time0 + 0.05 + Math.random() * 0.5;
          }
          lampOn = Math.max(0, lampOn - dt);
          lamp.material.color.setRGB(lampOn > 0 ? 0.8 : 0.1, lampOn > 0 ? 1 : 0.25, lampOn > 0 ? 0.5 : 0.08);
          clock += dt;
          while (clock > 0.2) {
            clock -= 0.2;
            mouth.getWorldPosition(tmp);
            fumes.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.01, 0.02 + Math.random() * 0.01, (Math.random() - 0.5) * 0.01), { life: 1600, size: 0.012, grow: 3, drag: 0.3, additive: false, peak: 0.3 });
          }
          bubbleClock += dt;
          while (bubbleClock > 0.15) {
            bubbleClock -= 0.15;
            bubbleSpot.position.set(540 + Math.random() * 136, -12, (Math.random() < 0.5 ? -1 : 1) * 32);
            bubbleSpot.getWorldPosition(tmp);
            bubbles.spawn(tmp, new THREE.Vector3(0, 0.015, 0), { life: 300, size: 0.0018, drag: 0 });
          }
          fumes.update(dt);
          bubbles.update(dt);
        },
        onFire: () => {
          mouth.getWorldPosition(tmp);
          for (let i = 0; i < 4; i += 1) {
            fumes.spawn(tmp, new THREE.Vector3((Math.random() - 0.2) * 0.25, (Math.random() - 0.2) * 0.15, (Math.random() - 0.5) * 0.25), { life: 1300, size: 0.016, grow: 3.5, drag: 1.2, additive: false, peak: 0.45 });
          }
          nextClick = 0;
        },
      };
    },
  };
}

// =============================================================================
// PHARAON — trésor d'une tombe royale. Or poli et lapis-lazuli moucheté d'or en
// bandes, frises de glyphes dorés où glisse la lumière. Un scarabée d'or aux
// ailes de lapis est posé sur le flanc et ouvre ses ailes à chaque tir ; un
// disque solaire ailé surmonte le couvercle ; un cobra dressé, capuchon ouvert
// et yeux de rubis, garde la bouche. Des grains de sable dorés tourbillonnent.
// =============================================================================

function glyph(ctx, x, y, s, kind) {
  ctx.beginPath();
  switch (kind % 6) {
    case 0:
      ctx.arc(x, y, s * 0.45, 0, Math.PI * 2);
      break;
    case 1:
      ctx.moveTo(x - s * 0.5, y - s * 0.4);
      ctx.lineTo(x, y + s * 0.5);
      ctx.lineTo(x + s * 0.5, y - s * 0.4);
      ctx.closePath();
      break;
    case 2:
      for (let k = 0; k <= 8; k += 1) ctx.lineTo(x - s * 0.5 + (k / 8) * s, y + Math.sin(k * 1.6) * s * 0.18);
      break;
    case 3:
      ctx.moveTo(x, y - s * 0.5);
      ctx.lineTo(x, y + s * 0.5);
      ctx.moveTo(x - s * 0.3, y + s * 0.1);
      ctx.lineTo(x + s * 0.3, y + s * 0.1);
      break;
    case 4:
      ctx.ellipse(x, y, s * 0.5, s * 0.25, 0, 0, Math.PI * 2);
      ctx.moveTo(x + s * 0.12, y);
      ctx.arc(x, y, s * 0.12, 0, Math.PI * 2);
      break;
    default:
      ctx.rect(x - s * 0.35, y - s * 0.35, s * 0.7, s * 0.7);
  }
  ctx.stroke();
}

function pharaohFinish(env, geo) {
  const lapisZones = [geo.stockOutline, magazineOutline(geo.magazineCurve)];
  const paint = (ctx, glow) => {
    if (!glow) {
      const g = ctx.createLinearGradient(0, LIVERY.minY, 0, LIVERY.maxY);
      g.addColorStop(0, '#9a6a1a');
      g.addColorStop(0.5, '#e8c05a');
      g.addColorStop(1, '#a8781e');
      ctx.fillStyle = g;
      ctx.fillRect(LIVERY.minX, LIVERY.minY, W, H);
      lapisZones.forEach((zone) => {
        ctx.save();
        tracePolygon(ctx, zone);
        ctx.clip();
        for (let y = LIVERY.minY; y < LIVERY.maxY; y += 16) {
          ctx.fillStyle = '#1d3a8a';
          ctx.fillRect(LIVERY.minX, y, W, 10);
        }
        speckle(ctx, LIVERY, 6000, ['#e8c05a', '#6a8ae0'], 0.5, seeded(1401));
        ctx.restore();
      });
    }
    ctx.strokeStyle = glow ? 'rgba(255,220,130,1)' : '#5a3a0a';
    ctx.lineWidth = 0.8;
    const rand = seeded(1402);
    // Frises de glyphes sur la carcasse et le garde-main.
    [[-12, 230, 500], [6, 230, 500], [-2, 510, 710], [-18, 510, 710]].forEach(([y, x0, x1]) => {
      for (let x = x0; x < x1; x += 10) glyph(ctx, x, y, 7, Math.floor(rand() * 6));
      strokeLine(ctx, [[x0, y + 6], [x1, y + 6]]);
    });
    if (!glow) {
      ctx.strokeStyle = '#fff0b0';
      ctx.lineWidth = 1.4;
      allOutlines(geo).forEach((o) => {
        tracePolygon(ctx, o);
        ctx.stroke();
      });
    }
  };
  const color = livery('pharaoh-color', (ctx) => paint(ctx, false), { color: true });
  const glow = livery('pharaoh-glow', (ctx) => paint(ctx, true), { background: '#000000', color: true });
  const metalMap = livery('pharaoh-metal', (ctx) => {
    ctx.fillStyle = '#000000';
    lapisZones.forEach((zone) => {
      ctx.save();
      tracePolygon(ctx, zone);
      ctx.clip();
      for (let y = LIVERY.minY; y < LIVERY.maxY; y += 16) ctx.fillRect(LIVERY.minX, y, W, 10);
      ctx.restore();
    });
  }, { background: '#ffffff' });
  const sweep = `
    float band = pow(max(0.0, 1.0 - abs(fract(vEmissiveMapUv.x * 1.2 - uTime * 0.2) - 0.5) * 6.0), 3.0);
    totalEmissiveRadiance *= 0.15 + band * 2.0 + uFlare * 1.3;
  `;
  const gilded = animateEmissive(
    new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.3, map: color, metalness: 1, metalnessMap: metalMap, roughness: 0.25, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1 }),
    geo.uniforms,
    sweep,
  );
  const gold = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.4, color: 0xe8c05a, metalness: 1, roughness: 0.2 });
  const lapis = new THREE.MeshStandardMaterial({ envMap: env, color: 0x1d3a8a, metalness: 0.3, roughness: 0.3 });
  return {
    ...allFaces([gilded, gold]),
    buttPad: [lapis, lapis],
    metal: gold,
    barrel: lapis,
    dark: new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.6 }),
    sight: new THREE.MeshBasicMaterial({ color: 0xff3a4a }),
    brass: gold,
    flash: 'gold',
    light: 0xffd27a,
    smoke: 0xf0d8a0,
    glow: [],
    decorate: ({ body, add, scene, parts }) => {
      const ruby = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xff2a3a, roughness: 0.02, transmission: 0.8, thickness: 3, ior: 2.2, emissive: 0x600010, emissiveIntensity: 0.6 });
      // Scarabée sur le flanc gauche (celui que voit le joueur).
      const scarab = new THREE.Group();
      scarab.position.set(430, 0, -18);
      scarab.rotation.y = Math.PI;
      body.add(scarab);
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), gold);
      shell.scale.set(16, 11, 5);
      scarab.add(shell);
      const head = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), gold);
      head.scale.set(6, 6, 4);
      head.position.set(-17, 0, 1);
      scarab.add(head);
      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0);
      wingShape.quadraticCurveTo(26, 14, 38, 2);
      wingShape.quadraticCurveTo(22, -4, 0, 0);
      const wings = [-1, 1].map((side) => {
        const pivot = new THREE.Group();
        pivot.position.set(-6, side * 3, 4);
        scarab.add(pivot);
        const wing = new THREE.Mesh(extrude(wingShape, 1.4, 0.4), lapis);
        wing.scale.y = side;
        pivot.add(wing);
        return { pivot, side };
      });
      // Disque solaire ailé au-dessus du couvercle.
      const sun = add(new THREE.CylinderGeometry(9, 9, 3, 32), gold, 380, 48, 0);
      sun.rotation.x = Math.PI / 2;
      add(new THREE.SphereGeometry(5, 14, 10), ruby, 380, 48, 2);
      [-1, 1].forEach((side) => {
        const w = add(extrude(wingShape, 1.4, 0.4), gold, 380 + side * 8, 48, 0);
        w.scale.set(side * 1.3, 0.8, 1);
        add(new THREE.CylinderGeometry(1.2, 1.2, 12, 8), gold, 380, 40, 0);
      });
      // Cobra dressé au-dessus de la bouche.
      parts.muzzle.material = [gold, gold];
      const cobraCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(840, 12, 0),
        new THREE.Vector3(868, 22, 0),
        new THREE.Vector3(876, 40, 0),
        new THREE.Vector3(870, 56, 0),
      ]);
      body.add(new THREE.Mesh(taperedTube(cobraCurve, 30, 6, 10, (t) => 1 - t * 0.35), gold));
      const hood = new THREE.Shape();
      hood.moveTo(0, -14);
      hood.quadraticCurveTo(16, -6, 10, 14);
      hood.quadraticCurveTo(0, 20, -10, 14);
      hood.quadraticCurveTo(-16, -6, 0, -14);
      const hoodMesh = add(extrude(hood, 3, 0.8), lapis, 872, 52, 0);
      hoodMesh.rotation.y = Math.PI / 2;
      const cobraHead = add(new THREE.SphereGeometry(1, 16, 12), gold, 878, 62, 0);
      cobraHead.scale.set(10, 5, 6);
      [-1, 1].forEach((side) => add(new THREE.SphereGeometry(1.6, 10, 8), ruby, 882, 64, side * 3.8));

      const sand = particleSystem(scene, softDotTexture('pharaoh-sand', 'rgba(255,230,160,1)', 'rgba(220,170,80,0)'), { max: 120 });
      const emitter = anchorAt(body, 0, 0, 0);
      const mouth = anchorAt(body, 905, 4, 0);
      const tmp = new THREE.Vector3();
      const spread = { x: 0, v: 0 };
      let clock = 0;
      return {
        update: (dt, time) => {
          springStep(spread, 0, 30, dt);
          wings.forEach(({ pivot, side }) => {
            pivot.rotation.x = side * (0.15 + Math.max(0, spread.x) * 1.2 + Math.sin(time * 2) * 0.05);
          });
          clock += dt;
          while (clock > 0.05) {
            clock -= 0.05;
            const a = Math.random() * Math.PI * 2;
            emitter.position.set(100 + Math.random() * 800, -40 + Math.sin(a) * 60, Math.cos(a) * 60);
            emitter.getWorldPosition(tmp);
            sand.spawn(tmp, new THREE.Vector3(0.02, 0.005, (Math.random() - 0.5) * 0.01), { life: 1400, size: 0.0014 + Math.random() * 0.0012, drag: 0 });
          }
          sand.update(dt);
        },
        onFire: () => {
          spread.v += 9;
          mouth.getWorldPosition(tmp);
          for (let i = 0; i < 20; i += 1) {
            sand.spawn(tmp, new THREE.Vector3((Math.random() - 0.3) * 1.2, (Math.random() - 0.3) * 0.8, (Math.random() - 0.5) * 1.2), { life: 700, size: 0.002, drag: 2.5, gravity: -1 });
          }
        },
      };
    },
  };
}

// =============================================================================
// HOLOGRAMME — l'arme n'est qu'une projection. Toutes ses pièces deviennent une
// lumière cyan translucide balayée de lignes de trame qui défilent, avec un
// front de « matérialisation » qui la parcourt en boucle ; chaque pièce est
// soulignée de ses arêtes en fil de fer. L'image décroche par moments (glitch
// de position et de transparence), des glyphes de données flottent autour, et
// chaque tir la fait se dé-pixelliser un instant.
// =============================================================================

function hologramFinish(env, geo) {
  const scan = tiledTexture('holo-scan', 256, (ctx, size) => {
    ctx.fillStyle = '#3a8aa0';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 4) {
      ctx.fillStyle = 'rgba(160,250,255,0.8)';
      ctx.fillRect(0, y, size, 1);
    }
  }, { color: true, repeat: 0.02 });
  const holo = (strength) =>
    animateEmissive(
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: 0x5ff7ff,
        emissiveMap: scan,
        emissiveIntensity: strength,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
      geo.uniforms,
      `
        float sweep = fract(uTime * 0.22);
        float front = smoothstep(sweep - 0.03, sweep, vEmissiveMapUv.x) - smoothstep(sweep, sweep + 0.01, vEmissiveMapUv.x);
        float lines = 0.55 + 0.45 * sin(vEmissiveMapUv.y * 1800.0 - uTime * 24.0);
        totalEmissiveRadiance = totalEmissiveRadiance * lines + vec3(0.7, 1.0, 1.0) * front * 2.5 + totalEmissiveRadiance * uFlare * 2.0;
      `,
    );
  const face = holo(1.1);
  const wallMat = holo(0.6);
  return {
    ...allFaces([face, wallMat]),
    buttPad: [wallMat, wallMat],
    metal: face,
    barrel: face,
    dark: holo(0.3),
    sight: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    brass: face,
    flash: 'plasma',
    light: 0x5ff7ff,
    smoke: 0x9ffcff,
    glow: [],
    makeShell: () => new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.008, 0.008, 0.008)), new THREE.LineBasicMaterial({ color: 0x9ffcff })),
    decorate: ({ body, scene }) => {
      // Arêtes en fil de fer de toutes les pièces déjà posées.
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x9ffcff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      const meshes = [];
      body.traverse((o) => {
        if (o.isMesh) meshes.push(o);
      });
      meshes.forEach((m) => {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 28), edgeMat);
        m.add(edges);
      });
      // Glyphes de données en orbite.
      const glyphTex = (text) => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#9ffcff';
        ctx.font = 'bold 40px monospace';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 8, 34);
        const t = new THREE.CanvasTexture(canvas);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      const labels = ['0x4F', 'A7', '1101', 'FF', '3C9', '0110', 'E2', 'B8'].map((text, i) => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTex(text), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        sprite.scale.set(34, 17, 1);
        body.add(sprite);
        return { sprite, phase: (i / 8) * Math.PI * 2 };
      });
      const pixels = particleSystem(scene, softDotTexture('holo-pixel', 'rgba(200,255,255,1)', 'rgba(95,247,255,0)'), { max: 120 });
      const emitter = anchorAt(body, 0, 0, 0);
      const tmp = new THREE.Vector3();
      // Position de base lue au premier affichage : le modèle recentre `body` après decorate().
      let baseX = null;
      let glitchUntil = 0;
      return {
        update: (dt, time, flare) => {
          const now = performance.now();
          if (now > glitchUntil + 900 && Math.random() < dt * 0.8) glitchUntil = now + 90;
          const glitch = now < glitchUntil;
          if (baseX === null) baseX = body.position.x;
          body.position.x = baseX + (glitch ? (Math.random() - 0.5) * 8 : 0);
          edgeMat.opacity = glitch ? 0.3 + Math.random() * 0.5 : 0.8 + flare * 0.2;
          labels.forEach(({ sprite, phase }, i) => {
            const a = time * 0.5 + phase;
            sprite.position.set(450 + Math.cos(a) * 380, 30 + Math.sin(a * 1.7 + i) * 60, Math.sin(a) * 70);
            sprite.material.opacity = 0.4 + 0.4 * Math.sin(time * 3 + i);
          });
          pixels.update(dt);
        },
        onFire: () => {
          for (let i = 0; i < 24; i += 1) {
            emitter.position.set(Math.random() * 900, -80 + Math.random() * 120, (Math.random() - 0.5) * 40);
            emitter.getWorldPosition(tmp);
            pixels.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2), { life: 350, size: 0.003, drag: 3 });
          }
        },
      };
    },
  };
}

export const VANDAL_LEGEND_SKINS = {
  aurora: { labelKey: 'aimTrainer.skinAurora', build: auroraFinish },
  sakura: { labelKey: 'aimTrainer.skinSakura', build: sakuraFinish },
  radiation: { labelKey: 'aimTrainer.skinRadiation', build: radiationFinish },
  pharaoh: { labelKey: 'aimTrainer.skinPharaoh', build: pharaohFinish },
  hologram: { labelKey: 'aimTrainer.skinHologram', build: hologramFinish },
};
