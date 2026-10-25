import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader, deferred, plain } from './load-module.mjs';
const user = { id: 'one', email: 'test@example.com' };
const date = '2026-10-25';
const sets = [{ reps: 5, weight: 100 }, { reps: 3, weight: 120 }];
function setup(overrides = {}) {
  const api = { getOrCreateWorkoutSheet: async () => 'workout-sheet', loadWorkoutDay: async () => ({ exercises: [], workouts: {} }), saveWorkoutSets: async (id, date, name) => name.trim(), ...overrides };
  const { useWorkoutStore: store } = createLoader({ mocks: { '../lib/workoutSheets': api } })('src/store/useWorkoutStore.ts');
  store.getState().setUser(user);
  return store;
}

test('workout discovery is lazy and shared across concurrent first loads', async () => {
  let discoveries = 0;
  const gate = deferred();
  const store = setup({ getOrCreateWorkoutSheet: () => { discoveries++; return gate.promise; } });
  assert.equal(discoveries, 0);
  const first = store.getState().loadDay('2026-10-24');
  const second = store.getState().loadDay(date);
  gate.resolve('workout-sheet');
  await Promise.all([first, second]);
  assert.equal(discoveries, 1);
  assert.equal(store.getState().loadedDate, date);
});
test('writes are blocked until the selected day is ready and failures preserve saved sets', async () => {
  const store = setup({ saveWorkoutSets: async () => { throw new Error('Offline'); } });
  assert.equal(await store.getState().saveExercise(date, 'Bench', sets), false);
  await store.getState().loadDay(date);
  store.setState({ workouts: { Bench: sets } });
  assert.equal(await store.getState().saveExercise('2026-10-26', 'Bench', []), false);
  assert.equal(await store.getState().saveExercise(date, 'Bench', []), false);
  assert.deepEqual(plain(store.getState().workouts.Bench), sets);
  assert.equal(store.getState().error, 'Offline');
  assert.equal(store.getState().pendingWrites, 0);
});
test('successful writes update the canonical exercise and empty sets remove only that day entry', async () => {
  const store = setup({ saveWorkoutSets: async () => 'Bench press' });
  await store.getState().loadDay(date);
  assert.equal(await store.getState().saveExercise(date, 'bench press', sets), true);
  assert.deepEqual(plain(store.getState().exercises), ['Bench press']);
  assert.deepEqual(plain(store.getState().workouts['Bench press']), sets);
  assert.equal(await store.getState().saveExercise(date, 'Bench press', []), true);
  assert.deepEqual(plain(store.getState().workouts), {});
  assert.deepEqual(plain(store.getState().exercises), ['Bench press']);
});
test('a late result from an earlier date never overwrites the selected date', async () => {
  const firstDay = deferred(), nextDay = deferred();
  const store = setup({ loadWorkoutDay: (id, day) => day === date ? firstDay.promise : nextDay.promise });
  store.setState({ spreadsheetId: 'workout-sheet' });
  const first = store.getState().loadDay(date);
  const next = store.getState().loadDay('2026-10-26');
  nextDay.resolve({ exercises: ['Drep'], workouts: { Drep: [{ reps: 3, weight: 80 }] } });
  await next;
  firstDay.resolve({ exercises: ['Bench'], workouts: { Bench: sets } });
  await first;
  assert.equal(store.getState().loadedDate, '2026-10-26');
  assert.deepEqual(Object.keys(store.getState().workouts), ['Drep']);
});
test('sign-out invalidates pending discovery, loads, and writes', async () => {
  const loading = deferred();
  const store = setup({ loadWorkoutDay: () => loading.promise });
  const load = store.getState().loadDay(date);
  await Promise.resolve(); await Promise.resolve();
  store.getState().clearUser();
  loading.resolve({ exercises: ['Bench'], workouts: { Bench: sets } });
  await load;
  assert.equal(store.getState().user, null);
  assert.deepEqual(plain(store.getState().workouts), {});

  const saving = deferred();
  const next = setup({ saveWorkoutSets: () => saving.promise });
  await next.getState().loadDay(date);
  const pending = next.getState().saveExercise(date, 'Bench', sets);
  next.getState().clearUser();
  saving.resolve('Bench');
  assert.equal(await pending, false);
  assert.equal(next.getState().pendingWrites, 0);
  assert.deepEqual(plain(next.getState().workouts), {});
});
test('double submission is prevented and input sets are copied before awaiting', async () => {
  const gate = deferred();
  const store = setup({ saveWorkoutSets: () => gate.promise });
  await store.getState().loadDay(date);
  const input = [{ reps: 5, weight: 100 }];
  const first = store.getState().saveExercise(date, 'Bench', input);
  input[0].weight = 999;
  assert.equal(await store.getState().saveExercise(date, 'Bench', sets), false);
  gate.resolve('Bench');
  assert.equal(await first, true);
  assert.equal(store.getState().workouts.Bench[0].weight, 100);
});
test('discovery can retry and special exercise names are ordinary data keys', async () => {
  let fail = true;
  const store = setup({ getOrCreateWorkoutSheet: async () => { if (fail) throw new Error('Connection failed'); return 'workout-sheet'; } });
  await store.getState().loadDay(date);
  assert.equal(store.getState().error, 'Connection failed');
  fail = false;
  await store.getState().loadDay(date);
  assert.equal(await store.getState().saveExercise(date, '__proto__', sets), true);
  assert.deepEqual(plain(store.getState().workouts['__proto__']), sets);
  assert.deepEqual(Object.keys(store.getState().workouts), ['__proto__']);
});
