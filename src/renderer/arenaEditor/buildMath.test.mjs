// Tests du placement des pièces en construction. Lancer :  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { PIECES, STAIR_STEPS, doorBoxes, pieceDims, placeEnemy, placeOnHit, snapCenter, stairBoxes } from './buildMath.js';

const bounds = { halfW: 24, halfD: 24 };
const wall = PIECES.find((p) => p.id === 'wall');
const up = { x: 0, y: 1, z: 0 };

test('un quart de tour échange largeur et profondeur', () => {
  assert.deepEqual(pieceDims(wall, 1), { w: 0.4, h: 3, d: 4 });
  assert.deepEqual(pieceDims(wall, 2), { w: 4, h: 3, d: 0.4 });
});

test('les bords tombent sur la grille ; viser la face d\'un mur colle le suivant', () => {
  const a = placeOnHit({ point: { x: 0.3, y: 0, z: -5.1 }, normal: up }, wall, bounds);
  assert.equal(Math.abs((a.x - wall.w / 2) % 0.5), 0);
  assert.equal(snapCenter(0.3, 4), 0.5);
  // Face +X du premier mur, visée à mi-hauteur.
  const b = placeOnHit({ point: { x: a.x + 2, y: 1.5, z: a.z }, normal: { x: 1, y: 0, z: 0 }, box: { y: 0 } }, wall, bounds);
  assert.equal(b.x - a.x, 4);
  assert.equal(b.z, a.z);
});

test('sur le dessus d\'un bloc : posé à sa hauteur', () => {
  const p = placeOnHit({ point: { x: 1.1, y: 2, z: 1.1 }, normal: up, box: { y: 0 } }, pieceDims(PIECES[0], 0), bounds);
  assert.equal(p.y, 2);
});

test('contre une face : collé à la face, aligné sur le bas du bloc visé', () => {
  // Face +X d'un bloc dont le bord est à x = 2, bloc posé sur une plateforme (y = 1).
  const cube = pieceDims(PIECES[0], 0);
  const p = placeOnHit({ point: { x: 2, y: 1.6, z: 0.4 }, normal: { x: 1, y: 0, z: 0 }, box: { y: 1 } }, cube, bounds);
  assert.equal(p.x, 2.5);
  assert.equal(p.y, 1);
  assert.equal(p.z, 0.5);
});

test('jamais hors de la salle, jamais sous un plafond', () => {
  const p = placeOnHit({ point: { x: 30, y: 0, z: -30 }, normal: up }, wall, bounds);
  assert.equal(p.x, 22);
  assert.equal(p.z, -23.8);
  assert.equal(placeOnHit({ point: { x: 0, y: 3, z: 0 }, normal: { x: 0, y: -1, z: 0 } }, wall, bounds), null);
});

test('un ennemi se pose debout, pas contre un mur', () => {
  assert.deepEqual(placeEnemy({ point: { x: 3.1, y: 2, z: -7.9 }, normal: up }, bounds), { x: 3, y: 2, z: -8 });
  assert.equal(placeEnemy({ point: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 } }, bounds), null);
});

test('escalier : une marche pleine par palier, jamais flottante', () => {
  const stairs = PIECES.find((p) => p.id === 'stairs');
  const boxes = stairBoxes({ x: 0, y: 0, z: 0 }, stairs, 0);
  assert.equal(boxes.length, STAIR_STEPS);
  // Chaque marche part du sol (h = sa hauteur, pas une plaque à mi-hauteur)
  // et monte par rapport à la précédente.
  for (let i = 1; i < boxes.length; i += 1) assert.ok(boxes[i].h > boxes[i - 1].h);
  assert.equal(boxes[boxes.length - 1].h, stairs.h);
  // La plus proche du joueur (en avant, +Z) est la plus basse.
  assert.ok(boxes[0].z > boxes[boxes.length - 1].z);
});

test("escalier tourné d'un quart : la montée change d'axe, pas la largeur totale", () => {
  const stairs = PIECES.find((p) => p.id === 'stairs');
  const straight = stairBoxes({ x: 0, y: 0, z: 0 }, stairs, 0);
  const turned = stairBoxes({ x: 0, y: 0, z: 0 }, stairs, 1);
  // Non tourné : les marches s'étalent en Z, largeur constante en X.
  assert.ok(straight.every((b) => b.w === stairs.w));
  // Tourné à 90° : les marches s'étalent en X (leurs z restent groupés), la
  // largeur constante passe sur l'axe Z.
  assert.ok(turned.every((b) => b.d === stairs.w));
  assert.notEqual(turned[0].x, turned[turned.length - 1].x);
});

test('porte : deux montants pleins + un linteau, jamais un bloc qui bouche l\'ouverture', () => {
  const door = PIECES.find((p) => p.id === 'door');
  const boxes = doorBoxes({ x: 0, y: 0, z: 0 }, door, 0);
  assert.equal(boxes.length, 3);
  // Aucun bloc ne recouvre le centre X sur toute la hauteur de l'ouverture :
  // au niveau du sol (y=0), rien ne doit exister entre les deux montants.
  const atGround = boxes.filter((b) => b.y === 0);
  assert.ok(atGround.every((b) => Math.abs(b.x) >= door.doorway.w / 2 - 1e-9));
  // Le linteau commence pile où l'ouverture finit.
  const lintel = boxes.find((b) => b.y > 0);
  assert.equal(lintel.y, door.doorway.h);
  assert.equal(lintel.h, door.h - door.doorway.h);
  assert.equal(lintel.w, door.doorway.w);
});

test('porte tournée : les montants passent sur Z (largeur/profondeur échangées)', () => {
  const door = PIECES.find((p) => p.id === 'door');
  const turned = doorBoxes({ x: 0, y: 0, z: 0 }, door, 1);
  assert.equal(turned.length, 3);
  const sideW = (door.w - door.doorway.w) / 2;
  const sides = turned.filter((b) => b.y === 0);
  // Montants : minces sur X (l'épaisseur du mur), leur largeur d'origine
  // passe sur Z ; alignés symétriquement de part et d'autre du centre.
  assert.ok(sides.every((b) => b.w === door.d && b.d === sideW));
  assert.notEqual(sides[0].z, sides[1].z);
  const lintel = turned.find((b) => b.y > 0);
  assert.equal(lintel.w, door.d);
  assert.equal(lintel.d, door.doorway.w);
});
