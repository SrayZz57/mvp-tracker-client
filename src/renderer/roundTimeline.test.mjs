import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, classifyBuy } from './roundTimeline.js';

const ME = { puuid: 'me', name: 'Moi', tag: 'FR1', team: 'Blue', character: 'Jett' };
const ALLY = { puuid: 'ally', name: 'Ally', tag: '1', team: 'Blue', character: 'Sage' };
const F1 = { puuid: 'f1', name: 'Foe1', tag: '1', team: 'Red', character: 'Raze' };
const F2 = { puuid: 'f2', name: 'Foe2', tag: '2', team: 'Red', character: 'Reyna' };

const stat = (p, loadout, kills = []) => ({
  player_puuid: p.puuid,
  player_team: p.team,
  economy: { loadout_value: loadout },
  kills: kills.length,
  damage: 100,
  score: 200,
  kill_events: kills,
});
const kill = (killer, victim, time) => ({
  kill_time_in_round: time,
  killer_puuid: killer.puuid,
  killer_display_name: `${killer.name}#${killer.tag}`,
  killer_team: killer.team,
  victim_puuid: victim.puuid,
  victim_display_name: `${victim.name}#${victim.tag}`,
  victim_team: victim.team,
  damage_weapon_name: 'Vandal',
});

function makeMatch(rounds) {
  return {
    metadata: { mode_id: 'competitive' },
    players: { all_players: [ME, ALLY, F1, F2] },
    rounds,
  };
}
const round = (winning_team, stats, extra = {}) => ({ winning_team, end_type: 'Eliminated', player_stats: stats, ...extra });

test('score cumulé, issue et écart après chaque round', () => {
  const t = buildTimeline(
    makeMatch([
      round('Blue', [stat(ME, 4000), stat(F1, 4000)]),
      round('Red', [stat(ME, 4000), stat(F1, 4000)]),
      round('Blue', [stat(ME, 4000), stat(F1, 4000)]),
    ]),
    ME,
  );
  assert.deepEqual(t.rounds.map((r) => r.won), [true, false, true]);
  assert.deepEqual(t.rounds.map((r) => r.score), [{ me: 1, enemy: 0 }, { me: 1, enemy: 1 }, { me: 2, enemy: 1 }]);
  assert.deepEqual(t.momentum, [0, 1, 0, 1]);
});

test('séries : 3 rounds ou plus d\'affilée deviennent un moment clé', () => {
  const rounds = ['Blue', 'Blue', 'Blue', 'Red', 'Red'].map((w) => round(w, [stat(ME, 4000)]));
  const t = buildTimeline(makeMatch(rounds), ME);
  const streaks = t.moments.filter((m) => m.kind === 'streak');
  assert.equal(streaks.length, 1);
  assert.deepEqual([streaks[0].round, streaks[0].length, streaks[0].won], [0, 3, true]);
  assert.equal(t.rounds[1].run.position, 2);
});

test('clutch : dernier vivant de mon équipe face à un adversaire', () => {
  const stats = [
    stat(ME, 4000, [kill(ME, F1, 30000)]),
    stat(ALLY, 4000),
    stat(F1, 4000),
    stat(F2, 4000, [kill(F2, ALLY, 10000)]),
  ];
  const t = buildTimeline(makeMatch([round('Blue', stats)]), ME);
  assert.deepEqual(t.rounds[0].clutch, { versus: 2, won: true });
  assert.equal(t.moments.some((m) => m.kind === 'clutch'), true);
});

test('ace et multi-kills', () => {
  const foes = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ puuid: id, name: id, tag: '1', team: 'Red' }));
  const aceKills = foes.map((f, i) => kill(ME, f, 5000 + i * 1000));
  const ace = buildTimeline(makeMatch([round('Blue', [stat(ME, 4000, aceKills)])]), ME);
  assert.equal(ace.rounds[0].ace, true);
  const triple = buildTimeline(makeMatch([round('Blue', [stat(ME, 4000, aceKills.slice(0, 3))])]), ME);
  assert.equal(triple.rounds[0].multiKill, 3);
  assert.equal(triple.rounds[0].ace, false);
});

test('économie : achat classé, round éco gagné contre un full buy', () => {
  assert.equal(classifyBuy(800, 5, true), 'eco');
  assert.equal(classifyBuy(2500, 5, true), 'semi');
  assert.equal(classifyBuy(4500, 5, true), 'full');
  assert.equal(classifyBuy(4500, 0, true), 'pistol');
  assert.equal(classifyBuy(null, 5, true), null);

  const t = buildTimeline(makeMatch([round('Blue', [stat(ME, 5000), stat(ALLY, 5000)]), round('Blue', [stat(ME, 900), stat(ALLY, 900), stat(F1, 4800), stat(F2, 4800)])]), ME);
  assert.equal(t.rounds[1].ecoWin, true);
  assert.equal(t.rounds[1].economy.myBuy, 'eco');
});

test('chronologie : kills triés, premier sang, pose du spike', () => {
  const stats = [stat(ME, 4000, [kill(ME, F1, 20000)]), stat(F2, 4000, [kill(F2, ALLY, 5000)])];
  const t = buildTimeline(
    makeMatch([
      round('Blue', stats, { plant_events: { plant_time_in_round: 12000, plant_site: 'A', planted_by: { display_name: 'Moi#FR1', team: 'Blue' } } }),
    ]),
    ME,
  );
  const r = t.rounds[0];
  assert.deepEqual(r.events.map((e) => e.type), ['kill', 'plant', 'kill']);
  assert.equal(r.firstBlood.byMe, false);
  assert.equal(r.firstBlood.allyKill, false);
  assert.equal(r.events[1].allyAction, true);
  assert.equal(r.events[2].byMe, true);
});

test('sans rounds ou sans joueur, pas de timeline', () => {
  assert.equal(buildTimeline(makeMatch([]), ME), null);
  assert.equal(buildTimeline(makeMatch([round('Blue', [])]), null), null);
});
