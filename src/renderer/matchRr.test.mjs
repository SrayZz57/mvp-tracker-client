import test from 'node:test';
import assert from 'node:assert/strict';
import { rrByMatch } from './matchRr.js';

const at = (iso) => Date.parse(iso) / 1000;
const match = (id, iso, { map = 'Ascent', mode = 'competitive', length = 1800 } = {}) => ({
  metadata: { matchid: id, game_start: at(iso), game_length: length, map, mode_id: mode },
});
// La date d'une entrée de RR est l'heure de début de la partie.
const entry = (iso, change, extra = {}) => ({ date: iso, change, map: 'Ascent', ...extra });

test('rrByMatch : identifiant de partie prioritaire', () => {
  const m = [match('a', '2026-09-30T18:00:00Z')];
  const h = [entry('2026-09-30T18:00:00Z', 17, { matchId: 'a' }), entry('2026-09-30T18:00:10Z', -9)];
  assert.equal(rrByMatch(m, h).get('a'), 17);
});

test('rrByMatch : repli sur l\'heure de début et la carte', () => {
  const m = [match('a', '2026-09-30T18:00:00Z'), match('b', '2026-09-30T19:00:00Z', { map: 'Haven' })];
  const h = [entry('2026-09-30T18:00:20Z', 15), entry('2026-09-30T19:00:05Z', -12, { map: 'Haven' })];
  const out = rrByMatch(m, h);
  assert.equal(out.get('a'), 15);
  assert.equal(out.get('b'), -12);
});

test('rrByMatch : une entrée ne sert qu\'une fois, la plus proche gagne', () => {
  const m = [match('a', '2026-09-30T18:00:00Z'), match('b', '2026-09-30T18:01:00Z')];
  const h = [entry('2026-09-30T18:01:10Z', 20)];
  const out = rrByMatch(m, h);
  assert.equal(out.size, 1);
  assert.equal(out.get('b'), 20);
});

test('rrByMatch : seulement les parties classées, jamais une autre carte, jamais trop loin', () => {
  const m = [match('u', '2026-09-30T18:00:00Z', { mode: 'unrated' }), match('f', '2026-09-30T20:00:00Z', { map: 'Bind' })];
  const h = [entry('2026-09-30T18:00:00Z', 14), entry('2026-09-30T20:00:00Z', 10), entry('2026-09-30T20:30:00Z', 8, { map: 'Bind' })];
  assert.equal(rrByMatch(m, h).size, 0);
});

test('rrByMatch : sans historique, rien', () => {
  assert.equal(rrByMatch([match('a', '2026-09-30T18:00:00Z')], []).size, 0);
  assert.equal(rrByMatch([match('a', '2026-09-30T18:00:00Z')], null).size, 0);
});
