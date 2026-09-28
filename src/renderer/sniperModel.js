import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  MM,
  extrude,
  roundedShape,
  studioEnvironment,
  seeded,
  drawnTexture,
  tiledTexture,
  speckle,
  flashTexture,
  softDotTexture,
  springStep,
  weaponUniforms,
} from './weaponKit.js';
import { SNIPER_SKIN_BUILDERS } from './sniperSkins.js';
import { makeBasicSkins } from './basicSkins.js';
import { SNIPER_MYTHIC_SKINS } from './sniperSkinsMythic.js';
import { SNIPER_TRANSCENDENT_SKINS } from './sniperSkinRift.js';
import { SNIPER_TRANSCENDENT_SET } from './sniperSkinsTranscendent.js';
import { sniperHands } from './viewmodelHands.js';

// Fusil de précision à verrou inspiré de l'Operator, modélisé en code comme la
// Vandal : profils au millimètre extrudés, textures dessinées sur canvas.
// Repère : millimètres, x vers la bouche (plaque de couche à x = 0), y vers le
// haut, axe du canon à y = 16, z vers le flanc droit.
//
// Animation de tir : fort recul, flash et jets latéraux du frein de bouche, puis
// manœuvre complète de la culasse (levier relevé, tiré, douille éjectée,
// repoussé, rabattu) avec l'arme qui bascule légèrement pendant la manœuvre.

const BORE_Y = 16;
const SCOPE_Y = 78;
const RECEIVER_R = 21;

export const SNIPER_SHAPES = {
  stock: [
    [0, 34, 6], [240, 26, 4], [318, 14, 3], [318, -24, 3], [262, -32, 14], [226, -62, 10], [40, -80, 10], [0, -78, 6],
  ],
  stockHole: [
    [40, 14, 8], [220, 10, 8], [200, -20, 12], [172, -44, 10], [46, -58, 10],
  ],
  grip: [
    [300, -24, 0], [350, -24, 0], [346, -50, 8], [338, -62, 5], [340, -78, 7], [332, -92, 5],
    [334, -106, 7], [324, -122, 8], [286, -124, 10], [280, -110, 6], [296, -50, 14],
  ],
  forend: [
    [636, 12, 3], [930, 12, 3], [942, 0, 4], [930, -26, 6], [650, -30, 6], [636, -24, 3],
  ],
  chassis: [
    [316, 2, 2], [642, 2, 2], [642, -28, 6], [330, -32, 6],
  ],
};

const FOREND_SLOTS = [0, 1, 2, 3, 4, 5].map((i) => {
  const x0 = 668 + i * 42;
  return [
    [x0, 1, 2],
    [x0 + 26, 1, 2],
    [x0 + 26, -11, 2],
    [x0, -11, 2],
  ];
});

function muzzleBrakeShape() {
  const ports = [0, 1, 2].map((i) => {
    const x0 = 1104 + i * 24;
    return [
      [x0, 8, 2],
      [x0 + 14, 8, 2],
      [x0 + 14, 24, 2],
      [x0, 24, 2],
    ];
  });
  return roundedShape(
    [
      [1090, -2, 3], [1180, -2, 3], [1188, 4, 2], [1188, 28, 2], [1180, 34, 3], [1090, 34, 3],
    ],
    ports,
  );
}

function triggerGuardShape() {
  return roundedShape(
    [[350, -30, 0], [430, -30, 0], [430, -36, 2], [424, -62, 8], [362, -64, 10], [346, -44, 6]],
    [[[360, -38, 3], [418, -38, 3], [414, -54, 6], [366, -55, 8]]],
  );
}

function triggerShape() {
  return roundedShape([[378, -32, 0], [385, -32, 0], [387, -44, 3], [382, -54, 4], [376, -52, 2], [380, -43, 3]]);
}

// Cylindre couché le long de x (canon, lunette, carcasse ronde).
function tube(radiusBack, radiusFront, length, segments = 32) {
  const geometry = new THREE.CylinderGeometry(radiusFront, radiusBack, length, segments);
  geometry.rotateZ(-Math.PI / 2);
  return geometry;
}

// --- Finition standard ------------------------------------------------------

const STD_BOUNDS = { minX: -20, maxX: 1200, minY: -130, maxY: 110 };

function standardFinish(env) {
  const common = { envMap: env, envMapIntensity: 0.7 };
  const bump = drawnTexture('sniper-std-bump', STD_BOUNDS, 3, (ctx) => {
    const rand = seeded(5);
    // Grain de la crosse et de la poignée, rainures de la plaque de couche.
    ctx.save();
    ctx.beginPath();
    ctx.rect(20, -80, 220, 110);
    ctx.rect(280, -124, 70, 100);
    ctx.clip();
    for (let i = 0; i < 26000; i += 1) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)';
      ctx.fillRect(-20 + rand() * 1220, -130 + rand() * 240, 0.35, 0.35);
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let y = -76; y < 32; y += 5) ctx.fillRect(-12, y, 14, 1.3);
    // Chanfreins autour des fentes du garde-main.
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 0.8;
    FOREND_SLOTS.forEach((slot) => {
      ctx.strokeRect(slot[0][0] - 1.5, slot[2][1] - 1.5, 29, 15);
    });
    speckle(ctx, STD_BOUNDS, 9000, ['rgba(0,0,0,0.15)', 'rgba(120,120,120,0.15)'], 0.5, seeded(6));
  });
  const wallRough = tiledTexture('sniper-wall', 256, (ctx, size) => {
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, { minX: 0, maxX: size, minY: 0, maxY: size }, 6000, ['#6a6a6a', '#c0c0c0'], 1.2, seeded(9));
  }, { repeat: 0.02 });
  const polymer = new THREE.MeshStandardMaterial({ ...common, envMapIntensity: 0.35, color: 0x2a2e25, metalness: 0.05, roughness: 0.78, bumpMap: bump, bumpScale: 1 });
  const polymerWall = new THREE.MeshStandardMaterial({ ...common, envMapIntensity: 0.35, color: 0x2a2e25, roughness: 1, roughnessMap: wallRough });
  const steel = new THREE.MeshStandardMaterial({ ...common, color: 0x23262c, metalness: 0.85, roughness: 0.35, bumpMap: bump, bumpScale: 0.6 });
  const steelWall = new THREE.MeshStandardMaterial({ ...common, color: 0x23262c, metalness: 0.85, roughness: 1, roughnessMap: wallRough });
  return {
    stock: [polymer, polymerWall],
    buttPad: [polymerWall, polymerWall],
    grip: [polymer, polymerWall],
    chassis: [steel, steelWall],
    forend: [steel, steelWall],
    muzzle: [steel, steelWall],
    receiver: new THREE.MeshStandardMaterial({ ...common, color: 0x2c3036, metalness: 0.9, roughness: 0.3 }),
    barrel: new THREE.MeshStandardMaterial({ ...common, color: 0x1b1d21, metalness: 0.92, roughness: 0.28 }),
    scope: new THREE.MeshStandardMaterial({ ...common, color: 0x15171b, metalness: 0.6, roughness: 0.42 }),
    lens: new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1.6, color: 0x1a3a6a, metalness: 0.4, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0 }),
    metal: new THREE.MeshStandardMaterial({ ...common, color: 0x40444b, metalness: 0.9, roughness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x060607, roughness: 0.9 }),
    brass: new THREE.MeshStandardMaterial({ ...common, color: 0xc99a45, metalness: 1, roughness: 0.28 }),
    flash: 'powder',
    light: 0xffb35c,
    smoke: 0xffffff,
  };
}

export const SNIPER_SKINS = {
  standard: { labelKey: 'aimTrainer.skinStandard', build: standardFinish },
  ...makeBasicSkins('sniper', standardFinish),
  ...SNIPER_SKIN_BUILDERS,
  ...SNIPER_MYTHIC_SKINS,
  ...SNIPER_TRANSCENDENT_SKINS,
  ...SNIPER_TRANSCENDENT_SET,
};

// --- Viewmodel ----------------------------------------------------------------

export function createSniperViewmodel({ renderer, scene, skin = 'standard', ...opts }) {
  const env = studioEnvironment(renderer);
  const uniforms = weaponUniforms();
  const geo = { shapes: SNIPER_SHAPES, forendSlots: FOREND_SLOTS, boreY: BORE_Y, scopeY: SCOPE_Y, uniforms };
  const finish = (SNIPER_SKINS[skin] ?? SNIPER_SKINS.standard).build(env, geo);

  const body = new THREE.Group();
  const add = (geometry, material, x = 0, y = 0, z = 0, parent = body) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const parts = {};

  // Crosse squelette, plaque de couche, appui-joue réglable, monopied arrière.
  parts.stock = add(extrude(roundedShape(SNIPER_SHAPES.stock, [SNIPER_SHAPES.stockHole]), 34, 3), finish.stock);
  parts.buttPad = add(extrude(roundedShape([[-14, 36, 5], [4, 36, 1], [4, -80, 1], [-14, -82, 6]]), 40, 2.5), finish.buttPad);
  parts.cheek = add(extrude(roundedShape([[40, 46, 5], [200, 42, 5], [212, 34, 2], [36, 34, 2]]), 26, 3), finish.stock);
  [70, 170].forEach((x) => add(new THREE.CylinderGeometry(3, 3, 14, 12), finish.metal, x, 33, 0));
  parts.monopod = add(new THREE.CylinderGeometry(5, 5, 34, 14), finish.metal, 70, -92, 0);
  add(new RoundedBoxGeometry(22, 5, 18, 2, 2), finish.metal, 70, -110, 0);

  // Châssis, poignée, pontet, détente, chargeur.
  parts.chassis = add(extrude(roundedShape(SNIPER_SHAPES.chassis), 44, 2.5), finish.chassis);
  parts.magwell = add(extrude(roundedShape([[470, -26, 0], [552, -26, 0], [548, -44, 3], [474, -44, 3]]), 40, 2), finish.chassis);
  parts.grip = add(extrude(roundedShape(SNIPER_SHAPES.grip), 30, 3), finish.grip);
  add(extrude(triggerGuardShape(), 9, 1.2), finish.metal);
  add(extrude(triggerShape(), 6, 0.8), finish.metal);
  parts.magazine = add(new RoundedBoxGeometry(66, 74, 32, 3, 3), finish.metal, 511, -80, 0);
  add(new RoundedBoxGeometry(72, 6, 36, 2, 2), finish.metal, 511, -118, 0);

  // Carcasse ronde, rail supérieur et ses encoches, bague avant.
  parts.receiver = add(tube(RECEIVER_R, RECEIVER_R, 322), finish.receiver, 481, BORE_Y, 0);
  parts.rail = add(new RoundedBoxGeometry(304, 9, 22, 2, 1.5), finish.metal, 490, BORE_Y + RECEIVER_R + 3, 0);
  for (let x = 348; x <= 632; x += 12) add(new THREE.BoxGeometry(5, 2.2, 23), finish.dark, x, BORE_Y + RECEIVER_R + 6.8, 0);
  add(tube(RECEIVER_R + 2.5, RECEIVER_R + 2.5, 14), finish.metal, 636, BORE_Y, 0);

  // Garde-main ajouré (fentes traversantes), bipied replié dessous.
  parts.forend = add(extrude(roundedShape(SNIPER_SHAPES.forend, FOREND_SLOTS), 52, 3), finish.forend);
  const bipod = new THREE.Group();
  body.add(bipod);
  add(new RoundedBoxGeometry(26, 12, 34, 2, 2), finish.metal, 918, -30, 0, bipod);
  [-1, 1].forEach((side) => {
    add(tube(3.6, 3.2, 120), finish.metal, 975, -33, side * 10, bipod);
    add(new RoundedBoxGeometry(12, 7, 9, 2, 2), finish.dark, 1038, -33, side * 10, bipod);
  });
  parts.bipod = bipod;

  // Canon cannelé, frein de bouche à trois lumières.
  parts.barrel = add(tube(13, 11, 480), finish.barrel, 860, BORE_Y, 0);
  parts.flutes = [];
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2;
    const flute = add(new RoundedBoxGeometry(150, 2.6, 2.6, 1, 1), finish.dark, 1010, BORE_Y + Math.sin(a) * 11.2, Math.cos(a) * 11.2);
    parts.flutes.push(flute);
  }
  parts.muzzle = add(extrude(muzzleBrakeShape(), 34, 2.5), finish.muzzle);
  add(new THREE.CircleGeometry(7, 24), finish.dark, 1188.8, BORE_Y, 0).rotation.y = Math.PI / 2;

  // Lunette : tube, oculaire, objectif, tourelles, colliers et embases.
  const scope = new THREE.Group();
  body.add(scope);
  parts.scope = scope;
  add(tube(15, 15, 262), finish.scope, 511, SCOPE_Y, 0, scope);
  add(tube(22, 15, 52), finish.scope, 356, SCOPE_Y, 0, scope);
  add(tube(23, 23, 10), finish.metal, 334, SCOPE_Y, 0, scope);
  add(tube(15, 27, 64), finish.scope, 674, SCOPE_Y, 0, scope);
  add(tube(28, 28, 40), finish.scope, 726, SCOPE_Y, 0, scope);
  add(tube(29.5, 29.5, 6), finish.metal, 744, SCOPE_Y, 0, scope);
  parts.lensFront = add(new THREE.CircleGeometry(25, 40), finish.lens, 746.5, SCOPE_Y, 0, scope);
  parts.lensFront.rotation.y = Math.PI / 2;
  parts.lensBack = add(new THREE.CircleGeometry(19, 32), finish.lensBack ?? new THREE.MeshPhysicalMaterial({ envMap: env, color: 0x05080d, metalness: 0.2, roughness: 0.08, clearcoat: 1 }), 328.5, SCOPE_Y, 0, scope);
  parts.lensBack.rotation.y = -Math.PI / 2;
  add(new THREE.CylinderGeometry(11, 11, 18, 24), finish.scope, 510, SCOPE_Y + 23, 0, scope);
  add(new THREE.CylinderGeometry(12, 12, 6, 24), finish.metal, 510, SCOPE_Y + 34, 0, scope);
  const windage = add(new THREE.CylinderGeometry(10, 10, 16, 24), finish.scope, 510, SCOPE_Y, 23, scope);
  windage.rotation.x = Math.PI / 2;
  const parallax = add(new THREE.CylinderGeometry(9, 9, 12, 24), finish.scope, 510, SCOPE_Y, -21, scope);
  parallax.rotation.x = Math.PI / 2;
  [430, 596].forEach((x) => {
    const ring = add(new THREE.TorusGeometry(16.5, 3.2, 10, 32), finish.metal, x, SCOPE_Y, 0, scope);
    ring.rotation.y = Math.PI / 2;
    add(new RoundedBoxGeometry(22, SCOPE_Y - 16 - (BORE_Y + RECEIVER_R + 7), 20, 2, 2), finish.metal, x, (SCOPE_Y - 16 + BORE_Y + RECEIVER_R + 7) / 2, 0, scope);
  });

  // Culasse mobile : pivote autour de l'axe du canon puis coulisse.
  const bolt = new THREE.Group();
  bolt.position.set(0, BORE_Y, 0);
  body.add(bolt);
  parts.bolt = bolt;
  add(tube(17, 17, 24), finish.receiver, 326, 0, 0, bolt);
  add(tube(9.5, 9.5, 120), finish.metal, 420, 0, 0, bolt);
  const stem = add(new THREE.CylinderGeometry(3.6, 4.4, 40, 14), finish.metal, 352, -8, RECEIVER_R + 14, bolt);
  stem.rotation.x = Math.PI / 2 + 0.55;
  parts.boltKnob = add(new THREE.SphereGeometry(9, 22, 16), finish.metal, 352, -20, RECEIVER_R + 30, bolt);
  // Fenêtre d'éjection (flanc droit).
  add(new THREE.PlaneGeometry(80, 18), finish.dark, 462, BORE_Y + 4, RECEIVER_R + 0.4);

  const skinExtras = finish.decorate?.({ body, add, scene, parts, geo }) ?? {};
  // Mains ajoutées après le skin : les apparitions des skins ne les déplacent pas.
  const hands = opts.hands ? sniperHands(typeof opts.hands === 'string' ? opts.hands : 'standard') : null;
  if (hands) body.add(hands.group);
  // Levier de culasse (repère du levier) : la main droite vient le manœuvrer.
  const KNOB = new THREE.Vector3(352, -20, RECEIVER_R + 30);
  const knobPos = new THREE.Vector3();
  const handWork = { hand: hands?.rightHand, target: new THREE.Vector3(), weight: 0, curl: 0.45 };

  // --- Effets -------------------------------------------------------------------
  const muzzle = new THREE.Object3D();
  muzzle.position.set(skinExtras.muzzleX ?? 1196, BORE_Y, 0);
  body.add(muzzle);
  const ejection = new THREE.Object3D();
  ejection.position.set(462, BORE_Y + 8, RECEIVER_R + 6);
  body.add(ejection);

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(finish.flash, 9), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  flash.scale.set(230, 230, 1);
  muzzle.add(flash);
  const coneTex = softDotTexture('flash-cone');
  const flashCone = new THREE.Sprite(new THREE.SpriteMaterial({ map: coneTex, color: finish.light, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  flashCone.position.set(60, 0, 0);
  flashCone.scale.set(200, 60, 1);
  muzzle.add(flashCone);
  // Jets latéraux du frein de bouche.
  const sideJets = [-1, 1].map((side) => {
    const jet = new THREE.Sprite(new THREE.SpriteMaterial({ map: coneTex, color: finish.light, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    jet.position.set(1130, BORE_Y, side * 40);
    jet.scale.set(70, 50, 1);
    body.add(jet);
    return jet;
  });
  const flashLight = new THREE.PointLight(finish.light, 0, 5, 2);
  muzzle.add(flashLight);

  body.position.set(-330, -BORE_Y, 0);
  const model = new THREE.Group();
  model.add(body);
  model.scale.setScalar(MM);
  model.rotation.y = Math.PI / 2;

  const holder = new THREE.Group();
  const recoilRig = new THREE.Group();
  holder.add(recoilRig);
  recoilRig.add(model);
  const REST = new THREE.Vector3(opts.rest?.[0] ?? 0.24, opts.rest?.[1] ?? -0.12, opts.rest?.[2] ?? -0.34);
  const REST_ROT = new THREE.Euler(opts.rot?.[0] ?? 0.0, opts.rot?.[1] ?? 0.05, opts.rot?.[2] ?? -0.02);
  holder.position.copy(REST);
  holder.rotation.copy(REST_ROT);

  // --- Animation ------------------------------------------------------------------
  const smokeTex = softDotTexture('smoke', 'rgba(215,215,215,0.55)', 'rgba(215,215,215,0)');
  const shellGeo = new THREE.CylinderGeometry(7 * MM, 7 * MM, 50 * MM, 14);
  const kick = { x: 0, v: 0 };
  const roll = { x: 0, v: 0 };
  let boltT = -1; // -1 = au repos ; sinon progression de la manœuvre (0 → 1)
  let shellPending = false;
  let flashUntil = 0;
  let flare = 0;
  let time = 0;
  let equip = 0;
  const shells = [];
  const smokes = [];
  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  const ejectShell = () => {
    ejection.getWorldPosition(tmp);
    const shell = finish.makeShell ? finish.makeShell() : new THREE.Mesh(shellGeo, finish.brass);
    shell.position.copy(tmp);
    holder.getWorldQuaternion(quat);
    const velocity = new THREE.Vector3(1.4 + Math.random() * 0.5, 1.6 + Math.random() * 0.5, 0.3).applyQuaternion(quat);
    shell.rotation.set(Math.random(), Math.random(), Math.PI / 2);
    scene.add(shell);
    shells.push({ mesh: shell, velocity, spin: new THREE.Vector3(14 + Math.random() * 8, Math.random() * 6, 9), born: performance.now() });
  };

  const fire = () => {
    const now = performance.now();
    kick.v += 13;
    roll.v += 6;
    flare = 1;
    flashUntil = now + 60;
    flash.material.rotation = Math.random() * Math.PI * 2;
    flash.scale.setScalar(200 + Math.random() * 80);
    // La manœuvre démarre juste après le coup ; un tir pendant la manœuvre la relance.
    if (shellPending) ejectShell();
    boltT = -0.18;
    shellPending = true;
    muzzle.getWorldPosition(tmp);
    for (let i = 0; i < 2; i += 1) {
      const smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.5, color: finish.smoke }));
      smoke.position.copy(tmp);
      smoke.scale.setScalar(0.05);
      scene.add(smoke);
      smokes.push({ sprite: smoke, born: now, drift: (Math.random() - 0.5) * 0.1 });
    }
    skinExtras.onFire?.();
    hands?.fire();
  };

  const update = (rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const now = performance.now();
    time += dt;
    equip = Math.min(1, equip + dt / 0.55);
    const e = 1 - (1 - equip) ** 3;

    springStep(kick, 0, 60, dt);
    springStep(roll, 0, 40, dt);

    // Manœuvre de culasse : relever (rotation), tirer, repousser, rabattre.
    let lift = 0;
    let slide = 0;
    let cant = 0;
    let boltProgress = -1;
    if (boltT > -1) {
      boltT += dt / 0.95;
      const t = Math.max(0, boltT);
      boltProgress = t;
      if (t < 0.18) lift = t / 0.18;
      else if (t < 0.42) {
        lift = 1;
        slide = (t - 0.18) / 0.24;
      } else if (t < 0.66) {
        lift = 1;
        slide = 1 - (t - 0.42) / 0.24;
      } else if (t < 0.82) lift = 1 - (t - 0.66) / 0.16;
      if (shellPending && t >= 0.4) {
        shellPending = false;
        ejectShell();
      }
      cant = Math.sin(Math.min(1, t) * Math.PI);
      if (boltT >= 1) boltT = -1;
    }
    const ease = (x) => x * x * (3 - 2 * x);
    bolt.rotation.x = -ease(lift) * 1.15;
    bolt.position.x = -ease(slide) * 86;

    const sway = Math.sin(time * 1.3) * 0.0016;
    holder.position.set(REST.x + Math.sin(time * 0.7) * 0.001 - cant * 0.012, REST.y + sway - (1 - e) * 0.16 - cant * 0.01, REST.z);
    holder.rotation.set(REST_ROT.x - (1 - e) * 0.6, REST_ROT.y, REST_ROT.z + (1 - e) * 0.35 + cant * 0.22);
    recoilRig.position.set(0, kick.x * 0.004, kick.x * 0.045);
    recoilRig.rotation.set(kick.x * 0.12, 0, roll.x * 0.02);

    flare = Math.max(0, flare - dt * 3);
    uniforms.uTime.value = time;
    uniforms.uFlare.value = flare;
    skinExtras.update?.(dt, time, flare, { lift, slide });
    if (hands) {
      // Pendant la manœuvre, la main droite lâche la poignée, suit le levier puis revient.
      const t = boltProgress;
      handWork.weight = t < 0 ? 0 : Math.min(1, t / 0.12) * (1 - Math.min(1, Math.max(0, (t - 0.76) / 0.16)));
      knobPos.copy(KNOB).applyEuler(bolt.rotation).add(bolt.position);
      handWork.target.copy(knobPos).add(new THREE.Vector3(-14, -58, 34));
      hands.update(dt, handWork);
    }

    const flashOn = now < flashUntil;
    flash.material.opacity = flashOn ? 1 : 0;
    flashCone.material.opacity = flashOn ? 0.9 : 0;
    sideJets.forEach((jet) => {
      jet.material.opacity = flashOn ? 0.8 : 0;
    });
    flashLight.intensity = flashOn ? 4 : 0;

    for (let i = shells.length - 1; i >= 0; i -= 1) {
      const s = shells[i];
      s.velocity.y -= 9.8 * dt;
      s.mesh.position.addScaledVector(s.velocity, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
      if (now - s.born > 1600) {
        scene.remove(s.mesh);
        shells.splice(i, 1);
      }
    }
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      const s = smokes[i];
      const t = (now - s.born) / 1100;
      if (t >= 1) {
        scene.remove(s.sprite);
        s.sprite.material.dispose();
        smokes.splice(i, 1);
      } else {
        s.sprite.position.y += dt * 0.08;
        s.sprite.position.x += dt * s.drift;
        s.sprite.scale.setScalar(0.05 + t * 0.25);
        s.sprite.material.opacity = 0.45 * (1 - t);
      }
    }
  };

  // Skins Transcendants : rejoue leur animation d'apparition (sortie de l'arme) ;
  // les mains attendent hors champ puis viennent la saisir.
  const replayIntro = () => {
    if (!skinExtras.replayIntro) return;
    skinExtras.replayIntro();
    hands?.startIntro(skinExtras.introDuration ?? 1.6);
  };

  return { holder, muzzle, fire, update, replayIntro };
}
