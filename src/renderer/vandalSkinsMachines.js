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
  extrudeAlongX,
  roundedShape,
  springStep,
  taperedTube,
  anchorAt,
} from './weaponKit.js';
import { LIVERY, livery, tracePolygon, alongMagazine } from './vandalSkins.js';

// Skins « Ultra » de la Vandal tirés de machines : Patchbay (synthétiseur
// modulaire) et Apex Downforce (monoplace). Mêmes règles que le dossier :
// silhouette Vandal lisible, rien au-dessus du couvercle dans la ligne de mire,
// éléments vivants sur le flanc gauche (-z, celui que voit le joueur).
//
// Cotes utiles du modèle (mm) : faces gauches de la carcasse z = -17, du
// couvercle -16,5, du garde-main -25, du chargeur -14,2.

function faces(pair) {
  return { receiver: pair, dustCover: pair, magwell: pair, gasBlock: pair, muzzle: pair, stock: pair, grip: pair, handguard: pair, upperGuard: pair, magazine: pair };
}

function canvasTexture(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { canvas, ctx: canvas.getContext('2d'), texture };
}

// Cylindre dont l'axe sort du flanc gauche (-z), base posée en z = 0.
function outward(group, rt, rb, h, z, material, seg = 24) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.z = z;
  group.add(mesh);
  return mesh;
}

// Le disque d'âme du canon d'origine flotte devant les bouches remplacées.
function hideBore(body) {
  body.children.forEach((m) => {
    if (m.geometry?.type === 'CircleGeometry' && m.position.x > 900) m.visible = false;
  });
}

// =============================================================================
// PATCHBAY — studio modulaire & synthétiseur analogique
// =============================================================================

const PHOSPHOR = '#52ff8a';
const AMBER = '#ffb23d';

function brushed(ctx, area, rand, count) {
  ctx.lineWidth = 0.25;
  for (let i = 0; i < count; i += 1) {
    const x = area.minX + rand() * (area.maxX - area.minX);
    const y = area.minY + rand() * (area.maxY - area.minY);
    ctx.strokeStyle = rand() < 0.6 ? `rgba(255,255,255,${0.02 + rand() * 0.05})` : `rgba(0,0,0,${0.1 + rand() * 0.2})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 20 + rand() * 120, y);
    ctx.stroke();
  }
}

function walnutGrain(ctx, rand, bump) {
  ctx.lineCap = 'round';
  for (let y = LIVERY.minY; y < LIVERY.maxY; y += 0.9 + rand() * 1.1) {
    const dark = rand() < 0.55;
    ctx.strokeStyle = bump
      ? `rgba(0,0,0,${0.1 + rand() * 0.25})`
      : dark ? `rgba(40,20,8,${0.18 + rand() * 0.35})` : `rgba(140,96,58,${0.12 + rand() * 0.25})`;
    ctx.lineWidth = 0.3 + rand() * 0.9;
    const phase = rand() * 6;
    const amp = 0.8 + rand() * 2.5;
    ctx.beginPath();
    for (let x = LIVERY.minX; x <= LIVERY.maxX; x += 8) {
      const yy = y + Math.sin(x * 0.012 + phase) * amp + Math.sin(x * 0.05 + phase * 2) * 0.4;
      if (x === LIVERY.minX) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // Pores ouverts du noyer : courts traits sombres dans le sens du fil.
  ctx.fillStyle = bump ? 'rgba(0,0,0,0.5)' : 'rgba(25,12,4,0.55)';
  for (let i = 0; i < 26000; i += 1) {
    ctx.fillRect(LIVERY.minX + rand() * (LIVERY.maxX - LIVERY.minX), LIVERY.minY + rand() * (LIVERY.maxY - LIVERY.minY), 0.8 + rand() * 1.6, 0.25);
  }
}

// Modules du rack sur le flanc gauche de la carcasse (y de -21 à 19).
const PANEL_TOP = 19;
const PANEL_BOTTOM = -21;
const MODULES = [
  { x0: 234, x1: 282, label: 'VCO', knobs: [[258, 3, 7]], jacks: [[246, -14, 'in'], [270, -14, 'out']], leds: [[258, -8]] },
  { x0: 284, x1: 334, label: 'LFO', knobs: [[309, 3, 6.5, 'lfo']], jacks: [[297, -14, 'in'], [321, -14, 'out']], leds: [[321, -6]] },
  { x0: 336, x1: 402, label: 'SCOPE', scope: true, jacks: [[346, -16, 'in'], [392, -16, 'in']] },
  { x0: 404, x1: 452, label: 'VCF', knobs: [[428, 4, 6.5], [416, -8, 4], [440, -8, 4]], jacks: [[428, -16, 'out']] },
  { x0: 454, x1: 500, label: 'VCA', knobs: [[477, 3, 6]], jacks: [[466, -14, 'in'], [488, -14, 'out']] },
];

function panelFace(module, index) {
  const ppm = 8;
  const w = module.x1 - module.x0;
  const h = PANEL_TOP - PANEL_BOTTOM;
  const { canvas, ctx, texture } = canvasTexture(w * ppm, h * ppm);
  const px = (x) => (x - module.x0) * ppm;
  const py = (y) => (PANEL_TOP - y) * ppm;
  ctx.fillStyle = '#1d1e23';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(ppm, ppm);
  brushed(ctx, { minX: 0, maxX: w, minY: 0, maxY: h }, seeded(7100 + index), 500);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
  // Vis M3 aux quatre coins.
  [[3.5, 3], [w - 3.5, 3], [3.5, h - 3], [w - 3.5, h - 3]].forEach(([x, y]) => {
    ctx.fillStyle = '#9a9ea7';
    ctx.beginPath();
    ctx.arc(x * ppm, y * ppm, 1.5 * ppm, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a2b30';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo((x - 1) * ppm, y * ppm);
    ctx.lineTo((x + 1) * ppm, y * ppm);
    ctx.stroke();
  });
  ctx.fillStyle = '#e8e2d0';
  ctx.font = `bold ${3.4 * ppm}px "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(module.label, canvas.width / 2, 5.6 * ppm);
  ctx.fillRect(canvas.width * 0.2, 6.6 * ppm, canvas.width * 0.6, 0.25 * ppm);
  // Graduations autour des potentiomètres (270° de course).
  (module.knobs ?? []).forEach(([x, y, r]) => {
    ctx.strokeStyle = '#e8e2d0';
    ctx.lineWidth = 2;
    for (let k = 0; k <= 10; k += 1) {
      const a = Math.PI * 0.75 + (k / 10) * Math.PI * 1.5;
      const r0 = (r + 2.4) * ppm;
      const r1 = (r + (k % 5 === 0 ? 3.8 : 3.1)) * ppm;
      ctx.beginPath();
      ctx.moveTo(px(x) + Math.cos(a) * r0, py(y) + Math.sin(a) * r0);
      ctx.lineTo(px(x) + Math.cos(a) * r1, py(y) + Math.sin(a) * r1);
      ctx.stroke();
    }
  });
  // Sorties en cartouche inversé, comme sur les vrais modules.
  (module.jacks ?? []).forEach(([x, y, kind]) => {
    if (kind === 'out') {
      ctx.fillStyle = '#e8e2d0';
      ctx.beginPath();
      ctx.roundRect(px(x) - 5.8 * ppm, py(y) - 5.6 * ppm, 11.6 * ppm, 11.6 * ppm, 1.6 * ppm);
      ctx.fill();
    }
    ctx.fillStyle = kind === 'out' ? '#1d1e23' : '#e8e2d0';
    ctx.font = `bold ${1.7 * ppm}px "Segoe UI", sans-serif`;
    ctx.fillText(kind.toUpperCase(), px(x), py(y) - 4.3 * ppm);
  });
  if (module.scope) {
    ctx.fillStyle = '#e8e2d0';
    ctx.font = `${1.7 * ppm}px "Segoe UI", sans-serif`;
    ctx.fillText('CH1', px(346), py(-16) - 4.3 * ppm);
    ctx.fillText('TRIG', px(392), py(-16) - 4.3 * ppm);
  }
  return texture;
}

function patchbayFinish(env, geo) {
  const aluColor = livery('patch-alu', (ctx) => {
    const rand = seeded(7001);
    brushed(ctx, LIVERY, rand, 14000);
    // Jointures des modules et vis : le flanc droit se lit aussi comme un rack.
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 0.7;
    [233, 283, 335, 403, 453, 501].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, -22);
      ctx.lineTo(x, 20);
      ctx.stroke();
    });
    [[240, 15], [276, 15], [290, -18], [328, -18], [342, 15], [396, 15], [410, -18], [446, -18]].forEach(([x, y]) => {
      ctx.fillStyle = '#8d9098';
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });
    // Sérigraphie du rail de patch et du ruban.
    ctx.fillStyle = 'rgba(232,226,208,0.8)';
    for (let x = 262; x <= 460; x += 28) ctx.fillRect(x - 0.3, 20.5, 0.6, 2);
    ctx.fillRect(520, 16, 180, 0.4);
  }, { background: '#1a1b20', color: true });
  const aluRough = livery('patch-alu-rough', (ctx) => brushed(ctx, LIVERY, seeded(7002), 14000), { background: '#5a5a5a' });
  const aluWallTex = tiledTexture('patch-alu-wall', 256, (ctx, size) => {
    ctx.fillStyle = '#1a1b20';
    ctx.fillRect(0, 0, size, size);
    brushed(ctx, { minX: 0, maxX: size, minY: 0, maxY: size }, seeded(7003), 900);
  }, { color: true, repeat: 1 / 80 });
  const alu = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1.1, map: aluColor, roughnessMap: aluRough, roughness: 0.62, metalness: 0.88, anisotropy: 0.6, clearcoat: 0.15 });
  const aluWall = new THREE.MeshPhysicalMaterial({ envMap: env, map: aluWallTex, roughness: 0.3, metalness: 0.9, anisotropy: 0.5 });

  const woodColor = livery('patch-walnut', (ctx) => walnutGrain(ctx, seeded(7010), false), { background: '#5a3a22', color: true });
  const woodBump = livery('patch-walnut-bump', (ctx) => walnutGrain(ctx, seeded(7010), true), { background: '#b0b0b0' });
  const woodWallTex = tiledTexture('patch-walnut-wall', 256, (ctx, size) => {
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(0, 0, size, size);
    const rand = seeded(7011);
    for (let y = 0; y < size; y += 1 + rand() * 2) {
      ctx.fillStyle = rand() < 0.5 ? `rgba(40,20,8,${0.2 + rand() * 0.3})` : `rgba(140,96,58,${0.15 + rand() * 0.2})`;
      ctx.fillRect(0, y, size, 0.6 + rand());
    }
  }, { color: true, repeat: 1 / 60 });
  const wood = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.7, map: woodColor, bumpMap: woodBump, bumpScale: 1.2, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.35 });
  const woodWall = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.7, map: woodWallTex, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.35 });

  const polished = new THREE.MeshStandardMaterial({ envMap: env, color: 0xb4b7be, metalness: 1, roughness: 0.18 });
  return {
    ...faces([alu, aluWall]),
    stock: [wood, woodWall],
    grip: [wood, woodWall],
    buttPad: [alu, aluWall],
    metal: polished,
    barrel: new THREE.MeshStandardMaterial({ envMap: env, color: 0x26272c, metalness: 0.9, roughness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.8 }),
    sight: new THREE.MeshBasicMaterial({ color: PHOSPHOR }),
    brass: new THREE.MeshStandardMaterial({ envMap: env, color: 0xc9a04a, metalness: 1, roughness: 0.22 }),
    flash: 'jade',
    light: 0x52ff8a,
    smoke: 0xb8ffd0,
    glow: [],
    decorate: (ctx) => decoratePatchbay({ ...ctx, geo, env, alu, aluWall, wood, polished }),
  };
}

function decoratePatchbay({ body, add, scene, parts, geo, env, alu, aluWall, polished }) {
  const u = geo.uniforms;
  const brass = new THREE.MeshStandardMaterial({ envMap: env, color: 0xc9a04a, metalness: 1, roughness: 0.22 });
  const bakelite = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.6, color: 0x0c0c0e, roughness: 0.4, clearcoat: 0.4 });
  const white = new THREE.MeshBasicMaterial({ color: 0xf2eee2 });
  const hole = new THREE.MeshStandardMaterial({ color: 0x020203, roughness: 1 });
  const panelBox = new THREE.MeshStandardMaterial({ envMap: env, color: 0x1d1e23, metalness: 0.85, roughness: 0.35 });

  parts.rail.visible = false;
  parts.railGrooves.forEach((g) => (g.visible = false));
  parts.muzzle.visible = false;
  parts.rearSight.visible = false;
  hideBore(body);

  const makeKnob = (r) => {
    const g = new THREE.Group();
    outward(g, r + 1.6, r + 1.6, 1.2, -0.6, polished, 32);
    outward(g, r * 0.9, r, 6, -4.2, bakelite, 20);
    outward(g, r * 0.68, r * 0.72, 0.8, -7.6, polished, 28);
    const index = new THREE.Mesh(new THREE.BoxGeometry(0.9, r * 0.75, 0.5), white);
    index.position.set(0, r * 0.5, -8.1);
    g.add(index);
    return g;
  };
  // Prise jack femelle : écrou hexagonal, fût et trou.
  const makeJack = () => {
    const g = new THREE.Group();
    outward(g, 4.2, 4.2, 1.6, -0.8, brass, 6);
    outward(g, 3, 3, 2.4, -2.4, brass, 18);
    const h = new THREE.Mesh(new THREE.CircleGeometry(1.7, 16), hole);
    h.rotation.y = Math.PI;
    h.position.z = -3.65;
    g.add(h);
    return g;
  };
  const makePlug = (color) => {
    const g = new THREE.Group();
    const rubber = new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, clearcoat: 0.3 });
    outward(g, 3.2, 3.2, 5, -5.4, brass, 20);
    outward(g, 3.4, 3.9, 11, -13.4, rubber, 20);
    outward(g, 2.2, 2.9, 4, -20.9, rubber, 16);
    return g;
  };
  const makeLed = (color) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 10), new THREE.MeshBasicMaterial({ color }));
    m.scale.z = 0.6;
    return m;
  };

  // --- Rack : 5 modules indépendants (ils glissent en cascade au tir) --------
  const jacks = {};
  const knobs = [];
  const panelLeds = [];
  let scope = null;
  const panels = MODULES.map((module, i) => {
    const group = new THREE.Group();
    body.add(group);
    const w = module.x1 - module.x0;
    const box = new THREE.Mesh(new RoundedBoxGeometry(w - 1, PANEL_TOP - PANEL_BOTTOM, 2.4, 2, 0.6), panelBox);
    box.position.set((module.x0 + module.x1) / 2, (PANEL_TOP + PANEL_BOTTOM) / 2, -18.2);
    group.add(box);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 1.2, PANEL_TOP - PANEL_BOTTOM - 0.2), new THREE.MeshStandardMaterial({ envMap: env, map: panelFace(module, i), metalness: 0.7, roughness: 0.38 }));
    face.rotation.y = Math.PI;
    face.position.set((module.x0 + module.x1) / 2, (PANEL_TOP + PANEL_BOTTOM) / 2, -19.45);
    group.add(face);
    (module.knobs ?? []).forEach(([x, y, r, kind]) => {
      const k = makeKnob(r);
      k.position.set(x, y, -19.5);
      k.rotation.z = -0.6 + Math.random() * 1.8;
      group.add(k);
      knobs.push({ k, kind, base: k.rotation.z });
    });
    (module.jacks ?? []).forEach(([x, y]) => {
      const j = makeJack();
      j.position.set(x, y, -19.5);
      group.add(j);
      jacks[`${module.label}:${x}`] = { x, y, z: -19.5, panel: i, group: j };
    });
    (module.leds ?? []).forEach(([x, y]) => {
      const led = makeLed(0xff3a2a);
      led.position.set(x, y, -19.6);
      group.add(led);
      panelLeds.push(led);
    });
    if (module.scope) {
      const cx = (module.x0 + module.x1) / 2;
      const bezel = new THREE.Mesh(new RoundedBoxGeometry(56, 32, 2, 2, 0.8), polished);
      bezel.position.set(cx, 3, -20);
      group.add(bezel);
      const screen = canvasTexture(256, 144);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(51, 27), new THREE.MeshBasicMaterial({ map: screen.texture }));
      glass.rotation.y = Math.PI;
      glass.position.set(cx, 3, -21.05);
      group.add(glass);
      const cover = new THREE.Mesh(
        new THREE.PlaneGeometry(51, 27),
        new THREE.MeshPhysicalMaterial({ envMap: env, color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.02, clearcoat: 1, depthWrite: false }),
      );
      cover.rotation.y = Math.PI;
      cover.position.set(cx, 3, -21.3);
      group.add(cover);
      scope = screen;
    }
    return { group, kick: { x: 0, v: 0 } };
  });

  // --- Rail de patch sur le couvercle : 8 prises + séquenceur 8 pas ----------
  const seqLeds = [];
  for (let i = 0; i < 8; i += 1) {
    const j = makeJack();
    j.position.set(262 + i * 28, 27, -16.5);
    body.add(j);
    jacks[`rail:${i}`] = { x: 262 + i * 28, y: 27, z: -16.5, panel: -1, group: j };
    const led = makeLed(0x3a2a10);
    led.position.set(276 + i * 28, 27, -16.8);
    body.add(led);
    seqLeds.push(led);
  }

  // --- Garde-main : ruban de pitch + prises -----------------------------------
  const strip = add(new RoundedBoxGeometry(182, 7, 1.6, 1, 0.5), new THREE.MeshPhysicalMaterial({ color: 0x08080a, roughness: 0.15, clearcoat: 1 }), 610, 10.5, -25.6);
  strip.renderOrder = 1;
  const dotTex = tiledTexture('patch-ribbon-dot', 64, (ctx, size) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.3);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }, { color: true });
  dotTex.repeat.set(30, 1);
  const ribbon = patchShader(
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(PHOSPHOR), emissiveMap: dotTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    u,
    { fragment: `
      float along = vEmissiveMapUv.x / 30.0;
      float pos = 0.5 + 0.42 * sin(uTime * 0.9) * cos(uTime * 0.37);
      float d = along - pos;
      totalEmissiveRadiance *= 0.12 + 2.2 * exp(-d * d * 500.0) + uFlare * 1.2;
    ` },
  );
  const ribbonLeds = add(new THREE.PlaneGeometry(178, 3), ribbon, 610, 10.5, -26.45);
  ribbonLeds.rotation.y = Math.PI;
  [556, 596, 636, 690].forEach((x, i) => {
    const j = makeJack();
    j.position.set(x, -10, -25);
    body.add(j);
    jacks[`hg:${i}`] = { x, y: -10, z: -25, panel: -1, group: j };
  });

  // --- Câbles patch torsadés : chaînettes amorties qui pendent sous l'arme ---
  const twist = (key, a, b) => tiledTexture(`patch-cable-${key}`, 64, (ctx, size) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = b;
    ctx.lineWidth = size * 0.18;
    for (let k = -2; k < 3; k += 1) {
      ctx.beginPath();
      ctx.moveTo(k * size * 0.5, size);
      ctx.lineTo(k * size * 0.5 + size, 0);
      ctx.stroke();
    }
  }, { color: true });
  const CABLES = [
    ['rail:1', 'VCO:270', 0xd8442f, '#d8442f', '#8a2415', 26],
    ['rail:4', 'SCOPE:392', 0xe3c33a, '#e3c33a', '#8e7616', 20],
    ['VCF:428', 'hg:0', 0x2f7fd8, '#2f7fd8', '#173f75', 34],
    ['rail:6', 'hg:2', 0xe8e2d0, '#e8e2d0', '#8f8a7a', 30],
    ['VCA:488', 'hg:3', 0x38b060, '#38b060', '#1a5a2e', 40],
  ];
  const plugEnd = (key) => {
    const j = jacks[key];
    const offset = j.panel >= 0 ? panels[j.panel].group.position.x : 0;
    return new THREE.Vector3(j.x + offset, j.y, j.z - 22.9);
  };
  const cables = CABLES.map(([a, b, color, c1, c2, sag], i) => {
    [a, b].forEach((key) => {
      const plug = makePlug(color);
      jacks[key].group.add(plug);
    });
    const tex = twist(i, c1, c2);
    tex.repeat.set(40, 1);
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.55, clearcoat: 0.25 }));
    body.add(mesh);
    return { a, b, sag, mesh, dy: { x: 0, v: 0 }, dz: { x: 0, v: 0 }, phase: i * 1.7 };
  });
  const rebuildCable = (c, time) => {
    const A = plugEnd(c.a);
    const B = plugEnd(c.b);
    const swing = Math.sin(time * 1.3 + c.phase) * 1.2;
    const mid = new THREE.Vector3((A.x + B.x) / 2 + swing, Math.min(A.y, B.y) - c.sag + c.dy.x, Math.min(A.z, B.z) - 6 + c.dz.x);
    const curve = new THREE.CatmullRomCurve3([A, A.clone().add(new THREE.Vector3(0, -6, -3)), mid, B.clone().add(new THREE.Vector3(0, -6, -3)), B], false, 'centripetal');
    c.mesh.geometry.dispose();
    c.mesh.geometry = new THREE.TubeGeometry(curve, 26, 1.8, 6, false);
  };

  // --- Chargeur : boîtier de clavier replié ----------------------------------
  const ivory = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.5, color: 0xefe9dc, roughness: 0.35, clearcoat: 0.5 });
  const ebony = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.6, color: 0x0b0b0d, roughness: 0.25, clearcoat: 0.8 });
  const curve = geo.magazineCurve;
  const whiteKeys = [];
  for (let k = 0; k < 14; k += 1) {
    const t = 0.1 + k * 0.058;
    const { position, angle } = alongMagazine(curve, t, 0, -15.7);
    const key = add(new RoundedBoxGeometry(10.2, 44, 3, 1, 0.8), ivory, position.x, position.y, position.z);
    key.rotation.z = angle;
    whiteKeys.push({ mesh: key, z: position.z, press: { x: 0, v: 0 } });
    if ([0, 1, 3, 4, 5].includes(k % 7) && k < 13) {
      const b = alongMagazine(curve, t + 0.029, 9, -16.8);
      const black = add(new RoundedBoxGeometry(6.4, 26, 5, 1, 0.8), ebony, b.position.x, b.position.y, b.position.z);
      black.rotation.z = b.angle;
    }
  }

  // --- Frein de bouche → haut-parleur ---------------------------------------
  const speaker = new THREE.Group();
  speaker.position.set(872, 4, 0);
  body.add(speaker);
  const neck = add(new THREE.CylinderGeometry(9, 9, 36, 24), alu, 842, 2, 0);
  neck.rotation.z = Math.PI / 2;
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(24, 19, 12, 36, 1, true), new THREE.MeshStandardMaterial({ envMap: env, color: 0x1d1e23, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide }));
  basket.rotation.z = -Math.PI / 2;
  basket.position.x = 7;
  speaker.add(basket);
  const magnet = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 12, 32), polished);
  magnet.rotation.z = -Math.PI / 2;
  magnet.position.x = -6;
  speaker.add(magnet);
  const flange = new THREE.Mesh(new THREE.TorusGeometry(24.5, 1.6, 10, 48), polished);
  flange.rotation.y = Math.PI / 2;
  flange.position.x = 14;
  speaker.add(flange);
  const surround = new THREE.Mesh(new THREE.TorusGeometry(21.5, 2.4, 10, 48), new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.75 }));
  surround.rotation.y = Math.PI / 2;
  surround.scale.set(1, 1, 0.7);
  surround.position.x = 13;
  speaker.add(surround);
  const coneTex = tiledTexture('patch-cone', 256, (ctx, size) => {
    ctx.fillStyle = '#2a2a2d';
    ctx.fillRect(0, 0, size, size);
    const rand = seeded(7020);
    for (let i = 0; i < 3000; i += 1) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.15)';
      ctx.fillRect(rand() * size, rand() * size, 2, 1);
    }
    for (let y = 0; y < size; y += size / 8) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, y, size, 2);
    }
  }, { color: true });
  const membrane = new THREE.Group();
  speaker.add(membrane);
  const coneGeo = new THREE.LatheGeometry([new THREE.Vector2(6.5, 4), new THREE.Vector2(12, 7), new THREE.Vector2(19, 11), new THREE.Vector2(20.5, 12.5)], 48);
  const cone = new THREE.Mesh(coneGeo, new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.6, map: coneTex, roughness: 0.6, side: THREE.DoubleSide }));
  cone.rotation.z = -Math.PI / 2;
  membrane.add(cone);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), polished);
  cap.rotation.z = -Math.PI / 2;
  cap.scale.set(1, 0.55, 1);
  cap.position.x = 4;
  membrane.add(cap);
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.2, 12), polished);
    screw.rotation.z = -Math.PI / 2;
    screw.position.set(15.6, Math.cos(a) * 24.5, Math.sin(a) * 24.5);
    speaker.add(screw);
  }

  // --- Crosse : ouïe de haut-parleur (grille hexagonale) + boomer ----------
  const hexAlpha = tiledTexture('patch-hex', 128, (ctx, size) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    const r = size / 8;
    for (let row = -1; row < 6; row += 1) {
      for (let col = -1; col < 6; col += 1) {
        const cx = col * r * 1.8 + (row % 2 ? r * 0.9 : 0);
        const cy = row * r * 1.56;
        ctx.beginPath();
        for (let k = 0; k < 6; k += 1) {
          const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
          ctx.lineTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78);
        }
        ctx.fill();
      }
    }
  });
  hexAlpha.repeat.set(1 / 16, 1 / 16);
  const grille = new THREE.MeshStandardMaterial({ envMap: env, color: 0x8d9098, metalness: 1, roughness: 0.3, alphaMap: hexAlpha, alphaTest: 0.5, side: THREE.DoubleSide });
  const holeGeo = new THREE.ShapeGeometry(roundedShape(geo.stockHole), 12);
  [-1, 1].forEach((side) => add(holeGeo, grille, 0, 0, side * 13));
  const woofer = new THREE.Group();
  woofer.position.set(112, -26, 0);
  body.add(woofer);
  [-1, 1].forEach((side) => {
    const c = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(5, 0), new THREE.Vector2(14, 4), new THREE.Vector2(22, 7)], 40), new THREE.MeshStandardMaterial({ map: coneTex, roughness: 0.85, side: THREE.DoubleSide }));
    c.rotation.x = side * Math.PI / 2;
    c.position.z = side * 2;
    woofer.add(c);
  });

  // --- Organes de visée : potentiomètres-oreilles et LED de guidon --------
  add(new RoundedBoxGeometry(16, 4, 28, 1, 1), alu, 470, 33, 0);
  [-1, 1].forEach((side) => {
    const ear = new THREE.Group();
    ear.position.set(470, 41, side * 8.4);
    body.add(ear);
    const k = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.4, 10, 28), bakelite);
    k.rotation.z = Math.PI / 2;
    ear.add(k);
    const capRing = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 10.6, 24), polished);
    capRing.rotation.z = Math.PI / 2;
    ear.add(capRing);
    // Index blanc sur la face arrière, pointé vers le cran central.
    const idx = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 4.2), white);
    idx.position.set(-5.4, 0, -side * 2.6);
    ear.add(idx);
  });
  const sightLed = add(new THREE.BoxGeometry(2.2, 2.2, 2.2), new THREE.MeshBasicMaterial({ color: PHOSPHOR }), 730, 65.2, 0);

  // --- Tir : anneaux d'onde de pression -------------------------------------
  const ringGeo = new THREE.TorusGeometry(1, 0.03, 6, 48).rotateY(Math.PI / 2);
  const rings = Array.from({ length: 9 }, () => {
    const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: PHOSPHOR, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, born: -1, delay: 0, reach: 0.1 };
  });
  let ringCursor = 0;
  const motes = particleSystem(scene, softDotTexture('patch-mote', 'rgba(200,255,220,1)', 'rgba(82,255,138,0)'), { max: 60 });
  const mouth = anchorAt(body, 890, 4, 0);
  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  // --- Oscilloscope ------------------------------------------------------------
  let spike = 0;
  const drawScope = (time) => {
    const { ctx, canvas, texture } = scope;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#021a0c';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(82,255,138,0.14)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i += 1) {
      ctx.beginPath();
      ctx.moveTo((i / 10) * W, 0);
      ctx.lineTo((i / 10) * W, H);
      ctx.stroke();
    }
    for (let i = 1; i < 8; i += 1) {
      ctx.beginPath();
      ctx.moveTo(0, (i / 8) * H);
      ctx.lineTo(W, (i / 8) * H);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(82,255,138,0.3)';
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    const amp = 0.26 + 0.08 * Math.sin(time * 0.6);
    ctx.shadowColor = PHOSPHOR;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#b8ffd0';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const p = x / W;
      let v = Math.sin(p * Math.PI * 5 + time * 0.3 * Math.PI * 2) * amp;
      if (spike > 0.01) {
        const saw = ((p * 7 + time * 3) % 1) * 2 - 1;
        v = v * (1 - spike) + saw * 0.42 * spike;
      }
      const y = H / 2 - v * H;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(82,255,138,0.7)';
    ctx.font = '11px monospace';
    ctx.fillText(spike > 0.05 ? 'TRIG' : '2V/div', 6, 14);
    ctx.fillText(`${(0.3 + spike * 7).toFixed(1)} Hz`, W - 58, H - 6);
    texture.needsUpdate = true;
  };

  const PENTATONIC_KEYS = [0, 2, 3, 4, 6, 7, 9, 10];
  const membranePush = { x: 0, v: 0 };
  const woofPush = { x: 0, v: 0 };
  let time = 0;
  let scopeClock = 1;
  let step = 0;
  let note = 0;
  let firedAt = -10;
  const kicked = panels.map(() => true);

  return {
    muzzleX: 892,
    update: (dt) => {
      time += dt;
      springStep(membranePush, 0, 900, dt);
      springStep(woofPush, 0, 400, dt);
      membrane.position.x = membranePush.x * 4;
      woofer.scale.setScalar(1 + woofPush.x * 0.06 + Math.sin(time * 4) * 0.004);

      // Modules qui reculent l'un après l'autre (15 ms d'écart), puis se recalent.
      panels.forEach((p, i) => {
        if (!kicked[i] && time - firedAt >= i * 0.015) {
          kicked[i] = true;
          p.kick.v -= 55;
        }
        springStep(p.kick, 0, 600, dt);
        p.group.position.x = Math.max(-2, p.kick.x);
      });

      knobs.forEach((k) => {
        if (k.kind === 'lfo') k.k.rotation.z = k.base + Math.sin(time * 0.5) * 1.2;
      });
      const lfo = 0.5 + 0.5 * Math.sin(time * 0.5 * 4);
      panelLeds.forEach((led, i) => led.material.color.setRGB(0.25 + 0.75 * (i ? 1 - lfo : lfo), 0.08, 0.05));

      // Séquenceur 8 pas à 120 BPM (croches).
      const s = Math.floor(time / 0.25) % 8;
      if (s !== step) {
        step = s;
        seqLeds.forEach((led, i) => led.material.color.set(i === step ? AMBER : '#3a2a10'));
      }

      whiteKeys.forEach((k) => {
        springStep(k.press, 0, 500, dt);
        k.mesh.position.z = k.z + Math.max(0, k.press.x) * 1.6;
      });

      cables.forEach((c) => {
        springStep(c.dy, 0, 40, dt);
        springStep(c.dz, 0, 30, dt);
        rebuildCable(c, time);
      });

      spike = Math.max(0, spike - dt / 0.4);
      scopeClock += dt;
      if (scopeClock > 1 / 30) {
        scopeClock = 0;
        drawScope(time);
      }
      sightLed.material.color.set(PHOSPHOR).multiplyScalar(1 + spike);

      const now = performance.now();
      rings.forEach((r) => {
        if (r.born < 0) return;
        const t = (now - r.born - r.delay) / 140;
        if (t < 0) return;
        if (t >= 1) {
          r.born = -1;
          r.mesh.visible = false;
          return;
        }
        r.mesh.visible = true;
        r.mesh.scale.setScalar(0.006 + t * r.reach);
        r.mesh.material.opacity = (1 - t) * 0.75;
      });
      motes.update(dt);
    },
    onFire: () => {
      firedAt = time;
      kicked.fill(false);
      membranePush.v += 60;
      woofPush.v += 30;
      spike = 1;
      cables.forEach((c, i) => {
        c.dy.v += 90 + i * 12;
        c.dz.v -= 40;
      });
      whiteKeys[PENTATONIC_KEYS[note % 8]].press.v += 45;
      note += 1;
      mouth.getWorldPosition(tmp);
      body.getWorldQuaternion(quat);
      // Onde fondamentale puis deux harmoniques plus serrées.
      [[0, 0.11], [18, 0.075], [34, 0.05]].forEach(([delay, reach]) => {
        const r = rings[ringCursor];
        ringCursor = (ringCursor + 1) % rings.length;
        r.born = performance.now();
        r.delay = delay;
        r.reach = reach;
        r.mesh.position.copy(tmp);
        r.mesh.quaternion.copy(quat);
      });
      for (let i = 0; i < 6; i += 1) {
        motes.spawn(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.3, -0.1 - Math.random() * 0.2, (Math.random() - 0.5) * 0.3), { life: 420, size: 0.0025, drag: 2 });
      }
    },
  };
}

// =============================================================================
// APEX DOWNFORCE — monoplace de course, pièce de soufflerie
// =============================================================================

const FLUO = '#e8ff1a';

function weave(ctx, area, rough) {
  const s = 3;
  for (let i = Math.floor(area.minX / s); i < area.maxX / s; i += 1) {
    for (let j = Math.floor(area.minY / s); j < area.maxY / s; j += 1) {
      const horizontal = (((i - j) % 4) + 4) % 4 < 2;
      ctx.fillStyle = rough ? (horizontal ? '#4c4c4c' : '#8a8a8a') : horizontal ? '#1a1d23' : '#0b0c0f';
      ctx.fillRect(i * s, j * s, s, s);
      ctx.fillStyle = rough ? 'rgba(0,0,0,0.25)' : 'rgba(210,220,235,0.06)';
      if (horizontal) ctx.fillRect(i * s, j * s + s * 0.35, s, s * 0.3);
      else ctx.fillRect(i * s + s * 0.35, j * s, s * 0.3, s);
    }
  }
}

// Inserts jaune fluo (mêmes formes sur la couleur, la rugosité et la lumière).
function apexInserts(ctx, curve) {
  tracePolygon(ctx, [[236, -24], [504, -24], [504, -17], [260, -15]]);
  ctx.fill();
  ctx.fillRect(240, 29.5, 256, 1.6);
  tracePolygon(ctx, [[34, -96], [172, -30], [176, -38], [46, -104]]);
  ctx.fill();
  tracePolygon(ctx, [[692, -70], [724, -70], [724, 20], [698, 20]]);
  ctx.fill();
  const a0 = alongMagazine(curve, 0.78, -34, 0).position;
  const a1 = alongMagazine(curve, 0.78, 34, 0).position;
  const b1 = alongMagazine(curve, 0.84, 34, 0).position;
  const b0 = alongMagazine(curve, 0.84, -34, 0).position;
  tracePolygon(ctx, [[a0.x, a0.y], [a1.x, a1.y], [b1.x, b1.y], [b0.x, b0.y]]);
  ctx.fill();
}

// Profil d'aile retourné (appui) : bord d'attaque en x = 0, fuite en x = -chord,
// extrados plat au-dessus, intrados bombé vers le bas.
function airfoil(chord, thick) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0, thick * 0.35, -chord * 0.25, thick * 0.35);
  s.quadraticCurveTo(-chord * 0.7, thick * 0.3, -chord, thick * 0.08);
  s.lineTo(-chord, -thick * 0.02);
  s.quadraticCurveTo(-chord * 0.6, -thick * 0.9, -chord * 0.25, -thick * 0.65);
  s.quadraticCurveTo(0, -thick * 0.45, 0, 0);
  return s;
}

function apexFinish(env, geo) {
  const curve = geo.magazineCurve;
  const color = livery('apex-color', (ctx) => {
    weave(ctx, LIVERY, false);
    ctx.fillStyle = FLUO;
    apexInserts(ctx, curve);
  }, { background: '#15171b', color: true });
  const rough = livery('apex-rough', (ctx) => {
    weave(ctx, LIVERY, true);
    ctx.fillStyle = '#5a5a5a';
    apexInserts(ctx, curve);
  }, { background: '#666666' });
  const glow = livery('apex-glow', (ctx) => {
    ctx.fillStyle = FLUO;
    apexInserts(ctx, curve);
  }, { background: '#000000', color: true });
  // Filets d'air blancs très discrets qui filent vers l'arrière le long du carbone.
  const carbon = animateEmissive(
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.85, map: color, roughnessMap: rough, roughness: 1, metalness: 0.25, bumpMap: rough, bumpScale: 0.35, clearcoat: 1, clearcoatRoughness: 0.03, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.22 }),
    geo.uniforms,
    `
      vec2 fl = vEmissiveMapUv;
      float lane = step(0.9, fract(fl.y * 22.0));
      float streak = pow(fract(fl.x * 4.0 + uTime * 0.9 + floor(fl.y * 22.0) * 0.37), 28.0);
      totalEmissiveRadiance = totalEmissiveRadiance * (1.0 + uFlare * 0.6) + vec3(0.9, 0.95, 1.0) * 0.06 * lane * streak;
    `,
  );
  const weaveTile = tiledTexture('apex-weave-tile', 128, (ctx, size) => {
    ctx.save();
    ctx.scale(size / 24, size / 24);
    weave(ctx, { minX: 0, maxX: 24, minY: 0, maxY: 24 }, false);
    ctx.restore();
  }, { color: true, repeat: 1 / 24 });
  const weaveRough = tiledTexture('apex-weave-rough', 128, (ctx, size) => {
    ctx.save();
    ctx.scale(size / 24, size / 24);
    weave(ctx, { minX: 0, maxX: 24, minY: 0, maxY: 24 }, true);
    ctx.restore();
  }, { repeat: 1 / 24 });
  const carbonTile = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.85, map: weaveTile, roughnessMap: weaveRough, roughness: 1, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03 });
  const suedeBump = tiledTexture('apex-suede', 256, (ctx, size) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, { minX: 0, maxX: size, minY: 0, maxY: size }, 30000, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.2)'], 1, seeded(7201));
  }, { repeat: 1 / 20 });
  const alcantara = new THREE.MeshPhysicalMaterial({ color: 0x3a3a40, roughness: 0.95, sheen: 0.8, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xb0b0b8), bumpMap: suedeBump, bumpScale: 0.6 });
  const titaniumMachined = new THREE.MeshStandardMaterial({ envMap: env, color: 0x9a9da5, metalness: 1, roughness: 0.22 });
  return {
    ...faces([carbon, carbonTile]),
    grip: [alcantara, alcantara],
    buttPad: [alcantara, alcantara],
    metal: titaniumMachined,
    barrel: new THREE.MeshStandardMaterial({ envMap: env, color: 0x1e2024, metalness: 0.92, roughness: 0.28 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.8 }),
    sight: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    brass: titaniumMachined,
    flash: 'frost',
    light: 0x6ab0ff,
    smoke: 0xdde6f0,
    glow: [],
    decorate: (ctx) => decorateApex({ ...ctx, geo, env, carbon, carbonTile, titaniumMachined }),
  };
}

function decorateApex({ body, add, scene, parts, geo, env, carbon, carbonTile, titaniumMachined }) {
  const u = geo.uniforms;
  const fluo = new THREE.MeshPhysicalMaterial({ envMap: env, color: FLUO, roughness: 0.35, clearcoat: 1, emissive: FLUO, emissiveIntensity: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9 });

  parts.handguard.visible = false;
  parts.muzzle.visible = false;
  parts.rearSight.visible = false;
  parts.rail.visible = false;
  parts.railGrooves.forEach((g) => (g.visible = false));
  hideBore(body);

  // --- Garde-main en aile inversée (profil d'appui qui plonge sous le canon) --
  const wingShape = new THREE.Shape();
  wingShape.moveTo(504, 17);
  wingShape.lineTo(700, 18);
  wingShape.quadraticCurveTo(714, 17, 713, 5);
  wingShape.bezierCurveTo(712, -34, 672, -64, 612, -60);
  wingShape.bezierCurveTo(560, -56, 524, -18, 504, 6);
  wingShape.lineTo(504, 17);
  add(extrude(wingShape, 46, 2.5, { curveSegments: 24 }), [carbon, carbonTile]);
  // Déflecteur de bord de fuite et deux dérives sous l'aile.
  add(new RoundedBoxGeometry(3, 10, 48, 1, 0.8), fluo, 506, 4, 0);
  [-11, 11].forEach((z) => {
    const fin = new THREE.Shape();
    fin.moveTo(546, -30);
    fin.lineTo(668, -40);
    fin.lineTo(646, -70);
    fin.lineTo(586, -68);
    fin.lineTo(546, -44);
    add(extrude(fin, 1.6, 0.4), [carbonTile, carbonTile], 0, 0, z);
  });

  // --- Mini-ailerons à DRS, deux de chaque côté du garde-main ---------------
  const flaps = [];
  [-1, 1].forEach((side) => {
    [[690, -26], [600, -36]].forEach(([x, y]) => {
      const main = add(extrude(airfoil(36, 8), 28, 0.6), [carbonTile, carbonTile], x, y, side * 39);
      main.rotation.z = -0.08;
      const pivot = new THREE.Group();
      pivot.position.set(x - 37, y + 3, side * 39);
      body.add(pivot);
      const flap = new THREE.Mesh(extrude(airfoil(18, 4.5), 28, 0.4), [fluo, fluo]);
      pivot.add(flap);
      const plate = new THREE.Shape();
      plate.moveTo(x + 4, y - 6);
      plate.lineTo(x - 60, y - 8);
      plate.lineTo(x - 56, y + 7);
      plate.lineTo(x - 20, y + 6);
      plate.lineTo(x + 2, y + 1);
      add(extrude(plate, 1.6, 0.5), [carbonTile, carbonTile], 0, 0, side * 54);
      add(new RoundedBoxGeometry(62, 1.6, 2, 1, 0.5), fluo, x - 28, y - 7.4, side * 54);
      flaps.push(pivot);
    });
  });

  // --- Pontons latéraux avec entrées d'air et radiateur à lames -------------
  const podShape = roundedShape([[382, -18, 6], [500, -20, 2], [500, 12, 2], [436, 12, 12], [382, 2, 14]]);
  [-1, 1].forEach((side) => {
    add(extrude(podShape, 10, 2), [carbon, carbonTile], 0, 0, side * 23);
    add(new RoundedBoxGeometry(3, 28, 10, 1, 0.8), dark, 501.4, -4, side * 23);
    for (let y = -15; y <= 8; y += 3.4) add(new RoundedBoxGeometry(1.2, 0.8, 10.5, 1, 0.3), titaniumMachined, 503.4, y, side * 23);
    for (let k = 0; k < 5; k += 1) {
      const gill = add(new RoundedBoxGeometry(16, 1.6, 1, 1, 0.4), dark, 408 + k * 14, -6, side * 30.2);
      gill.rotation.z = 0.5;
    }
  });

  // Numéro de course sur le flanc gauche.
  const roundel = tiledTexture('apex-number', 256, (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = FLUO;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0d0e11';
    ctx.font = `italic 900 ${size * 0.62}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('07', size / 2, size * 0.54);
  }, { color: true });
  const number = add(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: roundel, emissive: 0xffffff, emissiveMap: roundel, emissiveIntensity: 0.35, transparent: true, roughness: 0.35 }), 300, 0, -17.2);
  number.rotation.y = Math.PI;

  // --- Aileron arrière sur la crosse, feu de pluie -------------------------
  const rearWing = new THREE.Group();
  body.add(rearWing);
  [-8, 8].forEach((z) => {
    const pylon = roundedShape([[44, 22, 2], [66, 22, 2], [60, 66, 3], [48, 66, 3]]);
    const m = new THREE.Mesh(extrude(pylon, 3, 0.6), [carbonTile, carbonTile]);
    m.position.z = z;
    rearWing.add(m);
  });
  const mainPlane = new THREE.Mesh(extrude(airfoil(74, 8), 86, 1), [carbonTile, carbonTile]);
  mainPlane.position.set(92, 68, 0);
  mainPlane.rotation.z = -0.1;
  rearWing.add(mainPlane);
  const rearFlap = new THREE.Mesh(extrude(airfoil(34, 5), 86, 0.8), [fluo, fluo]);
  rearFlap.position.set(20, 80, 0);
  rearFlap.rotation.z = -0.42;
  rearWing.add(rearFlap);
  [-1, 1].forEach((side) => {
    const plate = new THREE.Mesh(extrude(roundedShape([[8, 60, 6], [100, 62, 6], [96, 84, 10], [6, 90, 8]]), 2, 0.5), [carbonTile, carbonTile]);
    plate.position.z = side * 44;
    rearWing.add(plate);
    const stripe = new THREE.Mesh(new RoundedBoxGeometry(92, 2.4, 2.4, 1, 0.6), fluo);
    stripe.position.set(52, 60, side * 44);
    rearWing.add(stripe);
  });
  const rainLight = new THREE.Mesh(new RoundedBoxGeometry(4, 9, 16, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  rainLight.position.set(43, 50, 0);
  rearWing.add(rainLight);
  const rainHousing = new THREE.Mesh(new RoundedBoxGeometry(6, 12, 20, 1, 1), dark);
  rainHousing.position.set(46, 50, 0);
  rearWing.add(rainHousing);

  // --- Palettes de volant sur la poignée, bouchon de remplissage ------------
  const paddles = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(330, -30, side * 17);
    body.add(pivot);
    const p = new THREE.Mesh(new RoundedBoxGeometry(34, 14, 1.6, 1, 0.6), carbonTile);
    p.position.set(-14, -6, side * 2);
    p.rotation.z = 0.35;
    pivot.add(p);
    return pivot;
  });
  const cap = alongMagazine(geo.magazineCurve, 0.2, -8, -15.2).position;
  const blue = new THREE.MeshStandardMaterial({ envMap: env, color: 0x2a5ae8, metalness: 1, roughness: 0.25 });
  const capRing = add(new THREE.CylinderGeometry(8, 8, 2.4, 28), blue, cap.x, cap.y, cap.z);
  capRing.rotation.x = Math.PI / 2;
  const capTop = add(new THREE.CylinderGeometry(5.5, 6, 3, 6), titaniumMachined, cap.x, cap.y, cap.z - 2.4);
  capTop.rotation.x = Math.PI / 2;

  // --- Visée : chevron de stand + point « pit limiter » ---------------------
  const chevron = roundedShape([[-9, 32, 1], [9, 32, 1], [9, 45, 1], [3.2, 45, 0.4], [0, 39.5, 0.6], [-3.2, 45, 0.4], [-9, 45, 1]]);
  add(extrudeAlongX(chevron, 12, 0.5), fluo, 466, 0, 0);
  const pitDot = add(new THREE.SphereGeometry(1.5, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff2a2a }), 730, 65, 0);

  // --- Nez en carbone et échappements latéraux en titane bleui --------------
  const nose = add(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(13, 0), new THREE.Vector2(12, 40), new THREE.Vector2(9, 74), new THREE.Vector2(6.5, 80), new THREE.Vector2(0, 80)], 32), carbonTile, 828, 2, 0);
  nose.rotation.z = -Math.PI / 2;
  const frontMain = add(extrude(airfoil(46, 7), 104, 0.8), [carbonTile, carbonTile], 918, -24, 0);
  frontMain.rotation.z = -0.04;
  [[878, -18, -0.32, 24], [858, -11, -0.62, 20]].forEach(([x, y, rot, chord]) => {
    const flap = add(extrude(airfoil(chord, 4.5), 96, 0.5), [fluo, fluo], x, y, 0);
    flap.rotation.z = rot;
  });
  [-1, 1].forEach((side) => {
    const plate = new THREE.Shape();
    plate.moveTo(920, -30);
    plate.lineTo(846, -30);
    plate.lineTo(840, -4);
    plate.lineTo(880, -2);
    plate.lineTo(922, -18);
    add(extrude(plate, 1.8, 0.5), [carbonTile, carbonTile], 0, 0, side * 53);
    add(extrude(roundedShape([[884, -20, 1], [904, -20, 1], [902, -4, 1], [888, -2, 1]]), 2, 0.4), [carbonTile, carbonTile], 0, 0, side * 7);
  });
  const noseBore = add(new THREE.CircleGeometry(4.5, 20), dark, 908.2, 2, 0);
  noseBore.rotation.y = Math.PI / 2;

  const tiTex = tiledTexture('apex-titanium', 256, (ctx, size) => {
    const g = ctx.createLinearGradient(0, 0, size, 0);
    g.addColorStop(0, '#b9bcc2');
    g.addColorStop(0.35, '#c8a35a');
    g.addColorStop(0.55, '#8a4a9a');
    g.addColorStop(0.72, '#6a3ac8');
    g.addColorStop(1, '#2a5ae8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }, { color: true });
  tiTex.wrapS = THREE.ClampToEdgeWrapping;
  const heatTex = tiledTexture('apex-heat', 128, (ctx, size) => {
    const g = ctx.createLinearGradient(0, 0, size, 0);
    g.addColorStop(0, '#000000');
    g.addColorStop(0.6, '#1a0800');
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }, { color: true });
  heatTex.wrapS = THREE.ClampToEdgeWrapping;
  // Ralenti à 12 Hz ; au tir, l'incandescence vire au blanc-bleu puis refroidit.
  const titanium = animateEmissive(
    new THREE.MeshStandardMaterial({ envMap: env, map: tiTex, metalness: 1, roughness: 0.18, emissive: 0xff6a1a, emissiveMap: heatTex, emissiveIntensity: 1 }),
    u,
    `
      float idle = 0.35 + 0.2 * sin(uTime * 75.4);
      vec3 hot = totalEmissiveRadiance * (idle + uFlare * 3.0);
      totalEmissiveRadiance = mix(hot, vec3(0.55, 0.75, 1.0) * length(hot), clamp(uFlare * 1.3, 0.0, 1.0));
    `,
  );
  const flameTex = tiledTexture('apex-flame', 64, (ctx, size) => {
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, 'rgba(40,90,255,0)');
    g.addColorStop(0.5, 'rgba(90,160,255,0.6)');
    g.addColorStop(1, 'rgba(235,245,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }, { color: true });
  const flameMat = new THREE.MeshBasicMaterial({ map: flameTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
  const coreMat = new THREE.MeshBasicMaterial({ map: flameTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  const Y = new THREE.Vector3(0, 1, 0);
  add(new RoundedBoxGeometry(56, 30, 34, 3, 6), carbonTile, 782, -6, 0);
  add(new RoundedBoxGeometry(58, 2, 36, 1, 0.8), fluo, 782, 9.6, 0);
  const exhausts = [-1, 1].map((side) => {
    const drop = Math.tan((20 * Math.PI) / 180);
    const start = new THREE.Vector3(790, -10, side * 12);
    const bend = new THREE.Vector3(818, -14, side * 20);
    const tip = new THREE.Vector3(870, -14 - 52 * drop, side * (20 + 52 * drop));
    const path = new THREE.CatmullRomCurve3([start, bend, tip]);
    body.add(new THREE.Mesh(taperedTube(path, 40, 7.5, 20, (t) => 0.85 + 0.35 * Math.max(0, (t - 0.8) / 0.2) ** 2), titanium));
    const dir = tip.clone().sub(path.getPoint(0.95)).normalize();
    const lip = new THREE.Mesh(new THREE.TorusGeometry(8.6, 1.2, 8, 28), titanium);
    lip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    lip.position.copy(tip);
    body.add(lip);
    const flame = new THREE.Group();
    flame.position.copy(tip);
    flame.quaternion.setFromUnitVectors(Y, dir);
    body.add(flame);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(8, 120, 16, 1, true).translate(0, 60, 0), flameMat);
    const core = new THREE.Mesh(new THREE.ConeGeometry(3.4, 60, 12, 1, true).translate(0, 30, 0), coreMat);
    flame.add(outer, core);
    return { flame, tipAnchor: anchorAt(body, tip.x, tip.y, tip.z), backAnchor: anchorAt(body, tip.x - dir.x * 40, tip.y - dir.y * 40, tip.z - dir.z * 40) };
  });
  const sparks = particleSystem(scene, softDotTexture('apex-spark', 'rgba(255,250,220,1)', 'rgba(255,200,80,0)'), { max: 80 });

  const drs = { x: 0, v: 0 };
  const flex = { x: 0, v: 0 };
  const paddle = { x: 0, v: 0 };
  let heat = 0;
  let time = 0;
  let flameUntil = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  return {
    muzzleX: 912,
    update: (dt) => {
      time += dt;
      springStep(drs, 0, 300, dt);
      springStep(flex, 0, 260, dt);
      springStep(paddle, 0, 500, dt);
      const open = Math.min(1, Math.max(0, drs.x));
      // Volets braqués au repos, qui s'ouvrent (s'aplatissent) au tir ; léger flottement moteur.
      flaps.forEach((f, i) => (f.rotation.z = -0.5 + open * 0.44 + Math.sin(time * 25.1 + i) * 0.026));
      rearWing.position.y = -flex.x * 3;
      paddles[0].rotation.y = paddle.x * 0.25;
      rainLight.material.color.set(Math.floor(time * 4) % 2 ? 0xff2a2a : 0x2a0404);
      heat = Math.max(0, heat - dt * 0.03);
      tiTex.offset.x = heat * 0.3;
      const on = performance.now() < flameUntil;
      flameMat.opacity = on ? 0.95 : 0;
      coreMat.opacity = on ? 1 : 0;
      pitDot.material.color.setRGB(1, 0.16 + u.uFlare.value * 0.3, 0.16);
      sparks.update(dt);
    },
    onFire: () => {
      drs.v += 47;
      flex.v += 30;
      paddle.v += 25;
      heat = Math.min(1, heat + 0.035);
      flameUntil = performance.now() + 45;
      exhausts.forEach((e) => {
        const s = 0.8 + Math.random() * 0.4;
        e.flame.scale.set(1, s, 1);
        e.tipAnchor.getWorldPosition(a);
        e.backAnchor.getWorldPosition(b);
        // Étincelles de titane projetées vers l'arrière et vers le bas, hors du cône de visée.
        const back = b.sub(a).normalize();
        for (let i = 0; i < 5; i += 1) {
          sparks.spawn(a, back.clone().multiplyScalar(0.6 + Math.random() * 0.8).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, -0.3 - Math.random() * 0.4, (Math.random() - 0.5) * 0.4)), { life: 260, size: 0.0022, drag: 1.5, gravity: -4 });
        }
      });
    },
  };
}

export const VANDAL_MACHINE_SKINS = {
  patchbay: { labelKey: 'aimTrainer.skinPatchbay', build: patchbayFinish },
  downforce: { labelKey: 'aimTrainer.skinDownforce', build: apexFinish },
};
