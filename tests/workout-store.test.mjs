import test from 'node:test';
import assert from 'node:assert/strict';
import { plain, deferred } from './load-module.mjs';
import { setupLocal, user, tick } from './local-fixture.mjs';
const date = '2026-10-25', sets = [{ reps: 5, weight: 100 }, { reps: 3, weight: 120 }];
async function setup(options = {}) {
  const env = setupLocal(options), key = await env.seed('workouts');
  const store = env.load('src/store/useWorkoutStore.ts').useWorkoutStore;
  store.getState().setUser(user); store.getState().setSpreadsheet('workout-sheet'); await store.getState().loadDay(date);
  return { ...env, store, key };
}
test('cached days switch immediately without network requests, with zero weights', async () => {
  const { store, requests } = await setup();
  assert.equal(store.getState().workouts.Drep[0].weight, 0);
  await store.getState().loadDay('2026-10-26');
  assert.equal(store.getState().workouts.Bench[0].weight, 120); assert.equal(requests.length, 0);
});
test('sets commit locally, use canonical names and are copied before awaiting', async () => {
  const { store } = await setup(), input = structuredClone(sets);
  const saving = store.getState().saveExercise(date, 'bench', input); input[0].weight = 999;
  assert.equal(await saving, true);
  assert.deepEqual(plain(store.getState().workouts.Bench), sets); assert.equal(store.getState().queuedWrites, 1);
});
test('deleting sets affects only the selected day and keeps the exercise suggestion', async () => {
  const { store } = await setup();
  assert.equal(await store.getState().saveExercise(date, 'Bench', []), true);
  assert.deepEqual(Object.keys(store.getState().workouts), ['Drep']); assert.ok(store.getState().exercises.includes('Bench'));
  await store.getState().loadDay('2026-10-26'); assert.equal(store.getState().workouts.Bench[0].weight, 120);
});
test('rename updates all cached days and survives reload while offline', async () => {
  const env = await setup();
  assert.equal(await env.store.getState().renameExercise(date, 'Bench', '__proto__'), true);
  env.store.getState().clearUser();
  const next = await setup({ database: env.database });
  assert.equal(next.store.getState().workouts['__proto__'][0].weight, 100);
  await next.store.getState().loadDay('2026-10-26'); assert.equal(next.store.getState().workouts['__proto__'][0].weight, 120);
});
test('disk failure, invalid sets and editing an unloaded date preserve saved workouts', async () => {
  const { store, database } = await setup();
  assert.equal(await store.getState().saveExercise('2026-10-26', 'Bench', []), false);
  assert.equal(await store.getState().saveExercise(date, 'New', []), false);
  assert.equal(await store.getState().saveExercise(date, 'Bench', [{ reps: 0, weight: -1 }]), false);
  database.fail(new Error('Storage full')); assert.equal(await store.getState().saveExercise(date, 'Bench', sets), false);
  assert.equal(store.getState().workouts.Bench[0].weight, 100); assert.equal(store.getState().error, 'Storage full');
});
test('lazy discovery is shared and cannot repopulate after sign-out', async () => {
  const gate = deferred(); let calls = 0;
  const env = setupLocal({ mocks: { '../lib/workoutSheets': { getOrCreateWorkoutSheet: () => { calls++; return gate.promise; } } } });
  const store = env.load('src/store/useWorkoutStore.ts').useWorkoutStore;
  store.getState().setUser(user); env.sync.authorizeSynchronization(user.id);
  const first = store.getState().loadDay(date), second = store.getState().loadDay('2026-10-26');
  assert.equal(calls, 1); store.getState().clearUser(); gate.resolve('workout-sheet'); await Promise.all([first, second]);
  assert.equal(store.getState().spreadsheetId, null); env.sync.pauseSynchronization();
});
test('a sheet switch retains the queue in the original file and clears the current day', async () => {
  const { store, database, key } = await setup();
  await store.getState().saveExercise(date, 'Bench', sets);
  store.getState().setSpreadsheet('replacement'); await tick();
  assert.equal(store.getState().spreadsheetId, 'replacement'); assert.equal(store.getState().loadedDate, null);
  assert.deepEqual(plain(store.getState().workouts), {}); assert.equal((await database.api.readLocal(key)).operations.length, 1);
});
test('offline first-time discovery asks for a connection instead of creating an empty editable sheet', async () => {
  const env = setupLocal(), store = env.load('src/store/useWorkoutStore.ts').useWorkoutStore;
  store.getState().setUser(user); await store.getState().loadDay(date);
  assert.match(store.getState().error, /internet/); assert.equal(store.getState().loadedDate, null);
});
