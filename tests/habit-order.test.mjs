import test from 'node:test';
import assert from 'node:assert/strict';
import { plain, deferred } from './load-module.mjs';
import { setupTracker, user, date } from './tracker-fixture.mjs';

const range = [new Date(2026, 9, 1), new Date(2026, 9, 31)];
async function setup(t) {
  const env = setupTracker(t), table = await env.seed();
  env.habits.getState().setSession(user, 'sheet-1');
  await env.habits.getState().loadHabitsAndValues(...range);
  return { ...env, store: env.habits, table };
}
const ids = store => plain(store.getState().habits).map(habit => habit.id);

test('column order survives an offline restart while history remains attached to stable habit IDs', async t => {
  const { store, table, reads } = await setup(t);
  await store.getState().setNumericValue('Read', date, '42');
  const values = plain(store.getState().habitValues), before = reads.length;
  assert.equal(await store.getState().reorderHabits(['read', 'run']), true);
  assert.deepEqual(ids(store), ['read', 'run']);
  assert.deepEqual(plain(store.getState().habitValues), values);
  assert.deepEqual(table.columns().map(column => column.id), ['read', 'run']);
  assert.equal(table.pending(), 2); assert.equal(store.getState().queuedWrites, 2);
  assert.equal((await table.export()).operations[1].schema.type, 'move');
  store.getState().clearUser(); store.getState().setSession(user, 'sheet-1');
  await store.getState().loadHabitsAndValues(...range);
  assert.deepEqual(ids(store), ['read', 'run']);
  assert.deepEqual(plain(store.getState().habitValues), values); assert.equal(reads.length, before);
});

test('order follows stable IDs through rename and deletion and appends new habits', async t => {
  const { store } = await setup(t);
  await store.getState().reorderHabits(['read', 'run']);
  await store.getState().renameHabit('read', 'Books');
  assert.deepEqual(ids(store), ['read', 'run']); assert.equal(store.getState().habits[0].name, 'Books');
  await store.getState().addHabit('Sleep', 'numeric');
  assert.equal(store.getState().habits[2].name, 'Sleep');
  await store.getState().deleteHabit('read');
  assert.equal(store.getState().habits[0].id, 'run'); assert.equal(store.getState().habits[1].name, 'Sleep');
});

test('invalid or stale orders, unchanged positions and failed storage writes never corrupt the durable order', async t => {
  const { store, table, fail } = await setup(t);
  assert.equal(await store.getState().reorderHabits(['run', 'read']), true); assert.equal(table.pending(), 0);
  for (const invalid of [['read', 'read'], ['run'], ['run', 'unknown'], ['run', 'read', 'unknown']]) {
    assert.equal(await store.getState().reorderHabits(invalid), false); assert.equal(table.pending(), 0);
  }
  fail(new Error('Storage full'));
  assert.equal(await store.getState().reorderHabits(['read', 'run']), false);
  assert.deepEqual(ids(store), ['run', 'read']); assert.equal(table.pending(), 0);
  assert.equal(store.getState().error, 'Storage full'); assert.equal(store.getState().pendingWrites, 0);
});

test('reordering cached habits works offline without initializing an additional table', async t => {
  const { store, storage, reads } = await setup(t);
  assert.equal(await store.getState().reorderHabits(['read', 'run']), true);
  assert.deepEqual(ids(store), ['read', 'run']); assert.equal(reads.length, 0);
  assert.deepEqual((await storage.list()).map(record => record.target.sheet), ['Habits']);
});

test('one transaction captures the requested order before yielding and moves several habits atomically', async t => {
  const { store, table } = await setup(t);
  await store.getState().addHabit('Sleep', 'numeric');
  const sleep = store.getState().habits.find(habit => habit.name === 'Sleep').id;
  const requested = [sleep, 'read', 'run'], saving = store.getState().reorderHabits(requested);
  requested.reverse(); assert.equal(await saving, true);
  assert.deepEqual(ids(store), [sleep, 'read', 'run']);
  const moves = (await table.export()).operations.filter(operation => operation.schema?.type === 'move');
  assert.equal(moves.length, 2); assert.equal(moves[0].transaction, moves[1].transaction);
});

test('background synchronization sends values and moves in the same table and a fresh device loads the order', async t => {
  const env = await setup(t);
  await env.store.getState().reorderHabits(['read', 'run']);
  await env.store.getState().setNumericValue('Read', date, '17');
  env.sync.authorizeSynchronization(user.id, []); await env.sync.wakeSynchronization();
  assert.equal(env.table.pending(), 0);
  assert.ok(env.sends.every(([target]) => target.sheet === 'Habits'));
  const device = setupTracker(t, { remote: env.inner });
  device.sync.authorizeSynchronization(user.id, []); device.habits.getState().setSession(user, 'sheet-1');
  await device.habits.getState().loadHabitsAndValues(...range);
  assert.deepEqual(ids(device.habits), ['read', 'run']); assert.equal(device.habits.getState().habitValues[date].Read, '17');
});

test('order stays isolated by spreadsheet and account', async t => {
  const { store, seed } = await setup(t);
  await store.getState().reorderHabits(['read', 'run']);
  await seed('habits', 'other'); store.getState().setSession(user, 'other'); await store.getState().loadHabitsAndValues(...range);
  assert.deepEqual(ids(store), ['run', 'read']);
  const other = { id: 'two', email: 'two@example.com' };
  await seed('habits', 'sheet-1', other); store.getState().setSession(other, 'sheet-1'); await store.getState().loadHabitsAndValues(...range);
  assert.deepEqual(ids(store), ['run', 'read']);
  store.getState().setSession(user, 'sheet-1'); await store.getState().loadHabitsAndValues(...range);
  assert.deepEqual(ids(store), ['read', 'run']);
});

test('a delayed order save remains attached to the original file and cannot repopulate a signed-out session', async t => {
  const { store, table } = await setup(t), gate = deferred(), transaction = table.transaction.bind(table);
  table.transaction = async (...args) => { await gate.promise; return transaction(...args); };
  const saving = store.getState().reorderHabits(['read', 'run']);
  store.getState().clearUser(); gate.resolve(); assert.equal(await saving, false);
  assert.deepEqual(ids(store), []); assert.equal(table.pending(), 1); assert.equal(store.getState().pendingWrites, 0);
});
