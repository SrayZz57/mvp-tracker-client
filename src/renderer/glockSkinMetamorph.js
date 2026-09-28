import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { seeded, tiledTexture, speckle, particleSystem, softDotTexture, springStep, anchorAt } from './weaponKit.js';
import { G_LIVERY, SLIDE, livery, tracePolygon } from './glockSkins.js';
import { captureParts, placePart, restorePart, shockRings, easeOutBack, easeOutCubic, clamp01 } from './transcendentKit.js';

// MÉTAMORPHE — palier Transcendant du Glock. Un pistolet-mécha : culasse en
// blindage céramique blanc à coutures d'énergie, carcasse gunmetal alvéolée,
// accents orange. Des volets de blindage s'entrouvrent sur des bobines
// d'induction, deux rails prolongent le canon avec des arcs électriques
// permanents, une turbine tourne sur la carcasse, une cellule d'énergie se
// vide et se recharge dans la poignée, un iris-réacteur regarde le joueur à
// l'arrière de la culasse. À l'apparition, l'arme se déplie depuis un cube.
//
// Repère : culasse x 0 → 186, y 0 → 30 (bouge au recul), axe du canon y = 16,
// poignée jusqu'à y ≈ -104. Tout reste sous la ligne de visée (y < 30).

const CYAN = new THREE.Color(0x35e0ff);
const ORANGE = 0xff6a1a;
const INTRO = 1.35;
const CUBE_CENTER = new THREE.Vector3(80, -40, 0);

// Émissif piloté par l'énergie de l'arme (`uPower`, 0 pendant le dépliage) :
// l'énergie circule le long des coutures.
function powered(material, uniforms, power, glsl) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uFlare = uniforms.uFlare;
    shader.uniforms.uPower = power;
    shader.fragmentShader = `uniform float uTime;\nuniform float uFlare;\nuniform float uPower;\n${shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${glsl}`)}`;
  };
  material.customProgramCacheKey = () => `metamorph-${glsl}`;
  return material;
}

function hexGrid(ctx, area, r, stroke, width) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  for (let row = 0; row * r * 1.5 < area.maxY - area.minY + r * 2; row += 1) {
    for (let col = 0; col * r * 1.732 < area.maxX - area.minX + r * 2; col += 1) {
      const cx = area.minX + col * r * 1.732 + (row % 2 ? r * 0.866 : 0);
      const cy = area.minY + row * r * 1.5;
      ctx.beginPath();
      for (let k = 0; k <= 6; k += 1) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
      }
      ctx.stroke();
    }
  }
}

function metamorphFinish(env, { uniforms }) {
  const power = { value: 1 };
  const frameArea = { minX: G_LIVERY.minX, maxX: G_LIVERY.maxX, minY: G_LIVERY.minY, maxY: -1 };
  const paint = (ctx, mode) => {
    const glow = mode === 'glow';
    const rough = mode === 'rough';
    if (!glow) {
      // Carcasse gunmetal alvéolée sous y = 0, blindage céramique au-dessus.
      ctx.fillStyle = rough ? '#8a8a8a' : '#1c1f25';
      ctx.fillRect(frameArea.minX, frameArea.minY, frameArea.maxX - frameArea.minX, frameArea.maxY - frameArea.minY);
      hexGrid(ctx, frameArea, 3.2, rough ? '#b0b0b0' : '#2e333d', 0.5);
      ctx.fillStyle = rough ? '#5a5a5a' : '#d9dde3';
      tracePolygon(ctx, SLIDE);
      ctx.fill();
      if (!rough) speckle(ctx, { minX: 0, maxX: 186, minY: 0, maxY: 30 }, 5000, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.3)'], 0.3, seeded(8101));
      // Lignes de panneaux du blindage.
      ctx.strokeStyle = rough ? '#999999' : '#5a6068';
      ctx.lineWidth = 0.5;
      [[0, 9, 186, 9], [0, 23, 186, 23], [38, 9, 38, 30], [96, 9, 96, 23], [150, 0, 150, 30], [124, 23, 124, 30]].forEach(([a, b, c, d]) => {
        ctx.beginPath();
        ctx.moveTo(a, b);
        ctx.lineTo(c, d);
        ctx.stroke();
      });
      // Bandes de danger à l'avant de la culasse.
      ctx.save();
      ctx.beginPath();
      ctx.rect(154, 0, 32, 8);
      ctx.clip();
      for (let x = 140; x < 200; x += 6) {
        ctx.fillStyle = rough ? '#6a6a6a' : '#ff6a1a';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 3, 0);
        ctx.lineTo(x + 11, 8);
        ctx.lineTo(x + 8, 8);
        ctx.fill();
      }
      ctx.restore();
      // Liseré orange sous le cache-poussière et marquages de la poignée.
      ctx.fillStyle = rough ? '#6a6a6a' : '#ff6a1a';
      ctx.fillRect(116, -14, 56, 1.2);
      ctx.fillRect(-4, -60, 2, 30);
    }
    // Coutures d'énergie (flux cyan).
    ctx.strokeStyle = glow ? '#35e0ff' : rough ? '#444444' : '#2a8fa6';
    ctx.lineWidth = glow ? 1.4 : 1;
    [[6, 16, 150, 16], [40, 26, 120, 26], [120, -8, 170, -8], [2, 4, 36, 4], [-5, -34, -11, -96]].forEach(([a, b, c, d]) => {
      ctx.beginPath();
      ctx.moveTo(a, b);
      ctx.lineTo(c, d);
      ctx.stroke();
    });
    if (glow) {
      // Fenêtre de la cellule d'énergie dans la poignée.
      ctx.fillStyle = '#35e0ff';
      for (let k = 0; k < 8; k += 1) ctx.fillRect(6 + k * 2.3, -96 + k * 6.4, 14, 4);
    }
  };
  const color = livery('meta-color', (ctx) => paint(ctx, 'color'), { background: '#1c1f25', color: true });
  const roughMap = livery('meta-rough', (ctx) => paint(ctx, 'rough'), { background: '#8a8a8a' });
  const glow = livery('meta-glow', (ctx) => paint(ctx, 'glow'), { background: '#000000', color: true });
  const armor = powered(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1, map: color, roughnessMap: roughMap, roughness: 1, metalness: 0.15, clearcoat: 0.6, clearcoatRoughness: 0.2, bumpMap: roughMap, bumpScale: 0.4, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 2.4 }),
    uniforms,
    power,
    `
      float flow = 0.45 + 1.6 * pow(fract(vEmissiveMapUv.x * 3.0 - uTime * 1.2), 6.0);
      // Cellule d'énergie : niveau qui descend au tir et remonte.
      float cell = step(vEmissiveMapUv.y, 0.244 + 0.275 * clamp(uPower - uFlare * 0.6, 0.0, 1.0));
      totalEmissiveRadiance *= uPower * (flow + uFlare * 2.0) * mix(1.0, cell * 1.6, step(vEmissiveMapUv.y, 0.53));
    `,
  );
  const armorWall = new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xc9ced6, roughness: 0.4, clearcoat: 0.5 });
  const frameWall = new THREE.MeshStandardMaterial({ envMap: env, color: 0x1c1f25, metalness: 0.7, roughness: 0.45 });
  const orange = new THREE.MeshStandardMaterial({ envMap: env, color: ORANGE, metalness: 0.6, roughness: 0.35 });
  return {
    slide: armor,
    slideWall: armorWall,
    frame: armor,
    frameWall,
    barrel: new THREE.MeshStandardMaterial({ envMap: env, color: 0x2a2e36, metalness: 0.95, roughness: 0.2 }),
    steel: orange,
    sight: new THREE.MeshBasicMaterial({ color: CYAN }),
    dot: new THREE.MeshBasicMaterial({ color: CYAN }),
    flash: 'plasma',
    light: 0x35e0ff,
    smoke: 0xc8f4ff,
    makeShell: () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.016, 12), new THREE.MeshStandardMaterial({ color: 0x2a2e36, metalness: 1, roughness: 0.2 })));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0047, 0.0047, 0.004, 12), new THREE.MeshBasicMaterial({ color: CYAN })));
      return g;
    },
    decorate: (ctx) => decorateMetamorph({ ...ctx, env, power, armorWall, frameWall, orange }),
  };
}

function decorateMetamorph({ model, slide, add, scene, uniforms, env, power, armorWall, frameWall, orange }) {
  const cyanMat = new THREE.MeshBasicMaterial({ color: CYAN.clone() });
  const glowTex = softDotTexture('meta-glow', 'rgba(200,250,255,1)', 'rgba(53,224,255,0)');
  const dark = new THREE.MeshStandardMaterial({ envMap: env, color: 0x121418, metalness: 0.8, roughness: 0.35 });
  const copper = new THREE.MeshStandardMaterial({ envMap: env, color: 0xc87533, metalness: 1, roughness: 0.25, emissive: 0x35e0ff, emissiveIntensity: 0.4 });
  const glowMats = [cyanMat];

  // --- Volets de blindage (charnière en haut) et bobines d'induction dessous ---
  const wings = [-1, 1].map((side) => {
    const z = side * 12.6;
    for (let k = 0; k < 6; k += 1) {
      const coil = add(new THREE.TorusGeometry(3.4, 1.1, 8, 20), copper, 50 + k * 11, 17, z + side * 0.4, slide);
      coil.rotation.y = side > 0 ? 0 : Math.PI;
      add(new THREE.CircleGeometry(2.3, 16), cyanMat, 50 + k * 11, 17, z + side * 0.2, slide).rotation.y = side > 0 ? 0 : Math.PI;
    }
    const pivot = new THREE.Group();
    pivot.position.set(78, 25.5, side * 13.4);
    slide.add(pivot);
    const plate = new THREE.Mesh(new RoundedBoxGeometry(80, 14, 1.8, 2, 0.6), armorWall);
    plate.position.set(0, -7, side * 0.9);
    pivot.add(plate);
    const stripe = new THREE.Mesh(new RoundedBoxGeometry(80.4, 1.2, 1.9, 1, 0.4), orange);
    stripe.position.set(0, -13.2, side * 0.9);
    pivot.add(stripe);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(60, 0.6, 0.4), cyanMat);
    seam.position.set(4, -4, side * 1.9);
    pivot.add(seam);
    const leak = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: CYAN, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
    leak.scale.set(90, 22, 1);
    leak.position.set(78, 16, side * 16);
    slide.add(leak);
    return { pivot, side, leak, open: { x: 0, v: 0 } };
  });

  // --- Rails de canon : deux mâchoires qui prolongent la culasse --------------
  const rails = new THREE.Group();
  slide.add(rails);
  [-1, 1].forEach((side) => {
    const rail = new THREE.Mesh(new RoundedBoxGeometry(70, 9, 3.2, 2, 1), armorWall);
    rail.position.set(222, 16, side * 8.4);
    rails.add(rail);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(62, 2.2, 0.4), cyanMat);
    inner.position.set(224, 16, side * 6.7);
    rails.add(inner);
    const tip = new THREE.Mesh(new RoundedBoxGeometry(10, 12, 4, 2, 1), orange);
    tip.position.set(254, 16, side * 8.6);
    rails.add(tip);
  });
  const bridge = new THREE.Mesh(new RoundedBoxGeometry(12, 4, 20, 2, 1), dark);
  bridge.position.set(191, 5, 0);
  rails.add(bridge);
  const holoTex = tiledTexture('meta-holo', 256, (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const c = size / 2;
    ctx.strokeStyle = '#35e0ff';
    ctx.lineWidth = 4;
    for (let k = 0; k < 24; k += 1) {
      if (k % 4 === 3) continue;
      ctx.beginPath();
      ctx.arc(c, c, c * 0.86, (k / 24) * Math.PI * 2, ((k + 0.7) / 24) * Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c, c, c * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 60; k += 1) {
      const a = (k / 60) * Math.PI * 2;
      const r0 = c * (k % 5 ? 0.74 : 0.72);
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      ctx.lineTo(c + Math.cos(a) * c * 0.78, c + Math.sin(a) * c * 0.78);
      ctx.stroke();
    }
  }, { color: true });
  const holo = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), new THREE.MeshBasicMaterial({ map: holoTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.8 }));
  holo.rotation.y = Math.PI / 2;
  holo.position.set(236, 16, 0);
  rails.add(holo);
  const pulseRings = [200, 220, 240].map((x) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.6, 8, 32), new THREE.MeshBasicMaterial({ color: CYAN.clone(), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.y = Math.PI / 2;
    m.position.set(x, 16, 0);
    rails.add(m);
    return m;
  });

  // Arcs électriques entre les rails : lignes brisées régénérées ~30 fois/s.
  const arcMat = new THREE.LineBasicMaterial({ color: 0xbff6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const ARC_POINTS = 10;
  const arcs = Array.from({ length: 4 }, () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_POINTS * 3), 3));
    const line = new THREE.Line(geo, arcMat);
    line.frustumCulled = false;
    rails.add(line);
    return line;
  });
  const zapArcs = (strength) => {
    arcs.forEach((line, i) => {
      const pos = line.geometry.attributes.position;
      const x = 196 + Math.random() * 52;
      const visible = i < 1 + Math.round(strength * 3);
      line.visible = visible;
      for (let k = 0; k < ARC_POINTS; k += 1) {
        const t = k / (ARC_POINTS - 1);
        const jitter = k === 0 || k === ARC_POINTS - 1 ? 0 : 1;
        pos.setXYZ(k, x + (Math.random() - 0.5) * 6 * jitter * (1 + strength), 16 + (Math.random() - 0.5) * 5 * jitter * (1 + strength), -6.4 + t * 12.8);
      }
      pos.needsUpdate = true;
    });
  };

  // --- Turbine sur chaque flanc de la carcasse ---------------------------------
  const turbines = [-1, 1].map((side) => {
    const g = new THREE.Group();
    g.position.set(142, -8.2, side * 14);
    model.add(g);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(6.2, 1, 8, 32), orange);
    g.add(bezel);
    const back = new THREE.Mesh(new THREE.CircleGeometry(5.6, 24), cyanMat);
    back.position.z = -side * 0.4;
    back.rotation.y = side > 0 ? 0 : Math.PI;
    g.add(back);
    const rotor = new THREE.Group();
    g.add(rotor);
    for (let k = 0; k < 7; k += 1) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.1, 5.2, 0.8), dark);
      const a = (k / 7) * Math.PI * 2;
      blade.position.set(Math.cos(a) * 2.8, Math.sin(a) * 2.8, side * 0.3);
      blade.rotation.set(side * 0.5, 0, a - Math.PI / 2);
      rotor.add(blade);
    }
    rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.6, 12), orange).rotateX(Math.PI / 2));
    return rotor;
  });

  // --- Iris-réacteur à l'arrière de la culasse (face au joueur) ---------------
  const iris = new THREE.Group();
  iris.position.set(-1.2, 14, 0);
  iris.rotation.y = -Math.PI / 2;
  slide.add(iris);
  iris.add(new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.9, 8, 36), orange));
  const irisCore = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), cyanMat);
  irisCore.position.z = 0.3;
  iris.add(irisCore);
  const irisBlades = new THREE.Group();
  iris.add(irisBlades);
  for (let k = 0; k < 6; k += 1) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 0.5), cyanMat);
    const a = (k / 6) * Math.PI * 2;
    b.position.set(Math.cos(a) * 4.4, Math.sin(a) * 4.4, 0.3);
    b.rotation.z = a;
    irisBlades.add(b);
  }
  const irisGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: CYAN, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
  irisGlow.scale.set(22, 22, 1);
  iris.add(irisGlow);

  // --- Effets -------------------------------------------------------------------
  const sparks = particleSystem(scene, glowTex, { max: 160 });
  const steam = particleSystem(scene, softDotTexture('meta-steam', 'rgba(230,240,245,0.7)', 'rgba(230,240,245,0)'), { max: 40 });
  const shock = shockRings(scene, { color: 0x35e0ff, count: 8, thickness: 0.035 });
  const mouth = anchorAt(slide, 258, 16, 0);
  const vents = [-1, 1].map((side) => anchorAt(slide, 78, 12, side * 16));
  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const spinUp = { x: 0, v: 0 };
  let arcClock = 0;
  let zap = 0;
  let time = 0;
  let pulseT = 1;
  let rotorAngle = 0;

  // --- Apparition : le cube se déplie pièce par pièce ---------------------------
  const cubeGroup = new THREE.Group();
  cubeGroup.position.copy(CUBE_CENTER);
  model.add(cubeGroup);
  const cubeFaces = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ].map(([x, y, z]) => {
    const n = new THREE.Vector3(x, y, z);
    const face = new THREE.Group();
    face.position.copy(n).multiplyScalar(30);
    face.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0x0c1a22, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    face.add(plate);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(60, 60)), new THREE.LineBasicMaterial({ color: CYAN, transparent: true }));
    face.add(edges);
    cubeGroup.add(face);
    return { face, n, plate, edges };
  });
  cubeGroup.visible = false;

  const pieces = captureParts([model, slide], [slide, cubeGroup]);
  pieces.sort((a, b) => a.center.distanceTo(CUBE_CENTER) - b.center.distanceTo(CUBE_CENTER));
  const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  pieces.forEach((p, i) => {
    p.delay = 0.22 + (i / pieces.length) * 0.72;
    p.fold = new THREE.Quaternion().setFromAxisAngle(axes[i % 3], (i % 2 ? 1 : -1) * Math.PI * (0.5 + (i % 3) * 0.5));
    p.locked = false;
  });
  let introT = -1;
  const delta = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const ID = new THREE.Quaternion();
  const worldOf = (obj, local) => obj.localToWorld(tmp.copy(local));
  const finishIntro = () => {
    introT = -1;
    pieces.forEach((p) => {
      restorePart(p);
      p.object.visible = true;
    });
    cubeGroup.visible = false;
    power.value = 1;
  };
  const runIntro = (dt) => {
    introT += dt;
    const t = introT;
    // Le cube apparaît, puis ses faces s'écartent et s'éteignent.
    cubeGroup.visible = t < 0.6;
    const open = clamp01((t - 0.12) / 0.4);
    cubeGroup.scale.setScalar(easeOutBack(clamp01(t / 0.14)) * (1 - open * 0.2));
    cubeFaces.forEach((f) => {
      f.face.position.copy(f.n).multiplyScalar(30 + easeOutCubic(open) * 60);
      f.plate.material.opacity = 0.85 * (1 - open);
      f.edges.material.opacity = 1 - open;
    });
    power.value = clamp01((t - INTRO + 0.35) / 0.35);
    pieces.forEach((p) => {
      const s = clamp01((t - p.delay) / 0.26);
      p.object.visible = t > 0.06;
      if (s >= 1) {
        if (!p.locked) {
          p.locked = true;
          restorePart(p);
          const w = worldOf(p.object.parent, p.center);
          for (let i = 0; i < 4; i += 1) sparks.spawn(w, new THREE.Vector3((Math.random() - 0.5) * 0.5, Math.random() * 0.4, (Math.random() - 0.5) * 0.5), { life: 260, size: 0.0022, drag: 3, tint: 0x9ff0ff });
        }
        return;
      }
      const e = s <= 0 ? 0 : easeOutBack(s);
      delta.copy(CUBE_CENTER).sub(p.center).multiplyScalar((1 - e) * 0.88);
      rot.copy(p.fold).slerp(ID, clamp01(e));
      placePart(p, 0.28 + 0.72 * clamp01(e), delta, rot);
    });
    if (t >= INTRO) {
      finishIntro();
      mouth.getWorldPosition(tmp);
      slide.getWorldQuaternion(quat);
      shock.spawn(tmp, quat, { reach: 0.05, life: 300, peak: 1 });
      wings.forEach((w) => (w.open.v += 14));
      spinUp.v += 30;
    }
  };

  return {
    muzzleX: 258,
    introDuration: INTRO,
    replayIntro: () => {
      introT = 0;
      pieces.forEach((p) => (p.locked = false));
      runIntro(0);
    },
    update: (dt, t, flare) => {
      time += dt;
      const energy = power.value;
      // Volets entrouverts qui « respirent », grand ouverts au tir.
      wings.forEach((w) => {
        springStep(w.open, 0, 90, dt);
        const angle = 0.3 + 0.06 * Math.sin(time * 2.2) + Math.max(0, w.open.x) * 0.9;
        w.pivot.rotation.x = -w.side * angle;
        w.leak.material.opacity = energy * (0.3 + angle * 0.6 + flare);
      });
      springStep(spinUp, 0, 6, dt);
      rotorAngle += (4 + Math.max(0, spinUp.x) * 3) * dt * energy;
      turbines.forEach((r, i) => (r.rotation.z = (i ? -1 : 1) * rotorAngle));
      irisBlades.rotation.z = -rotorAngle * 0.4;
      holo.rotation.x = time * 0.8 + spinUp.x * 0.3;
      holo.material.opacity = energy * (0.55 + flare * 0.45);
      holo.scale.setScalar(1 + flare * 0.25);
      const beat = 0.7 + 0.3 * Math.sin(time * 3.2);
      irisGlow.material.opacity = energy * (0.45 + 0.2 * beat + flare * 0.5);
      glowMats.forEach((m) => m.color.copy(CYAN).multiplyScalar(energy * (0.9 + 0.3 * beat + flare * 1.5)));
      copper.emissiveIntensity = energy * (0.3 + flare * 2);

      // Anneaux d'accélération allumés en séquence après le tir.
      pulseT = Math.min(1, pulseT + dt / 0.09);
      pulseRings.forEach((ring, i) => {
        const local = clamp01((pulseT * 3 - i) * 1.5);
        ring.material.opacity = energy * (0.25 + (local > 0 && local < 1 ? 1 - local : 0) * 2);
        ring.scale.setScalar(1 + (local > 0 && local < 1 ? (1 - local) * 0.6 : 0));
      });

      zap = Math.max(0, zap - dt * 5);
      arcClock += dt;
      if (arcClock > 0.035) {
        arcClock = 0;
        zapArcs(zap);
        arcMat.opacity = energy * (0.35 + zap * 0.65) * (Math.random() < 0.15 ? 0.2 : 1);
      }

      if (introT >= 0) runIntro(dt);
      sparks.update(dt);
      steam.update(dt);
      shock.update();
    },
    onFire: () => {
      zap = 1;
      pulseT = 0;
      spinUp.v += 20;
      wings.forEach((w) => (w.open.v += 16));
      mouth.getWorldPosition(tmp);
      slide.getWorldQuaternion(quat);
      shock.spawn(tmp, quat, { reach: 0.03, life: 150, from: 0.004, peak: 1 });
      shock.spawn(tmp, quat, { reach: 0.05, life: 240, from: 0.004, peak: 0.5, delay: 30 });
      for (let i = 0; i < 12; i += 1) {
        sparks.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.3) * 1.2, (Math.random() - 0.5) * 1.6), { life: 220, size: 0.0018, drag: 4, tint: 0xbff6ff });
      }
      // Vapeur qui s'échappe sous les volets.
      vents.forEach((v) => {
        v.getWorldPosition(tmp);
        for (let i = 0; i < 3; i += 1) steam.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.08 + Math.random() * 0.08, (Math.random() - 0.5) * 0.1), { life: 600, size: 0.01, grow: 2, drag: 2, additive: false, peak: 0.35, tint: 0xe8f4ff });
      });
    },
  };
}

export const GLOCK_TRANSCENDENT_SKINS = {
  metamorph: { build: metamorphFinish },
};
