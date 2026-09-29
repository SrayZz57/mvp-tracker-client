import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTiltSignals } from './tiltSignals.js';

const ME = { puuid: 'me', name: 'Moi', tag: 'FR1', team: 'Blue' };
const FOE = { puuid: 'foe', name: 'Foe', tag: '1', team: 'Red' };
const MIN = 60000;
const BASE = Date.parse('2026-09-30T12:00:00Z');

// minutesAgo : début de la partie (il y a N minutes) ; length en secondes.
function game(minutesAgo, { won = true, kills = 15, deaths = 10, hs = 10, body = 30, firstDeath = false, length = 1800 } = {}) {
  const round = firstDeath
    ? { player_stats: [{ kill_events: [{ kill_time_in_round: 5000, killer_puuid: 'foe', victim_puuid: 'me' }] }] }
    : { player_stats: [{ kill_events: [{ kill_time_in_round: 5000, killer_puuid: 'me', victim_puuid: 'foe' }, { kill_time_in_round: 9000, killer_puuid: 'foe', victim_puuid: 'me' }] }] };
  return {
    metadata: { game_start: (BASE - minutesAgo * MIN) / 1000, game_length: length, mode_id: 'competitive', map: 'Ascent' },
    players: { all_players: [{ ...ME, stats: { kills, deaths, assists: 2, headshots: hs, bodyshots: body, legshots: 0 } }, FOE] },
    teams: { blue: { has_won: won, rounds_won: won ? 13 : 8 }, red: { has_won: !won, rounds_won: won ? 8 : 13 } },
    rounds: [round, round, round, round],
  };
}

const NOW = BASE + 10 * MIN;
const get = (result, id) => result.signals.find((s) => s.id === id);
// Six anciennes bonnes parties (référence), espacées de 3 h pour ne pas former une session.
const steady = (minutesAgo) => game(minutesAgo, { kills: 18, deaths: 10, hs: 14, body: 26 });
const oldGood = () => Array.from({ length: 6 }, (_, i) => game(600 + i * 180, { kills: 18, deaths: 10, hs: 14, body: 26 }));

test('série de défaites : 2 = à surveiller, 3 = alerte', () => {
  const two = computeTiltSignals([game(30, { won: false }), game(90, { won: false }), game(300), ...oldGood()], 'Moi', 'FR1', NOW);
  assert.equal(get(two, 'lossStreak').status, 'watch');
  const three = computeTiltSignals([game(30, { won: false }), game(90, { won: false }), game(150, { won: false }), game(400), ...oldGood()], 'Moi', 'FR1', NOW);
  assert.equal(get(three, 'lossStreak').status, 'alert');
  assert.equal(get(three, 'lossStreak').value, 3);
});

test('K/D : chute des 3 dernières parties face à la référence', () => {
  const bad = [game(30, { kills: 6, deaths: 15 }), game(200, { kills: 6, deaths: 15 }), game(400, { kills: 6, deaths: 15 }), ...oldGood()];
  const kd = get(computeTiltSignals(bad, 'Moi', 'FR1', NOW), 'kd');
  assert.equal(kd.status, 'alert');
  assert.equal(kd.lowReference, false);
  assert.ok(kd.value < kd.reference);
  const fine = get(computeTiltSignals([steady(30), steady(200), steady(400), ...oldGood()], 'Moi', 'FR1', NOW), 'kd');
  assert.notEqual(fine.status, 'alert');
});

test('premières morts : plus fréquentes qu\'à l\'habitude', () => {
  const recent = [game(30, { firstDeath: true }), game(200, { firstDeath: true }), game(400, { firstDeath: true })];
  const result = computeTiltSignals([...recent, ...oldGood()], 'Moi', 'FR1', NOW);
  const fd = get(result, 'firstDeaths');
  assert.equal(fd.status, 'alert');
  assert.ok(fd.value > fd.reference);
});

test('précision tête en baisse', () => {
  const recent = [game(30, { hs: 4, body: 36 }), game(200, { hs: 4, body: 36 }), game(400, { hs: 4, body: 36 })];
  assert.equal(get(computeTiltSignals([...recent, ...oldGood()], 'Moi', 'FR1', NOW), 'hs').status, 'alert');
});

test('session : longue durée seulement si elle est en cours', () => {
  // 5 parties enchaînées de 35 min chacune, sans pause > 45 min : ~3 h.
  const chain = Array.from({ length: 5 }, (_, i) => game(15 + i * 37, { length: 2100 }));
  const ongoing = get(computeTiltSignals([...chain, ...oldGood()], 'Moi', 'FR1', NOW), 'session');
  assert.equal(ongoing.status, 'watch');
  assert.equal(ongoing.session.games, 5);
  // Même enchaînement mais terminé depuis longtemps : pas une session en cours.
  const later = NOW + 5 * 3600000;
  assert.equal(get(computeTiltSignals([...chain, ...oldGood()], 'Moi', 'FR1', later), 'session').status, 'na');
});

test('niveau global : calme, à surveiller, signal fort', () => {
  const calm = computeTiltSignals([steady(30), steady(200), steady(400), ...oldGood()], 'Moi', 'FR1', NOW);
  assert.equal(calm.level, 'calm');
  const strong = computeTiltSignals(
    [game(30, { won: false, kills: 5, deaths: 16, hs: 3, body: 37 }), game(90, { won: false, kills: 5, deaths: 16, hs: 3, body: 37 }), game(150, { won: false, kills: 5, deaths: 16, hs: 3, body: 37 }), ...oldGood()],
    'Moi',
    'FR1',
    NOW,
  );
  assert.equal(strong.level, 'strong');
  assert.ok(strong.alerts >= 2);
});

test('inactif : plus de 1 h 30 sans partie, aucun niveau d\'alerte ni pause suggérée', () => {
  const bad = [game(30, { won: false, kills: 5, deaths: 16 }), game(90, { won: false, kills: 5, deaths: 16 }), game(150, { won: false, kills: 5, deaths: 16 }), ...oldGood()];
  // Juste après la dernière partie : le niveau reflète les signaux.
  const active = computeTiltSignals(bad, 'Moi', 'FR1', NOW);
  assert.equal(active.idle, false);
  assert.notEqual(active.level, 'calm');
  // Le lendemain : les mêmes parties ne doivent plus déclencher de suggestion.
  const nextDay = computeTiltSignals(bad, 'Moi', 'FR1', NOW + 20 * 3600000);
  assert.equal(nextDay.idle, true);
  assert.equal(nextDay.level, 'idle');
  assert.equal(nextDay.signalLevel, active.signalLevel); // les signaux restent consultables
  assert.ok(nextDay.idleMs > 19 * 3600000);
  // Limite : 80 min après la fin de la partie = encore actif, 100 min = inactif.
  const lastEnd = BASE - 30 * MIN + 1800 * 1000;
  assert.equal(computeTiltSignals(bad, 'Moi', 'FR1', lastEnd + 80 * MIN).idle, false);
  assert.equal(computeTiltSignals(bad, 'Moi', 'FR1', lastEnd + 100 * MIN).idle, true);
  // Aucun historique : pas « inactif », simplement calme.
  assert.equal(computeTiltSignals([], 'Moi', 'FR1', NOW).idle, false);
});

test('peu de parties : signaux non concluants et référence fragile signalée', () => {
  const few = computeTiltSignals([game(30), game(200)], 'Moi', 'FR1', NOW);
  assert.equal(get(few, 'kd').status, 'na');
  assert.equal(few.lowData, true);
  const lowRef = get(computeTiltSignals([game(30), game(200), game(400), game(600)], 'Moi', 'FR1', NOW), 'kd');
  assert.equal(lowRef.lowReference, true);
  assert.equal(computeTiltSignals([], 'Moi', 'FR1', NOW).level, 'calm');
});
