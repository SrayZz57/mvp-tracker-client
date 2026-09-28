// Tests des courbes de réponse. Lancer : npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { AIM_CURVE_IDS, applyAimCurve } from './aimCurves.js';

test('chaque courbe : f(0) = 0, f(1) = 1, croissante', () => {
  for (const id of AIM_CURVE_IDS) {
    assert.equal(applyAimCurve(0, id), 0, id);
    assert.equal(applyAimCurve(1, id), 1, id);
    let prev = 0;
    for (let t = 0.1; t <= 1; t += 0.1) {
      const v = applyAimCurve(t, id);
      assert.ok(v >= prev, `${id} devrait être croissante (t=${t})`);
      prev = v;
    }
  }
});

test('le signe du stick est préservé', () => {
  assert.ok(applyAimCurve(-0.5, 'standard') < 0);
  assert.ok(applyAimCurve(0.5, 'standard') > 0);
  assert.equal(applyAimCurve(-0.5, 'standard'), -applyAimCurve(0.5, 'standard'));
});

test('une courbe inconnue retombe sur la courbe par défaut sans planter', () => {
  assert.equal(applyAimCurve(1, 'n-importe-quoi'), applyAimCurve(1, 'standard'));
});

test('une magnitude au-delà de 1 est bornée (jamais de rotation qui explose)', () => {
  assert.equal(applyAimCurve(1.5, 'linear'), 1);
  assert.equal(applyAimCurve(-1.5, 'linear'), -1);
});

test('heavy/extreme sont plus "molles" en dessous de 1 que linear (plus de précision près du centre)', () => {
  assert.ok(applyAimCurve(0.5, 'heavy') < applyAimCurve(0.5, 'linear'));
  assert.ok(applyAimCurve(0.5, 'extreme') < applyAimCurve(0.5, 'heavy'));
});
