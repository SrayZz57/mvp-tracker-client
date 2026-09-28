import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  MM,
  extrude,
  extrudeAlongX,
  roundedShape,
  studioEnvironment,
  seeded,
  drawnTexture,
  tiledTexture,
  speckle,
  flashTexture,
  softDotTexture,
  ribbonShape,
  springStep,
  weaponUniforms,
} from './weaponKit.js';
import { VANDAL_SKIN_BUILDERS } from './vandalSkins.js';
import { makeBasicSkins } from './basicSkins.js';
import { VANDAL_PREMIUM_SKINS } from './vandalSkinsPremium.js';
import { VANDAL_LEGEND_SKINS } from './vandalSkinsLegend.js';
import { VANDAL_MYTHIC_SKINS } from './vandalSkinsMythic.js';
import { VANDAL_LITHOSPHERE_SKIN } from './vandalSkinLithosphere.js';
import { VANDAL_DOSSIER_SKINS } from './vandalSkinsDossier.js';
import { VANDAL_MACHINE_SKINS } from './vandalSkinsMachines.js';
import { VANDAL_SINGULARITY_SKIN } from './vandalSkinSingularity.js';
import { VANDAL_TRANSCENDENT_SKINS } from './vandalSkinsTranscendent.js';
import { vandalHands } from './viewmodelHands.js';

// Fusil d'assaut inspiré de la Vandal, modélisé entièrement en code (aucun
// fichier ni licence externe). Chaque pièce est un profil dessiné au millimètre
// puis extrudé avec des arêtes arrondies ; les détails fins (usinage, grain des
// polymères, rainures du chargeur, gravures) sont des cartes de relief et de
// rugosité dessinées sur canvas.
//
// Repère du modèle, en millimètres : x vers la bouche du canon (crosse à x = 0),
// y vers le haut (axe du canon à y = 0), z vers le flanc droit.

const RECEIVER_W = 30;
const PORT = { x0: 404, x1: 468, y0: 3, y1: 19 };

// --- Profils ------------------------------------------------------------------

const STOCK_OUTLINE = [
  [4, 28, 6],
  [226, 21, 2],
  [226, -20, 2],
  [172, -34, 26],
  [26, -104, 12],
  [4, -108, 4],
];
const STOCK_HOLE = [
  [50, 11, 9],
  [186, 8, 9],
  [158, -22, 16],
  [66, -70, 12],
  [50, -70, 9],
];

function stockShape() {
  return roundedShape(STOCK_OUTLINE, [STOCK_HOLE]);
}

function buttPadShape() {
  return roundedShape([
    [-12, 29, 5],
    [6, 29, 1],
    [6, -109, 1],
    [-12, -110, 6],
  ]);
}

function cheekRiserShape() {
  return roundedShape([
    [30, 26, 4],
    [150, 23, 10],
    [168, 20, 2],
    [36, 20, 2],
  ]);
}

function receiverShape() {
  return roundedShape([
    [220, 22, 3],
    [504, 22, 2],
    [504, -24, 3],
    [220, -24, 5],
  ]);
}

function magwellShape() {
  return roundedShape([
    [426, -20, 0],
    [504, -20, 0],
    [500, -40, 4],
    [430, -40, 4],
  ]);
}

function dustCoverShape() {
  return roundedShape([
    [232, 19, 0],
    [496, 19, 0],
    [496, 30, 5],
    [252, 35, 9],
    [232, 29, 3],
  ]);
}

function gripShape() {
  return roundedShape([
    [322, -20, 0],
    [376, -20, 0],
    [371, -46, 10],
    [362, -60, 6],
    [364, -74, 8],
    [354, -88, 6],
    [355, -102, 8],
    [345, -118, 6],
    [341, -136, 9],
    [297, -141, 12],
    [287, -127, 7],
    [309, -52, 16],
  ]);
}

function triggerGuardShape() {
  return roundedShape(
    [
      [368, -20, 0],
      [432, -20, 0],
      [432, -30, 2],
      [428, -60, 9],
      [380, -62, 12],
      [364, -40, 8],
    ],
    [
      [
        [378, -29, 3],
        [423, -29, 3],
        [420, -52, 7],
        [384, -53, 9],
      ],
    ],
  );
}

function triggerShape() {
  return roundedShape([
    [393, -22, 0],
    [400, -22, 0],
    [402, -36, 3],
    [397, -49, 4],
    [391, -47, 2],
    [395, -35, 3],
  ]);
}

function magazineCurve() {
  return new THREE.QuadraticBezierCurve(new THREE.Vector2(465, -22), new THREE.Vector2(470, -120), new THREE.Vector2(538, -206));
}

const HANDGUARD_VENTS = [0, 1, 2, 3].map((i) => {
  const x0 = 532 + i * 40;
  return [
    [x0, 4, 3],
    [x0 + 22, 4, 3],
    [x0 + 13, -15, 3],
    [x0 - 9, -15, 3],
  ];
});

const HANDGUARD_OUTLINE = [
  [502, 18, 0],
  [712, 18, 2],
  [714, -8, 4],
  [692, -27, 8],
  [522, -28, 6],
  [502, -24, 2],
];

function handguardShape() {
  return roundedShape(HANDGUARD_OUTLINE, HANDGUARD_VENTS);
}

function upperGuardShape() {
  const vents = [0, 1, 2, 3, 4].map((i) => {
    const x0 = 548 + i * 26;
    return [
      [x0, 22, 2],
      [x0 + 14, 22, 2],
      [x0 + 14, 28, 2],
      [x0, 28, 2],
    ];
  });
  return roundedShape(
    [
      [506, 17, 0],
      [696, 17, 0],
      [698, 29, 6],
      [680, 35, 8],
      [516, 36, 8],
      [506, 30, 3],
    ],
    vents,
  );
}

function gasBlockShape() {
  return roundedShape([
    [710, -13, 3],
    [750, -13, 3],
    [750, 34, 3],
    [714, 34, 3],
  ]);
}

// Tour de guidon vue de face (plan z-y) : deux oreilles qui protègent le fût.
function frontSightTowerShape() {
  return roundedShape([
    [-12, 32, 2],
    [12, 32, 2],
    [12, 68, 4],
    [6.5, 68, 1.5],
    [6.5, 46, 2],
    [-6.5, 46, 2],
    [-6.5, 68, 1.5],
    [-12, 68, 4],
  ]);
}

function rearSightShape() {
  return roundedShape([
    [-9, 32, 1],
    [9, 32, 1],
    [9, 45, 1.5],
    [2.2, 45, 0.5],
    [2.2, 40, 1],
    [-2.2, 40, 1],
    [-2.2, 45, 0.5],
    [-9, 45, 1.5],
  ]);
}

// Frein de bouche à coupe biseautée, avec deux lumières traversantes.
function muzzleShape() {
  return roundedShape(
    [
      [836, -14, 2],
      [882, -14, 3],
      [902, 4, 3],
      [902, 14, 2],
      [836, 14, 2],
    ],
    [
      [
        [850, 4, 2.5],
        [880, 4, 2.5],
        [880, 9, 2.5],
        [850, 9, 2.5],
      ],
      [
        [850, -8, 2.5],
        [872, -8, 2.5],
        [872, -3, 2.5],
        [850, -3, 2.5],
      ],
    ],
  );
}

// --- Textures de la finition standard -------------------------------------------

const RECEIVER_BOUNDS = { minX: 216, maxX: 506, minY: -44, maxY: 40 };
const STOCK_BOUNDS = { minX: -14, maxX: 230, minY: -112, maxY: 32 };
const GRIP_BOUNDS = { minX: 284, maxX: 380, minY: -144, maxY: -18 };
const GUARD_BOUNDS = { minX: 500, maxX: 752, minY: -30, maxY: 38 };
const MAG_BOUNDS = { minX: 424, maxX: 580, minY: -218, maxY: -16 };

function receiverBump() {
  return drawnTexture('vandal-receiver-bump', RECEIVER_BOUNDS, 6, (ctx) => {
    const rand = seeded(11);
    // Fines rayures d'usinage le long de la pièce.
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (let y = -44; y < 40; y += 0.7) ctx.fillRect(216, y, 290, 0.12 + rand() * 0.1);
    // Nervures de la culasse (arrière du couvercle) et du couvercle lui-même.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (let i = 0; i < 6; i += 1) ctx.fillRect(258 + i * 4.2, 21, 1.8, 11);
    // Joint entre carcasse et couvercle, et rainure de renfort.
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(232, 19.2, 264, 0.6);
    ctx.fillRect(236, -12, 160, 0.5);
    // Rivets emboutis.
    [[244, -16], [300, -16], [356, -16], [488, -16], [488, 8]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
    });
    // Plaque de numéro (cartouche en creux, sans texte : les deux flancs partagent la texture).
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(250, -6, 46, 9);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(251, -5, 44, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 9; i += 1) ctx.fillRect(254 + i * 4.6, -3.5, 2.6, 4);
    // Repères du sélecteur.
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(330, 12, 5, 1);
    ctx.fillRect(330, 4, 5, 1);
    ctx.fillRect(330, -4, 5, 1);
  });
}

function receiverRoughness() {
  return drawnTexture('vandal-receiver-rough', RECEIVER_BOUNDS, 3, (ctx) => {
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(216, -44, 290, 84);
    // Usure plus brillante là où la main et le chargeur frottent.
    const worn = ctx.createRadialGradient(470, -20, 0, 470, -20, 40);
    worn.addColorStop(0, 'rgba(60,60,60,0.8)');
    worn.addColorStop(1, 'rgba(60,60,60,0)');
    ctx.fillStyle = worn;
    ctx.fillRect(416, -60, 90, 80);
    speckle(ctx, RECEIVER_BOUNDS, 9000, ['#707070', '#a0a0a0', '#5f5f5f'], 0.5, seeded(3));
  });
}

function stipple(ctx, clip, count, rand) {
  ctx.save();
  ctx.beginPath();
  clip(ctx);
  ctx.clip();
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.25)';
    const size = 0.3 + rand() * 0.25;
    ctx.fillRect(-20 + rand() * 800, -220 + rand() * 280, size, size);
  }
  ctx.restore();
}

function stockBump() {
  return drawnTexture('vandal-stock-bump', STOCK_BOUNDS, 4, (ctx) => {
    const rand = seeded(21);
    // Zone de joue texturée et rainures de la plaque de couche.
    stipple(
      ctx,
      (c) => {
        c.moveTo(30, 20);
        c.lineTo(46, 20);
        c.lineTo(46, -70);
        c.lineTo(30, -90);
        c.closePath();
      },
      9000,
      rand,
    );
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let y = -100; y < 24; y += 5) ctx.fillRect(-12, y, 18, 1.4);
    // Ligne de moulage.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(10, 14, 200, 0.5);
  });
}

function gripBump() {
  return drawnTexture('vandal-grip-bump', GRIP_BOUNDS, 6, (ctx) => {
    const rand = seeded(31);
    stipple(
      ctx,
      (c) => {
        c.moveTo(318, -34);
        c.lineTo(362, -34);
        c.lineTo(338, -130);
        c.lineTo(298, -134);
        c.closePath();
      },
      22000,
      rand,
    );
  });
}

function guardBump() {
  return drawnTexture('vandal-guard-bump', GUARD_BOUNDS, 5, (ctx) => {
    // Chanfrein souligné autour des lumières et rainures de préhension.
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 0.8;
    HANDGUARD_VENTS.forEach((vent) => {
      ctx.beginPath();
      vent.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x - 1.5, y + 1.5) : ctx.lineTo(x + (i === 1 || i === 2 ? 1.5 : -1.5), y + (i < 2 ? 1.5 : -1.5))));
      ctx.closePath();
      ctx.stroke();
    });
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let x = 528; x < 690; x += 6) ctx.fillRect(x, -24, 2.2, 4);
    speckle(ctx, GUARD_BOUNDS, 4000, ['rgba(0,0,0,0.25)', 'rgba(90,90,90,0.25)'], 0.5, seeded(41));
  });
}

function magBump() {
  return drawnTexture('vandal-mag-bump', MAG_BOUNDS, 5, (ctx) => {
    const curve = magazineCurve();
    // Nervures transversales qui suivent la courbure du chargeur.
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.6;
    for (let i = 3; i < 19; i += 1) {
      const t = i / 20;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const n = new THREE.Vector2(-tan.y, tan.x);
      const w = (64 - 6 * t) / 2 - 7;
      ctx.beginPath();
      ctx.moveTo(p.x + n.x * w, p.y + n.y * w);
      ctx.lineTo(p.x - n.x * (w - 18), p.y - n.y * (w - 18));
      ctx.stroke();
    }
    // Arête de renfort le long du dos.
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = 0; i <= 30; i += 1) {
      const t = i / 30;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const n = new THREE.Vector2(-tan.y, tan.x);
      const w = (64 - 6 * t) / 2 - 5;
      if (i === 0) ctx.moveTo(p.x - n.x * w, p.y - n.y * w);
      else ctx.lineTo(p.x - n.x * w, p.y - n.y * w);
    }
    ctx.stroke();
    speckle(ctx, MAG_BOUNDS, 5000, ['rgba(0,0,0,0.2)', 'rgba(110,110,110,0.2)'], 0.5, seeded(51));
  });
}

function wallRoughness(key, base) {
  return tiledTexture(key, 256, (ctx, size) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, { minX: 0, maxX: size, minY: 0, maxY: size }, 6000, ['#6a6a6a', '#9a9a9a', '#808080'], 1.2, seeded(key.length * 97));
  }, { repeat: 0.02 });
}

// --- Finitions (skins) -----------------------------------------------------------
// Une finition fournit ses matériaux et, si besoin, des pièces ou effets en plus.
// `glow` : matériaux lumineux animés dans update() (pulsation + sursaut au tir).

function standardFinish(env) {
  const common = { envMap: env, envMapIntensity: 0.7 };
  const steel = new THREE.MeshStandardMaterial({
    ...common,
    color: 0x2b2e34,
    metalness: 0.78,
    roughness: 1,
    roughnessMap: receiverRoughness(),
    bumpMap: receiverBump(),
    bumpScale: 1.2,
  });
  const steelWall = new THREE.MeshStandardMaterial({
    ...common,
    color: 0x2b2e34,
    metalness: 0.78,
    roughness: 1,
    roughnessMap: wallRoughness('vandal-steel-wall', '#7a7a7a'),
  });
  const polymer = (bumpMap) =>
    new THREE.MeshStandardMaterial({ ...common, envMapIntensity: 0.35, color: 0x1b1c1f, metalness: 0.05, roughness: 0.74, bumpMap, bumpScale: 1.1 });
  const polymerWall = new THREE.MeshStandardMaterial({
    ...common,
    envMapIntensity: 0.35,
    color: 0x1b1c1f,
    metalness: 0.05,
    roughness: 1,
    roughnessMap: wallRoughness('vandal-polymer-wall', '#b8b8b8'),
  });
  // Pièces claires du modèle d'origine (crosse, poignée, garde-main) : polymère
  // sable, qui donne sa silhouette bicolore à l'arme.
  const sand = (bumpMap) =>
    new THREE.MeshStandardMaterial({ ...common, envMapIntensity: 0.3, color: 0x7a6c56, metalness: 0, roughness: 0.82, bumpMap, bumpScale: 0.6 });
  const sandWall = new THREE.MeshStandardMaterial({
    ...common,
    envMapIntensity: 0.3,
    color: 0x7a6c56,
    metalness: 0,
    roughness: 1,
    roughnessMap: wallRoughness('vandal-sand-wall', '#c8c8c8'),
  });
  return {
    receiver: [steel, steelWall],
    dustCover: [steel, steelWall],
    stock: [sand(stockBump()), sandWall],
    buttPad: [polymer(stockBump()), polymerWall],
    grip: [sand(gripBump()), sandWall],
    handguard: [sand(guardBump()), sandWall],
    upperGuard: [polymer(guardBump()), polymerWall],
    magazine: [polymer(magBump()), polymerWall],
    metal: new THREE.MeshStandardMaterial({ ...common, color: 0x3d4047, metalness: 0.9, roughness: 0.32 }),
    barrel: new THREE.MeshStandardMaterial({ ...common, color: 0x1e2024, metalness: 0.92, roughness: 0.28 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x060607, roughness: 0.9 }),
    sight: new THREE.MeshStandardMaterial({ color: 0xf1efe6, roughness: 0.4, emissive: 0x2a2a2a }),
    brass: new THREE.MeshStandardMaterial({ ...common, color: 0xc99a45, metalness: 1, roughness: 0.28 }),
    flash: 'powder',
    light: 0xffb35c,
    smoke: 0xffffff,
    glow: [],
  };
}

export const VANDAL_SKINS = {
  standard: { labelKey: 'aimTrainer.skinStandard', build: standardFinish },
  ...makeBasicSkins('vandal', standardFinish),
  ...VANDAL_SKIN_BUILDERS,
  ...VANDAL_PREMIUM_SKINS,
  ...VANDAL_LEGEND_SKINS,
  ...VANDAL_MYTHIC_SKINS,
  ...VANDAL_LITHOSPHERE_SKIN,
  ...VANDAL_DOSSIER_SKINS,
  ...VANDAL_MACHINE_SKINS,
  ...VANDAL_SINGULARITY_SKIN,
  ...VANDAL_TRANSCENDENT_SKINS,
};

// --- Viewmodel ----------------------------------------------------------------

export function createVandalViewmodel({ renderer, scene, skin = 'standard', ...opts }) {
  const env = studioEnvironment(renderer);
  const uniforms = weaponUniforms();
  const geo = {
    stockOutline: STOCK_OUTLINE,
    stockHole: STOCK_HOLE,
    handguardOutline: HANDGUARD_OUTLINE,
    receiverWidth: RECEIVER_W,
    magazineCurve: magazineCurve(),
    uniforms,
  };
  const finish = (VANDAL_SKINS[skin] ?? VANDAL_SKINS.standard).build(env, geo);

  const body = new THREE.Group();
  const add = (geometry, material, x = 0, y = 0, z = 0, parent = body) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  // Crosse, plaque de couche et appui-joue.
  const parts = {};
  parts.stock = add(extrude(stockShape(), 32, 3), finish.stock);
  parts.buttPad = add(extrude(buttPadShape(), 36, 2.5), finish.buttPad);
  parts.cheekRiser = add(extrude(cheekRiserShape(), 22, 2.5), finish.stock);
  add(new RoundedBoxGeometry(22, 40, 26, 3, 3), finish.metal, 226, 0, 0);

  // Carcasse, couvercle, puits de chargeur.
  add(extrude(receiverShape(), RECEIVER_W, 2), finish.receiver);
  parts.dustCover = add(extrude(dustCoverShape(), RECEIVER_W - 3, 3), finish.dustCover);
  add(extrude(magwellShape(), RECEIVER_W + 2, 2), finish.magwell ?? finish.receiver);
  // Bouton de démontage à l'arrière du couvercle.
  add(new THREE.CylinderGeometry(5, 5, 8, 20), finish.metal, 232, 26, 0).rotation.z = Math.PI / 2;

  // Poignée, pontet, détente.
  parts.grip = add(extrude(gripShape(), 30, 3), finish.grip);
  add(extrude(triggerGuardShape(), 9, 1.2), finish.metal);
  add(extrude(triggerShape(), 6, 0.8), finish.metal);

  // Chargeur courbé + semelle.
  const curve = magazineCurve();
  parts.magazine = add(extrude(ribbonShape(curve, (t) => 64 - 6 * t, 48), 24, 2.2, { curveSegments: 4 }), finish.magazine);
  const end = curve.getPoint(1);
  const endTan = curve.getTangent(1);
  const basePlate = parts.basePlate = add(new RoundedBoxGeometry(62, 6, 28, 3, 2), finish.metal, end.x + endTan.x * 2, end.y + endTan.y * 2, 0);
  basePlate.rotation.z = Math.atan2(endTan.y, endTan.x) + Math.PI / 2;
  // Arrêtoir de chargeur, derrière le puits.
  add(new RoundedBoxGeometry(8, 16, 18, 2, 2), finish.metal, 424, -30, 0);

  // Garde-main bicolore, bloc d'emprunt et tour de guidon.
  parts.handguard = add(extrude(handguardShape(), 44, 3), finish.handguard);
  parts.upperGuard = add(extrude(upperGuardShape(), 32, 3), finish.upperGuard);
  add(extrude(gasBlockShape(), 30, 2), finish.gasBlock ?? finish.receiver);
  parts.frontSight = add(extrudeAlongX(frontSightTowerShape(), 20, 1), finish.metal, 720, 0, 0);
  add(new THREE.CylinderGeometry(1.6, 2, 18, 12), finish.dark, 730, 55, 0);

  // Canon (visible dans les lumières du garde-main), tube d'emprunt, frein de bouche.
  const barrel = add(new THREE.CylinderGeometry(8.5, 8.5, 350, 28), finish.barrel, 663, 0, 0);
  barrel.rotation.z = Math.PI / 2;
  [760, 790, 818].forEach((x) => {
    const ring = add(new THREE.CylinderGeometry(10, 10, 4, 28), finish.metal, x, 0, 0);
    ring.rotation.z = Math.PI / 2;
  });
  parts.muzzle = add(extrude(muzzleShape(), 26, 2), finish.muzzle ?? finish.receiver);
  const bore = add(new THREE.CircleGeometry(5.5, 24), finish.dark, 903.2, 4, 0);
  bore.rotation.y = Math.PI / 2;

  // Hausse sur l'avant du couvercle.
  parts.rearSight = add(extrudeAlongX(rearSightShape(), 14, 0.6), finish.metal, 470, 0, 0);

  // Flanc droit : fenêtre d'éjection, culasse mobile, levier d'armement, sélecteur.
  const portShadow = add(new THREE.PlaneGeometry(PORT.x1 - PORT.x0, PORT.y1 - PORT.y0), finish.dark, (PORT.x0 + PORT.x1) / 2, (PORT.y0 + PORT.y1) / 2, RECEIVER_W / 2 + 0.1);
  portShadow.renderOrder = 1;
  const carrier = new THREE.Group();
  body.add(carrier);
  add(new RoundedBoxGeometry(52, 12, 6, 2, 1.5), finish.metal, 436, 11, RECEIVER_W / 2 - 1.5, carrier);
  const handleStem = add(new THREE.CylinderGeometry(3.5, 3.5, 18, 14), finish.metal, 452, 11, RECEIVER_W / 2 + 8, carrier);
  handleStem.rotation.x = Math.PI / 2;
  add(new THREE.SphereGeometry(6, 18, 12), finish.metal, 452, 11, RECEIVER_W / 2 + 18, carrier).scale.set(1, 0.85, 0.8);
  const selector = add(new RoundedBoxGeometry(104, 7, 2.4, 2, 1), finish.metal, 386, 12, RECEIVER_W / 2 + 1.4);
  selector.rotation.z = -0.06;
  add(new RoundedBoxGeometry(10, 16, 3, 2, 1.2), finish.metal, 332, 8, RECEIVER_W / 2 + 2);

  // Rivets en relief des deux côtés de la carcasse.
  [[244, -16], [300, -16], [356, -16], [488, -16], [488, 8], [410, -32]].forEach(([x, y]) => {
    [-1, 1].forEach((side) => {
      const rivet = add(new THREE.SphereGeometry(2.6, 12, 8), finish.metal, x, y, side * (RECEIVER_W / 2 + 0.6));
      rivet.scale.set(1, 1, 0.45);
    });
  });

  // Flanc gauche : rail de montage en queue d'aronde (lunette), avec ses rainures.
  const rail = add(new RoundedBoxGeometry(112, 16, 5, 2, 1.2), finish.metal, 330, 2, -(RECEIVER_W / 2 + 2));
  parts.rail = rail;
  parts.railGrooves = [];
  for (let i = 0; i < 8; i += 1) {
    parts.railGrooves.push(add(new RoundedBoxGeometry(3, 12, 1.2, 1, 0.4), finish.dark, 284 + i * 13, 2, -(RECEIVER_W / 2 + 4.6)));
  }

  // Bagues de maintien du garde-main (avant et arrière).
  [[504, 12], [708, 8]].forEach(([x, w]) => {
    add(new RoundedBoxGeometry(w, 48, 46, 2, 2), finish.metal, x, -4, 0);
  });

  // Anneaux de bretelle.
  [[20, -30], [700, -22]].forEach(([x, y]) => {
    const loop = add(new THREE.TorusGeometry(7, 1.6, 8, 24), finish.metal, x, y, 0);
    loop.rotation.y = Math.PI / 2;
  });

  parts.barrel = barrel;
  // Les skins peuvent masquer, remplacer ou habiller n'importe quelle pièce nommée.
  const skinExtras = finish.decorate?.({ body, add, carrier, scene, parts, magazineCurve: curve }) ?? {};
  // Mains ajoutées après le skin : les apparitions des skins ne les déplacent pas.
  const hands = opts.hands ? vandalHands(typeof opts.hands === 'string' ? opts.hands : 'standard') : null;
  if (hands) body.add(hands.group);

  // --- Points d'ancrage et effets ---------------------------------------------
  const muzzle = new THREE.Object3D();
  muzzle.position.set(skinExtras.muzzleX ?? 912, 4, 0);
  body.add(muzzle);
  const ejection = new THREE.Object3D();
  ejection.position.set(440, 12, RECEIVER_W / 2 + 4);
  body.add(ejection);

  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: flashTexture(finish.flash, 8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
  );
  flash.scale.set(150, 150, 1);
  muzzle.add(flash);
  // Deuxième flash, allongé dans l'axe du canon : donne sa forme de dard au tir.
  const flashCone = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: softDotTexture('flash-cone'), color: finish.light, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
  );
  flashCone.position.set(40, 0, 0);
  flashCone.scale.set(120, 40, 1);
  muzzle.add(flashCone);
  const flashLight = new THREE.PointLight(finish.light, 0, 4, 2);
  muzzle.add(flashLight);

  // Tenue : poignée à l'origine du viewmodel, canon aligné sur -Z de la caméra.
  body.position.set(-345, 0, 0);
  const model = new THREE.Group();
  model.add(body);
  model.scale.setScalar(MM);
  model.rotation.y = Math.PI / 2;

  const holder = new THREE.Group();
  const recoilRig = new THREE.Group();
  holder.add(recoilRig);
  recoilRig.add(model);
  const REST = new THREE.Vector3(opts.rest?.[0] ?? 0.22, opts.rest?.[1] ?? -0.13, opts.rest?.[2] ?? -0.28);
  const REST_ROT = new THREE.Euler(opts.rot?.[0] ?? 0.01, opts.rot?.[1] ?? 0.07, opts.rot?.[2] ?? -0.03);
  holder.position.copy(REST);
  holder.rotation.copy(REST_ROT);

  // --- État d'animation ---------------------------------------------------------
  const smokeTex = softDotTexture('smoke', 'rgba(215,215,215,0.55)', 'rgba(215,215,215,0)');
  const shellGeo = new THREE.CylinderGeometry(5.6 * MM, 5.6 * MM, 26 * MM, 14);
  const neckGeo = new THREE.CylinderGeometry(4 * MM, 5.6 * MM, 12 * MM, 14);
  const kick = { x: 0, v: 0 };
  const roll = { x: 0, v: 0 };
  let carrierT = 1;
  let flashUntil = 0;
  let flare = 0;
  let time = 0;
  let equip = 0; // 0 → 1 à la sortie de l'arme
  const shells = [];
  const smokes = [];
  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  const fire = () => {
    const now = performance.now();
    kick.v += 7.5;
    roll.v += (Math.random() - 0.35) * 5;
    carrierT = 0;
    flare = 1;
    flashUntil = now + 45;
    flash.material.rotation = Math.random() * Math.PI * 2;
    flash.scale.setScalar(120 + Math.random() * 60);
    flashCone.scale.set(110 + Math.random() * 50, 34 + Math.random() * 14, 1);

    // Douille de 7,62 éjectée à droite, en tournoyant.
    ejection.getWorldPosition(tmp);
    let shell;
    if (finish.makeShell) {
      shell = finish.makeShell();
    } else {
      // Skin Magma : douille chauffée au rouge qui refroidit en tombant.
      const shellMaterial = finish.hotShells
        ? new THREE.MeshStandardMaterial({ color: 0x3b2418, metalness: 0.8, roughness: 0.4, emissive: 0xff5a14, emissiveIntensity: 2.4 })
        : finish.brass;
      shell = new THREE.Group();
      shell.add(new THREE.Mesh(shellGeo, shellMaterial));
      const neck = new THREE.Mesh(neckGeo, shellMaterial);
      neck.position.y = 19 * MM;
      shell.add(neck);
      if (finish.hotShells) shell.userData.cooling = shellMaterial;
    }
    shell.position.copy(tmp);
    holder.getWorldQuaternion(quat);
    const velocity = new THREE.Vector3(1.9 + Math.random() * 0.7, 1.2 + Math.random() * 0.6, 0.5 + Math.random() * 0.4).applyQuaternion(quat);
    shell.rotation.set(Math.random(), Math.random(), Math.PI / 2);
    scene.add(shell);
    shells.push({ mesh: shell, velocity, spin: new THREE.Vector3(20 + Math.random() * 10, Math.random() * 8, 12), born: now });

    muzzle.getWorldPosition(tmp);
    const smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.5, color: finish.smoke }));
    smoke.position.copy(tmp);
    smoke.scale.setScalar(0.04);
    scene.add(smoke);
    smokes.push({ sprite: smoke, born: now });
    skinExtras.onFire?.();
    hands?.fire();
  };

  const update = (rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const now = performance.now();
    time += dt;
    equip = Math.min(1, equip + dt / 0.45);
    const e = 1 - (1 - equip) ** 3;

    springStep(kick, 0, 150, dt);
    springStep(roll, 0, 90, dt);
    const sway = Math.sin(time * 1.5) * 0.0014;
    const swayX = Math.sin(time * 0.75) * 0.0009;
    holder.position.set(REST.x + swayX, REST.y + sway - (1 - e) * 0.14, REST.z);
    holder.rotation.set(REST_ROT.x - (1 - e) * 0.6, REST_ROT.y, REST_ROT.z + (1 - e) * 0.35);
    recoilRig.position.set(0, kick.x * 0.0035, kick.x * 0.03);
    recoilRig.rotation.set(kick.x * 0.085, 0, roll.x * 0.02);

    // Culasse et levier d'armement : aller-retour complet en ~85 ms (cadence Vandal).
    if (carrierT < 1) carrierT = Math.min(1, carrierT + dt / 0.085);
    const back = carrierT < 0.35 ? carrierT / 0.35 : 1 - (carrierT - 0.35) / 0.65;
    carrier.position.x = -Math.max(0, back) * 58;

    flare = Math.max(0, flare - dt * 4);
    uniforms.uTime.value = time;
    uniforms.uFlare.value = flare;
    if (finish.glow.length) {
      const pulse = 0.8 + 0.2 * Math.sin(time * 2.2);
      finish.glow.forEach((g) => {
        const level = pulse + flare * (g.flare ?? 1.5);
        if (g.kind === 'emissive') g.material.emissiveIntensity = g.base * level;
        else g.material.color.copy(g.color).multiplyScalar(Math.min(2, level));
      });
    }
    skinExtras.update?.(dt, time, flare);
    hands?.update(dt);

    const flashOn = now < flashUntil;
    flash.material.opacity = flashOn ? 1 : 0;
    flashCone.material.opacity = flashOn ? 0.85 : 0;
    flashLight.intensity = flashOn ? 3 : 0;

    for (let i = shells.length - 1; i >= 0; i -= 1) {
      const s = shells[i];
      s.velocity.y -= 9.8 * dt;
      s.mesh.position.addScaledVector(s.velocity, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
      if (s.mesh.userData.cooling) s.mesh.userData.cooling.emissiveIntensity = 2.4 * Math.max(0, 1 - (now - s.born) / 1100);
      if (now - s.born > 1400) {
        s.mesh.userData.cooling?.dispose();
        scene.remove(s.mesh);
        shells.splice(i, 1);
      }
    }
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      const s = smokes[i];
      const t = (now - s.born) / 800;
      if (t >= 1) {
        scene.remove(s.sprite);
        s.sprite.material.dispose();
        smokes.splice(i, 1);
      } else {
        s.sprite.position.y += dt * 0.1;
        s.sprite.scale.setScalar(0.04 + t * 0.16);
        s.sprite.material.opacity = 0.4 * (1 - t);
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
