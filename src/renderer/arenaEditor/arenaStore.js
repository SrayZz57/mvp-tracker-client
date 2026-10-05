import { AGENT_HEAD_RADIUS } from '../aimTrainerModes.js';
import { BOX_STYLE_IDS, DEFAULT_BOX_STYLE } from './boxStyles.js';
import { notifyAimDataChanged } from '../aimSyncEvents.js';

// Arènes créées dans l'éditeur, stockées en local uniquement (choix du user :
// pas de partage en ligne pour l'instant). Donnée pure, sans three.js.
//
// Repère (le même que les arènes du jeu) : mètres, sol centré sur l'origine,
// +X = droite, +Z = vers le joueur au départ (le joueur regarde vers -Z).
// Une box : centre au sol (x, z), élévation y de sa face du dessous, tailles
// w (X), h (hauteur), d (Z), rotation rotY autour de la verticale (radians).

const STORAGE_KEY = 'mvptracker-aim-arenas-v1';

export const ARENA_LIMITS = {
  floor: { min: 10, max: 80 },
  size: { min: 0.2, max: 40 },
  height: { min: 0.2, max: 20 },
  elevation: { min: 0, max: 20 },
  maxBoxes: 300,
  maxEnemies: 20,
  nameLength: 40,
  enemySpeed: { min: 0.5, max: 2 },
  enemyScale: { min: 0.6, max: 1.5 },
  enemyCount: { min: 1, max: 6 },
};

// Styles de déplacement des ennemis (mêmes que le mode Personnalisé, voir
// AGENT_STYLES dans aimBots.js — recopiés pour ne pas importer three.js ici).
export const ENEMY_STYLES = ['mixed', 'strafe', 'jiggle', 'walk', 'static'];
// L'éditeur construit dans la salle de base (48 × 48 m, voir classicArena.js).
export const DEFAULT_FLOOR = { w: 48, d: 48 };
// Cartes Valorant sur lesquelles on peut placer des ennemis (voir
// playableMaps.js). `base` d'une arène : 'classic' (la salle de l'éditeur) ou
// l'un de ces identifiants. Coordonnées alors en mètres dans le repère de la
// carte, sur une étendue bien plus large que la salle.
export const MAP_BASES = ['ascentA', 'sunsetB', 'havenA'];
export const MAP_EXTENT = 200;
export const isMapBase = (base) => MAP_BASES.includes(base);

const clamp = (v, min, max, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function createBox(fields = {}) {
  return sanitizeBox({ id: newId('box'), x: 0, z: 0, y: 0, w: 2, h: 2, d: 2, rotY: 0, style: DEFAULT_BOX_STYLE, ...fields });
}

export function createArena(name = 'Arène', base = 'classic') {
  const now = Date.now();
  return {
    id: newId('arena'),
    name,
    base: isMapBase(base) ? base : 'classic',
    createdAt: now,
    updatedAt: now,
    floor: { ...DEFAULT_FLOOR },
    // Point de départ du joueur : au bord sud, face au nord (yaw 0 = vers -Z).
    // `y` : hauteur des pieds au-dessus du sol de base (cartes à niveaux).
    // Sur une carte, tout à zéro = pas encore posé (l'éditeur démarre alors au premier point de la carte).
    spawn: isMapBase(base) ? { x: 0, z: 0, y: 0, yaw: 0 } : { x: 0, z: 18, y: 0, yaw: 0 },
    boxes: [],
    // Points d'apparition des ennemis, et comment ils se comportent.
    enemies: [],
    enemySettings: { style: 'mixed', speed: 1, scale: 1, count: 3 },
  };
}

// style/speed/scale : `null` = suit le réglage par défaut de l'arène
// (enemySettings) ; un ennemi peut avoir les siens, différents des autres.
export function createEnemy(fields = {}) {
  return { id: newId('enemy'), x: 0, z: 0, y: 0, style: null, speed: null, scale: null, ...fields };
}

// Les cartes ont des niveaux plus bas que le point de référence ; la salle, non.
const MAP_Y = { min: -6, max: 30 };

function sanitizeEnemy(raw, halfW, halfD, onMap) {
  if (!raw || typeof raw !== 'object') return null;
  const { enemySpeed, enemyScale } = ARENA_LIMITS;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('enemy'),
    x: clamp(raw.x, -halfW, halfW, 0),
    z: clamp(raw.z, -halfD, halfD, 0),
    y: onMap ? clamp(raw.y, MAP_Y.min, MAP_Y.max, 0) : clamp(raw.y, ARENA_LIMITS.elevation.min, ARENA_LIMITS.elevation.max, 0),
    style: ENEMY_STYLES.includes(raw.style) ? raw.style : null,
    speed: raw.speed == null ? null : clamp(raw.speed, enemySpeed.min, enemySpeed.max, null),
    scale: raw.scale == null ? null : clamp(raw.scale, enemyScale.min, enemyScale.max, null),
  };
}

// Toute donnée relue (localStorage, et plus tard un code d'import) passe par
// ici : valeurs bornées, champs inconnus ignorés, box invalides écartées.
export function sanitizeBox(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { floor, size, height, elevation } = ARENA_LIMITS;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('box'),
    x: clamp(raw.x, -floor.max, floor.max, 0),
    z: clamp(raw.z, -floor.max, floor.max, 0),
    y: clamp(raw.y, elevation.min, elevation.max, 0),
    w: clamp(raw.w, size.min, size.max, 2),
    h: clamp(raw.h, height.min, height.max, 2),
    d: clamp(raw.d, size.min, size.max, 2),
    rotY: clamp(raw.rotY, -Math.PI * 4, Math.PI * 4, 0),
    style: BOX_STYLE_IDS.includes(raw.style) ? raw.style : DEFAULT_BOX_STYLE,
  };
}

export function sanitizeArena(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { floor, maxBoxes, maxEnemies, nameLength, enemySpeed, enemyScale, enemyCount } = ARENA_LIMITS;
  const base = isMapBase(raw.base) ? raw.base : 'classic';
  const onMap = base !== 'classic';
  const w = clamp(raw.floor?.w, floor.min, floor.max, DEFAULT_FLOOR.w);
  const d = clamp(raw.floor?.d, floor.min, floor.max, DEFAULT_FLOOR.d);
  // Sur une carte, la salle n'existe pas : l'étendue autorisée est celle de la carte.
  const halfW = onMap ? MAP_EXTENT : w / 2;
  const halfD = onMap ? MAP_EXTENT : d / 2;
  const es = raw.enemySettings ?? {};
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, nameLength) : 'Arène';
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('arena'),
    name,
    base,
    createdAt: clamp(raw.createdAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
    updatedAt: clamp(raw.updatedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
    floor: { w, d },
    spawn: {
      x: clamp(raw.spawn?.x, -halfW, halfW, 0),
      z: clamp(raw.spawn?.z, -halfD, halfD, onMap ? 0 : d / 2 - 6),
      y: onMap ? clamp(raw.spawn?.y, MAP_Y.min, MAP_Y.max, 0) : 0,
      yaw: clamp(raw.spawn?.yaw, -Math.PI * 4, Math.PI * 4, 0),
    },
    boxes: (Array.isArray(raw.boxes) ? raw.boxes : []).map(sanitizeBox).filter(Boolean).slice(0, maxBoxes),
    enemies: (Array.isArray(raw.enemies) ? raw.enemies : [])
      .map((e) => sanitizeEnemy(e, halfW, halfD, onMap))
      .filter(Boolean)
      .slice(0, maxEnemies),
    enemySettings: {
      style: ENEMY_STYLES.includes(es.style) ? es.style : 'mixed',
      speed: clamp(es.speed, enemySpeed.min, enemySpeed.max, 1),
      scale: clamp(es.scale, enemyScale.min, enemyScale.max, 1),
      count: Math.round(clamp(es.count, enemyCount.min, enemyCount.max, 3)),
    },
  };
}

export function loadArenas(storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(list) ? list.map(sanitizeArena).filter(Boolean) : [];
  } catch {
    return [];
  }
}

// Renvoie false si l'écriture échoue (stockage plein ou indisponible) : l'UI
// le signale au lieu de laisser croire que le travail est enregistré.
export function saveArenas(arenas, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(arenas));
    notifyAimDataChanged();
    return true;
  } catch {
    return false;
  }
}

// Chaque éditeur ne gère que ses arènes (salle classique, ou une carte donnée) :
// il lit et réécrit son sous-ensemble sans effacer celles des autres.
export const loadArenasOf = (base, storage) => loadArenas(storage).filter((a) => a.base === base);

export function saveArenasOf(base, mine, storage = globalThis.localStorage) {
  const others = loadArenas(storage).filter((a) => a.base !== base);
  return saveArenas([...others, ...mine], storage);
}

// Code d'export/import d'une arène — même principe que les presets du mode
// Personnalisé (voir CustomModeConfig.jsx) : juste le contenu qui compte (pas
// l'id ni les dates, propres à l'appareil), en base64 préfixé. Pas de
// backend : le code se partage à la main (Discord, etc.).
const ARENA_CODE_PREFIX = 'MVPARENA1:';

export function encodeArenaCode(arena) {
  const payload = {
    name: arena.name,
    base: arena.base,
    floor: arena.floor,
    spawn: arena.spawn,
    boxes: arena.boxes,
    enemies: arena.enemies,
    enemySettings: arena.enemySettings,
  };
  return ARENA_CODE_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

export function decodeArenaCode(code) {
  const trimmed = code.trim();
  if (!trimmed.startsWith(ARENA_CODE_PREFIX)) return null;
  try {
    const json = decodeURIComponent(escape(atob(trimmed.slice(ARENA_CODE_PREFIX.length))));
    const data = JSON.parse(json);
    // sanitizeArena revalide tout (bornes, styles connus...) : un code
    // trafiqué ou corrompu retombe sur des valeurs sûres plutôt que planter.
    return sanitizeArena(data);
  } catch {
    return null;
  }
}

// Config de lancement d'une arène perso — un seul endroit pour cette
// correspondance (arène -> duel headshot dessus), reprise à l'identique par
// le bouton Jouer de l'éditeur, la liste d'arènes du hub et le mode
// Personnalisé (voir ArenaEditor.jsx, AimTrainerHub.jsx, CustomModeConfig.jsx).
export function arenaLaunchConfig(arena) {
  return {
    baseMode: 'headshotDuel',
    customArenaId: arena.id,
    duration: 60,
    // Sur une carte Valorant, tous les ennemis posés sont là en même temps
    // (c'est le but : les placer exactement où l'on veut s'entraîner).
    targetCount: isMapBase(arena.base) ? Math.max(1, arena.enemies.length) : arena.enemySettings.count,
    targetSize: AGENT_HEAD_RADIUS,
    spread: 45,
    speed: arena.enemySettings.speed,
    agentScale: arena.enemySettings.scale,
    agentStyle: arena.enemySettings.style,
  };
}

// Emprise au sol d'une box tournée (rectangle englobant, aligné sur les axes).
export function boxFootprint(box) {
  const c = Math.abs(Math.cos(box.rotY));
  const s = Math.abs(Math.sin(box.rotY));
  const hw = (box.w * c + box.d * s) / 2;
  const hd = (box.w * s + box.d * c) / 2;
  return { minX: box.x - hw, maxX: box.x + hw, minZ: box.z - hd, maxZ: box.z + hd };
}
