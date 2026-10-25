import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader, deferred, plain } from './load-module.mjs';

const user = { id: 'one', email: 'test@example.com' };
const habit = { id: 'run', name: 'Run', type: 'boolean' };
function setup(overrides = {}) {
  const api = { loadHabitData: async () => ({ habits: [habit], values: [] }), saveHabit: async () => {}, writeHabitValue: async () => {}, renameHabit: async (id,habitId,name)=>({...habit,id:habitId,name:name.trim()}), deleteHabit:async()=>{}, ...overrides };
  const { useHabitStore: store } = createLoader({ mocks: { '../lib/googleSheets': api } })('src/store/useHabitStore.ts');
  store.getState().setSession(user, 'sheet-1');
  store.setState({ hasLoaded: true });
  return store;
}
const range = [new Date(2026, 9, 1, 12), new Date(2026, 9, 31, 12)];

test('loading starts only with a ready sheet and retains persisted types', async () => {
  const store = setup({ loadHabitData: async () => ({ habits: [{ ...habit, type: 'numeric' }], values: [] }) });
  await store.getState().loadHabitsAndValues(...range);
  assert.equal(store.getState().habits[0].type, 'numeric');
  assert.equal(store.getState().isLoading, false);
});
test('failed initial loads block edits until the data has loaded successfully', async () => {
  const store = setup({ loadHabitData: async () => { throw new Error('Unavailable'); } });
  store.setState({ hasLoaded: false });
  await store.getState().loadHabitsAndValues(...range);
  assert.equal(store.getState().hasLoaded, false);
  assert.equal(await store.getState().addHabit('Run', 'boolean'), false);
  assert.equal(store.getState().habits.length, 0);
});
test('rapid toggles serialize and merge without losing edits on other dates', async () => {
  const values = [], gate = deferred();
  const store = setup({ writeHabitValue: async (id, date, name, value) => { values.push([date, value]); if (values.length === 1) await gate.promise; } });
  store.setState({ habits: [habit] });
  const first = store.getState().toggleHabit('Run', '2026-10-25');
  const second = store.getState().toggleHabit('Run', '2026-10-25');
  const third = store.getState().toggleHabit('Run', '2026-10-26');
  await Promise.resolve();
  gate.resolve();
  assert.deepEqual(await Promise.all([first, second, third]), [true, true, true]);
  assert.deepEqual(values, [['2026-10-25', '✓'], ['2026-10-25', ''], ['2026-10-26', '✓']]);
  assert.deepEqual(plain(store.getState().habitValues), { '2026-10-25': { Run: '' }, '2026-10-26': { Run: '✓' } });
  assert.equal(store.getState().pendingWrites, 0);
});
test('a failed write leaves existing nested state untouched and surfaces an error', async () => {
  const saved = { '2026-10-25': { Run: '✓' } };
  const store = setup({ writeHabitValue: async () => { throw new Error('Network unavailable'); } });
  store.setState({ habits: [habit], habitValues: saved });
  assert.equal(await store.getState().toggleHabit('Run', '2026-10-25'), false);
  assert.equal(saved['2026-10-25'].Run, '✓');
  assert.equal(store.getState().habitValues, saved);
  assert.equal(store.getState().error, 'Network unavailable');
  assert.equal(store.getState().pendingWrites, 0);
});
test('old loads cannot restore data after sign-out or overwrite a newer account', async () => {
  const gate = deferred();
  const store = setup({ loadHabitData: () => gate.promise });
  const pending = store.getState().loadHabitsAndValues(...range);
  store.getState().clearUser();
  store.getState().setSession({ id: 'two', email: 'two@example.com' }, 'sheet-2');
  gate.resolve({ habits: [habit], values: [] });
  await pending;
  assert.equal(store.getState().user.id, 'two');
  assert.equal(store.getState().habits.length, 0);
});
test('old writes and queued operations cannot restore a cleared session', async () => {
  const gate = deferred();
  let count = 0;
  const store = setup({ writeHabitValue: async () => { count++; await gate.promise; } });
  store.setState({ habits: [habit] });
  const first = store.getState().toggleHabit('Run', '2026-10-25');
  const queued = store.getState().toggleHabit('Run', '2026-10-26');
  await Promise.resolve(); await Promise.resolve();
  store.getState().clearUser();
  gate.resolve();
  assert.deepEqual(await Promise.all([first, queued]), [false, false]);
  assert.equal(count, 1);
  assert.equal(store.getState().user, null);
  assert.deepEqual(plain(store.getState().habitValues), {});
  assert.equal(store.getState().pendingWrites, 0);
});
test('adding rejects blank or duplicate names and keeps failures out of local state', async () => {
  const store = setup({ saveHabit: async () => { throw new Error('Failed to save'); } });
  store.setState({ habits: [habit] });
  assert.equal(await store.getState().addHabit('   ', 'boolean'), false);
  assert.equal(await store.getState().addHabit('run', 'numeric'), false);
  assert.equal(await store.getState().addHabit('Read', 'numeric'), false);
  assert.equal(store.getState().habits.length, 1);
  assert.equal(store.getState().error, 'Failed to save');
});
test('numeric edits accept zero and clearing, reject invalid numbers and boolean habits', async () => {
  const writes = [];
  const store = setup({ writeHabitValue: async (...args) => { writes.push(args); } });
  store.setState({ habits: [{ ...habit, name: 'Read', type: 'numeric' }] });
  assert.equal(await store.getState().setNumericValue('Read', '2026-10-25', '0'), true);
  assert.equal(await store.getState().setNumericValue('Read', '2026-10-25', ''), true);
  assert.equal(await store.getState().setNumericValue('Read', '2026-10-25', 'Infinity'), false);
  assert.equal(await store.getState().setNumericValue('Read', '2026-10-25', 'abc'), false);
  assert.equal(await store.getState().toggleHabit('Read', '2026-10-25'), false);
  assert.equal(writes.length, 2);
});
test('special habit names remain ordinary data keys', async () => {
  const store = setup();
  store.setState({ habits: [{ ...habit, name: '__proto__' }] });
  assert.equal(await store.getState().toggleHabit('__proto__', '2026-10-25'), true);
  assert.equal(store.getState().habitValues['2026-10-25']['__proto__'], '✓');
});
test('rename and delete move only the chosen habit values and preserve zero, blanks and other dates', async () => {
  const store=setup();
  store.setState({habits:[habit,{id:'read',name:'Read',type:'numeric'}],habitValues:{'2026-10-25':{Run:'✓',Read:'0'},'2026-10-26':{Run:'',Read:'24'}}});
  assert.equal(await store.getState().renameHabit('run','__proto__'),true);
  assert.deepEqual(plain(store.getState().habitValues),{'2026-10-25':{['__proto__']:'✓',Read:'0'},'2026-10-26':{['__proto__']:'',Read:'24'}});
  assert.equal(await store.getState().deleteHabit('run'),true);
  assert.deepEqual(plain(store.getState().habits),[{id:'read',name:'Read',type:'numeric'}]);
  assert.deepEqual(plain(store.getState().habitValues),{'2026-10-25':{Read:'0'},'2026-10-26':{Read:'24'}});
});
test('failed habit management preserves local data and late results cannot restore a signed-out account', async () => {
  for(const action of ['renameHabit','deleteHabit']) {
    const failed=setup({[action]:async()=>{throw new Error('Offline');}});
    failed.setState({habits:[habit],habitValues:{'2026-10-25':{Run:'✓'}}});
    assert.equal(await failed.getState()[action]('run','Walk'),false);
    assert.deepEqual(plain(failed.getState().habits),[habit]);
    assert.equal(failed.getState().habitValues['2026-10-25'].Run,'✓');
    assert.equal(failed.getState().error,'Offline');
    const gate=deferred(), store=setup({[action]:()=>gate.promise});
    store.setState({habits:[habit]});
    const pending=store.getState()[action]('run','Walk');
    await Promise.resolve();await Promise.resolve();
    store.getState().clearUser();
    gate.resolve({...habit,name:'Walk'});
    assert.equal(await pending,false);
    assert.deepEqual(plain(store.getState().habits),[]);
    assert.equal(store.getState().pendingWrites,0);
  }
});
test('a queued habit rename follows pending value writes and deletion prevents later edits', async () => {
  const gate=deferred(),calls=[];
  const store=setup({writeHabitValue:async(...args)=>{calls.push(args);await gate.promise;}});
  store.setState({habits:[habit]});
  const value=store.getState().toggleHabit('Run','2026-10-25');
  const rename=store.getState().renameHabit('run','Walk');
  gate.resolve();
  assert.deepEqual(await Promise.all([value,rename]),[true,true]);
  assert.equal(store.getState().habitValues['2026-10-25'].Walk,'✓');
  assert.equal(await store.getState().deleteHabit('run'),true);
  assert.equal(await store.getState().toggleHabit('Walk','2026-10-25'),false);
  assert.equal(calls.length,1);
});
