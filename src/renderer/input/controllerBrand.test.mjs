// Tests de la détection de marque manette / étiquettes de boutons.
// Lancer : npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectControllerBrand, buttonLabel } from './controllerBrand.js';

test('DualSense/DualShock détectés comme playstation', () => {
  assert.equal(detectControllerBrand('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'), 'playstation');
  assert.equal(detectControllerBrand('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)'), 'playstation');
});

test('manettes Xbox détectées comme xbox', () => {
  assert.equal(detectControllerBrand('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)'), 'xbox');
});

test('manette inconnue ou id vide : generic, jamais de plantage', () => {
  assert.equal(detectControllerBrand('Some Random Pad'), 'generic');
  assert.equal(detectControllerBrand(''), 'generic');
  assert.equal(detectControllerBrand(undefined), 'generic');
});

test('étiquettes correctes par marque', () => {
  assert.equal(buttonLabel('playstation', 'A'), '✕');
  assert.equal(buttonLabel('xbox', 'A'), 'A');
  assert.equal(buttonLabel('xbox', 'R2'), 'RT');
  assert.equal(buttonLabel('playstation', 'R2'), 'R2');
});

test('marque ou bouton inconnu : repli propre', () => {
  assert.equal(buttonLabel('martian', 'A'), 'A'); // repli sur "generic"
  assert.equal(buttonLabel('xbox', 'NotAButton'), 'NotAButton'); // repli sur le nom brut
});
