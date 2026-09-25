import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Pistole type Glock 17 modélisé entièrement en code (aucun fichier externe,
// donc aucune licence à gérer). Les pièces principales ne sont pas des blocs :
// ce sont des profils dessinés au millimètre (culasse, carcasse avec pontet
// évidé, poignée inclinée, queue de castor, détente courbe, hausse en U) puis
// extrudés avec des arêtes arrondies. Les détails fins (stries de culasse,
// grain de poignée) sont des cartes de relief.
//
// Repère du modèle, en millimètres : x vers la bouche du canon, y vers le haut,
// z vers le flanc droit. Le bas de la culasse est à y = 0.
//
// Effets au tir : culasse qui recule et revient, relèvement de l'arme,
// flash de bouche avec éclair lumineux, fumée, et douille éjectée à droite.

const MM = 0.001;
const SLIDE_LENGTH = 186;
const SLIDE_HEIGHT = 28.5;
const SLIDE_WIDTH = 25;
const FRAME_WIDTH = 27;
const BORE_Y = 16;

function extrude(shape, depth, bevel = 1) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 18,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

// Carte de relief dessinée en millimètres : `draw` reçoit un contexte déjà
// mis à l'échelle (1 unité = 1 mm, y vers le haut comme le modèle).
// Dessins mis en cache pour toute la durée de l'app : une nouvelle session ne
// les redessine pas (le grain de poignée à lui seul compte des milliers de points).
const canvasCache = new Map();

function bumpTexture(key, { minX, maxX, minY, maxY }, pxPerMm, draw) {
  if (!canvasCache.has(key)) {
    const width = Math.ceil((maxX - minX) * pxPerMm);
    const height = Math.ceil((maxY - minY) * pxPerMm);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.scale(pxPerMm, -pxPerMm);
    ctx.translate(-minX, -maxY);
    draw(ctx);
    ctx.restore();
    canvasCache.set(key, canvas);
  }
  const texture = new THREE.CanvasTexture(canvasCache.get(key));
  // Les UV des faces planes d'une extrusion valent (x, y) en mm : on ramène
  // cette plage sur [0, 1].
  texture.repeat.set(1 / (maxX - minX), 1 / (maxY - minY));
  texture.offset.set(-minX / (maxX - minX), -minY / (maxY - minY));
  texture.anisotropy = 16;
  return texture;
}

// Étoile de flash de bouche : cœur blanc, branches orangées.
function flashTexture() {
  if (canvasCache.has('flash')) {
    const cached = new THREE.CanvasTexture(canvasCache.get('flash'));
    cached.colorSpace = THREE.SRGBColorSpace;
    return cached;
  }
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, 'rgba(255,255,240,1)');
  glow.addColorStop(0.18, 'rgba(255,214,120,0.95)');
  glow.addColorStop(0.45, 'rgba(255,140,40,0.35)');
  glow.addColorStop(1, 'rgba(255,90,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  const spikes = 7;
  for (let i = 0; i <= spikes * 2; i += 1) {
    const angle = (i / (spikes * 2)) * Math.PI * 2;
    const radius = i % 2 === 0 ? c * (0.75 + Math.random() * 0.25) : c * 0.22;
    ctx.lineTo(c + Math.cos(angle) * radius, c + Math.sin(angle) * radius);
  }
  ctx.fill();
  canvasCache.set('flash', canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function smokeTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(210,210,210,0.55)');
  g.addColorStop(1, 'rgba(210,210,210,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// --- Profils -------------------------------------------------------------------

function slideShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 1.5);
  s.quadraticCurveTo(0, 0, 1.5, 0);
  s.lineTo(SLIDE_LENGTH - 1.5, 0);
  s.quadraticCurveTo(SLIDE_LENGTH, 0, SLIDE_LENGTH, 1.5);
  s.lineTo(SLIDE_LENGTH, 22);
  // Chanfrein avant du haut de culasse.
  s.lineTo(SLIDE_LENGTH - 6, SLIDE_HEIGHT);
  s.lineTo(4, SLIDE_HEIGHT);
  s.quadraticCurveTo(0.5, SLIDE_HEIGHT, 0, 25);
  s.closePath();
  return s;
}

// Carcasse : cache-poussière avec rail, pontet évidé, poignée inclinée
// (~22°), talon évasé et queue de castor sous l'arrière de la culasse.
function frameShape() {
  const s = new THREE.Shape();
  s.moveTo(8, -0.6);
  s.lineTo(166, -0.6);
  s.quadraticCurveTo(172, -0.6, 172, -6);
  s.lineTo(172, -15);
  s.lineTo(117, -15);
  // Pontet : face avant presque droite, crochet bas.
  s.quadraticCurveTo(114, -16, 113.5, -21);
  s.lineTo(112.5, -41);
  s.quadraticCurveTo(111.5, -47.5, 104, -47.5);
  s.lineTo(81, -47.5);
  s.quadraticCurveTo(72, -47.5, 69.5, -40);
  s.lineTo(66, -36);
  // Face avant de la poignée, légèrement galbée.
  s.quadraticCurveTo(52, -78, 35, -125.5);
  // Talon évasé (puits de chargeur).
  s.quadraticCurveTo(34.5, -129.5, 30, -129.5);
  s.lineTo(-6, -129.5);
  s.quadraticCurveTo(-11, -129.5, -11, -124);
  // Dos de poignée avec renflement de paume.
  s.quadraticCurveTo(-15, -82, -7, -32);
  // Queue de castor.
  s.quadraticCurveTo(-5, -20, -13, -14);
  s.quadraticCurveTo(-16, -10, -9, -7);
  s.quadraticCurveTo(2, -3, 8, -0.6);

  const hole = new THREE.Path();
  hole.moveTo(108, -19.5);
  hole.lineTo(106.5, -39.5);
  hole.quadraticCurveTo(106, -43.5, 101, -43.5);
  hole.lineTo(82, -43.5);
  hole.quadraticCurveTo(76.5, -43.5, 75.5, -38);
  hole.lineTo(73.5, -25);
  hole.quadraticCurveTo(73.5, -19.5, 79, -19.5);
  hole.closePath();
  s.holes.push(hole);
  return s;
}

function triggerShape() {
  const s = new THREE.Shape();
  s.moveTo(89.5, -15);
  s.quadraticCurveTo(83.5, -27, 87.5, -39);
  s.quadraticCurveTo(88.5, -40.5, 90, -39.5);
  s.quadraticCurveTo(87, -27, 92.5, -15);
  s.closePath();
  return s;
}

// Hausse vue de face : trapèze avec cran en U.
function rearSightShape() {
  const s = new THREE.Shape();
  s.moveTo(-8, 0);
  s.lineTo(8, 0);
  s.lineTo(6.5, 5.5);
  s.lineTo(1.9, 5.5);
  s.lineTo(1.9, 3);
  s.quadraticCurveTo(1.9, 1.6, 0, 1.6);
  s.quadraticCurveTo(-1.9, 1.6, -1.9, 3);
  s.lineTo(-1.9, 5.5);
  s.lineTo(-6.5, 5.5);
  s.closePath();
  return s;
}

// Liseré blanc en U de la hausse (vue de face).
function rearSightOutlineShape() {
  const s = new THREE.Shape();
  s.moveTo(-3.4, 5.4);
  s.lineTo(-3.4, 3);
  s.quadraticCurveTo(-3.4, 0.9, 0, 0.9);
  s.quadraticCurveTo(3.4, 0.9, 3.4, 3);
  s.lineTo(3.4, 5.4);
  s.lineTo(2.5, 5.4);
  s.lineTo(2.5, 3);
  s.quadraticCurveTo(2.5, 1.5, 0, 1.5);
  s.quadraticCurveTo(-2.5, 1.5, -2.5, 3);
  s.lineTo(-2.5, 5.4);
  s.closePath();
  return s;
}

function frontSightShape() {
  const s = new THREE.Shape();
  s.moveTo(-2.1, 0);
  s.lineTo(2.1, 0);
  s.lineTo(1.7, 5.6);
  s.lineTo(-1.7, 5.6);
  s.closePath();
  return s;
}

// Profil vu de face (x latéral, y haut) extrudé sur `length`, remis dans le
// repère du modèle (extrusion le long de x).
function extrudeAlongX(shape, length, bevel) {
  const geometry = extrude(shape, length, bevel);
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

export function createGlockViewmodel({ renderer, scene }) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  // --- Matériaux --------------------------------------------------------------
  const slideBump = bumpTexture('slide', { minX: 0, maxX: SLIDE_LENGTH, minY: 0, maxY: 30 }, 8, (ctx) => {
    // Stries arrière et avant (Gen5), légèrement usinées.
    ctx.fillStyle = '#000000';
    for (let i = 0; i < 9; i += 1) ctx.fillRect(8 + i * 3.3, 5, 1.5, 21);
    for (let i = 0; i < 7; i += 1) ctx.fillRect(150 + i * 3.3, 5, 1.5, 15);
    // Arête décorative et fines rayures d'usinage.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 21.5, SLIDE_LENGTH, 0.35);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (let x = 0; x < SLIDE_LENGTH; x += 0.8) ctx.fillRect(x, 0, 0.15, 30);
    // Marquages frappés (calibre, numéro), sans marque déposée.
    ctx.save();
    ctx.scale(1, -1);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = 'bold 4px Arial';
    ctx.fillText('9x19', 118, -9);
    ctx.font = '3px Arial';
    ctx.fillText('MVP-17', 60, -9);
    ctx.restore();
  });
  const frameBump = bumpTexture('frame', { minX: -16, maxX: 174, minY: -132, maxY: 1 }, 5, (ctx) => {
    // Grain de poignée : points serrés sur la zone de prise en main.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(62, -40);
    ctx.quadraticCurveTo(50, -80, 33, -120);
    ctx.lineTo(-6, -120);
    ctx.quadraticCurveTo(-11, -80, -4, -40);
    ctx.closePath();
    ctx.clip();
    for (let i = 0; i < 9000; i += 1) {
      const x = -14 + Math.random() * 80;
      const y = -122 + Math.random() * 84;
      ctx.fillStyle = Math.random() < 0.5 ? '#000000' : '#555555';
      ctx.fillRect(x, y, 0.55, 0.55);
    }
    ctx.restore();
    // Rainures du rail sous le cache-poussière et pastille de pouce.
    ctx.fillStyle = '#000000';
    for (let i = 0; i < 3; i += 1) ctx.fillRect(132 + i * 12, -14, 3, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(40, -30, 9, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
  });

  const common = { envMap, envMapIntensity: 1 };
  const slideMat = new THREE.MeshStandardMaterial({
    ...common,
    envMapIntensity: 0.55,
    color: 0x1c1e21,
    metalness: 0.6,
    roughness: 0.42,
    bumpMap: slideBump,
    bumpScale: 1.5,
  });
  const slideWallMat = new THREE.MeshStandardMaterial({ ...common, envMapIntensity: 0.55, color: 0x1c1e21, metalness: 0.6, roughness: 0.38 });
  const frameMat = new THREE.MeshStandardMaterial({
    ...common,
    envMapIntensity: 0.25,
    color: 0x151618,
    metalness: 0.05,
    roughness: 0.78,
    bumpMap: frameBump,
    bumpScale: 0.9,
  });
  const frameWallMat = new THREE.MeshStandardMaterial({ ...common, envMapIntensity: 0.25, color: 0x151618, metalness: 0.05, roughness: 0.66 });
  const barrelMat = new THREE.MeshStandardMaterial({ ...common, color: 0x6a6c70, metalness: 0.95, roughness: 0.22 });
  const steelMat = new THREE.MeshStandardMaterial({ ...common, color: 0x3a3c40, metalness: 0.9, roughness: 0.3 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf4f4ee, roughness: 0.4, emissive: 0x333333 });
  const brassMat = new THREE.MeshStandardMaterial({ ...common, color: 0xd1a54a, metalness: 1, roughness: 0.25 });

  const model = new THREE.Group();

  // --- Carcasse ---------------------------------------------------------------
  const frame = new THREE.Mesh(extrude(frameShape(), FRAME_WIDTH - 3, 1.5), [frameMat, frameWallMat]);
  model.add(frame);
  // Semelle de chargeur, un peu plus large que la poignée.
  const basePlate = new THREE.Mesh(new RoundedBoxGeometry(49, 5, FRAME_WIDTH + 1, 3, 1.6), frameWallMat);
  basePlate.position.set(12, -131.5, 0);
  model.add(basePlate);
  // Détente courbe avec sa languette de sécurité.
  const trigger = new THREE.Mesh(extrude(triggerShape(), 5, 0.7), frameWallMat);
  model.add(trigger);
  const triggerSafety = new THREE.Mesh(new RoundedBoxGeometry(1.4, 16, 1.6, 2, 0.5), steelMat);
  triggerSafety.position.set(88.8, -27, 0);
  triggerSafety.rotation.z = -0.12;
  model.add(triggerSafety);
  // Goupilles traversantes et leviers (arrêtoir de culasse, démontage).
  [
    [96, -9],
    [60, -10],
    [18, -7],
  ].forEach(([x, y]) => {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, FRAME_WIDTH + 0.6, 18), steelMat);
    pin.rotation.x = Math.PI / 2;
    pin.position.set(x, y, 0);
    model.add(pin);
  });
  const slideStop = new THREE.Mesh(new RoundedBoxGeometry(18, 3.2, 1.6, 2, 0.6), steelMat);
  slideStop.position.set(76, -2.2, -(FRAME_WIDTH / 2 + 0.7));
  model.add(slideStop);
  [-1, 1].forEach((side) => {
    const takedown = new THREE.Mesh(new RoundedBoxGeometry(9, 2.4, 1.2, 2, 0.5), steelMat);
    takedown.position.set(106, -2.5, side * (FRAME_WIDTH / 2 + 0.5));
    model.add(takedown);
  });
  // Tige-guide du ressort, visible sous la bouche.
  const guideRod = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 8, 20), blackMat);
  guideRod.rotation.z = Math.PI / 2;
  guideRod.position.set(184, 7, 0);
  model.add(guideRod);

  // --- Culasse (partie mobile) --------------------------------------------------
  const slide = new THREE.Group();
  model.add(slide);
  slide.add(new THREE.Mesh(extrude(slideShape(), SLIDE_WIDTH - 2.4, 1.2), [slideMat, slideWallMat]));
  // Fenêtre d'éjection et tête de canon visible dedans.
  const portTop = SLIDE_HEIGHT + 1.2;
  const port = new THREE.Mesh(new THREE.PlaneGeometry(36, 13), blackMat);
  port.rotation.x = -Math.PI / 2;
  port.position.set(131, portTop + 0.05, 5);
  slide.add(port);
  const hood = new THREE.Mesh(new RoundedBoxGeometry(33, 3, 11, 3, 1.2), barrelMat);
  hood.position.set(131, portTop - 0.6, 3.5);
  slide.add(hood);
  const portSide = new THREE.Mesh(new THREE.PlaneGeometry(36, 7), blackMat);
  portSide.position.set(131, portTop - 3.5, SLIDE_WIDTH / 2 + 0.05);
  slide.add(portSide);
  // Couronne du canon et âme (noire) à la bouche.
  const crown = new THREE.Mesh(new THREE.RingGeometry(4.6, 6.4, 32), barrelMat);
  crown.rotation.y = Math.PI / 2;
  crown.position.set(SLIDE_LENGTH + 1.3, BORE_Y, 0);
  slide.add(crown);
  const bore = new THREE.Mesh(new THREE.CircleGeometry(4.6, 32), blackMat);
  bore.rotation.y = Math.PI / 2;
  bore.position.set(SLIDE_LENGTH + 1.25, BORE_Y, 0);
  slide.add(bore);
  // Plaque arrière de culasse.
  const coverPlate = new THREE.Mesh(new RoundedBoxGeometry(1.2, 15, 10, 2, 0.5), blackMat);
  coverPlate.position.set(-1.1, 14, 0);
  slide.add(coverPlate);
  // Hausse avec liseré blanc en U, guidon avec point blanc.
  const rearSight = new THREE.Mesh(extrudeAlongX(rearSightShape(), 7, 0.4), blackMat);
  rearSight.position.set(12, portTop, 0);
  slide.add(rearSight);
  const outline = new THREE.Mesh(extrudeAlongX(rearSightOutlineShape(), 0.3, 0), whiteMat);
  outline.position.set(7.9, portTop, 0);
  slide.add(outline);
  const frontSight = new THREE.Mesh(extrudeAlongX(frontSightShape(), 5, 0.3), blackMat);
  frontSight.position.set(176, portTop - 0.4, 0);
  slide.add(frontSight);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(1.05, 20), whiteMat);
  dot.rotation.y = -Math.PI / 2;
  dot.position.set(173.05, portTop + 3.2, 0);
  slide.add(dot);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(SLIDE_LENGTH + 4, BORE_Y, 0);
  model.add(muzzle);
  const ejection = new THREE.Object3D();
  ejection.position.set(131, portTop + 2, 8);
  model.add(ejection);

  // --- Effets de bouche ---------------------------------------------------------
  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: flashTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
  );
  flash.scale.set(95, 95, 1);
  muzzle.add(flash);
  const flashLight = new THREE.PointLight(0xffb35c, 0, 3, 2);
  muzzle.add(flashLight);

  // Échelle en mètres, canon aligné sur -Z de la caméra, flanc droit vers la droite.
  model.scale.setScalar(MM);
  model.rotation.y = Math.PI / 2;

  const holder = new THREE.Group();
  holder.add(model);
  const REST = new THREE.Vector3(0.12, -0.112, -0.215);
  holder.position.copy(REST);
  // Canon légèrement tourné vers le centre de l'écran, flanc droit visible.
  holder.rotation.set(0.015, 0.14, 0.03);

  // --- État d'animation ---------------------------------------------------------
  const smokeTex = smokeTexture();
  const shellGeo = new THREE.CylinderGeometry(4.8 * MM, 4.8 * MM, 19 * MM, 14);
  const shells = [];
  const smokes = [];
  let kick = 0; // 0..1, relèvement de l'arme
  let kickVelocity = 0;
  let slideT = 1; // 1 = culasse au repos
  let flashUntil = 0;
  let time = 0;
  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  const fire = () => {
    const now = performance.now();
    kickVelocity += 9;
    slideT = 0;
    flashUntil = now + 55;
    flash.material.rotation = Math.random() * Math.PI * 2;
    flash.scale.setScalar(80 + Math.random() * 40);

    // Douille éjectée vers la droite et l'arrière, en rotation.
    ejection.getWorldPosition(tmp);
    const shell = new THREE.Mesh(shellGeo, brassMat);
    shell.position.copy(tmp);
    holder.getWorldQuaternion(quat);
    const velocity = new THREE.Vector3(1.6 + Math.random() * 0.6, 1.4 + Math.random() * 0.6, 0.35 + Math.random() * 0.3).applyQuaternion(quat);
    shell.rotation.set(Math.random(), Math.random(), Math.PI / 2);
    scene.add(shell);
    shells.push({ mesh: shell, velocity, spin: new THREE.Vector3(18 + Math.random() * 10, Math.random() * 6, 10), born: now });

    // Petit nuage de fumée à la bouche, qui monte et s'étale.
    muzzle.getWorldPosition(tmp);
    const smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.5 }));
    smoke.position.copy(tmp);
    smoke.scale.setScalar(0.03);
    scene.add(smoke);
    smokes.push({ sprite: smoke, born: now });
  };

  const update = (rawDt) => {
    // Borné : après une pause, un grand pas ferait diverger le ressort de recul.
    const dt = Math.min(rawDt, 0.05);
    const now = performance.now();
    time += dt;

    // Relèvement amorti (ressort critique) après chaque tir.
    const stiffness = 170;
    const damping = 2 * Math.sqrt(stiffness);
    kickVelocity += (-stiffness * kick - damping * kickVelocity) * dt;
    kick += kickVelocity * dt;
    const breathing = Math.sin(time * 1.6) * 0.0012;
    holder.position.set(REST.x, REST.y + breathing + kick * 0.004, REST.z + kick * 0.022);
    holder.rotation.x = 0.015 + kick * 0.11;

    // Culasse : recul très rapide puis retour (~110 ms).
    if (slideT < 1) slideT = Math.min(1, slideT + dt / 0.11);
    const back = slideT < 0.3 ? slideT / 0.3 : 1 - (slideT - 0.3) / 0.7;
    slide.position.x = -Math.max(0, back) * 24;

    const flashOn = now < flashUntil;
    flash.material.opacity = flashOn ? 1 : 0;
    flashLight.intensity = flashOn ? 2.2 : 0;

    for (let i = shells.length - 1; i >= 0; i -= 1) {
      const s = shells[i];
      s.velocity.y -= 9.8 * dt;
      s.mesh.position.addScaledVector(s.velocity, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
      if (now - s.born > 1400) {
        scene.remove(s.mesh);
        shells.splice(i, 1);
      }
    }
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      const s = smokes[i];
      const t = (now - s.born) / 700;
      if (t >= 1) {
        scene.remove(s.sprite);
        s.sprite.material.dispose();
        smokes.splice(i, 1);
      } else {
        s.sprite.position.y += dt * 0.12;
        s.sprite.scale.setScalar(0.03 + t * 0.12);
        s.sprite.material.opacity = 0.45 * (1 - t);
      }
    }
  };

  return { holder, muzzle, fire, update };
}
