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

function bumpTexture(key, bounds, pxPerMm, draw) {
  return drawnTexture(key, bounds, pxPerMm, draw);
}

// Texture dessinée en millimètres sur les faces planes des extrusions :
// relief (fond blanc), couleur ou lumière (`color` : espace sRGB).
function drawnTexture(key, { minX, maxX, minY, maxY }, pxPerMm, draw, { background = '#ffffff', color = false } = {}) {
  if (!canvasCache.has(key)) {
    const width = Math.ceil((maxX - minX) * pxPerMm);
    const height = Math.ceil((maxY - minY) * pxPerMm);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = background;
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
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Étoile de flash de bouche : cœur blanc, branches colorées selon le skin
// (orangées pour la poudre classique, cyan pour le skin futuriste).
const FLASH_PALETTES = {
  powder: ['rgba(255,255,240,1)', 'rgba(255,214,120,0.95)', 'rgba(255,140,40,0.35)', 'rgba(255,90,0,0)'],
  plasma: ['rgba(240,255,255,1)', 'rgba(120,245,255,0.95)', 'rgba(40,140,255,0.4)', 'rgba(20,60,255,0)'],
  banana: ['rgba(255,255,235,1)', 'rgba(255,236,120,0.95)', 'rgba(255,205,60,0.4)', 'rgba(255,180,0,0)'],
};

function flashTexture(palette = 'powder') {
  const key = `flash-${palette}`;
  if (canvasCache.has(key)) {
    const cached = new THREE.CanvasTexture(canvasCache.get(key));
    cached.colorSpace = THREE.SRGBColorSpace;
    return cached;
  }
  const stops = FLASH_PALETTES[palette];
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, stops[0]);
  glow.addColorStop(0.18, stops[1]);
  glow.addColorStop(0.45, stops[2]);
  glow.addColorStop(1, stops[3]);
  ctx.fillStyle = glow;
  ctx.beginPath();
  const spikes = 7;
  for (let i = 0; i <= spikes * 2; i += 1) {
    const angle = (i / (spikes * 2)) * Math.PI * 2;
    const radius = i % 2 === 0 ? c * (0.75 + Math.random() * 0.25) : c * 0.22;
    ctx.lineTo(c + Math.cos(angle) * radius, c + Math.sin(angle) * radius);
  }
  ctx.fill();
  canvasCache.set(key, canvas);
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

// --- Skin « Futuriste » : textures ------------------------------------------
// Culasse en céramique blanc nacré, bandeau gunmetal biseauté, circuits et
// chevrons lumineux cyan ; carcasse graphite à cellules hexagonales dont
// quelques-unes sont allumées. Chaque dessin existe en deux versions qui se
// superposent exactement : la couleur, et la carte de lumière (fond noir, seuls
// les éléments lumineux) qui pulse en jeu.
const NEON = '#5ff7ff';
const NEON_DIM = '#1fb5c9';
const GUNMETAL = '#171a20';
const SLIDE_BOUNDS = { minX: 0, maxX: SLIDE_LENGTH, minY: 0, maxY: 30 };
const FRAME_BOUNDS = { minX: -16, maxX: 174, minY: -132, maxY: 1 };

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

// Bandeau inférieur de culasse, biseauté vers le haut aux deux extrémités.
function slideBandPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(SLIDE_LENGTH, 0);
  ctx.lineTo(SLIDE_LENGTH, 10);
  ctx.lineTo(160, 10);
  ctx.lineTo(152, 6.5);
  ctx.lineTo(64, 6.5);
  ctx.lineTo(56, 10);
  ctx.lineTo(0, 10);
  ctx.closePath();
}

// Circuits, nœuds, emblème hexagonal et chevrons : communs à la couleur
// (teinte sourde) et à la lumière (teinte vive).
function slideCircuits(ctx, stroke, width) {
  ctx.strokeStyle = stroke;
  ctx.fillStyle = stroke;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  const trace = (points) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    const [ex, ey] = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(ex, ey, width * 1.6, 0, Math.PI * 2);
    ctx.fill();
  };
  trace([[44, 13], [58, 13], [61, 16], [102, 16], [105, 13], [142, 13]]);
  trace([[74, 16], [77, 19], [88, 19]]);
  trace([[118, 13], [121, 10.5], [134, 10.5]]);
  trace([[44, 13], [42, 15], [42, 21]]);
  // Emblème hexagonal.
  ctx.lineWidth = width * 0.9;
  ctx.beginPath();
  for (let i = 0; i <= 6; i += 1) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const x = 96 + Math.cos(a) * 2.4;
    const y = 23.2 + Math.sin(a) * 2.4;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(96, 23.2, 0.9, 0, Math.PI * 2);
  ctx.fill();
  // Chevrons vers la bouche, sur le bandeau.
  ctx.lineWidth = width * 1.2;
  [164, 168.5, 173].forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, 7.5);
    ctx.lineTo(x + 2.2, 4.8);
    ctx.lineTo(x, 2.1);
    ctx.stroke();
  });
  // Filet lumineux le long du biseau du bandeau.
  ctx.lineWidth = width * 0.5;
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.lineTo(56, 10);
  ctx.lineTo(64, 6.5);
  ctx.lineTo(152, 6.5);
  ctx.lineTo(160, 10);
  ctx.lineTo(SLIDE_LENGTH, 10);
  ctx.stroke();
}

function futuristicSlideColor() {
  return drawnTexture(
    'fx-slide-color',
    SLIDE_BOUNDS,
    10,
    (ctx) => {
      const pearl = ctx.createLinearGradient(0, 30, 0, 0);
      pearl.addColorStop(0, '#f4f7fb');
      pearl.addColorStop(1, '#d3d9e2');
      ctx.fillStyle = pearl;
      ctx.fillRect(0, 0, SLIDE_LENGTH, 30);
      // Grain de céramique très fin.
      const rand = seeded(5);
      ctx.fillStyle = 'rgba(110,120,140,0.07)';
      for (let i = 0; i < 4000; i += 1) ctx.fillRect(rand() * SLIDE_LENGTH, rand() * 30, 0.2, 0.2);
      // Bandeau gunmetal et panneaux des stries.
      const metal = ctx.createLinearGradient(0, 10, 0, 0);
      metal.addColorStop(0, '#20252d');
      metal.addColorStop(1, '#0e1014');
      ctx.fillStyle = metal;
      slideBandPath(ctx);
      ctx.fill();
      ctx.fillStyle = GUNMETAL;
      [
        [6, 36],
        [147, 177],
      ].forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(a + 1.5, 4);
        ctx.lineTo(b, 4);
        ctx.lineTo(b, 25.5);
        ctx.lineTo(a, 25.5);
        ctx.lineTo(a, 5.5);
        ctx.closePath();
        ctx.fill();
      });
      // Joints de panneaux gravés.
      ctx.strokeStyle = 'rgba(95,108,125,0.9)';
      ctx.lineWidth = 0.22;
      ctx.beginPath();
      ctx.moveTo(40, 24.5);
      ctx.lineTo(62, 24.5);
      ctx.lineTo(66, 20.8);
      ctx.lineTo(126, 20.8);
      ctx.lineTo(130, 24.5);
      ctx.lineTo(144, 24.5);
      ctx.stroke();
      slideCircuits(ctx, '#0a93ab', 0.8);
      // Marquages.
      ctx.save();
      ctx.scale(1, -1);
      ctx.fillStyle = '#5d6777';
      ctx.font = 'bold 2.6px Arial';
      ctx.fillText('NX-17  //  PULSE ARMS', 104, -23.4);
      ctx.font = '2.2px Arial';
      ctx.fillText('9x19 · CERAMIC', 66, -8.4);
      ctx.restore();
    },
    { color: true },
  );
}

// Carte de surface (données, pas une couleur) : canal rouge = vernis, canal
// vert = rugosité. La céramique est vernie et lisse ; le bandeau et les
// panneaux gunmetal sont mats et sans vernis, pour rester sombres sous
// n'importe quel reflet.
function futuristicSlideSurface() {
  return drawnTexture(
    'fx-slide-surface',
    SLIDE_BOUNDS,
    10,
    (ctx) => {
      ctx.fillStyle = '#00e000';
      slideBandPath(ctx);
      ctx.fill();
      [
        [6, 36],
        [147, 177],
      ].forEach(([a, b]) => ctx.fillRect(a, 4, b - a, 21.5));
    },
    { background: '#ff5000' },
  );
}

// Carte de lumière : un premier passage flouté fait un halo autour des
// circuits (effet de lueur sans post-traitement), puis le tracé net par-dessus.
function futuristicSlideGlow() {
  return drawnTexture(
    'fx-slide-glow',
    SLIDE_BOUNDS,
    10,
    (ctx) => {
      ctx.save();
      ctx.shadowColor = NEON;
      ctx.shadowBlur = 14;
      slideCircuits(ctx, 'rgba(95,247,255,0.55)', 1.4);
      ctx.restore();
      slideCircuits(ctx, '#c8fdff', 0.8);
    },
    { background: '#000000', color: true },
  );
}

// Grille d'hexagones sur la poignée : même tirage pour la couleur, la
// lumière et le relief, pour que tout reste parfaitement aligné.
function gripClip(ctx) {
  ctx.beginPath();
  ctx.moveTo(62, -40);
  ctx.quadraticCurveTo(50, -80, 33, -120);
  ctx.lineTo(-6, -120);
  ctx.quadraticCurveTo(-11, -80, -4, -40);
  ctx.closePath();
  ctx.clip();
}

function hexGrid(ctx, cell) {
  const radius = 2.6;
  const w = Math.sqrt(3) * radius;
  const rand = seeded(11);
  for (let row = 0; row < 40; row += 1) {
    const y = -124 + row * radius * 1.5;
    for (let col = 0; col < 30; col += 1) {
      const x = -16 + col * w + (row % 2 ? w / 2 : 0);
      const lit = rand() < 0.07;
      ctx.beginPath();
      for (let i = 0; i <= 6; i += 1) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        const px = x + Math.cos(a) * (radius - 0.25);
        const py = y + Math.sin(a) * (radius - 0.25);
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      cell(ctx, lit);
    }
  }
}

function frameDetails(ctx, stroke, width) {
  // Filet le long du cache-poussière, terminé par un chevron.
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(118, -12);
  ctx.lineTo(160, -12);
  ctx.lineTo(163, -9);
  ctx.lineTo(169, -9);
  ctx.stroke();
  // Filet du dos de poignée.
  ctx.beginPath();
  ctx.moveTo(-6, -36);
  ctx.quadraticCurveTo(-12, -80, -8, -118);
  ctx.stroke();
}

function futuristicFrameColor() {
  return drawnTexture(
    'fx-frame-color',
    FRAME_BOUNDS,
    5,
    (ctx) => {
      ctx.save();
      gripClip(ctx);
      hexGrid(ctx, (c, lit) => {
        c.fillStyle = lit ? '#0f5763' : '#242a35';
        c.fill();
        c.strokeStyle = '#11141a';
        c.lineWidth = 0.35;
        c.stroke();
      });
      ctx.restore();
      frameDetails(ctx, NEON_DIM, 0.7);
      ctx.save();
      ctx.scale(1, -1);
      ctx.fillStyle = '#7f8899';
      ctx.font = 'bold 3px Arial';
      ctx.fillText('01', 138, 7);
      ctx.restore();
    },
    { background: '#1b1f27', color: true },
  );
}

function futuristicFrameGlow() {
  return drawnTexture(
    'fx-frame-glow',
    FRAME_BOUNDS,
    5,
    (ctx) => {
      ctx.save();
      gripClip(ctx);
      hexGrid(ctx, (c, lit) => {
        if (!lit) return;
        c.fillStyle = '#0b6f7d';
        c.fill();
        c.strokeStyle = NEON;
        c.lineWidth = 0.35;
        c.stroke();
      });
      ctx.restore();
      ctx.save();
      ctx.shadowColor = NEON;
      ctx.shadowBlur = 10;
      frameDetails(ctx, NEON, 0.8);
      ctx.restore();
    },
    { background: '#000000', color: true },
  );
}

function futuristicFrameBump() {
  return drawnTexture('fx-frame-bump', FRAME_BOUNDS, 5, (ctx) => {
    ctx.save();
    gripClip(ctx);
    hexGrid(ctx, (c) => {
      c.strokeStyle = '#000000';
      c.lineWidth = 0.4;
      c.stroke();
    });
    ctx.restore();
    ctx.fillStyle = '#000000';
    for (let i = 0; i < 3; i += 1) ctx.fillRect(132 + i * 12, -14, 3, 3);
  });
}

// Chambre d'énergie visible dans la fenêtre d'éjection : grille et noyau.
function energyCoreTexture() {
  const key = 'fx-core';
  if (!canvasCache.has(key)) {
    const w = 512;
    const h = 192;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#021016';
    ctx.fillRect(0, 0, w, h);
    const core = ctx.createLinearGradient(0, 0, 0, h);
    core.addColorStop(0, 'rgba(95,247,255,0)');
    core.addColorStop(0.5, 'rgba(170,252,255,1)');
    core.addColorStop(1, 'rgba(95,247,255,0)');
    ctx.fillStyle = core;
    ctx.fillRect(24, h * 0.3, w - 48, h * 0.4);
    ctx.strokeStyle = 'rgba(95,247,255,0.35)';
    ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    canvasCache.set(key, canvas);
  }
  const texture = new THREE.CanvasTexture(canvasCache.get(key));
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// --- Skin « Banane » : une arme en forme de banane --------------------------
// Toute la mécanique du Glock est conservée (culasse mobile, pontet, détente,
// hausse et guidon, fenêtre d'éjection, goupilles, arrêtoir), mais sculptée
// dans des bananes : la culasse est une banane courbe qui recule au tir, la
// poignée une seconde banane, le pontet une lanière de peau et le canon la
// queue du fruit. Repère en millimètres, comme le reste du modèle.

// Peau enroulée sur un tube : u le long du fruit, v autour. Jaune mûr,
// arêtes aux jonctions des cinq faces, taches de sucre, bout brun à l'arrière,
// pointe verte à l'avant, autocollant « MVP » de chaque côté.
function bananaPeelTexture() {
  const key = 'banana-peel';
  if (!canvasCache.has(key)) {
    const w = 1024;
    const h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const peel = ctx.createLinearGradient(0, 0, 0, h);
    ['#f1c316', '#f6d22c', '#e9b90f', '#f6d22c', '#eebf14', '#f1c316'].forEach((c, i, all) => peel.addColorStop(i / (all.length - 1), c));
    ctx.fillStyle = peel;
    ctx.fillRect(0, 0, w, h);
    // Pointe verte vers l'avant, bout brun à l'arrière.
    const green = ctx.createLinearGradient(w * 0.82, 0, w, 0);
    green.addColorStop(0, 'rgba(130,170,40,0)');
    green.addColorStop(1, 'rgba(110,150,35,0.9)');
    ctx.fillStyle = green;
    ctx.fillRect(w * 0.82, 0, w * 0.18, h);
    const brown = ctx.createLinearGradient(0, 0, w * 0.07, 0);
    brown.addColorStop(0, 'rgba(80,50,20,0.95)');
    brown.addColorStop(1, 'rgba(110,70,25,0)');
    ctx.fillStyle = brown;
    ctx.fillRect(0, 0, w * 0.07, h);
    // Arêtes entre les faces.
    for (let i = 0; i <= 5; i += 1) {
      const y = (i / 5) * h;
      const ridge = ctx.createLinearGradient(0, y - 6, 0, y + 6);
      ridge.addColorStop(0, 'rgba(150,110,15,0)');
      ridge.addColorStop(0.5, 'rgba(150,110,15,0.55)');
      ridge.addColorStop(1, 'rgba(150,110,15,0)');
      ctx.fillStyle = ridge;
      ctx.fillRect(0, y - 6, w, 12);
    }
    // Taches de sucre en petits groupes, et deux meurtrissures.
    const rand = seeded(23);
    for (let g = 0; g < 70; g += 1) {
      const cx = w * (0.08 + rand() * 0.8);
      const cy = rand() * h;
      const n = 2 + Math.floor(rand() * 6);
      for (let i = 0; i < n; i += 1) {
        ctx.fillStyle = `rgba(${70 + rand() * 30},${42 + rand() * 20},14,${0.55 + rand() * 0.4})`;
        ctx.beginPath();
        ctx.ellipse(cx + (rand() - 0.5) * 22, cy + (rand() - 0.5) * 9, 1.2 + rand() * 2.6, 0.8 + rand() * 1.5, rand() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    [
      [0.3, 0.35],
      [0.66, 0.8],
    ].forEach(([u, v]) => {
      const bruise = ctx.createRadialGradient(u * w, v * h, 0, u * w, v * h, 34);
      bruise.addColorStop(0, 'rgba(110,70,20,0.4)');
      bruise.addColorStop(1, 'rgba(110,70,20,0)');
      ctx.fillStyle = bruise;
      ctx.fillRect(u * w - 34, v * h - 34, 68, 68);
    });
    // Autocollant ovale, sur les deux flancs.
    [0.25, 0.75].forEach((v) => {
      ctx.save();
      ctx.translate(w * 0.5, v * h);
      ctx.fillStyle = '#1d4fb8';
      ctx.beginPath();
      ctx.ellipse(0, 0, 44, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffd93b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 40, 12.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 15px Arial';
      ctx.fillText('MVP', 0, -2);
      ctx.font = 'bold 6px Arial';
      ctx.fillText('PREMIUM BANANA', 0, 8);
      ctx.restore();
    });
    canvasCache.set(key, canvas);
  }
  const texture = new THREE.CanvasTexture(canvasCache.get(key));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  return texture;
}

// Tube à section pentagonale le long d'une courbe, effilé selon `taper(t)`.
function pentagonTube(curve, radius, taper, segments = 48) {
  const geometry = new THREE.TubeGeometry(curve, segments, radius, 5, false);
  const position = geometry.attributes.position;
  const center = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    curve.getPointAt(t, center);
    const k = taper(t);
    for (let j = 0; j <= 5; j += 1) {
      const index = i * 6 + j;
      v.fromBufferAttribute(position, index).sub(center).multiplyScalar(k).add(center);
      position.setXYZ(index, v.x, v.y, v.z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

const BANANA_SLIDE = {
  curve: () => new THREE.QuadraticBezierCurve3(new THREE.Vector3(-6, 12, 0), new THREE.Vector3(92, 27, 0), new THREE.Vector3(186, 15, 0)),
  radius: 18,
  taper: (t) => 0.42 + 0.58 * Math.sin(Math.PI * t) ** 0.4,
};
const BANANA_GRIP = {
  curve: () => new THREE.QuadraticBezierCurve3(new THREE.Vector3(66, 8, 0), new THREE.Vector3(44, -72, 0), new THREE.Vector3(-4, -126, 0)),
  radius: 16,
  taper: (t) => 0.45 + 0.55 * Math.sin(Math.PI * t) ** 0.4,
};
const BANANA_BORE_Y = 15.5;

// Hauteur du dessus de la culasse-banane à l'abscisse x (pour y poser les
// organes de visée). La courbe est une Bézier dont x varie linéairement.
function bananaSlideTop(x) {
  const t = Math.min(1, Math.max(0, (x + 6) / 192));
  const y = (1 - t) ** 2 * 12 + 2 * t * (1 - t) * 27 + t ** 2 * 15;
  return y + BANANA_SLIDE.radius * BANANA_SLIDE.taper(t) * 0.95;
}

function buildBananaGun({ model, slide, stemMat, sightMat, dotMat, blackMat, common }) {
  const peelMat = new THREE.MeshStandardMaterial({ ...common, envMapIntensity: 0.3, map: bananaPeelTexture(), metalness: 0, roughness: 0.5 });
  const fleshMat = new THREE.MeshStandardMaterial({ ...common, envMapIntensity: 0.2, color: 0xefdd9e, roughness: 0.85 });
  const greenStemMat = new THREE.MeshStandardMaterial({ ...common, envMapIntensity: 0.3, color: 0x7d8f2c, roughness: 0.6 });

  // Culasse : banane courbe, bout brun à l'arrière, queue en guise de canon.
  const slideCurve = BANANA_SLIDE.curve();
  slide.add(new THREE.Mesh(pentagonTube(slideCurve, BANANA_SLIDE.radius, BANANA_SLIDE.taper), peelMat));
  const rearTip = new THREE.Mesh(new THREE.SphereGeometry(6.4, 12, 10), stemMat);
  rearTip.position.set(-6, 12, 0);
  slide.add(rearTip);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 6.2, 16, 5), greenStemMat);
  stem.rotation.z = -Math.PI / 2;
  stem.position.set(192, BANANA_BORE_Y, 0);
  slide.add(stem);
  const crown = new THREE.Mesh(new THREE.RingGeometry(3.2, 4.8, 5), stemMat);
  crown.rotation.y = Math.PI / 2;
  crown.position.set(200.1, BANANA_BORE_Y, 0);
  slide.add(crown);
  const bore = new THREE.Mesh(new THREE.CircleGeometry(3.2, 20), blackMat);
  bore.rotation.y = Math.PI / 2;
  bore.position.set(200.05, BANANA_BORE_Y, 0);
  slide.add(bore);

  // Fenêtre d'éjection : peau pelée qui laisse voir la chair, rabat retroussé.
  const portTop = bananaSlideTop(133);
  const flesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), fleshMat);
  flesh.scale.set(16, 2.4, 8.5);
  flesh.position.set(133, portTop - 0.9, 3);
  slide.add(flesh);
  const flapCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(119, portTop - 1.5, 10),
    new THREE.Vector3(125, portTop + 3, 14),
    new THREE.Vector3(132, portTop + 5.5, 13),
    new THREE.Vector3(138, portTop + 3.5, 9),
  ]);
  const flap = new THREE.Mesh(new THREE.TubeGeometry(flapCurve, 16, 3.4, 5, false), peelMat);
  slide.add(flap);

  // Hausse en U et guidon posés sur le dessus de la banane.
  const rearY = bananaSlideTop(12) - 0.8;
  const rearSight = new THREE.Mesh(extrudeAlongX(rearSightShape(), 7, 0.4), blackMat);
  rearSight.position.set(12, rearY, 0);
  slide.add(rearSight);
  const outline = new THREE.Mesh(extrudeAlongX(rearSightOutlineShape(), 0.3, 0), sightMat);
  outline.position.set(7.9, rearY, 0);
  slide.add(outline);
  const frontY = bananaSlideTop(172) - 0.8;
  const frontSight = new THREE.Mesh(extrudeAlongX(frontSightShape(), 5, 0.3), blackMat);
  frontSight.position.set(172, frontY, 0);
  slide.add(frontSight);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(1.05, 20), dotMat);
  dot.rotation.y = -Math.PI / 2;
  dot.position.set(169.05, frontY + 3.6, 0);
  slide.add(dot);

  // Carcasse : poignée-banane inclinée, bout brun en guise de talon.
  const gripCurve = BANANA_GRIP.curve();
  model.add(new THREE.Mesh(pentagonTube(gripCurve, BANANA_GRIP.radius, BANANA_GRIP.taper), peelMat));
  const heel = new THREE.Mesh(new THREE.SphereGeometry(6.2, 12, 10), stemMat);
  heel.position.set(-4, -126, 0);
  model.add(heel);
  const heelStem = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 9, 5), stemMat);
  heelStem.position.set(-7, -132, 0);
  heelStem.rotation.z = -0.5;
  model.add(heelStem);

  // Pontet en lanière de peau, du bas de la poignée jusque sous la culasse.
  const guardCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(58, -24, 0),
    new THREE.Vector3(66, -42, 0),
    new THREE.Vector3(80, -47, 0),
    new THREE.Vector3(103, -47, 0),
    new THREE.Vector3(111, -38, 0),
    new THREE.Vector3(112, -16, 0),
    new THREE.Vector3(108, 8, 0),
  ]);
  model.add(new THREE.Mesh(new THREE.TubeGeometry(guardCurve, 40, 2.8, 5, false), peelMat));

  // Traverse en peau sous la culasse : relie la poignée au pontet et porte la
  // détente, comme le cache-poussière d'une carcasse de Glock.
  const bridgeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(60, -8, 0),
    new THREE.Vector3(86, -9.5, 0),
    new THREE.Vector3(112, -8, 0),
  ]);
  model.add(new THREE.Mesh(new THREE.TubeGeometry(bridgeCurve, 20, 6, 5, false), peelMat));

  // Détente courbe, goupilles et arrêtoir de culasse, en « queue de banane ».
  model.add(new THREE.Mesh(extrude(triggerShape(), 5, 0.7), stemMat));
  [
    [54, -16],
    [40, -48],
  ].forEach(([x, y]) => {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 30, 12), stemMat);
    pin.rotation.x = Math.PI / 2;
    pin.position.set(x, y, 0);
    model.add(pin);
  });
  const slideStop = new THREE.Mesh(new RoundedBoxGeometry(16, 3, 1.6, 2, 0.6), stemMat);
  slideStop.position.set(74, 3, -15.5);
  model.add(slideStop);

  return {
    muzzle: new THREE.Vector3(203, BANANA_BORE_Y, 0),
    ejection: new THREE.Vector3(133, portTop + 3, 8),
  };
}

// --- Banane (projectile du skin « Banane ») ----------------------------------
const BANANA_LENGTH = 0.19;
const BANANA_RADIUS = 0.019;
const BANANA_SEGMENTS = 28;
const BANANA_SIDES = 5;

function bananaCurve() {
  return new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-BANANA_LENGTH / 2, 0, 0),
    new THREE.Vector3(0, BANANA_LENGTH * 0.3, 0),
    new THREE.Vector3(BANANA_LENGTH / 2, 0, 0),
  );
}

function bananaBodyGeometry() {
  const curve = bananaCurve();
  const geometry = new THREE.TubeGeometry(curve, BANANA_SEGMENTS, BANANA_RADIUS, BANANA_SIDES, false);
  const position = geometry.attributes.position;
  const center = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= BANANA_SEGMENTS; i += 1) {
    const t = i / BANANA_SEGMENTS;
    curve.getPointAt(t, center);
    const taper = 0.3 + 0.7 * Math.sin(Math.PI * t) ** 0.55;
    for (let j = 0; j <= BANANA_SIDES; j += 1) {
      const index = i * (BANANA_SIDES + 1) + j;
      v.fromBufferAttribute(position, index).sub(center).multiplyScalar(taper).add(center);
      position.setXYZ(index, v.x, v.y, v.z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Banane entière : corps à facettes, queue brune d'un côté, pointe sombre de l'autre.
function buildBanana(geometries, materials) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometries.body, materials.peel));
  const stem = new THREE.Mesh(geometries.stem, materials.stem);
  stem.position.set(-BANANA_LENGTH / 2 - 0.008, 0.004, 0);
  stem.rotation.z = Math.PI / 2 + 0.5;
  group.add(stem);
  const tip = new THREE.Mesh(geometries.tip, materials.tip);
  tip.position.set(BANANA_LENGTH / 2, 0, 0);
  group.add(tip);
  return group;
}

// Peau éjectée à la place de la douille : trois lanières courbes en étoile.
function buildPeel(geometries, materials) {
  const group = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const strip = new THREE.Mesh(geometries.strip, materials.peel);
    strip.rotation.x = (i * Math.PI * 2) / 3;
    strip.rotation.z = 0.5;
    group.add(strip);
  }
  const stem = new THREE.Mesh(geometries.stem, materials.stem);
  stem.rotation.z = Math.PI / 2;
  group.add(stem);
  group.scale.setScalar(0.55);
  return group;
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

export function createGlockViewmodel({ renderer, scene, skin = 'standard' }) {
  const futuristic = skin === 'futuristic';
  const banana = skin === 'banana';
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
  let slideMat;
  let slideWallMat;
  let frameMat;
  let frameWallMat;
  let barrelMat;
  let steelMat;
  let sightMat;
  let dotMat;
  // Éléments lumineux du skin futuriste, animés dans update() : pulsation
  // lente au repos, sursaut de lumière à chaque tir.
  const glowMaterials = [];
  if (futuristic) {
    const slideSurface = futuristicSlideSurface();
    slideMat = new THREE.MeshPhysicalMaterial({
      ...common,
      envMapIntensity: 0.9,
      map: futuristicSlideColor(),
      emissive: 0xffffff,
      emissiveMap: futuristicSlideGlow(),
      emissiveIntensity: 1.8,
      metalness: 0.08,
      roughness: 1,
      roughnessMap: slideSurface,
      clearcoat: 1,
      clearcoatMap: slideSurface,
      clearcoatRoughness: 0.1,
      bumpMap: slideBump,
      bumpScale: 1.1,
    });
    slideWallMat = new THREE.MeshPhysicalMaterial({
      ...common,
      envMapIntensity: 0.9,
      color: 0xe4e9ef,
      metalness: 0.08,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    });
    frameMat = new THREE.MeshStandardMaterial({
      ...common,
      envMapIntensity: 0.5,
      map: futuristicFrameColor(),
      emissive: 0xffffff,
      emissiveMap: futuristicFrameGlow(),
      emissiveIntensity: 1.3,
      metalness: 0.3,
      roughness: 0.5,
      bumpMap: futuristicFrameBump(),
      bumpScale: 0.9,
    });
    frameWallMat = new THREE.MeshStandardMaterial({ ...common, envMapIntensity: 0.5, color: 0x1b1f27, metalness: 0.3, roughness: 0.45 });
    barrelMat = new THREE.MeshStandardMaterial({ ...common, color: 0x232a33, metalness: 1, roughness: 0.12 });
    // Pièces anodisées cyan (leviers, goupilles, languette de détente).
    steelMat = new THREE.MeshStandardMaterial({ ...common, color: 0x1597b0, metalness: 0.85, roughness: 0.28 });
    // Organes de visée « phosphorescents » : insensibles à l'éclairage.
    sightMat = new THREE.MeshBasicMaterial({ color: 0x6ff9ff });
    dotMat = new THREE.MeshBasicMaterial({ color: 0xff4fd8 });
    glowMaterials.push(
      { material: slideMat, base: 1.8, kind: 'emissive' },
      { material: frameMat, base: 1.3, kind: 'emissive' },
    );
  } else if (banana) {
    // L'arme-banane a ses propres matériaux (voir buildBananaGun) ; ici
    // seulement les pièces partagées : « queue de banane » et visée jaune.
    barrelMat = new THREE.MeshStandardMaterial({ ...common, envMapIntensity: 0.3, color: 0x7d8f2c, roughness: 0.6 });
    steelMat = new THREE.MeshStandardMaterial({ ...common, envMapIntensity: 0.3, color: 0x6b4a22, metalness: 0, roughness: 0.7 });
    sightMat = new THREE.MeshBasicMaterial({ color: 0xfff06a });
    dotMat = sightMat;
  } else {
    slideMat = new THREE.MeshStandardMaterial({
      ...common,
      envMapIntensity: 0.55,
      color: 0x1c1e21,
      metalness: 0.6,
      roughness: 0.42,
      bumpMap: slideBump,
      bumpScale: 1.5,
    });
    slideWallMat = new THREE.MeshStandardMaterial({ ...common, envMapIntensity: 0.55, color: 0x1c1e21, metalness: 0.6, roughness: 0.38 });
    frameMat = new THREE.MeshStandardMaterial({
      ...common,
      envMapIntensity: 0.25,
      color: 0x151618,
      metalness: 0.05,
      roughness: 0.78,
      bumpMap: frameBump,
      bumpScale: 0.9,
    });
    frameWallMat = new THREE.MeshStandardMaterial({ ...common, envMapIntensity: 0.25, color: 0x151618, metalness: 0.05, roughness: 0.66 });
    barrelMat = new THREE.MeshStandardMaterial({ ...common, color: 0x6a6c70, metalness: 0.95, roughness: 0.22 });
    steelMat = new THREE.MeshStandardMaterial({ ...common, color: 0x3a3c40, metalness: 0.9, roughness: 0.3 });
    sightMat = new THREE.MeshStandardMaterial({ color: 0xf4f4ee, roughness: 0.4, emissive: 0x333333 });
    dotMat = sightMat;
  }
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9 });
  const brassMat = new THREE.MeshStandardMaterial({ ...common, color: 0xd1a54a, metalness: 1, roughness: 0.25 });
  // Néon cyan des bandes lumineuses (couleur modulée par la pulsation).
  const NEON_COLOR = new THREE.Color(0x5ff7ff);
  const neonMat = new THREE.MeshBasicMaterial({ color: NEON_COLOR.clone() });
  if (futuristic) glowMaterials.push({ material: neonMat, base: 1, kind: 'color', color: NEON_COLOR });

  const model = new THREE.Group();

  // Culasse (partie mobile, qui recule au tir) et points d'ancrage des effets.
  const slide = new THREE.Group();
  model.add(slide);
  const portTop = SLIDE_HEIGHT + 1.2;
  const muzzleAt = new THREE.Vector3(SLIDE_LENGTH + 4, BORE_Y, 0);
  const ejectionAt = new THREE.Vector3(131, portTop + 2, 8);

  if (banana) {
    const anchors = buildBananaGun({ model, slide, stemMat: steelMat, sightMat, dotMat, blackMat, common });
    muzzleAt.copy(anchors.muzzle);
    ejectionAt.copy(anchors.ejection);
  } else {
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
    slide.add(new THREE.Mesh(extrude(slideShape(), SLIDE_WIDTH - 2.4, 1.2), [slideMat, slideWallMat]));
    // Fenêtre d'éjection et tête de canon visible dedans.
    const coreMat = futuristic
      ? new THREE.MeshStandardMaterial({ map: energyCoreTexture(), emissive: 0xffffff, emissiveMap: energyCoreTexture(), emissiveIntensity: 1.4 })
      : blackMat;
    if (futuristic) glowMaterials.push({ material: coreMat, base: 1.4, kind: 'emissive' });
    const port = new THREE.Mesh(new THREE.PlaneGeometry(36, 13), coreMat);
    port.rotation.x = -Math.PI / 2;
    port.position.set(131, portTop + 0.05, 5);
    slide.add(port);
    const hood = new THREE.Mesh(new RoundedBoxGeometry(33, 3, 11, 3, 1.2), barrelMat);
    hood.position.set(131, portTop - 0.6, 3.5);
    slide.add(hood);
    const portSide = new THREE.Mesh(new THREE.PlaneGeometry(36, 7), coreMat);
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
    const outline = new THREE.Mesh(extrudeAlongX(rearSightOutlineShape(), 0.3, 0), sightMat);
    outline.position.set(7.9, portTop, 0);
    slide.add(outline);
    const frontSight = new THREE.Mesh(extrudeAlongX(frontSightShape(), 5, 0.3), blackMat);
    frontSight.position.set(176, portTop - 0.4, 0);
    slide.add(frontSight);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(1.05, 20), dotMat);
    dot.rotation.y = -Math.PI / 2;
    dot.position.set(173.05, portTop + 3.2, 0);
    slide.add(dot);
  }

  if (futuristic) {
    // Bandes lumineuses encastrées dans le bandeau gunmetal, des deux côtés.
    [-1, 1].forEach((side) => {
      const strip = new THREE.Mesh(new RoundedBoxGeometry(78, 1.1, 0.8, 2, 0.35), neonMat);
      strip.position.set(106, 3.4, side * (SLIDE_WIDTH / 2 + 0.15));
      slide.add(strip);
    });
    // Ligne lumineuse sur le dessus de la culasse, visible en visant.
    const topStrip = new THREE.Mesh(new RoundedBoxGeometry(56, 0.6, 1.3, 2, 0.28), neonMat);
    topStrip.position.set(76, portTop + 0.05, 0);
    slide.add(topStrip);
    // Barre verticale et deux témoins sur l'arrière de culasse.
    const rearBar = new THREE.Mesh(new RoundedBoxGeometry(0.6, 11, 1.4, 2, 0.28), neonMat);
    rearBar.position.set(-1.9, 14, 0);
    slide.add(rearBar);
    [-4, 4].forEach((z) => {
      const led = new THREE.Mesh(new RoundedBoxGeometry(0.6, 1.4, 1.4, 2, 0.3), neonMat);
      led.position.set(-1.9, 22, z);
      slide.add(led);
    });
    // Anneau lumineux autour de la bouche.
    const ring = new THREE.Mesh(new THREE.RingGeometry(6.8, 7.8, 40), neonMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(SLIDE_LENGTH + 1.35, BORE_Y, 0);
    slide.add(ring);
    // Témoins magenta sur le cache-poussière de la carcasse.
    [-1, 1].forEach((side) => {
      const indicator = new THREE.Mesh(new RoundedBoxGeometry(5, 1.4, 0.6, 2, 0.25), dotMat);
      indicator.position.set(150, -6.5, side * (FRAME_WIDTH / 2 + 0.2));
      model.add(indicator);
    });
  }

  const muzzle = new THREE.Object3D();
  muzzle.position.copy(muzzleAt);
  model.add(muzzle);
  const ejection = new THREE.Object3D();
  ejection.position.copy(ejectionAt);
  model.add(ejection);

  // --- Effets de bouche ---------------------------------------------------------
  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: flashTexture(futuristic ? 'plasma' : banana ? 'banana' : 'powder'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
  );
  flash.scale.set(95, 95, 1);
  muzzle.add(flash);
  const flashLight = new THREE.PointLight(futuristic ? 0x5ff0ff : banana ? 0xffdc5a : 0xffb35c, 0, 3, 2);
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
  const cellRingGeo = new THREE.CylinderGeometry(5.1 * MM, 5.1 * MM, 3.5 * MM, 14);
  const cellMat = new THREE.MeshStandardMaterial({ ...common, color: 0x2a313b, metalness: 1, roughness: 0.15 });
  let flare = 0; // 0..1, sursaut de lumière après un tir
  const projectiles = [];
  const bananaParts = banana
    ? {
        geometries: {
          body: bananaBodyGeometry(),
          stem: new THREE.CylinderGeometry(0.0045, 0.006, 0.022, 6),
          tip: new THREE.SphereGeometry(0.0065, 8, 6),
          strip: bananaBodyGeometry().translate(BANANA_LENGTH / 2, 0, 0).scale(0.5, 0.45, 0.55),
        },
        materials: {
          peel: new THREE.MeshStandardMaterial({ color: 0xebb80f, roughness: 0.55, flatShading: true, side: THREE.DoubleSide }),
          stem: new THREE.MeshStandardMaterial({ color: 0x6b4a22, roughness: 0.8 }),
          tip: new THREE.MeshStandardMaterial({ color: 0x3a2a14, roughness: 0.9 }),
        },
      }
    : null;
  const aim = new THREE.Vector3();
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
    flare = 1;
    flashUntil = now + 55;
    flash.material.rotation = Math.random() * Math.PI * 2;
    flash.scale.setScalar(80 + Math.random() * 40);

    // Douille éjectée vers la droite et l'arrière, en rotation.
    ejection.getWorldPosition(tmp);
    let shell;
    if (banana) {
      shell = buildPeel(bananaParts.geometries, bananaParts.materials);
    } else {
      shell = new THREE.Mesh(shellGeo, futuristic ? cellMat : brassMat);
      if (futuristic) shell.add(new THREE.Mesh(cellRingGeo, neonMat));
    }
    shell.position.copy(tmp);
    holder.getWorldQuaternion(quat);
    const velocity = new THREE.Vector3(1.6 + Math.random() * 0.6, 1.4 + Math.random() * 0.6, 0.35 + Math.random() * 0.3).applyQuaternion(quat);
    shell.rotation.set(Math.random(), Math.random(), Math.PI / 2);
    scene.add(shell);
    shells.push({ mesh: shell, velocity, spin: new THREE.Vector3(18 + Math.random() * 10, Math.random() * 6, 10), born: now });

    // Skin banane : une vraie banane jaillit de la bouche vers le viseur, en
    // tournant sur elle-même, avec une légère retombée.
    if (banana) {
      muzzle.getWorldPosition(tmp);
      holder.parent.getWorldDirection(aim);
      const projectile = buildBanana(bananaParts.geometries, bananaParts.materials);
      projectile.position.copy(tmp);
      projectile.scale.setScalar(1.8);
      projectile.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      scene.add(projectile);
      projectiles.push({
        mesh: projectile,
        velocity: aim.clone().multiplyScalar(46).add(new THREE.Vector3(0, 0.6, 0)),
        spin: new THREE.Vector3(8 + Math.random() * 6, 3 + Math.random() * 4, 14 + Math.random() * 8),
        born: now,
      });
    }

    // Petit nuage de fumée à la bouche, qui monte et s'étale.
    muzzle.getWorldPosition(tmp);
    const smoke = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.5, color: futuristic ? 0xaef9ff : banana ? 0xfff1a8 : 0xffffff }),
    );
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

    if (glowMaterials.length) {
      flare = Math.max(0, flare - dt * 3.5);
      const pulse = 0.82 + 0.18 * Math.sin(time * 2.4);
      const level = pulse + flare * 1.6;
      glowMaterials.forEach((g) => {
        if (g.kind === 'emissive') g.material.emissiveIntensity = g.base * level;
        else g.material.color.copy(g.color).multiplyScalar(Math.min(1.8, level));
      });
    }

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
    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const p = projectiles[i];
      p.velocity.y -= 4 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      if (now - p.born > 1100) {
        scene.remove(p.mesh);
        projectiles.splice(i, 1);
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
