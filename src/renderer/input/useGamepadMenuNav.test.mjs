// Tests de la navigation spatiale (D-pad/stick dans les menus) — la partie
// pure de useGamepadMenuNav.js, sans DOM. Lancer : npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickClosestRect } from './useGamepadMenuNav.js';

const rect = (left, top, width = 100, height = 40) => ({ left, top, width, height });

test('vers le bas : choisit l\'élément juste en dessous, pas un autre plus loin', () => {
  const from = rect(0, 0);
  const candidates = [rect(0, 200), rect(0, 60), rect(0, -100)];
  assert.equal(pickClosestRect(from, candidates, 0, 1), 1);
});

test('vers le haut : ignore tout ce qui est en dessous', () => {
  const from = rect(0, 200);
  const candidates = [rect(0, 300), rect(0, 260)];
  assert.equal(pickClosestRect(from, candidates, 0, -1), -1);
});

test('vers la droite : préfère juste à droite plutôt qu\'en diagonale lointaine', () => {
  const from = rect(0, 0);
  const candidates = [rect(500, 500), rect(120, 5)];
  assert.equal(pickClosestRect(from, candidates, 1, 0), 1);
});

test('pénalise le décalage latéral : un élément aligné bat un élément plus proche mais désaxé', () => {
  const from = rect(0, 0);
  const aligned = rect(0, 60); // juste en dessous, même colonne
  const closerButOffset = rect(200, 50); // plus proche en distance brute, mais très décalé
  assert.equal(pickClosestRect(from, [closerButOffset, aligned], 0, 1), 1);
});

test('aucun candidat dans la bonne direction : renvoie -1', () => {
  assert.equal(pickClosestRect(rect(0, 0), [rect(0, 0)], 0, 1), -1);
});
