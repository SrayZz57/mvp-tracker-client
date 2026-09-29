import test from 'node:test';
import assert from 'node:assert/strict';
import { computeEvolution } from './evolution.js';

const ME = { puuid: 'me', name: 'Moi', tag: 'FR1', team: 'Blue' };
const DAY = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 0, 1, 12);

// n-ième partie (i = 0 la plus ancienne) : stats qui s'améliorent avec `skill`.
function game(i, { dayGap = 1, won, kills = 12, deaths = 12, hs = 6, body = 34, agent = 'Jett', map = 'Ascent', length = 1800, mode = 'competitive' } = {}) {
  return {
    metadata: { game_start: (T0 + i * dayGap * DAY) / 1000, game_length: length, map, mode_id: mode, matchid: `m${i}` },
    players: { all_players: [{ ...ME, character: agent, stats: { kills, deaths, assists: 3, headshots: hs, bodyshots: body, legshots: 0 } }] },
    teams: { blue: { has_won: won, rounds_won: won ? 13 : 8 }, red: { has_won: !won, rounds_won: won ? 8 : 13 } },
    rounds: [],
  };
}

// 60 parties : les 30 premières faibles, les 30 dernières nettement meilleures.
function improving() {
  return Array.from({ length: 60 }, (_, i) =>
    i < 30
      ? game(i, { won: i % 4 === 0, kills: 9, deaths: 15, hs: 4, body: 36 })
      : game(i, { won: i % 4 !== 0, kills: 18, deaths: 10, hs: 9, body: 31, agent: 'Reyna', map: 'Bind' }),
  );
}

test('aucune partie -> null', () => {
  assert.equal(computeEvolution([], [], 'Moi', 'FR1'), null);
});

test('progression : les 30 dernières parties contre les 30 premières', () => {
  const evo = computeEvolution(improving(), [], 'Moi', 'FR1');
  assert.equal(evo.totalGames, 60);
  assert.equal(evo.comparison.window, 30);
  assert.equal(evo.comparison.overall, 'progress');
  assert.equal(evo.comparison.metrics.winrate.verdict, 'up');
  assert.equal(evo.comparison.metrics.kd.verdict, 'up');
  assert.equal(evo.comparison.metrics.hs.verdict, 'up');
  assert.ok(evo.comparison.metrics.kd.now > evo.comparison.metrics.kd.start);
});

test('régression et stabilité détectées', () => {
  const declining = improving().reverse().map((m, i) => ({ ...m, metadata: { ...m.metadata, game_start: (T0 + i * DAY) / 1000 } }));
  assert.equal(computeEvolution(declining, [], 'Moi', 'FR1').comparison.overall, 'decline');
  const flat = Array.from({ length: 40 }, (_, i) => game(i, { won: i % 2 === 0 }));
  assert.equal(computeEvolution(flat, [], 'Moi', 'FR1').comparison.overall, 'stable');
});

test('trop peu de parties pour comparer', () => {
  const few = Array.from({ length: 12 }, (_, i) => game(i, { won: true }));
  const evo = computeEvolution(few, [], 'Moi', 'FR1');
  assert.equal(evo.comparison, null);
  assert.ok(evo.rolling.length > 0); // la courbe glissante existe dès 10 parties
});

test('courbe glissante : une fenêtre de 20 parties, plus récente à droite', () => {
  const evo = computeEvolution(improving(), [], 'Moi', 'FR1');
  assert.equal(evo.rolling.length, 41);
  assert.ok(evo.rolling[evo.rolling.length - 1].kd > evo.rolling[0].kd);
  assert.ok(evo.rolling[0].at < evo.rolling[evo.rolling.length - 1].at);
});

test('agents et maps : première partie, nombre de parties', () => {
  const evo = computeEvolution(improving(), [], 'Moi', 'FR1');
  const reyna = evo.agents.find((a) => a.key === 'Reyna');
  assert.equal(reyna.games, 30);
  assert.equal(reyna.firstAt, (T0 + 30 * DAY));
  assert.equal(evo.maps.find((m) => m.key === 'Bind').games, 30);
});

test('sessions : parties rapprochées regroupées, durée et jeu total', () => {
  // 3 sessions de 3 parties (10 min entre les débuts), séparées de plusieurs jours.
  const games = [];
  for (let s = 0; s < 3; s += 1) {
    for (let g = 0; g < 3; g += 1) {
      const m = game(0, { won: true });
      m.metadata.game_start = (T0 + s * 5 * DAY + g * 40 * 60000) / 1000;
      m.metadata.matchid = `s${s}g${g}`;
      games.push(m);
    }
  }
  const evo = computeEvolution(games, [], 'Moi', 'FR1');
  assert.equal(evo.sessions.count, 3);
  assert.equal(evo.sessions.avgGames, 3);
  assert.equal(evo.sessions.playtimeMs, 9 * 1800 * 1000);
  assert.equal(evo.sessions.longest.games, 3);
});

test('jalons : 1re partie, 10 / 25 / 50 parties, série de victoires, nouvel agent', () => {
  const evo = computeEvolution(improving(), [], 'Moi', 'FR1');
  const types = evo.milestones.map((m) => m.type);
  assert.ok(types.includes('first'));
  assert.deepEqual(evo.milestones.filter((m) => m.type === 'games').map((m) => m.count).sort((a, b) => a - b), [10, 25, 50]);
  assert.ok(evo.milestones.some((m) => m.type === 'agent' && m.agent === 'Reyna'));
  // Triés du plus récent au plus ancien.
  for (let i = 1; i < evo.milestones.length; i += 1) assert.ok(evo.milestones[i - 1].at >= evo.milestones[i].at);
  const winStreak = Array.from({ length: 8 }, (_, i) => game(i, { won: true }));
  assert.equal(computeEvolution(winStreak, [], 'Moi', 'FR1').streaks[0].length, 8);
});

test('records battus au fil du temps (kills, K/D, précision tête)', () => {
  const games = [
    ...Array.from({ length: 6 }, (_, i) => game(i, { won: true, kills: 10, deaths: 10 })),
    game(6, { won: true, kills: 20, deaths: 5, hs: 10, body: 30 }),
    game(7, { won: true, kills: 30, deaths: 5, hs: 12, body: 28 }),
  ];
  const evo = computeEvolution(games, [], 'Moi', 'FR1');
  const kills = evo.records.filter((r) => r.metric === 'kills');
  assert.deepEqual(kills.map((r) => r.value), [30, 20]); // plus récent d'abord
  assert.ok(evo.records.some((r) => r.metric === 'kd'));
  assert.ok(evo.milestones.some((m) => m.type === 'record' && m.metric === 'kills' && m.value === 30));
});

test('rang : points, promotion (première fois), pic, début du suivi', () => {
  const snaps = [
    { at: T0, tierId: 12, tierName: 'Silver 3', rr: 50, elo: 950, source: 'game' },
    { at: T0 + DAY, tierId: 13, tierName: 'Gold 1', rr: 5, elo: 1005, source: 'game' },
    { at: T0 + 2 * DAY, tierId: 12, tierName: 'Silver 3', rr: 90, elo: 990, source: 'game' },
    { at: T0 + 3 * DAY, tierId: 13, tierName: 'Gold 1', rr: 20, elo: 1020, source: 'sync' },
  ];
  const evo = computeEvolution(improving(), snaps, 'Moi', 'FR1');
  assert.equal(evo.rank.trackedSince, T0);
  assert.equal(evo.rank.peak.elo, 1020);
  assert.deepEqual(evo.rank.changes.map((c) => c.type), ['promotion', 'demotion', 'promotion']);
  assert.deepEqual(evo.rank.changes.map((c) => c.firstTime), [true, false, false]);
  assert.equal(evo.milestones.filter((m) => m.type === 'rankUp').length, 1);
  assert.equal(computeEvolution(improving(), [], 'Moi', 'FR1').rank, null);
});
