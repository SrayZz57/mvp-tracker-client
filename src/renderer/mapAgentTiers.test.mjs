import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAP_AGENT_STATS,
  MAP_AGENT_TIERS,
  MAP_PRO_PICKS,
  MIN_RELIABLE_MATCHES,
  VERDICT_THRESHOLDS,
  getAgentMapTier,
  proPickRate,
  rankAgentsOnMap,
  recommendComp,
  verdictFor,
} from './mapAgentTiers.js';

const ROLE_OF = {
  Jett: 'Duelliste', Raze: 'Duelliste', Neon: 'Duelliste', Phoenix: 'Duelliste', Reyna: 'Duelliste', Yoru: 'Duelliste',
  Sova: 'Initiateur', Fade: 'Initiateur', Skye: 'Initiateur', 'KAY/O': 'Initiateur', Tejo: 'Initiateur',
  Clove: 'Contrôleur', Omen: 'Contrôleur', Viper: 'Contrôleur', Brimstone: 'Contrôleur', Astra: 'Contrôleur',
  Killjoy: 'Sentinelle', Cypher: 'Sentinelle', Sage: 'Sentinelle', Chamber: 'Sentinelle', Vyse: 'Sentinelle', Deadlock: 'Sentinelle',
};
const roleOf = (name) => ROLE_OF[name] ?? 'Inconnu';
const ROLE_ORDER = ['Duelliste', 'Initiateur', 'Contrôleur', 'Sentinelle'];

test('statistiques : 12 maps, chaque entrée est [taux %, parties >= 100]', () => {
  assert.equal(Object.keys(MAP_AGENT_STATS).length, 12);
  for (const [map, agents] of Object.entries(MAP_AGENT_STATS)) {
    assert.ok(Object.keys(agents).length >= 15, `${map} : trop peu d'agents`);
    for (const [agent, [rate, games]] of Object.entries(agents)) {
      assert.ok(rate > 0 && rate < 100, `${map}/${agent} : taux ${rate}`);
      assert.ok(Number.isInteger(games) && games >= 100, `${map}/${agent} : ${games} parties`);
    }
  }
});

test('verdictFor : seuils et bornes', () => {
  assert.equal(verdictFor(VERDICT_THRESHOLDS.great), 'great');
  assert.equal(verdictFor(VERDICT_THRESHOLDS.great - 0.01), 'good');
  assert.equal(verdictFor(VERDICT_THRESHOLDS.good), 'good');
  assert.equal(verdictFor(VERDICT_THRESHOLDS.good - 0.01), 'ok');
  assert.equal(verdictFor(VERDICT_THRESHOLDS.ok), 'ok');
  assert.equal(verdictFor(VERDICT_THRESHOLDS.ok - 0.01), 'bad');
  assert.equal(verdictFor(0), 'bad');
});

test('Skye sur Haven est « à éviter » sur un échantillon fiable (le cas qui a motivé le verdict)', () => {
  const [rate, games] = MAP_AGENT_STATS.Haven.Skye;
  assert.ok(games >= MIN_RELIABLE_MATCHES);
  assert.equal(verdictFor(rate), 'bad');
  assert.notEqual(verdictFor(MAP_AGENT_STATS.Haven.Sova[0]), 'bad');
});

test('rankAgentsOnMap : fiables d\'abord par taux décroissant, puis petits échantillons', () => {
  const ranked = rankAgentsOnMap('Summit', ['Sage', 'Vyse', 'Cypher', 'Chamber']);
  const reliable = ranked.filter((a) => a.reliable);
  const small = ranked.filter((a) => !a.reliable);
  assert.deepEqual(ranked, [...reliable, ...small]);
  for (let i = 1; i < reliable.length; i += 1) assert.ok(reliable[i - 1].winrate >= reliable[i].winrate);
  assert.equal(ranked.find((a) => a.name === 'Vyse').reliable, false, 'Vyse : 256 parties sur Summit');
  assert.equal(ranked[0].name, 'Sage');
});

test('rankAgentsOnMap : map inconnue ou agent absent', () => {
  assert.deepEqual(rankAgentsOnMap('Mapinexistante', ['Sage']), []);
  assert.deepEqual(rankAgentsOnMap('Haven', ['Agentinexistant']), []);
});

test('recommendComp : au plus un agent par rôle puis un au choix, jamais un agent « à éviter »', () => {
  for (const map of Object.keys(MAP_AGENT_STATS)) {
    const comp = recommendComp(map, roleOf, ROLE_ORDER);
    assert.ok(comp.length >= 1 && comp.length <= 5, `${map} : ${comp.length} agents`);
    const names = comp.map((c) => c.name);
    assert.equal(new Set(names).size, names.length, `${map} : agent en double`);
    comp.filter((c) => !c.flex).forEach((c) => assert.equal(comp.filter((x) => !x.flex && x.role === c.role).length, 1));
    comp.forEach((c) => {
      assert.ok(c.reliable);
      assert.notEqual(verdictFor(c.winrate), 'bad');
    });
    assert.ok(comp.filter((c) => c.flex).length <= 1);
  }
  assert.deepEqual(recommendComp('Mapinexistante', roleOf, ROLE_ORDER), []);
});

test('MAP_AGENT_TIERS : 3 S + 3 A fiables pour chaque map à statistiques, Icebox en repli', () => {
  for (const map of Object.keys(MAP_AGENT_STATS)) {
    const { S, A } = MAP_AGENT_TIERS[map];
    assert.equal(S.length, 3, map);
    assert.equal(A.length, 3, map);
    for (const name of [...S, ...A]) assert.ok(MAP_AGENT_STATS[map][name][1] >= MIN_RELIABLE_MATCHES, `${map}/${name}`);
    assert.equal(new Set([...S, ...A]).size, 6);
  }
  assert.ok(MAP_AGENT_TIERS.Icebox, 'Icebox : ancien avis conservé');
  assert.equal(MAP_AGENT_STATS.Icebox, undefined);
});

test('getAgentMapTier', () => {
  const [first] = MAP_AGENT_TIERS.Haven.S;
  assert.equal(getAgentMapTier(first, 'Haven'), 'S');
  assert.equal(getAgentMapTier(MAP_AGENT_TIERS.Haven.A[0], 'Haven'), 'A');
  assert.equal(getAgentMapTier('Skye', 'Haven'), 'B');
  assert.equal(getAgentMapTier('Skye', 'Mapinexistante'), null);
});

test('choix des pros : parts cohérentes, Sunset recoupe une source indépendante', () => {
  for (const [map, { maps, picks }] of Object.entries(MAP_PRO_PICKS)) {
    assert.ok(maps >= 15, `${map} : ${maps} parties`);
    for (const [agent, share] of Object.entries(picks)) assert.ok(share >= 5 && share <= 100, `${map}/${agent} : ${share} %`);
  }
  // Omen 99 %, Neon 84 %, Cypher 62 %, Sova 61 % sur 103 parties (VLR, Stage 2).
  assert.equal(MAP_PRO_PICKS.Sunset.maps, 103);
  assert.ok(proPickRate('Sunset', 'Omen') >= 98);
  assert.ok(Math.abs(proPickRate('Sunset', 'Neon') - 84) <= 1);
  assert.equal(proPickRate('Sunset', 'Agentinexistant'), 0);
  assert.equal(proPickRate('Mapinexistante', 'Omen'), 0);
  assert.equal(proPickRate('Haven', 'Skye') < 20, true, 'Skye : peu joué par les pros sur Haven');
});
