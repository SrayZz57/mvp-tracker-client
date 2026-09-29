import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateDuelZones, duelsOnMap, rankZones, worldToMap } from './duelHeatmap.js';

const ME = { puuid: 'me', name: 'Moi', tag: 'FR1', team: 'Blue' };
const ENEMY = { puuid: 'foe', name: 'Foe', tag: 'EU1', team: 'Red' };

function kill(killer, victim, victimAt, killerAt) {
  return {
    killer_puuid: killer.puuid,
    killer_display_name: `${killer.name}#${killer.tag}`,
    victim_puuid: victim.puuid,
    victim_display_name: `${victim.name}#${victim.tag}`,
    victim_death_location: victimAt,
    player_locations_on_kill: killerAt ? [{ player_puuid: killer.puuid, location: killerAt }] : [],
  };
}

function match(id, kills) {
  return {
    metadata: { matchid: id, map: 'Ascent', mode_id: 'competitive' },
    players: { all_players: [ME, ENEMY] },
    rounds: [{ player_stats: [{ player_puuid: ME.puuid, kill_events: kills }] }],
  };
}

test('un kill du joueur est un duel gagné, sa mort un duel perdu', () => {
  const duels = duelsOnMap(
    [match('m1', [kill(ME, ENEMY, { x: 0, y: 0 }), kill(ENEMY, ME, { x: 100, y: 100 })])],
    'Moi',
    'FR1',
    'Ascent',
  );
  assert.equal(duels.length, 2);
  assert.equal(duels[0].won, true);
  assert.equal(duels[1].won, false);
  assert.equal(duels[0].matchId, 'm1');
});

test('chaque duel garde adversaire, arme, distance et round pour le détail', () => {
  const foe = { ...ENEMY, character: 'Jett' };
  const withWeapon = { ...kill(ME, ENEMY, { x: 0, y: 0 }, { x: 300, y: 400 }), damage_weapon_name: 'Vandal' };
  const m = { ...match('m1', [withWeapon]), players: { all_players: [ME, foe] } };
  m.metadata.game_start = 1700000000;
  const [duel] = duelsOnMap([m], 'Moi', 'FR1', 'Ascent');
  assert.equal(duel.enemyName, 'Foe#EU1');
  assert.equal(duel.enemyAgent, 'Jett');
  assert.equal(duel.weapon, 'Vandal');
  assert.equal(duel.distance, 5);
  assert.equal(duel.roundIndex, 0);
  assert.equal(duel.gameStart, 1700000000);
});

test("en cas de défaite l'adversaire est le tueur", () => {
  const [duel] = duelsOnMap([match('m1', [kill(ENEMY, ME, { x: 1, y: 1 })])], 'Moi', 'FR1', 'Ascent');
  assert.equal(duel.won, false);
  assert.equal(duel.enemyName, 'Foe#EU1');
});

test('le duel est placé au milieu entre le tueur et la victime', () => {
  const [duel] = duelsOnMap([match('m1', [kill(ME, ENEMY, { x: 1000, y: 0 }, { x: 0, y: 400 })])], 'Moi', 'FR1', 'Ascent');
  assert.equal(duel.x, 500);
  assert.equal(duel.y, 200);
});

test('sans position du tueur, on garde le point de mort de la victime', () => {
  const [duel] = duelsOnMap([match('m1', [kill(ME, ENEMY, { x: 12, y: 34 })])], 'Moi', 'FR1', 'Ascent');
  assert.deepEqual([duel.x, duel.y], [12, 34]);
});

test('ni suicide (spike/chute), ni kill des autres, ni autre map', () => {
  const other = { puuid: 'x', name: 'X', tag: '1', team: 'Red' };
  const self = kill(ME, ME, { x: 1, y: 1 });
  const duels = duelsOnMap(
    [match('m1', [self, kill(other, ENEMY, { x: 1, y: 1 })]), { ...match('m2', [kill(ME, ENEMY, { x: 1, y: 1 })]), metadata: { matchid: 'm2', map: 'Bind', mode_id: 'competitive' } }],
    'Moi',
    'FR1',
    'Ascent',
  );
  assert.equal(duels.length, 0);
});

test('worldToMap suit la formule de la minimap', () => {
  const coords = { xMultiplier: 0.001, xScalarToAdd: 0.5, yMultiplier: 0.002, yScalarToAdd: 0.25 };
  assert.deepEqual(worldToMap({ x: 100, y: 200 }, coords), { fx: 0.7, fy: 0.45 });
});

test('aggregateDuelZones regroupe par zone et calcule le taux de réussite', () => {
  // x et y du monde = position minimap directe avec ces facteurs (fx = y, fy = x).
  const coords = { xMultiplier: 1, xScalarToAdd: 0, yMultiplier: 1, yScalarToAdd: 0 };
  const duels = [
    { x: 0.1, y: 0.1, won: true },
    { x: 0.11, y: 0.11, won: true },
    { x: 0.12, y: 0.1, won: false },
    { x: 0.9, y: 0.9, won: false },
    { x: 5, y: 5, won: true }, // hors carte : ignoré
  ];
  const result = aggregateDuelZones(duels, coords, 10);
  assert.equal(result.total, 4);
  assert.equal(result.wins, 2);
  assert.equal(result.losses, 2);
  assert.equal(result.rate, 0.5);
  assert.equal(result.zones.length, 2);
  const busy = result.zones.find((z) => z.total === 3);
  assert.equal(busy.wins, 2);
  assert.ok(Math.abs(busy.rate - 2 / 3) < 1e-9);
  assert.equal(busy.reliable, true);
  assert.equal(busy.duels.length, 3);
  assert.equal(result.zones.find((z) => z.total === 1).reliable, false);
});

test('aggregateDuelZones : aucun duel -> taux nul, pas de division par zéro', () => {
  const result = aggregateDuelZones([], { xMultiplier: 1, xScalarToAdd: 0, yMultiplier: 1, yScalarToAdd: 0 });
  assert.equal(result.total, 0);
  assert.equal(result.rate, null);
  assert.deepEqual(result.zones, []);
});

test('rankZones : meilleures et pires zones fiables, sans chevauchement', () => {
  const zone = (col, wins, losses) => ({ col, row: 0, wins, losses, total: wins + losses, rate: wins / (wins + losses), reliable: wins + losses >= 3 });
  const zones = [zone(0, 9, 1), zone(1, 5, 5), zone(2, 1, 6), zone(3, 4, 0), zone(4, 2, 1), zone(5, 0, 2), zone(6, 3, 8)];
  const { best, worst } = rankZones(zones, 2);
  assert.deepEqual(best.map((z) => z.col), [3, 0]);
  assert.deepEqual(worst.map((z) => z.col), [2, 6]);
  // 50 % exact et zone trop peu fournie (0-2) : dans aucun classement.
  assert.ok(![...best, ...worst].some((z) => z.col === 1 || z.col === 5));
});

test('rankZones : rien de fiable -> deux listes vides', () => {
  const { best, worst } = rankZones([{ col: 0, row: 0, wins: 1, losses: 0, total: 1, rate: 1, reliable: false }]);
  assert.deepEqual(best, []);
  assert.deepEqual(worst, []);
});
