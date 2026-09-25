import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Arènes de l'Aim Trainer. 'classic' est construite directement dans
// AimTrainerGame.jsx ; les autres le sont ici. Une arène n'est pas un réglage :
// elle est imposée par le mode joué (voir MODES[...].arena).
//
// Règles communes à toutes les arènes :
// - le joueur est à l'origine, les yeux à y = 0, face à -Z ; le sol (floorY)
//   est passé par l'appelant (AGENT_FLOOR_Y pour les modes à agents) ;
// - la zone TARGET_ZONE devant le joueur reste libre de tout solide, pour
//   qu'un futur mode à sphères (qui ne teste pas le décor au tir) y reste
//   jouable. Les modes à agents, eux, testent le décor (voir aimBots.js).
// Secteur interdit au décor : rayon et demi-angle (depuis -Z) vus du joueur.
export const TARGET_ZONE = { radius: 17.5, halfAngleDeg: 62 };

// --- Textures générées au canvas --------------------------------------------
// Aucune image externe (rien à créditer, rien à télécharger), comme le reste
// de l'Aim Trainer.

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

// Dessin en coordonnées « logiques » mais canvas deux fois plus grand
// (suréchantillonnage) : joints, lettres et motifs restent nets de près au lieu
// d'un rendu flou façon basse résolution.
const TEXTURE_SUPERSAMPLE = 2;

function makeCanvas(width, height, draw, supersample = TEXTURE_SUPERSAMPLE) {
  const canvas = document.createElement('canvas');
  canvas.width = width * supersample;
  canvas.height = height * supersample;
  const ctx = canvas.getContext('2d');
  ctx.scale(supersample, supersample);
  draw(ctx, width, height);
  return canvas;
}

// Les dessins ne dépendent ni du thème ni de la session : dessinés une seule
// fois par lancement de l'app, puis réutilisés à chaque partie.
const canvasCache = new Map();
function cachedCanvas(key, make) {
  if (!canvasCache.has(key)) canvasCache.set(key, make());
  return canvasCache.get(key);
}

// Fusionne les pièces fixes du décor qui partagent un matériau : quelques
// dizaines d'objets à dessiner à chaque image au lieu de plusieurs centaines,
// pour un rendu identique. Les matériaux « à l'échelle » (userData.kind) ont
// leur répétition de texture reportée dans les UV, ce qui leur permet de
// partager un seul matériau par type de surface.
function mergeStaticMeshes(group, canonical) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  const leftovers = new Set();
  [...group.children].forEach((child) => {
    if (!child.isMesh || Array.isArray(child.material)) return;
    let geometry = child.geometry.clone();
    geometry.applyMatrix4(child.matrix);
    if (geometry.index) geometry = geometry.toNonIndexed();
    if (!geometry.attributes.uv || !geometry.attributes.normal) return;
    Object.keys(geometry.attributes).forEach((name) => {
      if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
    });
    geometry.clearGroups();
    let { material } = child;
    if (material.userData.kind) {
      const [ru, rv] = material.userData.repeat;
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
      leftovers.add(material);
      material = canonical[material.userData.kind];
    }
    if (!buckets.has(material)) buckets.set(material, []);
    buckets.get(material).push(geometry);
    group.remove(child);
    child.geometry.dispose();
  });
  buckets.forEach((geometries, material) => {
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    group.add(new THREE.Mesh(merged, material));
  });
  // Copies temporaires des matériaux « à l'échelle » ; leur texture, partagée,
  // reste utilisée par le matériau de référence.
  leftovers.forEach((material) => material.dispose());
}

function toTexture(canvas, { repeat = [1, 1], wrap = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (wrap) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  texture.repeat.set(repeat[0], repeat[1]);
  // Plafonné par Three.js au maximum du GPU : garde le sol net en angle rasant.
  texture.anisotropy = 16;
  return texture;
}

// Taches douces : patine d'un enduit, d'une pierre ou d'un bois.
function speckle(ctx, w, h, rand, count, colors, maxRadius) {
  for (let i = 0; i < count; i += 1) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 2 + rand() * maxRadius;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colors[Math.floor(rand() * colors.length)]);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// Enduit blanc cassé des murs de monastère, légèrement taché par le bas.
function plasterCanvas() {
  return makeCanvas(512, 512, (ctx, s) => {
    const rand = seededRandom(7);
    ctx.fillStyle = '#e9dfcb';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, s, rand, 220, ['rgba(170,150,120,0.16)', 'rgba(255,252,242,0.3)', 'rgba(140,120,95,0.1)'], 70);
    ctx.strokeStyle = 'rgba(120,100,80,0.18)';
    for (let i = 0; i < 40; i += 1) {
      const x = rand() * s;
      ctx.beginPath();
      ctx.moveTo(x, rand() * s);
      ctx.lineTo(x + (rand() - 0.5) * 6, rand() * s);
      ctx.stroke();
    }
  });
}

// Soubassement en pierre de taille : assises décalées, joints sombres.
function stoneBlocksCanvas() {
  return makeCanvas(512, 512, (ctx, s) => {
    const rand = seededRandom(11);
    ctx.fillStyle = '#6f6a62';
    ctx.fillRect(0, 0, s, s);
    const rows = 4;
    const rh = s / rows;
    for (let r = 0; r < rows; r += 1) {
      let x = r % 2 ? -rh * 0.8 : 0;
      while (x < s) {
        const w = rh * (1.3 + rand() * 1.1);
        const tone = 120 + Math.floor(rand() * 40);
        ctx.fillStyle = `rgb(${tone}, ${tone - 4}, ${tone - 12})`;
        ctx.fillRect(x + 3, r * rh + 3, w - 6, rh - 6);
        x += w;
      }
    }
    speckle(ctx, s, s, rand, 260, ['rgba(40,35,30,0.2)', 'rgba(255,250,240,0.12)'], 22);
  });
}

// Dallage irrégulier en ardoise, joints sombres.
function flagstoneCanvas() {
  return makeCanvas(512, 512, (ctx, s) => {
    const rand = seededRandom(19);
    ctx.fillStyle = '#3b3d42';
    ctx.fillRect(0, 0, s, s);
    let y = 0;
    while (y < s) {
      const rh = Math.min(s - y, 70 + rand() * 70);
      let x = -rand() * 60;
      while (x < s) {
        const w = 80 + rand() * 110;
        const tone = 128 + Math.floor(rand() * 34);
        ctx.fillStyle = `rgb(${tone - 4}, ${tone}, ${tone + 4})`;
        ctx.fillRect(x + 4, y + 4, w - 8, rh - 8);
        x += w;
      }
      y += rh;
    }
    speckle(ctx, s, s, rand, 500, ['rgba(40,45,50,0.22)', 'rgba(250,250,255,0.1)', 'rgba(120,110,90,0.12)'], 24);
  });
}

// Planches de bois verticales teintées sombre.
function woodCanvas() {
  return makeCanvas(256, 256, (ctx, s) => {
    const rand = seededRandom(23);
    const planks = 4;
    for (let i = 0; i < planks; i += 1) {
      const tone = 70 + Math.floor(rand() * 20);
      ctx.fillStyle = `rgb(${tone + 22}, ${tone - 8}, ${tone - 30})`;
      ctx.fillRect((i * s) / planks, 0, s / planks, s);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(((i + 1) * s) / planks - 2, 0, 2, s);
    }
    ctx.strokeStyle = 'rgba(20,10,5,0.25)';
    for (let i = 0; i < 30; i += 1) {
      const x = rand() * s;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 4, s * 0.3, x - 4, s * 0.7, x + 2, s);
      ctx.stroke();
    }
  });
}

// Tuiles de toit en rangées, gris ardoise tirant sur le vert.
function roofTilesCanvas() {
  return makeCanvas(256, 256, (ctx, s) => {
    const rand = seededRandom(29);
    ctx.fillStyle = '#2b3534';
    ctx.fillRect(0, 0, s, s);
    const cols = 8;
    const rows = 6;
    const cw = s / cols;
    const rh = s / rows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = c * cw + (r % 2 ? cw / 2 : 0);
        const g = ctx.createLinearGradient(x, 0, x + cw, 0);
        const tone = 70 + Math.floor(rand() * 18);
        g.addColorStop(0, `rgb(${tone - 30}, ${tone - 18}, ${tone - 20})`);
        g.addColorStop(0.5, `rgb(${tone + 10}, ${tone + 26}, ${tone + 22})`);
        g.addColorStop(1, `rgb(${tone - 30}, ${tone - 18}, ${tone - 20})`);
        ctx.fillStyle = g;
        ctx.fillRect(x, r * rh, cw - 2, rh - 3);
      }
    }
  });
}

// Frise peinte des bandeaux : fond rouge, pastilles dorées, filets verts.
function friezeCanvas() {
  return makeCanvas(512, 64, (ctx, w, h) => {
    ctx.fillStyle = '#8f2a21';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2f6f63';
    ctx.fillRect(0, 0, w, 7);
    ctx.fillRect(0, h - 7, w, 7);
    ctx.fillStyle = '#d9a63a';
    ctx.fillRect(0, 7, w, 3);
    ctx.fillRect(0, h - 10, w, 3);
    for (let x = 32; x < w; x += 64) {
      ctx.beginPath();
      ctx.arc(x, h / 2, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8f2a21';
      ctx.beginPath();
      ctx.arc(x, h / 2, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d9a63a';
      ctx.fillRect(x + 22, h / 2 - 2, 20, 4);
    }
  });
}

// Fenêtre à encadrement peint (rouge, filet doré, croisillons sombres).
function windowCanvas() {
  return makeCanvas(256, 320, (ctx, w, h) => {
    ctx.fillStyle = '#5a1f18';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d9a63a';
    ctx.fillRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = '#8f2a21';
    ctx.fillRect(20, 20, w - 40, h - 40);
    ctx.fillStyle = '#16181c';
    ctx.fillRect(40, 60, w - 80, h - 100);
    ctx.strokeStyle = '#6b2a1f';
    ctx.lineWidth = 6;
    for (let x = 40 + (w - 80) / 3; x < w - 40; x += (w - 80) / 3) {
      ctx.beginPath();
      ctx.moveTo(x, 60);
      ctx.lineTo(x, h - 40);
      ctx.stroke();
    }
    for (let y = 60 + (h - 100) / 4; y < h - 40; y += (h - 100) / 4) {
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(w - 40, y);
      ctx.stroke();
    }
    // Petit auvent peint en haut (trapèze vert)
    ctx.fillStyle = '#2f6f63';
    ctx.beginPath();
    ctx.moveTo(10, 50);
    ctx.lineTo(w - 10, 50);
    ctx.lineTo(w - 30, 24);
    ctx.lineTo(30, 24);
    ctx.fill();
  });
}

// Caisse : panneau de planches, cadre métallique, sangle et marquage.
function crateCanvas() {
  return makeCanvas(512, 512, (ctx, s) => {
    const rand = seededRandom(31);
    const frame = s * 0.09;
    const planks = 5;
    for (let i = 0; i < planks; i += 1) {
      const y = (i * s) / planks;
      const tone = 125 + Math.floor(rand() * 30);
      ctx.fillStyle = `rgb(${tone + 30}, ${tone - 10}, ${tone - 60})`;
      ctx.fillRect(0, y, s, s / planks);
      ctx.fillStyle = 'rgba(40,20,5,0.55)';
      ctx.fillRect(0, y + s / planks - 3, s, 3);
    }
    speckle(ctx, s, s, rand, 120, ['rgba(60,30,10,0.18)'], 30);
    ctx.fillStyle = '#34373c';
    ctx.fillRect(0, 0, s, frame);
    ctx.fillRect(0, s - frame, s, frame);
    ctx.fillRect(0, 0, frame, s);
    ctx.fillRect(s - frame, 0, frame, s);
    ctx.fillRect(s / 2 - frame * 0.35, 0, frame * 0.7, s);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(0, 0, s, 4);
    ctx.fillStyle = '#9ba0a8';
    [frame / 2, s - frame / 2].forEach((x) =>
      [frame / 2, s - frame / 2].forEach((y) => {
        ctx.beginPath();
        ctx.arc(x, y, frame * 0.17, 0, Math.PI * 2);
        ctx.fill();
      }),
    );
    ctx.fillStyle = '#e8792b';
    ctx.fillRect(frame * 1.5, frame * 1.5, s * 0.22, s * 0.05);
    ctx.fillStyle = 'rgba(20,20,20,0.7)';
    ctx.font = 'bold 34px Arial, sans-serif';
    ctx.fillText('K-07', s * 0.62, s - frame * 1.6);
  });
}

// Zone de pose du Spike : liseré peint usé + grande lettre au sol.
function plantZoneCanvas(letter) {
  return makeCanvas(1024, 1024, (ctx, s) => {
    const rand = seededRandom(47);
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(236,178,58,0.95)';
    ctx.lineWidth = 22;
    ctx.setLineDash([90, 40]);
    ctx.strokeRect(24, 24, s - 48, s - 48);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(236,178,58,0.6)';
    ctx.font = 'bold 520px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, s / 2, s / 2 + 30);
    // Usure : on efface des taches au hasard dans la peinture.
    ctx.globalCompositeOperation = 'destination-out';
    speckle(ctx, s, s, rand, 900, ['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.3)'], 16);
    ctx.globalCompositeOperation = 'source-over';
  }, 1);
}

// Panneau de site : plaque sombre, lettre claire, bande orange, flèche.
function siteSignCanvas(letter, arrow) {
  return makeCanvas(512, 512, (ctx, s) => {
    ctx.fillStyle = '#1c1f24';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#e8792b';
    ctx.fillRect(0, s - 70, s, 70);
    ctx.strokeStyle = '#d9a63a';
    ctx.lineWidth = 10;
    ctx.strokeRect(18, 18, s - 36, s - 36);
    ctx.fillStyle = '#f4ecdc';
    ctx.font = 'bold 300px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, s / 2, s / 2 - 30);
    if (arrow) {
      ctx.fillStyle = '#1c1f24';
      ctx.beginPath();
      ctx.moveTo(s / 2 - 40, s - 22);
      ctx.lineTo(s / 2 + 40, s - 22);
      ctx.lineTo(s / 2, s - 62);
      ctx.fill();
    }
  });
}

// --- Monastère · Site A ------------------------------------------------------
// Site A inspiré de Haven : cour dallée d'un monastère de montagne, murs
// d'enduit blanc sur soubassement de pierre, bandeaux peints rouge et or,
// toits en ardoise, passerelle « heaven » au fond, jardin à gauche, entrée
// « short » à droite. Le joueur arrive par « main », un couloir derrière lui.
//
// Tous les éléments solides sont enregistrés dans `colliders` (boîtes
// alignées sur les axes, en coordonnées monde) pour un futur déplacement du
// joueur : on pourra y marcher (dessus des boîtes = sols praticables, dont la
// passerelle et les marches) sans rien reconstruire.
export function buildMonasteryArena(arena, { floorY, isDark }) {
  const tint = (hex) => (isDark ? new THREE.Color(hex).multiplyScalar(0.42) : new THREE.Color(hex));
  const Y = (h) => floorY + h;
  const colliders = [];

  // Matériaux texturés à l'échelle du monde : la répétition de la texture
  // suit la taille de la surface, pour qu'un grand mur ne l'étire pas. Un seul
  // matériau de référence par type de surface ; mat() renvoie une copie qui
  // mémorise la répétition voulue, reportée dans les UV à la fusion finale
  // (voir mergeStaticMeshes).
  const canvasMakers = {
    plaster: plasterCanvas,
    stone: stoneBlocksCanvas,
    wood: woodCanvas,
    roof: roofTilesCanvas,
    frieze: friezeCanvas,
  };
  const tileSize = { plaster: 5, stone: 4, wood: 2, roof: 3, frieze: 3 };
  const canonical = {};
  Object.entries(canvasMakers).forEach(([kind, make]) => {
    canonical[kind] = new THREE.MeshStandardMaterial({
      map: toTexture(cachedCanvas(kind, make)),
      roughness: kind === 'roof' ? 0.7 : 0.9,
      color: tint(0xffffff),
    });
  });
  const materialCache = new Map();
  const mat = (kind, u = 1, v = 1) => {
    const ru = Math.max(1, Math.round((u / tileSize[kind]) * 2) / 2);
    const rv = kind === 'frieze' ? 1 : Math.max(1, Math.round((v / tileSize[kind]) * 2) / 2);
    const key = `${kind}:${ru}:${rv}`;
    if (!materialCache.has(key)) {
      const material = canonical[kind].clone();
      material.userData = { kind, repeat: [ru, rv] };
      materialCache.set(key, material);
    }
    return materialCache.get(key);
  };
  const plain = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: tint(hex), roughness: 0.8, ...extra });
  const redWood = plain(0x7e2a20, { roughness: 0.6 });
  const darkWood = plain(0x3a251a);
  const gold = plain(0xd4a13a, { roughness: 0.35, metalness: 0.8 });
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x0b0c0f });
  const windowMat = new THREE.MeshStandardMaterial({ map: toTexture(cachedCanvas('window', windowCanvas), { wrap: false }), roughness: 0.8, color: tint(0xffffff) });
  const crateMat = new THREE.MeshStandardMaterial({ map: toTexture(cachedCanvas('crate', crateCanvas), { wrap: false }), roughness: 0.8, color: tint(0xffffff) });

  // Boîte posée à `y0` au-dessus du sol. `solid` l'ajoute aux colliders.
  const box = (w, h, d, material, x, y0, z, { rotY = 0, solid = true } = {}) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, Y(y0 + h / 2), z);
    mesh.rotation.y = rotY;
    arena.add(mesh);
    if (solid) {
      mesh.updateMatrixWorld(true);
      colliders.push(new THREE.Box3().setFromObject(mesh));
    }
    return mesh;
  };

  // Mur dans l'axe X ou Z, de (x1, z1) à (x2, z2), avec ouvertures facultatives
  // `gaps` = [[début, fin, hauteur]] le long du mur (distance depuis x1/z1).
  const wall = (x1, z1, x2, z2, { h = 7, t = 0.9, gaps = [], cap = true } = {}) => {
    const alongX = z1 === z2;
    const length = alongX ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
    const start = alongX ? Math.min(x1, x2) : Math.min(z1, z2);
    const fixed = alongX ? z1 : x1;
    const piece = (a, b, y0, y1, material, extraT = 0) => {
      if (b - a < 0.01 || y1 - y0 < 0.01) return;
      const mid = start + (a + b) / 2;
      const len = b - a;
      if (alongX) box(len, y1 - y0, t + extraT, material, mid, y0, fixed);
      else box(t + extraT, y1 - y0, len, material, fixed, y0, mid);
    };
    // Découpe du mur en tronçons pleins, avec linteau au-dessus des ouvertures.
    const sorted = [...gaps].sort((g1, g2) => g1[0] - g2[0]);
    let cursor = 0;
    const layers = (a, b, fromY = 0) => {
      piece(a, b, fromY, Math.min(1.3, h), mat('stone', b - a, 1.3), 0.12);
      piece(a, b, Math.max(1.3, fromY), h - 1.1, mat('plaster', b - a, h - 2.4));
    };
    sorted.forEach(([ga, gb, gh]) => {
      layers(cursor, ga);
      piece(ga, gb, gh, h - 1.1, mat('plaster', gb - ga, h - 1.1 - gh));
      piece(ga - 0.25, gb + 0.25, gh - 0.4, gh, darkWood, 0.2);
      cursor = gb;
    });
    layers(cursor, length);
    // Couronnement : poutre sombre, frise peinte, filet doré.
    piece(0, length, h - 1.1, h - 0.75, darkWood, 0.14);
    piece(0, length, h - 0.75, h - 0.2, mat('frieze', length, 1), 0.08);
    piece(0, length, h - 0.2, h, gold, 0.1);
    if (cap) {
      // Petit toit à deux pans sur la crête du mur.
      [-1, 1].forEach((side) => {
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(alongX ? length + 0.6 : 0.9, 0.14, alongX ? 0.9 : length + 0.6),
          mat('roof', length, 1),
        );
        const cx = alongX ? start + length / 2 : fixed + side * 0.4;
        const cz = alongX ? fixed + side * 0.4 : start + length / 2;
        slab.position.set(cx, Y(h + 0.18), cz);
        if (alongX) slab.rotation.x = side * 0.42;
        else slab.rotation.z = -side * 0.42;
        arena.add(slab);
      });
    }
  };

  // Toit en pagode : pyramide d'ardoise à pans très débordants, bandeau
  // rouge, faîte doré. `tiers` empile des toits de plus en plus petits.
  const pagodaRoof = (x, z, w, d, y0, { tiers = 1, rise = 2.2 } = {}) => {
    let cw = w;
    let cd = d;
    let cy = y0;
    for (let i = 0; i < tiers; i += 1) {
      const eave = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.3, 0.35, cd + 0.3), redWood);
      eave.position.set(x, Y(cy + 0.17), z);
      arena.add(eave);
      // Rotation appliquée à la géométrie (et non au mesh) : sinon l'échelle
      // non uniforme s'appliquerait en diagonale et déformerait le toit.
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.05, Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4), mat('roof', cw, cd));
      roof.scale.set(cw + 2.2, rise, cd + 2.2);
      roof.position.set(x, Y(cy + 0.35 + rise / 2), z);
      arena.add(roof);
      cw *= 0.62;
      cd *= 0.62;
      cy += rise + 0.35;
      if (i < tiers - 1) {
        box(cw, 1.4, cd, mat('plaster', cw, 1.4), x, cy - rise * 0.5, z, { solid: false });
        cy += 0.9 - rise * 0.5 + 0.5;
      }
    }
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.6, 8), gold);
    finial.position.set(x, Y(cy + 0.9), z);
    arena.add(finial);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), gold);
    ball.position.set(x, Y(cy + 0.25), z);
    arena.add(ball);
  };

  // Plan décoratif (fenêtre, panneau) plaqué contre un mur.
  const plate = (material, w, h, x, y0, z, rotY) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, Y(y0 + h / 2), z);
    mesh.rotation.y = rotY;
    arena.add(mesh);
    return mesh;
  };

  // Colonne de bois rouge sur socle de pierre, chapiteau doré.
  const pillar = (x, z, h, base = 0) => {
    box(0.9, 0.5, 0.9, mat('stone', 1, 1), x, base, z);
    box(0.5, h - 0.9, 0.5, redWood, x, base + 0.5, z);
    box(0.8, 0.4, 0.8, gold, x, base + h - 0.4, z, { solid: false });
  };

  const crate = (x, z, level = 0, rotY = 0, size = 1.7) =>
    box(size, size, size, crateMat, x, level * 1.7, z, { rotY });

  // --- Sol -----------------------------------------------------------------
  const floorMat = new THREE.MeshStandardMaterial({
    map: toTexture(cachedCanvas('flagstone', flagstoneCanvas), { repeat: [24, 24] }),
    roughness: 0.85,
    color: tint(0xffffff),
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(96, 96), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  arena.add(floor);

  // --- A main : couloir d'arrivée derrière le joueur -------------------------
  wall(-7, -2.5, -7, 24, { h: 7 });
  wall(7, -2.5, 7, 24, { h: 7 });
  wall(-7, 24, 7, 24, { h: 8, gaps: [[4.5, 9.5, 4.5]] });
  plate(shadowMat, 5, 4.5, 0, 0, 23.5, Math.PI);
  // Fenêtres du couloir
  [4, 12, 18].forEach((z) => {
    plate(windowMat, 1.4, 1.8, -6.52, 3.2, z, Math.PI / 2);
    plate(windowMat, 1.4, 1.8, 6.52, 3.2, z, -Math.PI / 2);
  });
  // Portique d'entrée sur le site (au-dessus du joueur, hors du cône de tir).
  box(0.9, 7.2, 0.9, redWood, -6.6, 0, -3.2, { solid: false });
  box(0.9, 7.2, 0.9, redWood, 6.6, 0, -3.2, { solid: false });
  box(14, 0.7, 1.1, mat('frieze', 14, 1), 0, 6.3, -3.2, { solid: false });
  box(14.6, 0.25, 1.3, gold, 0, 7, -3.2, { solid: false });
  const mainSign = new THREE.MeshStandardMaterial({ map: toTexture(cachedCanvas('signArrow', () => siteSignCanvas('A', true)), { wrap: false }), roughness: 0.7, color: tint(0xffffff) });
  plate(mainSign, 1, 1, 0, 5.15, -2.6, Math.PI);

  // --- Enceinte de la cour --------------------------------------------------
  // Murs avant (de part et d'autre du couloir), hors du cône de tir.
  wall(-26, -2.5, -7, -2.5, { h: 7 });
  wall(7, -2.5, 26, -2.5, { h: 7 });
  // Mur gauche : façade du bâtiment du jardin, porte vers le lien (« link »).
  wall(-26, -46, -26, -2.5, { h: 8, gaps: [[30, 34, 4.2]] });
  plate(shadowMat, 4, 4.2, -26.47, 0, -14, Math.PI / 2);
  // Mur droit : ouverture « A short ».
  wall(26, -46, 26, -2.5, { h: 8, gaps: [[20, 27, 5]] });
  // Mur du fond (derrière heaven).
  wall(-26, -46, 26, -46, { h: 13, cap: false });

  // Fenêtres sur les façades de la cour.
  [-40, -34, -27, -8].forEach((z) => plate(windowMat, 1.6, 2, -25.53, 3.4, z, Math.PI / 2));
  [-40, -34, -8].forEach((z) => plate(windowMat, 1.6, 2, 25.53, 3.4, z, -Math.PI / 2));
  [-20, -12, 12, 20].forEach((x) => plate(windowMat, 1.8, 2.3, x, 8.6, -45.53, 0));

  // Bâtiments derrière l'enceinte, avec leurs toits en pagode.
  box(12, 11, 9, mat('plaster', 12, 11), -32, 0, -12, { solid: false });
  pagodaRoof(-32, -12, 12, 9, 11, { tiers: 1 });
  box(10, 13, 10, mat('plaster', 10, 13), 33, 0, -36, { solid: false });
  pagodaRoof(33, -36, 10, 10, 13, { tiers: 2 });
  box(10, 10, 10, mat('plaster', 10, 10), -33, 0, -38, { solid: false });
  pagodaRoof(-33, -38, 10, 10, 10, { tiers: 1 });
  // Grand temple au fond, sur toute la largeur.
  pagodaRoof(0, -50, 40, 8, 13, { tiers: 3, rise: 2.6 });
  box(16, 3, 8, mat('plaster', 16, 3), 0, 13, -50, { solid: false });

  // --- Heaven : passerelle surélevée au fond ----------------------------------
  const deckH = 4.4;
  const deckFront = -37;
  box(30, deckH, 9, mat('stone', 30, deckH), 0, 0, (deckFront + -46) / 2);
  box(30.4, 0.3, 0.5, darkWood, 0, deckH, deckFront - 0.1, { solid: false });
  // Garde-corps rouge avec balustres.
  box(30, 0.14, 0.14, redWood, 0, deckH + 1.1, deckFront - 0.3);
  box(30, 0.1, 0.1, gold, 0, deckH + 0.55, deckFront - 0.3, { solid: false });
  for (let x = -14.5; x <= 14.5; x += 1.25) box(0.1, 1.1, 0.1, redWood, x, deckH, deckFront - 0.3, { solid: false });
  // Colonnes et toit débordant au-dessus de la passerelle.
  [-14, -7, 0, 7, 14].forEach((x) => pillar(x, deckFront - 0.8, 4.2, deckH));
  box(31, 0.45, 2.2, redWood, 0, deckH + 4.2, deckFront - 0.6, { solid: false });
  const heavenRoof = new THREE.Mesh(new THREE.BoxGeometry(32, 0.25, 5), mat('roof', 32, 5));
  heavenRoof.position.set(0, Y(deckH + 5.2), deckFront - 2);
  heavenRoof.rotation.x = 0.38;
  arena.add(heavenRoof);
  // Ouverture au fond de heaven + panneau de site.
  plate(shadowMat, 4.5, 3.4, -5, deckH, -45.53, 0);
  const siteSign = new THREE.MeshStandardMaterial({ map: toTexture(cachedCanvas('sign', () => siteSignCanvas('A', false)), { wrap: false }), roughness: 0.7, color: tint(0xffffff) });
  plate(siteSign, 2.2, 2.2, 6, deckH + 1, -45.52, 0);
  // Lanternes suspendues sous le toit de heaven.
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  [-10.5, -3.5, 3.5, 10.5].forEach((x) => {
    box(0.03, 0.8, 0.03, darkWood, x, deckH + 3.4, deckFront - 0.8, { solid: false });
    box(0.45, 0.6, 0.45, lanternMat, x, deckH + 2.8, deckFront - 0.8, { solid: false });
    box(0.55, 0.08, 0.55, redWood, x, deckH + 3.4, deckFront - 0.8, { solid: false });
  });
  // Escalier d'accès à heaven, côté gauche (marches praticables).
  const steps = 9;
  for (let i = 0; i < steps; i += 1) {
    const h = ((i + 1) * deckH) / steps;
    box(1, h, 3.2, mat('stone', 1, h), -24.5 + i, 0, -39.5);
  }
  box(0.2, 1, 9, redWood, -20, deckH / 2 + 0.5, -37.8, { solid: false });

  // --- Site A : zone de pose, couvertures ------------------------------------
  const plantZone = { minX: -10, maxX: 10, minZ: -33, maxZ: -19 };
  const plant = new THREE.Mesh(
    new THREE.PlaneGeometry(plantZone.maxX - plantZone.minX, plantZone.maxZ - plantZone.minZ),
    new THREE.MeshBasicMaterial({ map: toTexture(cachedCanvas('plantZone', () => plantZoneCanvas('A')), { wrap: false }), transparent: true, depthWrite: false, opacity: isDark ? 0.5 : 0.9 }),
  );
  plant.rotation.x = -Math.PI / 2;
  plant.position.set(0, floorY + 0.02, (plantZone.minZ + plantZone.maxZ) / 2);
  arena.add(plant);

  // « Default » : double caisse au centre du site.
  crate(-3.2, -25, 0, 0.06);
  crate(-3.2, -25, 1, -0.04);
  crate(-1.5, -25.3, 0, 0.02);
  // Pile triple à droite du site.
  crate(6.5, -28.5, 0, 0);
  crate(8.2, -28.5, 0, 0.05);
  crate(7.3, -28.4, 1, -0.1);
  crate(7.3, -28.4, 2, 0.12, 1.2);
  // Muret bas sous heaven, avec bac à fleurs.
  box(9, 1.1, 1.2, mat('stone', 9, 1.1), -1, 0, -34.5);
  box(9, 0.3, 1.3, darkWood, -1, 1.1, -34.5, { solid: false });
  // Caisses à l'entrée de short.
  crate(21.8, -21, 0, 0.3);
  crate(21.5, -26.6, 0, -0.1);
  crate(23.3, -26.2, 0, 0.1);
  crate(22.4, -26.4, 1, 0.3, 1.2);
  // Caisses près de l'entrée main, sur les côtés (hors cône).
  crate(-17.5, -6.5, 0, 0.2);
  crate(-15.8, -6, 0, 0);
  crate(17.8, -7, 0, -0.25);
  crate(18.3, -7.4, 1, 0.1, 1.2);

  // --- Jardin à gauche : bac surélevé, arbre, buissons ------------------------
  box(8, 0.9, 11, mat('stone', 8, 0.9), -21.5, 0, -20);
  box(8.2, 0.15, 11.2, darkWood, -21.5, 0.9, -20, { solid: false });
  const trunkMat = plain(0x4a3020);
  const leafMats = [plain(0x3f6b3a, { flatShading: true }), plain(0x557f3e, { flatShading: true }), plain(0xb3474d, { flatShading: true })];
  const tree = (x, z, s, blossom) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.4 * s, 4 * s, 7), trunkMat);
    trunk.position.set(x, Y(0.9 + 2 * s), z);
    arena.add(trunk);
    colliders.push(new THREE.Box3().setFromCenterAndSize(trunk.position, new THREE.Vector3(0.8 * s, 4 * s, 0.8 * s)));
    const rand = seededRandom(Math.round(x * 13 + z * 7));
    for (let i = 0; i < 6; i += 1) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry((1.1 + rand() * 0.8) * s, 0), leafMats[blossom && rand() < 0.5 ? 2 : Math.floor(rand() * 2)]);
      leaf.position.set(x + (rand() - 0.5) * 2.6 * s, Y(0.9 + 4 * s + (rand() - 0.3) * 1.6 * s), z + (rand() - 0.5) * 2.6 * s);
      arena.add(leaf);
    }
  };
  tree(-22.5, -22, 1.2, true);
  tree(-19.5, -16.5, 0.8, false);
  [[-18.5, -24.5], [-24, -16], [-20.5, -19.5]].forEach(([x, z]) => {
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), leafMats[1]);
    bush.position.set(x, Y(1.4), z);
    bush.scale.y = 0.7;
    arena.add(bush);
  });

  // --- A short : ruelle derrière l'ouverture de droite -----------------------
  wall(26, -26, 36, -26, { h: 7 });
  wall(26, -16, 36, -16, { h: 7 });
  wall(36, -26, 36, -16, { h: 7, gaps: [[3, 7, 4]] });
  plate(shadowMat, 4, 4, 35.53, 0, -21, -Math.PI / 2);
  // Portique peint sur l'ouverture de short.
  box(0.6, 5.6, 0.6, redWood, 25.4, 0, -16.2, { solid: false });
  box(0.6, 5.6, 0.6, redWood, 25.4, 0, -25.8, { solid: false });
  box(0.8, 0.6, 10.4, mat('frieze', 10, 1), 25.4, 5.2, -21, { solid: false });

  // --- Drapeaux de prière --------------------------------------------------
  // Guirlandes de fanions aux cinq couleurs. Jamais tendues dans le champ où
  // apparaissent les cibles (±50° de côté, jusqu'à ~40° de hauteur vus du
  // joueur) : des fanions colorés derrière une cible la noyaient dans le décor.
  // Elles longent donc les murs latéraux, passent au-dessus du portique
  // d'entrée et décorent le couloir de main.
  const flagColors = [0x2f6fd0, 0xf2efe6, 0xc9352b, 0x3f9a4c, 0xe6c23a];
  const flagMats = flagColors.map((c) => new THREE.MeshStandardMaterial({ color: tint(c), side: THREE.DoubleSide, roughness: 0.9 }));
  const flagGeo = new THREE.PlaneGeometry(0.55, 0.7);
  const ropeMat = new THREE.LineBasicMaterial({ color: isDark ? 0x2a2a2a : 0x5b5147 });
  const flagLine = (a, b, sag, count) => {
    const points = [];
    for (let i = 0; i <= 24; i += 1) {
      const t = i / 24;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      p.y -= Math.sin(Math.PI * t) * sag;
      points.push(p);
    }
    arena.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), ropeMat));
    const dir = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
    const yaw = Math.atan2(dir.x, dir.z) + Math.PI / 2;
    for (let i = 1; i < count; i += 1) {
      const t = i / count;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      p.y -= Math.sin(Math.PI * t) * sag + 0.38;
      const flag = new THREE.Mesh(flagGeo, flagMats[i % flagMats.length]);
      flag.position.copy(p);
      flag.rotation.y = yaw;
      flag.rotation.z = (Math.random() - 0.5) * 0.15;
      arena.add(flag);
    }
  };
  [-1, 1].forEach((side) => {
    flagLine(new THREE.Vector3(side * 25.4, Y(8), -2.8), new THREE.Vector3(side * 25.4, Y(8), -20), 1, 16);
  });
  flagLine(new THREE.Vector3(-22, Y(8.6), -2.9), new THREE.Vector3(22, Y(8.6), -2.9), 0.5, 30);
  [6, 13, 20].forEach((z) => flagLine(new THREE.Vector3(-6.5, Y(7), z), new THREE.Vector3(6.5, Y(7), z), 0.9, 10));

  // --- Montagnes à l'horizon ---------------------------------------------------
  const rockMat = plain(0x6d7480, { flatShading: true, fog: true });
  const snowMat = plain(0xf2f5fa, { flatShading: true });
  [
    [-70, -85, 34, 48], [-20, -100, 40, 62], [35, -95, 36, 52], [85, -60, 30, 40],
    [-95, -30, 28, 36], [95, 20, 26, 34], [-85, 50, 30, 38], [20, 95, 34, 44],
  ].forEach(([x, z, r, h]) => {
    const peak = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), rockMat);
    peak.position.set(x, Y(h / 2 - 4), z);
    peak.rotation.y = x * 0.1;
    arena.add(peak);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.36, h * 0.36, 7), snowMat);
    cap.position.set(x, Y(h - 4 - (h * 0.36) / 2 + 0.2), z);
    cap.rotation.y = x * 0.1;
    arena.add(cap);
  });

  // --- Lumières d'ambiance (le soleil et les accents restent ceux du jeu) ------
  [
    [-12, deckH + 3, -39],
    [12, deckH + 3, -39],
    [0, 5, -24],
  ].forEach(([x, y, z]) => {
    const light = new THREE.PointLight(0xffc98a, isDark ? 4 : 1.8, 22, 2);
    light.position.set(x, Y(y), z);
    arena.add(light);
  });

  mergeStaticMeshes(arena, canonical);

  return {
    colliders,
    // Point d'apparition à la sortie de main, regard vers le site.
    spawn: { position: new THREE.Vector3(0, 0, 0), yaw: 0 },
    plantZone,
    bounds: { minX: -26, maxX: 36, minZ: -46, maxZ: 24 },
    floorY,
    // Zones où peuvent apparaître et se déplacer des personnages (hauteur du
    // sol de la zone au-dessus de floorY). Heaven en a été retiré : à ~40 m, les
    // têtes devenaient trop petites pour un entraînement utile.
    botZones: [
      { minX: -14, maxX: 22, minZ: -27, maxZ: -8, y: 0 },
    ],
  };
}
