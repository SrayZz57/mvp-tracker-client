import test from 'node:test';
import assert from 'node:assert/strict';
import { computePlayerRecord, listRegulars } from './playerRecord.js';

const ME = { puuid: 'me', name: 'Moi', tag: 'FR1' };
const BUD = { puuid: 'bud', name: 'Bud', tag: 'A1' };
const RIV = { puuid: 'riv', name: 'Riv', tag: 'B2' };
const DAY = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 8, 1, 12);

// side : équipe de Bud et Riv par rapport à moi (Blue).
function game(daysAgo, { won = true, budTeam = 'Blue', rivTeam = 'Red', kills = 15, deaths = 10, hs = 10, body = 30, duels = [], damage = 150, mode = 'competitive' } = {}) {
  const kill = (killer, victim) => ({ kill_time_in_round: 5000, killer_puuid: killer, victim_puuid: victim });
  return {
    metadata: { game_start: (T0 - daysAgo * DAY) / 1000, game_length: 1800, map: 'Ascent', mode_id: mode, matchid: `m${daysAgo}` },
    players: {
      all_players: [
        { ...ME, team: 'Blue', character: 'Jett', stats: { kills, deaths, assists: 2, headshots: hs, bodyshots: body, legshots: 0 } },
        { ...BUD, team: budTeam, character: 'Sage', stats: {} },
        { ...RIV, team: rivTeam, character: 'Raze', stats: {} },
      ],
    },
    teams: { blue: { has_won: won, rounds_won: won ? 13 : 8 }, red: { has_won: !won, rounds_won: won ? 8 : 13 } },
    rounds: [
      {
        winning_team: won ? 'Blue' : 'Red',
        player_stats: [{ player_puuid: 'me', damage, kill_events: duels.map(([a, b]) => kill(a, b)) }],
      },
    ],
  };
}

test('listRegulars : joueurs croisés au moins 2 fois, dans un camp ou l\'autre, les plus fréquents d\'abord', () => {
  const matches = [game(1), game(2), game(3, { budTeam: 'Red', rivTeam: 'Blue' }), game(10, { mode: 'deathmatch' })];
  const regulars = listRegulars(matches, 'Moi', 'FR1');
  assert.equal(regulars.length, 2);
  assert.equal(regulars[0].total, 3);
  const bud = regulars.find((p) => p.puuid === 'bud');
  assert.deepEqual([bud.together, bud.against], [2, 1]);
  // Le Deathmatch n'est pas une partie standard : ignoré.
  assert.equal(listRegulars([game(1), game(10, { mode: 'deathmatch' })], 'Moi', 'FR1').length, 0);
  assert.equal(listRegulars(matches, 'Moi', 'FR1', 4).length, 0);
});

test('fiche : parties ensemble et face à face séparées, avec le bilan de chaque cas', () => {
  const matches = [
    game(1, { won: true }),
    game(2, { won: false }),
    game(3, { won: true }),
    game(4, { won: true, budTeam: 'Red', rivTeam: 'Blue' }),
    game(5, { won: false, budTeam: 'Red', rivTeam: 'Blue' }),
  ];
  const record = computePlayerRecord(matches, 'Moi', 'FR1', 'bud');
  assert.equal(record.total, 5);
  assert.deepEqual([record.together.games, record.together.wins, record.together.losses], [3, 2, 1]);
  assert.deepEqual([record.against.games, record.against.wins, record.against.losses], [2, 1, 1]);
  assert.ok(Math.abs(record.together.winrate - (2 / 3) * 100) < 1e-9);
  assert.equal(record.against.winrate, 50);
  assert.equal(record.solid, true);
  assert.equal(record.games.length, 5);
  assert.equal(record.games[0].side, 'together'); // plus récente d'abord
  assert.equal(record.together.theirAgents[0].agent, 'Sage');
  assert.equal(record.together.myAgents[0].agent, 'Jett');
  assert.ok(record.firstPlayed < record.lastPlayed);
});

test('fiche : mes performances avec lui comparées à ma moyenne', () => {
  const matches = [
    game(1, { kills: 25, deaths: 5, hs: 15, body: 25, damage: 200 }),
    game(2, { kills: 25, deaths: 5, hs: 15, body: 25, damage: 200 }),
    game(3, { kills: 10, deaths: 20, hs: 5, body: 35, damage: 100, budTeam: 'Red', rivTeam: 'Blue' }),
    game(4, { kills: 10, deaths: 20, hs: 5, body: 35, damage: 100, budTeam: 'Red', rivTeam: 'Blue' }),
  ];
  const record = computePlayerRecord(matches, 'Moi', 'FR1', 'bud');
  assert.equal(record.together.kd, 5);
  assert.equal(record.against.kd, 0.5);
  assert.equal(record.together.adr, 200);
  assert.equal(record.baseline.games, 4);
  assert.equal(record.baseline.adr, 150);
  assert.ok(record.together.hsPercent > record.baseline.hsPercent);
  assert.ok(record.against.hsPercent < record.baseline.hsPercent);
});

test('fiche : duels directs comptés dans les deux sens', () => {
  const matches = [
    game(1, { budTeam: 'Red', rivTeam: 'Blue', duels: [['me', 'bud'], ['me', 'bud'], ['bud', 'me']] }),
    game(2, { budTeam: 'Red', rivTeam: 'Blue', duels: [['bud', 'me']] }),
  ];
  const record = computePlayerRecord(matches, 'Moi', 'FR1', 'bud');
  assert.deepEqual(record.duels, { mine: 2, theirs: 2 });
});

test('fiche : pas de partie commune -> null ; échantillon court non « solide »', () => {
  assert.equal(computePlayerRecord([game(1)], 'Moi', 'FR1', 'inconnu'), null);
  const short = computePlayerRecord([game(1), game(2)], 'Moi', 'FR1', 'bud');
  assert.equal(short.solid, false);
  assert.equal(short.against.games, 0);
  assert.equal(short.against.winrate, null);
  assert.equal(short.against.kd, null);
});
