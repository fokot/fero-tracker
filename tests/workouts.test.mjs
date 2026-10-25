import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader, plain } from './load-module.mjs';
import { setup as sheetSetup } from './sheets-fixture.mjs';

const { formatWorkoutSets, parseWorkoutSets } = createLoader()('src/lib/workouts.ts');
const sets = [{ reps: 5, weight: 100 }, { reps: 3, weight: 120 }, { reps: 1, weight: 125 }];
function setup(options = {}) {
  return sheetSetup({ rows: [['Date', 'Bench press', 'Drep']], definitions: null, sheetName: 'Workouts', apiModule: 'src/lib/workoutSheets.ts', ...options });
}

test('all sets round-trip through one readable cell in their original order', () => {
  assert.equal(formatWorkoutSets(sets), '5×100, 3×120, 1×125');
  assert.deepEqual(plain(parseWorkoutSets(formatWorkoutSets(sets))), sets);
  assert.deepEqual(plain(parseWorkoutSets(' 5 x 100 kg, 3×120, 1*125 ')), sets);
  assert.equal(formatWorkoutSets([{ reps: 10, weight: 0 }, { reps: 8, weight: 12.5 }]), '10×0, 8×12.5');
  assert.deepEqual(plain(parseWorkoutSets('')), []);
  assert.deepEqual(plain(parseWorkoutSets(formatWorkoutSets([{ reps: 1, weight: 1e-7 }]))), [{ reps: 1, weight: 1e-7 }]);
});
test('invalid or incomplete sets never become stored cells', () => {
  for (const invalid of [{ reps: 0, weight: 100 }, { reps: 1.5, weight: 100 }, { reps: -1, weight: 100 }, { reps: 5, weight: -1 }, { reps: 5, weight: Infinity }, { reps: NaN, weight: 100 }]) assert.throws(() => formatWorkoutSets([invalid]));
  for (const invalid of ['5×', '5×100,', '3.5×100', '0×100', '5×-100', 'random']) assert.throws(() => parseWorkoutSets(invalid));
});
test('workouts use a separate spreadsheet name and reuse the same file on sign-in', async () => {
  const env = setup();
  assert.equal(await env.sheets.getOrCreateWorkoutSheet('test@example.com'), 'sheet-1');
  const query = new URL(env.calls[0].url).searchParams.get('q');
  assert.match(query, /name = 'Workouts_/);
  assert.doesNotMatch(query, /Habits_/);
  assert.equal(env.calls.filter((call) => call.method === 'POST').length, 0);
  const fresh = setup({ existing: null });
  await fresh.sheets.getOrCreateWorkoutSheet('test@example.com');
  const creation = fresh.calls.find((call) => call.method === 'POST');
  assert.match(creation.body.properties.title, /^Workouts_/);
  assert.deepEqual(creation.body.sheets.map((sheet) => sheet.properties.title), ['Workouts']);
  assert.deepEqual(fresh.rows, [['Date']]);
});
test('one date and exercise store all sets in exactly one cell and preserve other exercises', async () => {
  const env = setup({ rows: [['Date', 'Bench press', 'Drep'], ['2026-10-25', '', '5×80'], ['2026-10-26', '1×90']] });
  await env.sheets.saveWorkoutSets('sheet-1', '2026-10-25', 'Bench press', sets);
  assert.deepEqual(env.rows, [['Date', 'Bench press', 'Drep'], ['2026-10-25', '5×100, 3×120, 1×125', '5×80'], ['2026-10-26', '1×90']]);
  const result = await env.sheets.loadWorkoutDay('sheet-1', '2026-10-25');
  assert.deepEqual(plain(result.workouts['Bench press']), sets);
  assert.deepEqual(plain(result.workouts.Drep), [{ reps: 5, weight: 80 }]);
});
test('several exercises on a new date share one row; exercise names reuse existing columns', async () => {
  const env = setup();
  await Promise.all([
    env.sheets.saveWorkoutSets('sheet-1', '2026-10-25', ' bench PRESS ', sets),
    env.sheets.saveWorkoutSets('sheet-1', '2026-10-25', 'Drep', [{ reps: 5, weight: 80 }]),
  ]);
  assert.deepEqual(env.rows, [['Date', 'Bench press', 'Drep'], ['2026-10-25', '5×100, 3×120, 1×125', '5×80']]);
});
test('adding an exercise and its first cell is atomic and expands the grid', async () => {
  const env = setup({ columns: 3, rowCount: 1 });
  assert.equal(await env.sheets.saveWorkoutSets('sheet-1', '2026-10-25', 'Zhyby', [{ reps: 10, weight: 0 }]), 'Zhyby');
  assert.deepEqual(env.rows, [['Date', 'Bench press', 'Drep', 'Zhyby'], ['2026-10-25', '', '', '10×0']]);
  assert.equal(env.tabs[0].properties.gridProperties.columnCount, 4);
  assert.equal(env.tabs[0].properties.gridProperties.rowCount, 2);
  const failed = setup({ failBatch: true });
  await assert.rejects(failed.sheets.saveWorkoutSets('sheet-1', '2026-10-25', 'Zhyby', sets), /batch failure/);
  assert.deepEqual(failed.rows, [['Date', 'Bench press', 'Drep']]);
});
test('editing or removing sets replaces only the selected exercise cell', async () => {
  const env = setup({ rows: [['Date', 'Bench press', 'Drep'], ['2026-10-25', '5×100, 3×120', '5×80']] });
  await env.sheets.saveWorkoutSets('sheet-1', '2026-10-25', 'Bench press', [{ reps: 3, weight: 120 }]);
  assert.equal(env.rows[1][1], '3×120');
  await env.sheets.saveWorkoutSets('sheet-1', '2026-10-25', 'Bench press', []);
  assert.deepEqual(env.rows, [['Date', 'Bench press', 'Drep'], ['2026-10-25', '', '5×80']]);
  const result = await env.sheets.loadWorkoutDay('sheet-1', '2026-10-25');
  assert.deepEqual(plain(result.exercises), ['Bench press', 'Drep']);
  assert.deepEqual(Object.keys(result.workouts), ['Drep']);
});
test('days are independent and invalid remote cells are surfaced instead of discarded', async () => {
  const env = setup({ rows: [['Date', 'Bench press'], ['2026-10-25', '5×100'], ['2026-10-26', 'invalid']] });
  assert.deepEqual(plain((await env.sheets.loadWorkoutDay('sheet-1', '2026-10-27')).workouts), {});
  assert.deepEqual(plain((await env.sheets.loadWorkoutDay('sheet-1', '2026-10-25')).workouts['Bench press']), [{ reps: 5, weight: 100 }]);
  await assert.rejects(env.sheets.loadWorkoutDay('sheet-1', '2026-10-26'), /Bench press/);
});
test('empty new exercises, invalid dates, and blank or conflicting headers are rejected', async () => {
  const env = setup();
  await assert.rejects(env.sheets.saveWorkoutSets('sheet-1', '2026-10-25', 'New', []), /aspoň jednu/);
  await assert.rejects(env.sheets.saveWorkoutSets('sheet-1', 'invalid', 'New', sets), /dátum/);
  await assert.rejects(env.sheets.saveWorkoutSets('sheet-1', '2026-10-25', ' ', sets), /Názov/);
  const duplicate = setup({ rows: [['Date', 'Bench', 'bench']] });
  await assert.rejects(duplicate.sheets.loadWorkoutDay('sheet-1', '2026-10-25'), /jedinečný/);
});
test('queued workout writes cannot use a different signed-in account', async () => {
  const env = setup();
  const pending = env.sheets.saveWorkoutSets('sheet-1', '2026-10-25', 'Bench press', sets);
  env.signOut();
  await assert.rejects(pending);
  assert.equal(env.calls.length, 0);
});
test('a habits spreadsheet can never be rewritten as workouts by mistake', async () => {
  const env = setup({ sheetName: 'Habits' });
  await assert.rejects(env.sheets.saveWorkoutSets('sheet-1', '2026-10-25', 'Bench press', sets), /chýba list Workouts/);
  assert.equal(env.calls.filter((call) => call.method === 'POST').length, 0);
});
