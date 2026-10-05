import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, hashItem, hashText, planSync } from './aimSyncPlan.js';

const item = (id, extra = {}) => ({ id, name: `Élément ${id}`, ...extra });
const entry = (id, extra) => ({ id, item: item(id, extra) });
const row = (id, extra, deleted = false) => ({ id, hash: hashItem(item(id, extra)), deleted });
const known = (id, extra, remoteExtra = extra) => ({ hash: hashItem(item(id, extra)), rhash: hashItem(item(id, remoteExtra)) });
const ids = (list) => list.map((x) => (typeof x === 'string' ? x : x.id)).sort();

test('empreinte : indépendante de l\'ordre des clés, sensible au contenu', () => {
  assert.equal(hashItem({ a: 1, b: { c: 2, d: [1, 2] } }), hashItem({ b: { d: [1, 2], c: 2 }, a: 1 }));
  assert.notEqual(hashItem({ a: 1 }), hashItem({ a: 2 }));
  assert.notEqual(hashText('abc'), hashText('abd'));
  assert.equal(canonicalJson([{ b: 1, a: 2 }]), '[{"a":2,"b":1}]');
});

test('premier envoi : tout ce qui est local et absent du serveur est envoyé', () => {
  const plan = planSync({ local: [entry('a'), entry('b')], remote: [], meta: {} });
  assert.deepEqual(ids(plan.push), ['a', 'b']);
  assert.equal(plan.pull.length + plan.tombstone.length + plan.removeLocal.length, 0);
});

test('nouvel appareil : tout ce qui est sur le serveur est rapatrié', () => {
  const plan = planSync({ local: [], remote: [row('a'), row('b')], meta: {} });
  assert.deepEqual(ids(plan.pull), ['a', 'b']);
  assert.equal(plan.push.length, 0);
});

test('déjà identique : rien à faire, et l\'état est retenu', () => {
  const plan = planSync({ local: [entry('a')], remote: [row('a')], meta: {} });
  assert.equal(plan.push.length + plan.pull.length, 0);
  assert.deepEqual(plan.meta.a, known('a'));
});

test('modifié ici seulement : envoi', () => {
  const plan = planSync({ local: [entry('a', { v: 2 })], remote: [row('a', { v: 1 })], meta: { a: known('a', { v: 1 }) } });
  assert.deepEqual(ids(plan.push), ['a']);
  assert.equal(plan.pull.length, 0);
});

test('modifié ailleurs seulement : rapatriement', () => {
  const plan = planSync({ local: [entry('a', { v: 1 })], remote: [row('a', { v: 2 })], meta: { a: known('a', { v: 1 }) } });
  assert.deepEqual(ids(plan.pull), ['a']);
  assert.equal(plan.push.length, 0);
});

test('modifié des deux côtés : la version de cet appareil l\'emporte', () => {
  const plan = planSync({ local: [entry('a', { v: 2 })], remote: [row('a', { v: 3 })], meta: { a: known('a', { v: 1 }) } });
  assert.deepEqual(ids(plan.push), ['a']);
  assert.equal(plan.pull.length, 0);
});

test('supprimé ici : on marque la suppression sur le serveur', () => {
  const plan = planSync({ local: [], remote: [row('a')], meta: { a: known('a') } });
  assert.deepEqual(ids(plan.tombstone), ['a']);
  assert.equal(plan.pull.length, 0);
});

test('supprimé ici mais modifié ailleurs entre-temps : on ne perd pas le travail de l\'autre appareil', () => {
  const plan = planSync({ local: [], remote: [row('a', { v: 2 })], meta: { a: known('a', { v: 1 }) } });
  assert.deepEqual(ids(plan.pull), ['a']);
  assert.equal(plan.tombstone.length, 0);
});

test('supprimé ailleurs : suppression ici, sauf si modifié ici depuis', () => {
  const remote = [row('a', {}, true)];
  assert.deepEqual(ids(planSync({ local: [entry('a')], remote, meta: { a: known('a') } }).removeLocal), ['a']);
  const edited = planSync({ local: [entry('a', { v: 9 })], remote, meta: { a: known('a') } });
  assert.deepEqual(ids(edited.push), ['a']);
  assert.equal(edited.removeLocal.length, 0);
});

test('suppression sur le serveur mais aucun souvenir ici : on garde l\'élément (rien de perdu)', () => {
  const plan = planSync({ local: [entry('a')], remote: [row('a', {}, true)], meta: {} });
  assert.deepEqual(ids(plan.push), ['a']);
  assert.equal(plan.removeLocal.length, 0);
});

test('écran d\'édition ouvert : rien n\'est écrasé ni supprimé ici, mais les envois continuent', () => {
  const plan = planSync({
    local: [entry('a', { v: 2 }), entry('c', { v: 1 })],
    remote: [row('a', { v: 1 }), row('b'), row('c', { v: 5 }), row('d', {}, true)],
    meta: { a: known('a', { v: 1 }), c: known('c', { v: 1 }) },
    canPull: false,
  });
  assert.deepEqual(ids(plan.push), ['a']);
  assert.equal(plan.pull.length + plan.removeLocal.length, 0);
  assert.ok(plan.meta.c, 'l\'état de l\'élément en attente est conservé pour la prochaine fois');
});

test('éléments refusés (cartes cachées sur le web) : ignorés des deux côtés, jamais supprimés', () => {
  const accept = (id) => id !== 'map';
  const plan = planSync({ local: [], remote: [row('map'), row('ok')], meta: {}, accept });
  assert.deepEqual(ids(plan.pull), ['ok']);
  assert.equal(plan.tombstone.length, 0);
});

test('deux synchronisations de suite ne changent plus rien', () => {
  const local = [entry('a'), entry('b', { v: 2 })];
  const remote = [row('a'), row('b', { v: 2 })];
  const first = planSync({ local, remote, meta: {} });
  const second = planSync({ local, remote, meta: first.meta });
  assert.equal(second.push.length + second.pull.length + second.tombstone.length + second.removeLocal.length, 0);
});
