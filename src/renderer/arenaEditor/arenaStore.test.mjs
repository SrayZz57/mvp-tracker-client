// Tests du format des arènes de l'éditeur. Lancer :  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA_LIMITS, boxFootprint, createArena, createBox, createEnemy, decodeArenaCode, encodeArenaCode, loadArenas, sanitizeArena, saveArenas } from './arenaStore.js';
import { BOX_STYLE_IDS, DEFAULT_BOX_STYLE } from './boxStyles.js';

const memoryStorage = () => {
  const data = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } };
};

test('aller-retour par le stockage : rien ne se perd', () => {
  const storage = memoryStorage();
  const arena = createArena('Test');
  arena.boxes.push(createBox({ x: 3, z: -5, w: 4, h: 3, d: 1, rotY: Math.PI / 4, style: 'metal' }));
  arena.enemies.push(createEnemy({ x: -4, z: -10, y: 2 }));
  arena.enemySettings = { style: 'jiggle', speed: 1.5, scale: 0.8, count: 2 };
  assert.ok(saveArenas([arena], storage));
  assert.deepEqual(loadArenas(storage), [arena]);
});

test('données corrompues ou trafiquées : bornées, jamais de plantage', () => {
  const storage = memoryStorage();
  storage.setItem('mvptracker-aim-arenas-v1', '{pas du json');
  assert.deepEqual(loadArenas(storage), []);

  const arena = sanitizeArena({
    name: '   ',
    floor: { w: 9999, d: -3 },
    boxes: [{ w: -1, h: 1e9, d: 'abc', style: 'lave', x: NaN }, null, 'box'],
  });
  assert.equal(arena.name, 'Arène');
  assert.equal(arena.floor.w, ARENA_LIMITS.floor.max);
  assert.equal(arena.floor.d, ARENA_LIMITS.floor.min);
  assert.equal(arena.boxes.length, 1);
  const [box] = arena.boxes;
  assert.equal(box.w, ARENA_LIMITS.size.min);
  assert.equal(box.h, ARENA_LIMITS.height.max);
  assert.equal(box.d, 2);
  assert.equal(box.x, 0);
  assert.equal(box.style, DEFAULT_BOX_STYLE);
});

test('nombre de box plafonné', () => {
  const boxes = Array.from({ length: ARENA_LIMITS.maxBoxes + 50 }, () => ({}));
  assert.equal(sanitizeArena({ boxes }).boxes.length, ARENA_LIMITS.maxBoxes);
});

test('le point de départ reste sur le terrain', () => {
  const arena = sanitizeArena({ floor: { w: 20, d: 20 }, spawn: { x: 100, z: -100 } });
  assert.deepEqual(arena.spawn, { x: 10, z: -10, yaw: 0 });
});

test('emprise au sol d\'une box tournée', () => {
  const box = createBox({ x: 0, z: 0, w: 4, d: 2, rotY: Math.PI / 2 });
  const f = boxFootprint(box);
  assert.ok(Math.abs(f.maxX - 1) < 1e-9 && Math.abs(f.maxZ - 2) < 1e-9);
});

test('chaque style de box a une traduction', async () => {
  const fs = await import('node:fs');
  for (const lang of ['fr', 'en']) {
    const locale = JSON.parse(fs.readFileSync(new URL(`../i18n/locales/${lang}.json`, import.meta.url), 'utf8'));
    for (const id of BOX_STYLE_IDS) assert.ok(locale.aimTrainer.arenaEditor.styles[id], `${lang} : style ${id}`);
  }
});

test('ennemis : bornés au terrain, nombre plafonné, réglages valides', () => {
  const arena = sanitizeArena({
    floor: { w: 20, d: 20 },
    enemies: [...Array.from({ length: ARENA_LIMITS.maxEnemies + 5 }, () => ({ x: 999, z: -999, y: -3 })), 'x'],
    enemySettings: { style: 'vol', speed: 9, scale: 0, count: 2.6 },
  });
  assert.equal(arena.enemies.length, ARENA_LIMITS.maxEnemies);
  assert.deepEqual([arena.enemies[0].x, arena.enemies[0].z, arena.enemies[0].y], [10, -10, 0]);
  assert.deepEqual(arena.enemySettings, { style: 'mixed', speed: ARENA_LIMITS.enemySpeed.max, scale: ARENA_LIMITS.enemyScale.min, count: 3 });
});

test('ancienne arène sans ennemis ni orientation : relue sans perte', () => {
  const arena = sanitizeArena({ name: 'Vieille', boxes: [{ x: 1, z: 2 }], spawn: { x: 0, z: 5 } });
  assert.equal(arena.boxes.length, 1);
  assert.deepEqual(arena.enemies, []);
  assert.equal(arena.spawn.yaw, 0);
});

test('code de partage : aller-retour fidèle, texte non reconnu ou corrompu renvoie null', () => {
  const arena = sanitizeArena({
    name: 'Partagée',
    boxes: [createBox({ x: 1, style: 'metal' })],
    enemies: [createEnemy({ x: 2, style: 'jiggle' })],
  });
  const code = encodeArenaCode(arena);
  const back = decodeArenaCode(code);
  assert.equal(back.name, arena.name);
  assert.equal(back.boxes[0].style, 'metal');
  assert.equal(back.enemies[0].style, 'jiggle');
  assert.equal(decodeArenaCode('pas un code'), null);
  assert.equal(decodeArenaCode('MVPARENA1:%%%pas du base64%%%'), null);
});
