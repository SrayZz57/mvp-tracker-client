import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyStreak, lastDays, msUntilNextDay, utcDayKey } from './dailyLogin.js';

const at = (iso) => Date.parse(iso);

test('utcDayKey suit le jour UTC, pas le fuseau du PC', () => {
  assert.equal(utcDayKey(at('2026-10-05T23:59:59Z')), '2026-10-05');
  assert.equal(utcDayKey(at('2026-10-06T00:00:00Z')), '2026-10-06');
});

test('lastDays : 7 jours, du plus ancien à aujourd\'hui', () => {
  const days = lastDays(at('2026-10-05T12:00:00Z'), 7);
  assert.equal(days.length, 7);
  assert.equal(days[0], '2026-09-29');
  assert.equal(days[6], '2026-10-05');
});

test('série : jours consécutifs jusqu\'à aujourd\'hui', () => {
  const claimed = new Set(['2026-10-03', '2026-10-04', '2026-10-05']);
  assert.equal(dailyStreak(claimed, at('2026-10-05T08:00:00Z')), 3);
});

test('série : aujourd\'hui pas encore réclamé, la série court jusqu\'à hier', () => {
  const claimed = new Set(['2026-10-03', '2026-10-04']);
  assert.equal(dailyStreak(claimed, at('2026-10-05T08:00:00Z')), 2);
});

test('série : un jour manqué la casse', () => {
  const claimed = new Set(['2026-10-01', '2026-10-02', '2026-10-04']);
  assert.equal(dailyStreak(claimed, at('2026-10-05T08:00:00Z')), 1);
  assert.equal(dailyStreak(new Set(), at('2026-10-05T08:00:00Z')), 0);
});

test('msUntilNextDay : compte à rebours jusqu\'à 00:00 UTC', () => {
  assert.equal(msUntilNextDay(at('2026-10-05T23:00:00Z')), 3600 * 1000);
  assert.equal(msUntilNextDay(at('2026-10-06T00:00:00Z')), 24 * 3600 * 1000);
});
