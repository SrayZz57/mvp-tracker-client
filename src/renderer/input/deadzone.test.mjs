// Tests de la deadzone radiale. Lancer : npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRadialDeadzone } from './deadzone.js';

test('stick neutre (0,0) : aucune sortie, pas de drift', () => {
  const r = applyRadialDeadzone(0, 0, 0.1, 1);
  assert.deepEqual(r, { x: 0, y: 0, magnitude: 0 });
});

test('sous la deadzone interne : coupé à zéro, quel que soit l\'axe', () => {
  assert.deepEqual(applyRadialDeadzone(0.05, 0, 0.1, 1), { x: 0, y: 0, magnitude: 0 });
  assert.deepEqual(applyRadialDeadzone(0.03, 0.03, 0.1, 1), { x: 0, y: 0, magnitude: 0 });
});

test('à 100% (bord du stick) : magnitude 1, direction inchangée', () => {
  const r = applyRadialDeadzone(1, 0, 0.1, 1);
  assert.equal(r.magnitude, 1);
  assert.ok(Math.abs(r.x - 1) < 1e-9);
  assert.equal(r.y, 0);
});

test('juste après la deadzone : progression continue, pas un saut brutal', () => {
  const justAbove = applyRadialDeadzone(0.11, 0, 0.1, 1);
  assert.ok(justAbove.magnitude > 0 && justAbove.magnitude < 0.05, 'doit démarrer près de 0, pas sauter à une valeur élevée');
});

test('renormalisation correcte : à mi-chemin entre inner et outer, magnitude = 0.5', () => {
  const r = applyRadialDeadzone(0.55, 0, 0.1, 1);
  assert.ok(Math.abs(r.magnitude - 0.5) < 1e-9);
});

test('la deadzone externe borne à 1 même avec du survirage physique', () => {
  const r = applyRadialDeadzone(1.05, 0, 0, 1);
  assert.equal(r.magnitude, 1);
});

test('deadzone radiale : la diagonale n\'est pas coupée plus tôt qu\'un axe pur (pas de carré)', () => {
  const diag = applyRadialDeadzone(0.08, 0.08, 0.1, 1); // magnitude ≈ 0.113
  const axis = applyRadialDeadzone(0.11, 0, 0.1, 1);
  assert.ok(diag.magnitude > 0, 'la diagonale doit passer la deadzone dès que sa MAGNITUDE la dépasse');
  assert.ok(Math.abs(diag.magnitude - axis.magnitude) < 0.05);
});

test('direction préservée (le ratio x/y ne change pas)', () => {
  const r = applyRadialDeadzone(0.3, 0.4, 0.1, 1); // magnitude 0.5
  assert.ok(Math.abs(r.x / r.y - 0.3 / 0.4) < 1e-9);
});
