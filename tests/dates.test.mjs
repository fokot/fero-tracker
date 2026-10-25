import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './load-module.mjs';
const { dateKey, isDateKey, visibleDates } = createLoader()('src/lib/dates.ts');

test('local date remains correct near midnight in Bratislava', () => {
  const original = process.env.TZ;
  process.env.TZ = 'Europe/Bratislava';
  try {
    assert.equal(dateKey(new Date('2026-10-25T00:30:00+02:00')), '2026-10-25');
    const dates = visibleDates(new Date(2026, 9, 25));
    assert.equal(dates.length, 38);
    assert.equal(dateKey(dates[0]), '2026-09-25');
    assert.equal(dateKey(dates[30]), '2026-10-25');
    assert.equal(dateKey(dates[37]), '2026-11-01');
    assert.equal(new Set(dates.map(dateKey)).size, 38);
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});
test('date validation rejects impossible calendar dates', () => {
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-2', 'garbage']) assert.equal(isDateKey(date), false);
  assert.equal(isDateKey('2028-02-29'), true);
});
