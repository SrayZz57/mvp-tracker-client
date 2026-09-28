// Tests du battle pass. Lancer :  npm test
// (node:test intégré à Node, aucune dépendance à installer.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SEASONS, REWARD_TYPES, getSeason, seasonAt, listRewards } from './catalog.js';
import { levelFromXp, xpToReach, xpForNextLevel } from './levels.js';
import { allSeasonSql } from './seedSql.js';
import { SKIN_RARITY, RARITY_ORDER } from '../skinRarity.js';
import { WEAPON_MODELS } from '../aimTrainerModes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const curve = { maxLevel: 50, base: 400, step: 20 };

// --- Courbe de niveaux -----------------------------------------------------------

test('le niveau 1 se possède à 0 XP', () => {
  assert.equal(levelFromXp(curve, 0).level, 1);
  assert.equal(levelFromXp(curve, -50).level, 1);
  assert.equal(levelFromXp(curve, Number.NaN).level, 1);
});

test('le seuil est exact : un XP de moins = niveau précédent', () => {
  for (let level = 2; level <= curve.maxLevel; level += 1) {
    const need = xpToReach(curve, level);
    assert.equal(levelFromXp(curve, need).level, level, `niveau ${level} à ${need} XP`);
    assert.equal(levelFromXp(curve, need - 1).level, level - 1, `niveau ${level - 1} à ${need - 1} XP`);
  }
});

test('xpToReach est la somme des coûts de chaque niveau', () => {
  let sum = 0;
  for (let level = 1; level < curve.maxLevel; level += 1) {
    assert.equal(xpToReach(curve, level), sum);
    sum += xpForNextLevel(curve, level);
  }
  assert.equal(xpToReach(curve, curve.maxLevel), sum);
  assert.equal(sum, 43120, 'total documenté dans catalog.js');
});

test('au niveau max, l\'XP en trop est ignorée', () => {
  const state = levelFromXp(curve, 10_000_000);
  assert.equal(state.level, 50);
  assert.equal(state.maxed, true);
  assert.equal(state.progress, 1);
});

test('la progression dans le niveau est entre 0 et 1', () => {
  const half = xpToReach(curve, 10) + xpForNextLevel(curve, 10) / 2;
  const state = levelFromXp(curve, half);
  assert.equal(state.level, 10);
  assert.equal(state.progress, 0.5);
});

// --- Intégrité du catalogue --------------------------------------------------------

for (const season of SEASONS) {
  test(`saison ${season.id} : calendrier cohérent`, () => {
    const start = Date.parse(season.startsAt);
    const end = Date.parse(season.endsAt);
    assert.ok(end > start);
    const weeks = (end - start) / (7 * 24 * 3600 * 1000);
    assert.equal(weeks, 8, 'une saison dure 8 semaines');
    assert.equal(new Date(start).getUTCDay(), 1, 'commence un lundi');
    assert.equal(new Date(start).getUTCHours(), 0);
  });

  test(`saison ${season.id} : ids uniques, niveaux valides, types connus`, () => {
    const rewards = listRewards(season);
    const ids = rewards.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, 'ids uniques');
    for (const r of rewards) {
      assert.ok(Number.isInteger(r.level) && r.level >= 1 && r.level <= season.maxLevel, `niveau de ${r.id}`);
      assert.ok(r.type in REWARD_TYPES, `type inconnu pour ${r.id}`);
    }
  });

  test(`saison ${season.id} : chaque skin existe vraiment et n'est pas le skin de base`, () => {
    for (const r of listRewards(season).filter((x) => x.type === 'weaponSkin')) {
      const skins = WEAPON_MODELS[r.weapon]?.skins;
      assert.ok(skins, `arme inconnue : ${r.weapon}`);
      assert.ok(r.skin in skins, `skin inconnu : ${r.weapon}/${r.skin}`);
      assert.notEqual(r.skin, 'standard', 'le skin de base est déjà à tout le monde');
      assert.ok(r.skin in SKIN_RARITY, `rareté manquante : ${r.skin}`);
    }
  });

  test(`saison ${season.id} : la rareté des skins ne baisse jamais avec le niveau`, () => {
    const order = listRewards(season)
      .filter((r) => r.type === 'weaponSkin')
      .map((r) => RARITY_ORDER.indexOf(SKIN_RARITY[r.skin]));
    for (let i = 1; i < order.length; i += 1) assert.ok(order[i] >= order[i - 1], `rupture de progression à l'indice ${i}`);
  });

  test(`saison ${season.id} : le dernier niveau a une récompense phare`, () => {
    assert.ok(season.levels[season.maxLevel]?.length >= 1);
  });

  test(`saison ${season.id} : le semis SQL est à jour (lancer scripts/generate-battle-pass-sql.mjs)`, () => {
    const entry = allSeasonSql().find((e) => e.file.includes(`season_${season.number}.`));
    const onDisk = fs.readFileSync(path.join(root, 'sql', entry.file), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(onDisk, entry.sql);
  });
}

test('les numéros de saison et les périodes ne se chevauchent pas', () => {
  const sorted = [...SEASONS].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  for (let i = 1; i < sorted.length; i += 1) {
    assert.ok(Date.parse(sorted[i].startsAt) >= Date.parse(sorted[i - 1].endsAt), 'chevauchement');
  }
  assert.equal(new Set(SEASONS.map((s) => s.number)).size, SEASONS.length);
});

test('seasonAt / getSeason', () => {
  const s1 = SEASONS[0];
  assert.equal(seasonAt(new Date(s1.startsAt)).id, s1.id);
  assert.equal(seasonAt(new Date(Date.parse(s1.endsAt) - 1)).id, s1.id);
  assert.equal(seasonAt(new Date(s1.endsAt)), null, 'la fin est exclusive');
  assert.equal(seasonAt(new Date('2020-01-01')), null);
  assert.equal(getSeason('s1').id, 's1');
  assert.equal(getSeason('nope'), null);
});
