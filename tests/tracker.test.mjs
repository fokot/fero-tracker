import test from 'node:test';
import assert from 'node:assert/strict';
import { plain, deferred } from './load-module.mjs';
import { setupTracker, user, date, tick } from './tracker-fixture.mjs';
const range = [new Date(2026,9,1), new Date(2026,9,31)];
async function habits(t, options) {
  const env = setupTracker(t, options), table = await env.seed();
  env.habits.getState().setSession(user, 'sheet-1'); await env.habits.getState().loadHabitsAndValues(...range);
  return { ...env, table, store: env.habits };
}
async function workouts(t, options) {
  const env = setupTracker(t, options), table = await env.seed('workouts');
  env.workouts.getState().setUser(user); env.workouts.getState().setSpreadsheet('workout-sheet'); await env.workouts.getState().loadDay(date);
  return { ...env, table, store: env.workouts };
}
test('habits load offline from Sheetbase without network and zero stays a value', async t => {
  const { store, reads } = await habits(t); assert.equal(store.getState().hasLoaded, true); assert.equal(store.getState().habitValues[date].Read, '0'); assert.equal(reads.length, 0);
});
test('rapid habit toggles use the latest durable value and coalesce through Sheetbase', async t => {
  const { store, table } = await habits(t);
  await Promise.all(Array.from({length:3}, () => store.getState().toggleHabit('Run', date)));
  assert.equal(store.getState().habitValues[date].Run, '✓'); assert.equal(table.pending(), 1);
  await store.getState().toggleHabit('Run', date); assert.equal(store.getState().habitValues[date].Run, ''); assert.equal(table.pending(), 1);
});
test('habit schema changes retain identity, type, values and survive an offline remount', async t => {
  const env = await habits(t); await env.store.getState().setNumericValue('Read', date, '24'); await env.store.getState().renameHabit('read', '__proto__');
  env.store.getState().clearUser(); env.store.getState().setSession(user, 'sheet-1'); await env.store.getState().loadHabitsAndValues(...range);
  assert.equal(env.store.getState().habits[1].id, 'read'); assert.equal(env.store.getState().habitValues[date].__proto__, '24');
  await env.store.getState().deleteHabit('run'); assert.deepEqual(plain(env.store.getState().habits).map(habit => habit.name), ['__proto__']); assert.equal(env.store.getState().habitValues[date].__proto__, '24');
});
test('invalid habits, dates and numeric inputs cannot enter the durable queue', async t => {
  const { store, table } = await habits(t);
  assert.equal(await store.getState().addHabit(' READ ', 'numeric'), false);
  assert.equal(await store.getState().addHabit('Date', 'boolean'), false);
  assert.equal(await store.getState().setNumericValue('Read', date, '0x10'), false);
  assert.equal(await store.getState().toggleHabit('Run', 'bad'), false);
  assert.equal(table.pending(), 0); assert.equal(await store.getState().setNumericValue('Read', date, ''), true); assert.equal(store.getState().habitValues[date]?.Read ?? '', '');
});
test('failed local writes keep the previous visible and persisted value', async t => {
  const { store, table, fail } = await habits(t); fail(new Error('Storage full'));
  assert.equal(await store.getState().toggleHabit('Run', date), false); assert.equal(store.getState().habitValues[date].Run, ''); assert.equal(table.pending(), 0); assert.equal(store.getState().error, 'Storage full');
});
test('switching files keeps queued values attached to the original sheet and account', async t => {
  const { store, table, seed } = await habits(t); await store.getState().toggleHabit('Run', date);
  await seed('habits', 'other'); store.getState().setSession(user, 'other'); await store.getState().loadHabitsAndValues(...range);
  assert.equal(store.getState().habitValues[date].Run, ''); assert.equal(table.pending(), 1);
  store.getState().clearUser(); assert.equal(store.getState().localKey, null); assert.equal(table.pending(), 1);
});
test('explicit refresh reads remote history and cached calendar navigation stays local', async t => {
  const env = await habits(t); env.sync.authorizeSynchronization(user.id, []); await tick();
  const before = env.reads.length; await env.store.getState().loadHabitsAndValues(...range); assert.equal(env.reads.length, before);
  await env.store.getState().loadHabitsAndValues(...range, true); assert.equal(env.reads.length, before + 1);
});
test('workout day switching is local and weights of zero survive decoding', async t => {
  const { store, reads } = await workouts(t); assert.equal(store.getState().workouts.Drep[0].weight, 0);
  await store.getState().loadDay('2026-10-26'); assert.equal(store.getState().workouts.Bench[0].weight, 120); assert.equal(reads.length, 0);
});
test('new exercise and captured first sets share one local transaction', async t => {
  const { store, table } = await workouts(t), sets = [{ reps: 5, weight: 100 }];
  const saving = store.getState().saveExercise(date, 'New', sets); sets[0].weight = 999; assert.equal(await saving, true);
  assert.equal(store.getState().workouts.New[0].weight, 100); const record = await table.export();
  assert.equal(record.operations.length, 2); assert.equal(record.operations[0].schema.type, 'add'); assert.equal(Object.values(record.operations[1].values)[0], '5×100');
});
test('workout names are canonical, clearing one day retains other days and suggestions', async t => {
  const { store } = await workouts(t); await store.getState().saveExercise(date, ' bench ', [{ reps: 2, weight: 0 }]); assert.equal(store.getState().workouts.Bench[0].weight, 0);
  await store.getState().saveExercise(date, 'Bench', []); assert.equal(store.getState().workouts.Bench, undefined); assert.ok(store.getState().exercises.includes('Bench'));
  await store.getState().loadDay('2026-10-26'); assert.equal(store.getState().workouts.Bench[0].weight, 120);
});
test('workout rename preserves all cached days and rolls back conflicts', async t => {
  const { store } = await workouts(t); assert.equal(await store.getState().renameExercise(date, 'Bench', 'drep'), false);
  assert.equal(await store.getState().renameExercise(date, 'Bench', 'Tlaky'), true); assert.equal(store.getState().workouts.Tlaky[0].weight, 100);
  await store.getState().loadDay('2026-10-26'); assert.equal(store.getState().workouts.Tlaky[0].weight, 120);
});
test('invalid or unloaded workouts and storage failures retain the saved workout', async t => {
  const { store, fail } = await workouts(t);
  assert.equal(await store.getState().saveExercise('2026-10-26', 'Bench', []), false); assert.equal(await store.getState().saveExercise(date, 'New', []), false);
  assert.equal(await store.getState().saveExercise(date, 'Bench', [{ reps:0,weight:-1 }]), false);
  fail(new Error('Storage full')); assert.equal(await store.getState().saveExercise(date, 'Bench', []), false); assert.equal(store.getState().workouts.Bench[0].weight, 100);
});
test('first-time workouts offline require a connection', async t => {
  const { workouts } = setupTracker(t); workouts.getState().setUser(user); await workouts.getState().loadDay(date); assert.match(workouts.getState().error, /internet/); assert.equal(workouts.getState().loadedDate, null);
});
test('late exercise discovery cannot repopulate a signed-out session', async t => {
  const gate = deferred(); let calls = 0;
  const env = setupTracker(t, { mocks: { '../lib/workoutSheets': { getOrCreateWorkoutSheet: () => { calls++; return gate.promise; } } } });
  env.workouts.getState().setUser(user); env.sync.authorizeSynchronization(user.id, []);
  const first = env.workouts.getState().loadDay(date), second = env.workouts.getState().loadDay('2026-10-26'); assert.equal(calls, 1);
  env.workouts.getState().clearUser(); gate.resolve('new'); await Promise.all([first, second]); assert.equal(env.workouts.getState().spreadsheetId, null);
});
test('expired Google credentials expose reauthorization and a new login can recover the original queue', async t => {
  const env=await habits(t),remote=env.table.client.options.remote,commit=remote.commit;
  const {SheetbaseError}=await import('@fokot/sheetbase');let expired=true;
  remote.commit=async(...args)=>{if(expired)throw new SheetbaseError('auth-required','Expired');return commit(...args);};
  await env.store.getState().toggleHabit('Run',date);env.sync.authorizeSynchronization(user.id,[]);await tick();
  await env.sync.synchronizeRecord(env.table.key);assert.equal(env.table.pending(),1);
  const status=env.load('src/store/useSyncStore.ts').useSyncStore;assert.equal(status.getState().authorizedUserId,null);
  expired=false;env.sync.authorizeSynchronization(user.id,[]);await tick();await env.sync.synchronizeRecord(env.table.key);
  assert.equal(status.getState().authorizedUserId,user.id);assert.equal(env.table.pending(),0);assert.equal(env.store.getState().habitValues[date].Run,'✓');
});

test('a fresh connection starts empty and saves new habits through Sheetbase',async t=>{
  const env=setupTracker(t);env.sync.authorizeSynchronization(user.id,[]);
  env.habits.getState().setSession(user,'new-sheet');await env.habits.getState().loadHabitsAndValues(...range);
  assert.equal(env.habits.getState().hasLoaded,true);assert.deepEqual(plain(env.habits.getState().habits),[]);
  assert.equal(await env.habits.getState().addHabit('Run','boolean'),true);assert.equal(await env.habits.getState().toggleHabit('Run',date),true);
  await env.sync.synchronizeRecord(env.habits.getState().localKey);assert.equal(env.habits.getState().queuedWrites,0);
  assert.equal(env.habits.getState().habitValues[date].Run,'✓');
});
