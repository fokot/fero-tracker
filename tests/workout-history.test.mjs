import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader, plain } from './load-module.mjs';

const { workoutReference } = createLoader()('src/lib/workoutHistory.ts');
const history = {
  '2026-10-01': { Bench: [{ reps: 5, weight: 100 }, { reps: 2, weight: 120 }] },
  '2026-10-03': { Bench: [{ reps: 3, weight: 120 }] },
  '2026-10-05': { Bench: [{ reps: 3, weight: 120 }] },
  '2026-10-08': { Bench: [{ reps: 10, weight: 80 }, { reps: 8, weight: 90 }] },
  '2026-10-09': { Bench: [] },
  '2026-10-10': { Bench: [{ reps: 1, weight: 200 }] },
  '2026-10-11': { Bench: [{ reps: 1, weight: 300 }] },
};
test('last workout shows all sets from the nearest earlier nonempty day', () => {
  assert.deepEqual(plain(workoutReference(history, ' bench ', '2026-10-10', 'last')),
    { date: '2026-10-08', sets: history['2026-10-08'].Bench });
});
test('maximum uses weight then reps, and the most recent date on an exact tie', () => {
  assert.deepEqual(plain(workoutReference(history, 'Bench', '2026-10-10', 'best')),
    { date: '2026-10-05', sets: [{ reps: 3, weight: 120 }] });
  assert.equal(workoutReference(history, 'Bench', '2026-10-03', 'best').date, '2026-10-01');
});
test('disabled history, unknown exercise and no earlier training return no reference', () => {
  for (const [name, day, mode] of [['Bench', '2026-10-10', 'none'], ['Drep', '2026-10-10', 'last'], ['Bench', '2026-10-01', 'best']]) {
    assert.equal(workoutReference(history, name, day, mode), null);
  }
  assert.deepEqual(plain(workoutReference({ '2026-10-01': { Drep: [{ reps: 10, weight: 0 }] } }, 'Drep', '2026-10-02', 'best')),
    { date: '2026-10-01', sets: [{ reps: 10, weight: 0 }] });
});
test('display preference survives reloads and storage restrictions remain usable', () => {
  const data = new Map();
  const globals = { localStorage: { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) } };
  const load = () => createLoader({ globals })('src/store/useWorkoutHistoryPreference.ts').useWorkoutHistoryPreference;
  assert.equal(load().getState().mode, 'last');
  for (const mode of ['best', 'none', 'last']) {
    load().getState().setMode(mode);
    assert.equal(load().getState().mode, mode);
  }
  const blocked = createLoader({ globals: { localStorage: { getItem() { throw Error(); }, setItem() { throw Error(); } } } })('src/store/useWorkoutHistoryPreference.ts').useWorkoutHistoryPreference;
  blocked.getState().setMode('none');
  assert.equal(blocked.getState().mode, 'none');
});
