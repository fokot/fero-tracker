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
  assert.equal(env.calls.filter(call => call.method === 'POST' && new URL(call.url).pathname === '/v4/spreadsheets').length, 0);
  const fresh = setup({ existing: null });
  await fresh.sheets.getOrCreateWorkoutSheet('test@example.com');
  const creation = fresh.calls.find((call) => call.method === 'POST');
  assert.match(creation.body.properties.title, /^Workouts_/);
  assert.deepEqual(creation.body.sheets.map((sheet) => sheet.properties.title), ['Workouts']);
  assert.deepEqual(fresh.rows, [['Date']]);
});
test('connecting a workout file preserves unrelated sheets and rejects incompatible existing data',async()=>{
  const other=setup({sheetName:'Notes',rows:[['Keep'],['Original']]});
  await other.sheets.connectWorkoutSheet('sheet-1');
  assert.deepEqual(other.rows,[['Keep'],['Original']]);
  assert.deepEqual(other.tabs.find(tab=>tab.properties.title==='Workouts').rows,[['Date']]);
  const empty=setup({rows:[]});await empty.sheets.connectWorkoutSheet('sheet-1');assert.deepEqual(empty.rows,[['Date']]);
  const invalid=setup({rows:[['Wrong header'],['Important data']]});
  await assert.rejects(invalid.sheets.connectWorkoutSheet('sheet-1'),/Column A/);assert.deepEqual(invalid.rows,[['Wrong header'],['Important data']]);
});
