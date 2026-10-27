import test from 'node:test';
import assert from 'node:assert/strict';
import { plain, deferred } from './load-module.mjs';
import { setupLocal, user, habitData, tick } from './local-fixture.mjs';
const date = '2026-10-25', range = [new Date(), new Date()];
async function setup(options = {}) {
  const env = setupLocal(options); const key = await env.seed();
  const store = env.load('src/store/useHabitStore.ts').useHabitStore;
  store.getState().setSession(user, 'sheet-1'); await store.getState().loadHabitsAndValues(...range);
  return { ...env, store, key };
}
test('cached habits load with stable types without a Google authorization', async () => {
  const { store, requests } = await setup();
  assert.equal(store.getState().habits[1].type, 'numeric');
  assert.equal(store.getState().hasLoaded, true); assert.equal(requests.length, 0);
});
test('rapid toggles use the last durable state and keep other dates', async () => {
  const { store, database, key } = await setup();
  assert.deepEqual(await Promise.all([
    store.getState().toggleHabit('Run', date), store.getState().toggleHabit('Run', date), store.getState().toggleHabit('Run', '2026-10-26'),
  ]), [true, true, true]);
  assert.deepEqual(plain(store.getState().habitValues), { [date]: { Run: '' }, '2026-10-26': { Run: '✓' } });
  assert.equal((await database.api.readLocal(key)).operations.length, 2);
  assert.equal(store.getState().pendingWrites, 0); assert.equal(store.getState().queuedWrites, 2);
});
test('disk failure preserves the last saved state and reports the actual failure', async () => {
  const { store, database } = await setup();
  database.fail(new Error('Storage full'));
  assert.equal(await store.getState().toggleHabit('Run', date), false);
  assert.deepEqual(plain(store.getState().habitValues), {}); assert.equal(store.getState().error, 'Storage full');
});
test('network failure keeps a successful local edit and its queue', async () => {
  const { store, sync, database, key } = await setup({ remote: { sendRemote: async () => { throw new Error('Offline'); } } });
  sync.authorizeSynchronization(user.id);
  assert.equal(await store.getState().toggleHabit('Run', date), true);
  await sync.synchronizeRecord(key);
  assert.equal(store.getState().habitValues[date].Run, '✓');
  assert.equal((await database.api.readLocal(key)).operations.length, 1);
  assert.equal(store.getState().syncError, 'Offline'); assert.equal(store.getState().error, null);
  sync.pauseSynchronization();
});
test('a reload restores queued values and schema changes, without a token', async () => {
  const first = await setup();
  await first.store.getState().renameHabit('run', 'Walk');
  await first.store.getState().toggleHabit('Walk', date);
  first.store.getState().clearUser();
  const second = await setup({ database: first.database });
  assert.equal(second.store.getState().habits[0].name, 'Walk');
  assert.equal(second.store.getState().habitValues[date].Walk, '✓'); assert.equal(second.requests.length, 0);
  assert.equal(second.store.getState().queuedWrites, 2);
});
test('late hydration and commits cannot repopulate a different account', async () => {
  const env = await setup();
  const pending = env.store.getState().toggleHabit('Run', date);
  env.store.getState().setSession({ id: 'two', email: 'two@example.com' }, 'sheet-2');
  await pending; await tick();
  assert.equal(env.store.getState().user.id, 'two'); assert.equal(env.store.getState().habits.length, 0);
  assert.equal(env.store.getState().queuedWrites, 0);
  assert.equal((await env.database.api.readLocal(env.key)).operations.length, 1);
});
test('invalid names, dates, values and wrong habit types never enter the queue', async () => {
  const { store, database, key } = await setup();
  for (const name of ['', ' run ', 'x'.repeat(101)]) assert.equal(await store.getState().addHabit(name, 'boolean'), false);
  for (const value of ['Infinity', 'abc']) assert.equal(await store.getState().setNumericValue('Read', date, value), false);
  assert.equal(await store.getState().setNumericValue('Run', date, '5'), false);
  assert.equal(await store.getState().toggleHabit('Read', date), false);
  assert.equal(await store.getState().toggleHabit('Run', 'not-a-date'), false);
  assert.equal((await database.api.readLocal(key)).operations.length, 0);
  assert.equal(await store.getState().setNumericValue('Read', date, '0'), true);
  assert.equal(await store.getState().setNumericValue('Read', date, ''), true);
});
test('rename and delete preserve every other habit and zero, including special names', async () => {
  const { store } = await setup();
  await store.getState().setNumericValue('Read', date, '0'); await store.getState().toggleHabit('Run', date);
  assert.equal(await store.getState().renameHabit('run', '__proto__'), true);
  assert.equal(store.getState().habitValues[date]['__proto__'], '✓');
  assert.equal(await store.getState().deleteHabit('run'), true);
  assert.deepEqual(plain(store.getState().habitValues), { [date]: { Read: '0' } });
});
test('first-time sheets cannot be edited until a remote snapshot is available', async () => {
  const env = setupLocal(), store = env.load('src/store/useHabitStore.ts').useHabitStore;
  store.getState().setSession(user, 'unknown'); await store.getState().loadHabitsAndValues(...range);
  assert.equal(store.getState().hasLoaded, false); assert.equal(await store.getState().addHabit('New', 'boolean'), false);
  env.sync.authorizeSynchronization(user.id); await env.sync.synchronizeRecord(store.getState().localKey);
  assert.equal(store.getState().hasLoaded, true);
  assert.deepEqual(plain(store.getState().habits), habitData.habits); env.sync.pauseSynchronization();
});
test('another tab publishes newer committed revisions into the current view', async () => {
  const { store, database, key, model } = await setup();
  await database.api.updateLocal(key, record => ({ ...record, operations: [{id:'other-tab',change:{type:'habit-value',habitId:'run',date,value:'✓'}}] }));
  await tick(); assert.equal(store.getState().habitValues[date].Run, '✓');
  assert.equal(model.projectRecord(await database.api.readLocal(key)).values[date].Run, '✓');
});
test('reentering cached habits uses local data, and the refresh button path reads Google explicitly',async()=>{
  const {store,sync,requests,database,key}=await setup();await database.api.updateLocal(key,record=>({...record,syncedAt:Date.now()-3600000}));
  sync.authorizeSynchronization(user.id,[]);await tick();
  await store.getState().loadHabitsAndValues(...range);await sync.synchronizeRecord(key);assert.equal(requests.length,0);
  await store.getState().loadHabitsAndValues(...range,true);assert.equal(requests.length,1);sync.pauseSynchronization();
});
