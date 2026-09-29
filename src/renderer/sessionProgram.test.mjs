import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, compareReports, hydratePlan, liveProgress, matchesSince, serializePlan, sessionAdvice, warmupModeIds, warmupProgress } from './sessionProgram.js';

const ME = { puuid: 'me', name: 'Moi', tag: 'FR1', team: 'Blue' };
const ms = (iso) => Date.parse(iso);

function game(iso, { won = true, kills = 15, deaths = 10, hs = 10, body = 30 } = {}) {
  return {
    metadata: { game_start: ms(iso) / 1000, game_length: 1800, map: 'Ascent', season_id: 'a', mode_id: 'competitive' },
    players: { all_players: [{ ...ME, character: 'Jett', stats: { kills, deaths, assists: 2, headshots: hs, bodyshots: body, legshots: 0 } }] },
    teams: { blue: { has_won: won, rounds_won: won ? 13 : 8 }, red: { has_won: !won, rounds_won: won ? 8 : 13 } },
    rounds: [],
  };
}

const plan = { warmup: { minutes: 10, reason: 'r' }, targetMap: 'Ascent', tilt: { isTilted: false }, matchCount: 3, hsTarget: 25, objective: 'o' };
const saved = serializePlan(plan);
const START = ms('2026-09-30T18:00:00');

test('serializePlan / hydratePlan : aller-retour sans perte', () => {
  const back = hydratePlan(JSON.parse(JSON.stringify(saved)));
  assert.equal(back.warmup.minutes, 10);
  assert.equal(back.tilt.isTilted, false);
  assert.equal(back.matchCount, 3);
  assert.equal(back.targetMap, 'Ascent');
});

test('matchesSince : seulement les parties commencées après le lancement', () => {
  const list = [game('2026-09-30T17:00:00'), game('2026-09-30T18:30:00'), game('2026-09-30T19:30:00')];
  assert.equal(matchesSince(list, START).length, 2);
  assert.equal(matchesSince(list, START, ms('2026-09-30T19:00:00')).length, 1);
});

test('sessionAdvice : pause > objectif atteint > dernière partie > en cours', () => {
  assert.equal(sessionAdvice({ played: 0, target: 3, losingStreak: 0 }, saved), 'start');
  assert.equal(sessionAdvice({ played: 1, target: 3, losingStreak: 0 }, saved), 'go');
  assert.equal(sessionAdvice({ played: 2, target: 3, losingStreak: 0 }, saved), 'last');
  assert.equal(sessionAdvice({ played: 3, target: 3, losingStreak: 0 }, saved), 'done');
  assert.equal(sessionAdvice({ played: 3, target: 3, losingStreak: 3 }, saved), 'pause');
  // En tilt au départ, la pause se déclenche plus tôt (2 défaites).
  assert.equal(sessionAdvice({ played: 2, target: 3, losingStreak: 2 }, { ...saved, tilted: true }), 'pause');
  assert.equal(sessionAdvice({ played: 2, target: 3, losingStreak: 2 }, saved), 'last');
});

test('liveProgress : compteur, stats de session et série de défaites en cours', () => {
  const played = [
    game('2026-09-30T18:10:00', { won: true }),
    game('2026-09-30T18:50:00', { won: false }),
    game('2026-09-30T19:30:00', { won: false }),
  ];
  const p = liveProgress(saved, played, 'Moi', 'FR1');
  assert.equal(p.played, 3);
  assert.equal(p.wins, 1);
  assert.equal(p.losses, 2);
  assert.equal(p.losingStreak, 2);
  assert.equal(p.advice, 'done');
  assert.equal(liveProgress(saved, [], 'Moi', 'FR1').advice, 'start');
});

test('buildReport : objectif atteint ou non, durée', () => {
  const played = [game('2026-09-30T18:10:00', { hs: 12, body: 28 }), game('2026-09-30T18:50:00', { hs: 12, body: 28 }), game('2026-09-30T19:30:00', { hs: 12, body: 28 })];
  const report = buildReport(saved, played, 'Moi', 'FR1', START, START + 90 * 60000);
  assert.equal(report.games, 3);
  assert.equal(report.durationMs, 90 * 60000);
  assert.equal(report.objective.gamesDone, true);
  assert.equal(report.objective.hsReached, true); // 30 % >= 25 %

  const low = buildReport(saved, [game('2026-09-30T18:10:00', { hs: 5, body: 35 })], 'Moi', 'FR1', START, START + 1000);
  assert.equal(low.objective.gamesDone, false);
  assert.equal(low.objective.hsReached, false);

  const none = buildReport(saved, [], 'Moi', 'FR1', START, START + 1000);
  assert.equal(none.games, 0);
  assert.equal(none.objective.hsReached, null);
});

test('compareReports : écarts avec la session précédente, null sans précédente', () => {
  const a = { games: 3, winrate: 66, kd: 1.3, hsPercent: 30 };
  const b = { games: 2, winrate: 50, kd: 1.0, hsPercent: 24 };
  const d = compareReports(a, b);
  assert.equal(d.games, 1);
  assert.equal(d.winrate, 16);
  assert.equal(compareReports(a, null), null);
});

function modeGame(iso, modeId) {
  const g = game(iso);
  g.metadata.mode_id = modeId;
  return g;
}

test("matchesSince : les modes prévus en échauffement ne comptent pas comme parties de session", () => {
  const list = [modeGame('2026-09-30T18:10:00', 'competitive'), modeGame('2026-09-30T18:20:00', 'spikerush'), modeGame('2026-09-30T18:30:00', 'deathmatch')];
  // Le Deathmatch n'est de toute façon jamais une partie standard.
  assert.equal(matchesSince(list, START).length, 2);
  // Spike Rush prévu en échauffement : exclu à son tour.
  assert.deepEqual(matchesSince(list, START, Infinity, ['spikerush']).map((m) => m.metadata.mode_id), ['competitive']);
});

test('warmupModeIds : seulement les étapes suivies (pas le champ de tir)', () => {
  const plan = { warmupValorant: [{ mode: 'deathmatch', amount: 2 }, { mode: 'range', amount: 5 }, { mode: 'spikerush', amount: 1 }] };
  assert.deepEqual(warmupModeIds(plan), ['deathmatch', 'spikerush']);
  assert.deepEqual(warmupModeIds({}), []);
});

test('warmupProgress : Deathmatch comptés pour l\'échauffement, depuis la préparation du plan', () => {
  const plan = { warmupValorant: [{ mode: 'deathmatch', amount: 2 }, { mode: 'range', amount: 5 }] };
  const list = [modeGame('2026-09-30T17:40:00', 'deathmatch'), modeGame('2026-09-30T17:55:00', 'deathmatch'), modeGame('2026-09-30T18:10:00', 'competitive')];
  const since = ms('2026-09-30T17:30:00');
  const [dm, range] = warmupProgress(plan, list, 'Moi', 'FR1', since);
  assert.deepEqual([dm.played, dm.target, dm.done, dm.tracked], [2, 2, true, true]);
  assert.equal(range.tracked, false);
  // Avant le début de la fenêtre : rien.
  assert.equal(warmupProgress(plan, list, 'Moi', 'FR1', ms('2026-09-30T17:50:00'))[0].played, 1);
});

test('buildReport garde le bilan de l\'échauffement (étapes suivies)', () => {
  const warmup = [{ mode: 'deathmatch', tracked: true, target: 2, played: 1, done: false }, { mode: 'range', tracked: false, target: 5, played: 0, done: false }];
  const report = buildReport(saved, [], 'Moi', 'FR1', START, START + 1000, warmup);
  assert.deepEqual(report.warmup, [{ mode: 'deathmatch', target: 2, played: 1 }]);
});

test('le plan sauvegardé garde les étapes Valorant et le moment de préparation', () => {
  const back = hydratePlan(JSON.parse(JSON.stringify(serializePlan({ ...plan, warmupValorant: [{ mode: 'deathmatch', amount: 1 }], preparedAt: 1234 }))));
  assert.deepEqual(back.warmupValorant, [{ mode: 'deathmatch', amount: 1 }]);
  assert.equal(back.preparedAt, 1234);
});
