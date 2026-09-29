import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPeriodRecap, compareRecaps, defaultPeriod, listPeriods, monthStartMs, previousPeriod, rrForPeriod, weekStartMs } from './wrappedStats.js';

const ME = { puuid: 'me', name: 'Moi', tag: 'FR1', team: 'Blue' };
const at = (iso) => Date.parse(iso) / 1000;

function game(iso, { won = true, kills = 15, deaths = 10, agent = 'Jett', map = 'Ascent', season = 'act1', length = 1800 } = {}) {
  return {
    metadata: { game_start: at(iso), game_length: length, map, season_id: season, mode_id: 'competitive', matchid: iso },
    players: { all_players: [{ ...ME, character: agent, stats: { kills, deaths, assists: 3, headshots: 10, bodyshots: 30, legshots: 0 } }] },
    teams: { blue: { has_won: won, rounds_won: won ? 13 : 8 }, red: { has_won: !won, rounds_won: won ? 8 : 13 } },
    rounds: [],
  };
}

// Les parties sont à midi pour éviter les effets de fuseau sur les bornes de jour.
const W1 = [game('2026-09-15T12:00:00'), game('2026-09-16T12:00:00', { won: false }), game('2026-09-17T12:00:00')];
const W2 = [game('2026-09-22T12:00:00'), game('2026-09-23T12:00:00')];
const NOW = new Date('2026-09-30T12:00:00').getTime();

test('weekStartMs : lundi 00h00 local', () => {
  const monday = new Date(weekStartMs(new Date('2026-09-17T12:00:00').getTime()));
  assert.equal(monday.getDay(), 1);
  assert.equal(monday.getHours(), 0);
  const sunday = new Date(weekStartMs(new Date('2026-09-20T12:00:00').getTime()));
  assert.equal(sunday.getDate(), 14);
});

test("listPeriods (semaine) : groupées, la plus récente d'abord, complétude", () => {
  const periods = listPeriods('week', [...W1, ...W2], NOW);
  assert.equal(periods.length, 2);
  assert.equal(periods[0].matches.length, 2);
  assert.equal(periods[0].complete, true);
  assert.equal(periods[1].matches.length, 3);
});

test('defaultPeriod : dernière période terminée, sinon la plus récente', () => {
  const thisWeek = [game('2026-09-29T10:00:00')];
  const periods = listPeriods('week', [...thisWeek, ...W2], NOW);
  assert.equal(periods[0].complete, false);
  assert.equal(defaultPeriod(periods).matches.length, 2);
  const onlyCurrent = listPeriods('week', thisWeek, NOW);
  assert.equal(defaultPeriod(onlyCurrent).matches.length, 1);
  assert.equal(defaultPeriod([]), null);
});

test('previousPeriod : semaine adjacente uniquement, mois précédent, acte plus ancien', () => {
  const weeks = listPeriods('week', [...W1, ...W2], NOW);
  assert.equal(previousPeriod(weeks, weeks[0]).matches.length, 3);
  assert.equal(previousPeriod(weeks, weeks[1]), null);

  const gap = listPeriods('week', [...W2, game('2026-09-01T12:00:00')], NOW);
  assert.equal(previousPeriod(gap, gap[0]), null);

  const months = listPeriods('month', [game('2026-08-20T12:00:00'), game('2026-09-05T12:00:00')], NOW);
  assert.equal(months[0].start, monthStartMs(new Date('2026-09-05T12:00:00').getTime()));
  assert.equal(previousPeriod(months, months[0]).matches.length, 1);

  const acts = listPeriods('act', [game('2026-06-01T12:00:00', { season: 'a1' }), game('2026-09-01T12:00:00', { season: 'a2' })], NOW);
  assert.equal(acts[0].id, 'a2');
  assert.equal(previousPeriod(acts, acts[0]).id, 'a1');
  assert.equal(previousPeriod(acts, acts[1]), null);
});

test('buildPeriodRecap : victoires, défaites, K/D, records, série', () => {
  const recap = buildPeriodRecap(
    [
      game('2026-09-15T12:00:00', { won: true, kills: 20, deaths: 10, agent: 'Jett', map: 'Ascent' }),
      game('2026-09-15T14:00:00', { won: true, kills: 12, deaths: 12, agent: 'Jett', map: 'Ascent' }),
      game('2026-09-15T16:00:00', { won: false, kills: 8, deaths: 16, agent: 'Sage', map: 'Bind' }),
      game('2026-09-15T18:00:00', { won: true, kills: 25, deaths: 5, agent: 'Jett', map: 'Ascent' }),
    ],
    'Moi',
    'FR1',
  );
  assert.equal(recap.games, 4);
  assert.equal(recap.wins, 3);
  assert.equal(recap.losses, 1);
  assert.equal(recap.winrate, 75);
  assert.equal(recap.kills, 65);
  assert.equal(recap.bestAgent.key, 'Jett');
  assert.equal(recap.bestKdMatch.kills, 25);
  assert.equal(recap.mostKillsMatch.kills, 25);
  assert.equal(recap.longestWinStreak, 2);
  assert.equal(recap.playtimeSeconds, 7200);
  assert.equal(recap.bestMap.key, 'Ascent');
  assert.equal(recap.topAgents.length, 2);
});

test('buildPeriodRecap : rien -> null', () => {
  assert.equal(buildPeriodRecap([], 'Moi', 'FR1'), null);
});

test('compareRecaps : écarts, null si pas de période précédente', () => {
  const a = { games: 10, winrate: 60, kd: 1.2, hsPercent: 25 };
  const b = { games: 6, winrate: 50, kd: 1.4, hsPercent: null };
  const delta = compareRecaps(a, b);
  assert.equal(delta.games, 4);
  assert.equal(delta.winrate, 10);
  assert.ok(Math.abs(delta.kd + 0.2) < 1e-9);
  assert.equal(delta.hsPercent, null);
  assert.equal(compareRecaps(a, null), null);
});

test("rrForPeriod : RR net sur la période, partiel si l'historique est trop court", () => {
  const history = [
    { date: '2026-09-16T10:00:00Z', change: 18, tierName: 'Gold 2', rr: 40 },
    { date: '2026-09-17T10:00:00Z', change: -12, tierName: 'Gold 2', rr: 28 },
    { date: '2026-09-25T10:00:00Z', change: 20, tierName: 'Gold 3', rr: 10 },
  ];
  const start = Date.parse('2026-09-14T00:00:00Z');
  const end = Date.parse('2026-09-21T00:00:00Z');
  const now = Date.parse('2026-09-30T00:00:00Z');
  const week = rrForPeriod(history, start, end, now);
  assert.equal(week.net, 6);
  assert.equal(week.games, 2);
  assert.equal(week.endTierName, 'Gold 2');
  assert.equal(week.partial, false);
  assert.equal(rrForPeriod(history, Date.parse('2026-09-01T00:00:00Z'), Date.parse('2026-09-10T00:00:00Z'), now), null);
  // Période commencée il y a plus de 30 jours : l'historique conservé ne suffit pas.
  assert.equal(rrForPeriod(history, Date.parse('2026-08-01T00:00:00Z'), Date.parse('2026-10-01T00:00:00Z'), now).partial, true);
  // Historique plein (20 parties) qui ne remonte pas jusqu'au début : partiel aussi.
  const full = Array.from({ length: 20 }, (_, i) => ({ date: new Date(Date.parse('2026-09-20T00:00:00Z') + i * 3600e3).toISOString(), change: 1, tierName: 'Gold 1', rr: 1 }));
  assert.equal(rrForPeriod(full, Date.parse('2026-09-14T00:00:00Z'), Date.parse('2026-09-30T00:00:00Z'), now).partial, true);
});
