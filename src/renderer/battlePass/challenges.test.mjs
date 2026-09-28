// Tests des défis, des plafonds de mode et du budget d'XP. Lancer :  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SEASONS } from './catalog.js';
import { METRICS, expandSeasonChallenges, dailyChallengesFor, weeklyChallengesFor, xpBudget } from './challenges.js';
import { MODE_SCORE_CAPS, OBSERVED_SCORES, POPULAR_MODES, CUSTOM_MODE, scoreTarget } from './modeCaps.js';
import { CHALLENGE_XP, BUDGET_RATIO } from './xpRules.js';
import { allGeneratedSql } from './seedSql.js';
import { MODES, customTuning } from '../aimTrainerModes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const season = SEASONS[0];
const rows = expandSeasonChallenges(season);
const DAY = 24 * 3600 * 1000;

// --- Tirage -----------------------------------------------------------------------

test('le tirage est déterministe : mêmes entrées, mêmes défis', () => {
  assert.deepEqual(expandSeasonChallenges(season), expandSeasonChallenges(season));
  const d = Date.parse('2026-11-05T00:00:00Z');
  assert.deepEqual(dailyChallengesFor('s1', d), dailyChallengesFor('s1', d));
});

test('la saison change le tirage : deux saisons ne rejouent pas les mêmes journées', () => {
  // Un jour donné peut tomber pareil par hasard (peu de modèles par niveau) :
  // on compare donc toute la saison.
  const start = Date.parse(season.startsAt);
  let different = 0;
  for (let i = 0; i < 56; i += 1) {
    const a = dailyChallengesFor('s1', start + i * DAY).map((c) => `${c.metric}${c.mode}${c.target}`).join();
    const b = dailyChallengesFor('s2', start + i * DAY).map((c) => `${c.metric}${c.mode}${c.target}`).join();
    if (a !== b) different += 1;
  }
  assert.ok(different >= 40, `seulement ${different} jours sur 56 diffèrent`);
});

test('chaque jour de la saison a trois défis facile / moyen / difficile, de métriques différentes', () => {
  const days = (Date.parse(season.endsAt) - Date.parse(season.startsAt)) / DAY;
  assert.equal(days, 56);
  for (let i = 0; i < days; i += 1) {
    const day = dailyChallengesFor(season.id, Date.parse(season.startsAt) + i * DAY);
    assert.deepEqual(day.map((c) => c.tier), ['easy', 'medium', 'hard']);
    assert.equal(new Set(day.map((c) => c.metric)).size, 3, `métriques en double le jour ${i}`);
  }
});

test('chaque semaine a trois défis, alignés sur un lundi UTC et longs de 7 jours', () => {
  const weekly = rows.filter((r) => r.period === 'weekly');
  assert.equal(weekly.length, 8 * 3);
  for (const r of weekly) {
    assert.equal(new Date(r.startsAt).getUTCDay(), 1, `${r.id} ne commence pas un lundi`);
    assert.equal(Date.parse(r.endsAt) - Date.parse(r.startsAt), 7 * DAY);
  }
  const first = weeklyChallengesFor(season.id, Date.parse(season.startsAt));
  assert.equal(new Set(first.map((c) => c.metric)).size, 3);
});

test('ids uniques, 200 défis (56×3 + 8×3 + 8)', () => {
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  assert.equal(rows.length, 56 * 3 + 8 * 3 + 8);
});

// --- Contenu des défis --------------------------------------------------------------

test('métriques connues, XP conforme à la difficulté, périodes bien formées', () => {
  for (const r of rows) {
    assert.ok(METRICS.includes(r.metric), `métrique inconnue : ${r.metric}`);
    assert.ok(Date.parse(r.endsAt) > Date.parse(r.startsAt));
    assert.ok(Number.isInteger(r.target) && r.target > 0, `cible de ${r.id}`);
    if (r.period === 'daily') assert.equal(r.xp, CHALLENGE_XP.daily[r.tier]);
    if (r.period === 'weekly') assert.equal(r.xp, CHALLENGE_XP.weekly[r.tier]);
  }
});

test('un défi « meilleur score » vise un mode populaire, jamais « custom », sous le plafond', () => {
  const best = rows.filter((r) => r.metric === 'bestScore');
  assert.ok(best.length > 30);
  for (const r of best) {
    assert.ok(POPULAR_MODES.includes(r.mode), `${r.id} : mode ${r.mode} peu joué ou custom`);
    assert.notEqual(r.mode, CUSTOM_MODE);
    assert.ok(r.target <= MODE_SCORE_CAPS[r.mode], `${r.id} : cible au-dessus du plafond`);
    assert.ok(r.target < OBSERVED_SCORES[r.mode][2], `${r.id} : cible au-dessus du 99e centile, quasi impossible`);
  }
});

test('seuls les défis de précision ont un plancher de touches, et il est fixé', () => {
  for (const r of rows) {
    if (r.metric === 'accuracy') assert.ok(r.minHits >= 30, `${r.id}`);
    else assert.equal(r.minHits, null);
    if (r.metric !== 'bestScore') assert.equal(r.mode, null);
  }
});

test('le tirage varie : chaque métrique de quotidien sort souvent, aucun modèle n\'est mort', () => {
  const daily = rows.filter((r) => r.period === 'daily');
  const count = (metric) => daily.filter((r) => r.metric === metric).length;
  for (const metric of ['sessions', 'distinctModes', 'dailyChallenge', 'bestScore', 'accuracy']) {
    assert.ok(count(metric) >= 10, `${metric} sort seulement ${count(metric)} fois sur 56 jours`);
  }
  assert.ok(new Set(rows.filter((r) => r.metric === 'bestScore').map((r) => r.mode)).size >= 6, 'trop peu de modes différents');
});

// --- Budget d'XP --------------------------------------------------------------------

test("le budget d'XP tient : assez pour finir le pass, pas assez pour le finir en deux semaines", () => {
  const b = xpBudget(season);
  assert.equal(b.total, b.sessions + b.daily + b.weekly + b.season);
  assert.ok(b.ratio >= BUDGET_RATIO.min, `ratio ${b.ratio.toFixed(2)} trop bas : il faudrait une saison parfaite`);
  assert.ok(b.ratio <= BUDGET_RATIO.max, `ratio ${b.ratio.toFixed(2)} trop haut : le pass se finit trop vite`);
});

// --- Réglages libres du mode Personnalisé -----------------------------------------

test('vitesse, taille et déplacement libres : jamais hors du mode Personnalisé', () => {
  const tweaked = { speed: 2, agentScale: 0.6, agentStyle: 'static' };
  for (const id of Object.keys(MODES)) {
    assert.deepEqual(customTuning({ mode: id, ...tweaked }), { speed: 1, agentScale: 1, agentStyle: 'mixed' }, id);
  }
  assert.deepEqual(customTuning({ mode: 'custom', ...tweaked }), tweaked);
  // Valeurs hors bornes (preset importé trafiqué) ramenées dans les limites.
  const clamped = customTuning({ mode: 'custom', speed: 50, agentScale: 0.01 });
  assert.equal(clamped.speed, 2);
  assert.equal(clamped.agentScale, 0.6);
});

// --- Plafonds de mode ------------------------------------------------------------------

test('chaque mode du jeu a un plafond de score (sinon il ne rapporterait aucune XP)', () => {
  for (const id of Object.keys(MODES)) {
    assert.ok(id in MODE_SCORE_CAPS, `mode « ${id} » sans plafond : à ajouter dans modeCaps.js (OBSERVED_SCORES)`);
  }
  assert.ok(CUSTOM_MODE in MODE_SCORE_CAPS);
});

test('les plafonds laissent une vraie marge au-dessus du maximum observé', () => {
  for (const [mode, [count, max]] of Object.entries(OBSERVED_SCORES)) {
    assert.ok(MODE_SCORE_CAPS[mode] >= max * 1.5, `${mode} : plafond trop serré`);
    if (count < 100 && mode !== CUSTOM_MODE) assert.ok(MODE_SCORE_CAPS[mode] >= max * 2.5, `${mode} : peu joué, marge insuffisante`);
  }
});

test('modes populaires : assez de parties, jamais custom', () => {
  assert.ok(POPULAR_MODES.length >= 8);
  for (const mode of POPULAR_MODES) {
    assert.ok(OBSERVED_SCORES[mode][0] >= 300);
    assert.notEqual(mode, CUSTOM_MODE);
  }
  assert.ok(!POPULAR_MODES.includes('ascentDuel') && !POPULAR_MODES.includes('headshotDuel'));
});

test('scoreTarget est croissant avec la fraction', () => {
  assert.ok(scoreTarget('gridshot', 0.5) < scoreTarget('gridshot', 0.7));
  assert.ok(scoreTarget('gridshot', 0.7) < scoreTarget('gridshot', 0.9));
});

// --- Fichiers SQL générés ------------------------------------------------------------------

for (const { file, sql } of allGeneratedSql()) {
  test(`sql/${file} est à jour (lancer scripts/generate-battle-pass-sql.mjs)`, () => {
    const onDisk = fs.readFileSync(path.join(root, 'sql', file), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(onDisk, sql);
  });
}
