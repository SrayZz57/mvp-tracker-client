import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILT_IN_TEMPLATES, VALORANT_WARMUP_OPTIONS, applyTemplate, estimateWarmupMinutes, sanitizeTemplate } from './sessionTemplates.js';
import { hydratePlan, pickPreviousReport, serializePlan, sessionAdvice } from './sessionProgram.js';

const VALID = new Set(['flick', 'gridshot', 'tracking', 'micro']);

test('sanitizeTemplate : valeurs bornées, modes invalides écartés, nom obligatoire', () => {
  const t = sanitizeTemplate(
    { id: 'x', name: '  Mon rituel  ', warmupMinutes: 999, warmupModes: ['flick', 'inconnu', 'micro'], matchCount: 0, hsTarget: 5, pauseLosses: 9, targetMap: 'Split' },
    VALID,
  );
  assert.equal(t.name, 'Mon rituel');
  assert.equal(t.warmupMinutes, 60);
  assert.deepEqual(t.warmupModes, ['flick', 'micro']);
  assert.equal(t.matchCount, 1);
  assert.equal(t.hsTarget, 10);
  assert.equal(t.pauseLosses, 5);
  assert.equal(t.targetMap, 'Split');
  assert.equal(sanitizeTemplate({ name: '   ' }, VALID), null);
  assert.equal(sanitizeTemplate({ name: 'Ok', warmupMinutes: 'abc' }, VALID).warmupMinutes, 10);
});

test("sanitizeTemplate : nombre d'exercices limité", () => {
  const many = Array.from({ length: 20 }, () => 'flick');
  assert.equal(sanitizeTemplate({ name: 'A', warmupModes: many }, VALID).warmupModes.length, 8);
});

test('modèles fournis : tous valides une fois nommés', () => {
  const all = new Set(BUILT_IN_TEMPLATES.flatMap((t) => t.warmupModes));
  BUILT_IN_TEMPLATES.forEach((tpl) => {
    assert.ok(sanitizeTemplate({ ...tpl, name: 'x' }, all), tpl.id);
    assert.ok(tpl.pauseLosses >= 2 && tpl.pauseLosses <= 5);
  });
  assert.equal(new Set(BUILT_IN_TEMPLATES.map((t) => t.id)).size, BUILT_IN_TEMPLATES.length);
});

test('estimateWarmupMinutes : somme des durées, arrondie au-dessus', () => {
  const durationOf = (id) => ({ flick: 60, tracking: 45 }[id]);
  assert.equal(estimateWarmupMinutes(['flick', 'tracking'], durationOf), 2);
  assert.equal(estimateWarmupMinutes([], durationOf), 0);
  assert.equal(estimateWarmupMinutes(['inconnu'], durationOf), 1);
});

test('applyTemplate : le modèle remplace échauffement, objectif, map et pause', () => {
  const base = { warmup: { minutes: 20, reason: 'auto' }, targetMap: 'Bind', tilt: { isTilted: true }, matchCount: 2, hsTarget: 30, objective: 'auto' };
  const tpl = { id: 'u1', name: 'Rituel', warmupMinutes: 12, warmupModes: ['flick'], matchCount: 4, hsTarget: 22, pauseLosses: 2, targetMap: null };
  const plan = applyTemplate(base, tpl, { templateName: 'Rituel', warmupReason: 'ton rituel', objective: '4 matchs' });
  assert.equal(plan.warmup.minutes, 12);
  assert.equal(plan.warmup.reason, 'ton rituel');
  assert.equal(plan.matchCount, 4);
  assert.equal(plan.targetMap, 'Bind'); // pas de map dans le modèle : on garde celle du plan de base
  assert.equal(plan.tilt.isTilted, true); // l'analyse de forme du plan de base reste
  assert.equal(plan.templateId, 'u1');
});

test('le modèle survit à la sauvegarde du plan et règle le seuil de pause', () => {
  const plan = applyTemplate(
    { warmup: { minutes: 10, reason: 'a' }, targetMap: null, tilt: { isTilted: false }, matchCount: 3, hsTarget: 25, objective: 'o' },
    { id: 'u1', name: 'Strict', warmupMinutes: 10, warmupModes: ['flick', 'micro'], matchCount: 4, hsTarget: 25, pauseLosses: 2, targetMap: null },
    { templateName: 'Strict', warmupReason: 'r', objective: 'o' },
  );
  const back = hydratePlan(JSON.parse(JSON.stringify(serializePlan(plan))));
  assert.deepEqual(back.warmupModes, ['flick', 'micro']);
  assert.equal(back.templateName, 'Strict');
  const saved = serializePlan(plan);
  assert.equal(sessionAdvice({ played: 2, target: 4, losingStreak: 2 }, saved), 'pause');
  assert.equal(sessionAdvice({ played: 2, target: 4, losingStreak: 2 }, { ...saved, pauseLosses: 3 }), 'go');
});

test('pickPreviousReport : dernière session du même modèle, sinon la dernière tout court', () => {
  const history = [
    { plan: { templateId: 'a' }, result: { games: 1, tag: 'a-recent' } },
    { plan: { templateId: 'b' }, result: { games: 2, tag: 'b' } },
    { plan: { templateId: 'a' }, result: { games: 3, tag: 'a-old' } },
  ];
  assert.equal(pickPreviousReport(history, 'b').result.tag, 'b');
  assert.equal(pickPreviousReport(history, 'a').result.tag, 'a-recent');
  const noMatch = pickPreviousReport(history, 'zzz');
  assert.equal(noMatch.result.tag, 'a-recent');
  assert.equal(noMatch.sameTemplate, false);
  assert.equal(pickPreviousReport(history, 'b').sameTemplate, true);
  assert.equal(pickPreviousReport([], 'a'), null);
});

test('sanitizeTemplate : étapes Valorant valides, bornées, une seule par mode', () => {
  const t = sanitizeTemplate(
    { name: 'A', warmupValorant: [{ mode: 'deathmatch', amount: 99 }, { mode: 'deathmatch', amount: 2 }, { mode: 'inconnu', amount: 1 }, { mode: 'range', amount: 500 }, { mode: 'hurm', amount: 0 }] },
    VALID,
  );
  assert.deepEqual(t.warmupValorant, [
    { mode: 'deathmatch', amount: 5 },
    { mode: 'range', amount: 60 },
    { mode: 'hurm', amount: 1 },
  ]);
  assert.deepEqual(sanitizeTemplate({ name: 'B' }, VALID).warmupValorant, []);
});

test('options Valorant : ids uniques, le champ de tir est la seule étape non suivie', () => {
  assert.equal(new Set(VALORANT_WARMUP_OPTIONS.map((o) => o.id)).size, VALORANT_WARMUP_OPTIONS.length);
  assert.deepEqual(VALORANT_WARMUP_OPTIONS.filter((o) => !o.tracked).map((o) => o.id), ['range']);
  VALORANT_WARMUP_OPTIONS.filter((o) => o.tracked).forEach((o) => assert.ok(o.modeId));
});
