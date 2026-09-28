// Tests de la conversion arène → zones d'apparition des ennemis. Lancer :  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnemy } from './arenaStore.js';
import { botZonesFor } from './buildCustomArena.js';

test('un ennemi placé = une petite zone de patrouille centrée dessus', () => {
  const [zone] = botZonesFor([createEnemy({ x: 3, z: -7, y: 1 })]);
  assert.equal((zone.minX + zone.maxX) / 2, 3);
  assert.equal((zone.minZ + zone.maxZ) / 2, -7);
  assert.ok(zone.maxX > zone.minX, 'largeur non nulle : sinon aucun style de déplacement ne peut bouger (voir aimBots.js)');
  assert.equal(zone.y, 1);
});

test('plusieurs ennemis : une zone par ennemi, dans l\'ordre', () => {
  const zones = botZonesFor([createEnemy({ x: 1, z: 1 }), createEnemy({ x: -1, z: -1 })]);
  assert.equal(zones.length, 2);
  assert.ok(zones[1].minX < -1 && zones[1].maxX > -1);
});

test('aucun ennemi : une zone de secours plutôt qu\'un tableau vide', () => {
  const zones = botZonesFor([]);
  assert.equal(zones.length, 1);
  assert.ok(zones[0].minX < zones[0].maxX);
});

test('réglages propres à un ennemi : repris dans sa zone ; sinon absents (le moteur retombe sur ceux de la session)', () => {
  const custom = createEnemy({ x: 0, z: 0, style: 'jiggle', speed: 1.4, scale: 0.8 });
  const [zoneCustom] = botZonesFor([custom]);
  assert.equal(zoneCustom.style, 'jiggle');
  assert.equal(zoneCustom.speed, 1.4);
  assert.equal(zoneCustom.scale, 0.8);

  const [zoneDefault] = botZonesFor([createEnemy({ x: 0, z: 0 })]);
  assert.ok(!('style' in zoneDefault) && !('speed' in zoneDefault) && !('scale' in zoneDefault));
});
