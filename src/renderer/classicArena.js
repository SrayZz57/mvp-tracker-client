import * as THREE from 'three';

import floorColorUrl from '../assets/textures/floor-color.jpg';
import floorNormalUrl from '../assets/textures/floor-normal.jpg';
import floorRoughnessUrl from '../assets/textures/floor-roughness.jpg';
import wallColorUrl from '../assets/textures/wall-color.jpg';
import wallNormalUrl from '../assets/textures/wall-normal.jpg';
import wallRoughnessUrl from '../assets/textures/wall-roughness.jpg';

// Salle « de base » de l'Aim Trainer (sol texturé, grille, murs bas ouverts
// sur le ciel) et ses textures. Partagée par le moteur de jeu et l'éditeur
// d'arène, pour que l'éditeur montre exactement ce qu'on verra en jouant.

export const CLASSIC_WALL_HEIGHT = 7;
export const CLASSIC_WALL_HALF = 24;
export { wallColorUrl, wallNormalUrl, wallRoughnessUrl };

// Bruit de valeur lissé, base de toutes les textures procédurales ci-dessous
// (aucune image externe : l'app doit rester autonome et légère).
function valueNoise(width, height, cellSize, seed = 1) {
  const cols = Math.ceil(width / cellSize) + 1;
  const rows = Math.ceil(height / cellSize) + 1;
  const grid = [];
  let state = seed;
  const rand = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  for (let r = 0; r < rows; r += 1) {
    grid.push(Array.from({ length: cols }, rand));
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = x / cellSize;
    const gy = y / cellSize;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = smooth(gx - x0);
    const ty = smooth(gy - y0);
    const v00 = grid[y0 % rows][x0 % cols];
    const v10 = grid[y0 % rows][(x0 + 1) % cols];
    const v01 = grid[(y0 + 1) % rows][x0 % cols];
    const v11 = grid[(y0 + 1) % rows][(x0 + 1) % cols];
    return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
  };
}

// Textures PBR photographiques (couleur + normales + rugosité), CC0 —
// provenance dans src/assets/textures/CREDITS.md. Bien plus crédibles que
// des motifs dessinés au canvas : le relief des normales réagit vraiment à
// l'éclairage de la scène.
const textureLoader = new THREE.TextureLoader();

// Images décodées une seule fois par lancement de l'app, puis partagées entre
// les sessions : sans ce cache, chaque partie redécodait ~3,5 Mo de JPEG. Chaque
// matériau reçoit sa propre copie (clone) pour régler sa répétition, et c'est
// cette copie qui est libérée en fin de session, jamais l'image mise en cache.
const baseTextures = new Map();
function loadBaseTexture(url) {
  if (!baseTextures.has(url)) baseTextures.set(url, textureLoader.loadAsync(url));
  return baseTextures.get(url);
}

export function loadPbrMaterial({ color, normal, roughness }, repeat, extra = {}) {
  const material = new THREE.MeshStandardMaterial(extra);
  const assign = (slot, url, isColor) => {
    loadBaseTexture(url).then((base) => {
      const texture = base.clone();
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeat[0], repeat[1]);
      texture.anisotropy = 8;
      if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      material[slot] = texture;
      material.needsUpdate = true;
    });
  };
  assign('map', color, true);
  assign('normalMap', normal, false);
  assign('roughnessMap', roughness, false);
  return material;
}

// Libère la mémoire graphique d'une scène (géométries, matériaux, textures) :
// sans ça, chaque session laissait tout en mémoire et l'app s'alourdissait au
// fil des parties.

export function makeSkyTexture() {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#1f4a8c');
  sky.addColorStop(0.45, '#5b9bd8');
  sky.addColorStop(0.72, '#a8cbe8');
  sky.addColorStop(1, '#e2d6c4');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Halo solaire, cohérent avec la direction de la lumière directionnelle.
  const sunGlow = ctx.createRadialGradient(width * 0.72, height * 0.26, 0, width * 0.72, height * 0.26, height * 0.55);
  sunGlow.addColorStop(0, 'rgba(255, 244, 214, 0.95)');
  sunGlow.addColorStop(0.25, 'rgba(255, 232, 186, 0.35)');
  sunGlow.addColorStop(1, 'rgba(255, 232, 186, 0)');
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, width, height);

  // Nuages : trois octaves de bruit, seuillées puis adoucies.
  const octaves = [
    { noise: valueNoise(width, height, 150, 3), weight: 0.55 },
    { noise: valueNoise(width, height, 70, 11), weight: 0.3 },
    { noise: valueNoise(width, height, 32, 29), weight: 0.15 },
  ];
  const clouds = ctx.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    // Les nuages s'estompent vers le zénith et vers l'horizon.
    const band = Math.sin((y / height) * Math.PI) ** 1.5;
    for (let x = 0; x < width; x += 1) {
      let n = 0;
      octaves.forEach(({ noise, weight }) => {
        n += noise(x, y) * weight;
      });
      const density = Math.max(0, n - 0.5) * 2.4 * band;
      const alpha = Math.min(1, density) * 235;
      const i = (y * width + x) * 4;
      clouds.data[i] = 255;
      clouds.data[i + 1] = 255;
      clouds.data[i + 2] = 255;
      clouds.data[i + 3] = alpha;
    }
  }
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = width;
  cloudCanvas.height = height;
  cloudCanvas.getContext('2d').putImageData(clouds, 0, 0);
  ctx.filter = 'blur(3px)';
  ctx.drawImage(cloudCanvas, 0, 0);
  ctx.filter = 'none';

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function classicWallMaterial(isDark) {
  return loadPbrMaterial(
    { color: wallColorUrl, normal: wallNormalUrl, roughness: wallRoughnessUrl },
    [8, 2],
    { metalness: 0.45, side: THREE.DoubleSide, color: isDark ? 0x3a3f4a : 0xffffff },
  );
}

// `wallMat` : le moteur passe le sien (partagé avec les murs du Dodge Flash).
export function buildClassicRoom(arena, { floorY, isDark, wallMat = classicWallMaterial(isDark) }) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 70),
    loadPbrMaterial(
      { color: floorColorUrl, normal: floorNormalUrl, roughness: floorRoughnessUrl },
      [18, 18],
      // `color` multiplie la texture (blanc = inchangé) : simple façon
      // d'assombrir le sol clair existant en thème sombre sans nouvel asset.
      { metalness: 0.05, color: isDark ? 0x3a3f4a : 0xffffff },
    ),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  arena.add(floor);

  const grid = new THREE.GridHelper(70, 35, 0xff6b78, 0x7c869c);
  grid.position.y = floorY + 0.01;
  grid.material.opacity = 0.25;
  grid.material.transparent = true;
  arena.add(grid);

  // Murs bas et ouverts sur le ciel (pas de plafond), avec un liseré
  // lumineux en crête pour délimiter proprement l'aire de jeu.
  const wallY = floorY + CLASSIC_WALL_HEIGHT / 2;
  const wallPlacements = [
    { pos: [0, wallY, -CLASSIC_WALL_HALF], rot: 0 },
    { pos: [0, wallY, CLASSIC_WALL_HALF], rot: Math.PI },
    { pos: [-CLASSIC_WALL_HALF, wallY, 0], rot: Math.PI / 2 },
    { pos: [CLASSIC_WALL_HALF, wallY, 0], rot: -Math.PI / 2 },
  ];
  wallPlacements.forEach(({ pos, rot }) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(CLASSIC_WALL_HALF * 2, CLASSIC_WALL_HEIGHT), wallMat);
    wall.position.set(...pos);
    wall.rotation.y = rot;
    arena.add(wall);

    const crest = new THREE.Mesh(
      new THREE.PlaneGeometry(CLASSIC_WALL_HALF * 2, 0.22),
      new THREE.MeshBasicMaterial({ color: 0xff4655, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    crest.position.set(pos[0], floorY + CLASSIC_WALL_HEIGHT - 0.15, pos[2]);
    crest.rotation.y = rot;
    arena.add(crest);
  });

  // Bandeaux lumineux verticaux sur le mur du fond : repères de profondeur.
  [-8, 0, 8].forEach((x, i) => {
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, CLASSIC_WALL_HEIGHT * 0.8),
      new THREE.MeshBasicMaterial({
        color: i === 1 ? 0xff4655 : 0x9fb4ff,
        transparent: true,
        opacity: i === 1 ? 0.6 : 0.35,
      }),
    );
    strip.position.set(x, floorY + CLASSIC_WALL_HEIGHT * 0.45, -CLASSIC_WALL_HALF + 0.05);
    arena.add(strip);
  });
}
