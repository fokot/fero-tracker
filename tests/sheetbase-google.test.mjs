import test from 'node:test';
import assert from 'node:assert/strict';
import * as sdk from '@fokot/sheetbase';
import { setupTracker,user,date,tick } from './tracker-fixture.mjs';
import { setup } from './sheets-fixture.mjs';
test('the actual tracker stores sync dynamic schema and readable values through the Google adapter',async t=>{
  const cloud=setup({rows:[['Date']],definitions:null});
  const remote=sdk.createGoogleSheetsRemote({getCredentials:()=>({accountId:user.id,accessToken:'token'}),fetch:async(url,options)=>new Response(JSON.stringify(await cloud.request(url,options)))});
  const env=setupTracker(t,{remote});env.sync.authorizeSynchronization(user.id,[]);env.habits.getState().setSession(user,'sheet-1');await env.habits.getState().loadHabitsAndValues(new Date(),new Date());
  assert.deepEqual(cloud.rows,[['Date']]);
  await env.habits.getState().addHabit('Run','boolean');await env.habits.getState().addHabit('Read','numeric');await env.habits.getState().setNumericValue('Read',date,'0');
  const run=env.habits.getState().habits.find(habit=>habit.name==='Run');
  await env.habits.getState().toggleHabit('Run',date);await env.habits.getState().addHabit('Sleep','numeric');
  const sleep=env.habits.getState().habits.find(habit=>habit.name==='Sleep');await env.habits.getState().setNumericValue('Sleep',date,'7.5');await env.habits.getState().renameHabit(sleep.id,'Spánok');
  await tick();await env.sync.wakeSynchronization();
  assert.deepEqual(cloud.rows,[['Date','Run','Read','Spánok'],[date,'✓','0','7.5']]);
  assert.ok(cloud.definitions.some(row=>row[0]===sleep.id&&row[1]==='Spánok'&&row[2]==='numeric'));
  await env.habits.getState().deleteHabit(run.id);await env.sync.synchronizeRecord(env.habits.getState().localKey);
  assert.deepEqual(cloud.rows,[['Date','Read','Spánok'],[date,'0','7.5']]);assert.ok(cloud.tabs.some(tab=>tab.properties.title==='_Sheetbase'));
});


test('habit order moves complete Google columns and a new device follows their physical order', async t => {
  const cloud = setup({ rows: [['Date', 'Run', 'Read'], [date, '✓', '23'], ['', 'trailing note', 'keep']] });
  const remote = sdk.createGoogleSheetsRemote({ getCredentials: () => ({ accountId: user.id, accessToken: 'token' }),
    fetch: async (url, options) => new Response(JSON.stringify(await cloud.request(url, options))) });
  const env = setupTracker(t, { remote });
  env.sync.authorizeSynchronization(user.id, []); env.habits.getState().setSession(user, 'sheet-1');
  await env.habits.getState().loadHabitsAndValues(new Date(), new Date());
  const definitions = structuredClone(cloud.definitions), before = cloud.calls.length;
  assert.equal(await env.habits.getState().reorderHabits(['read', 'run']), true);
  await env.sync.wakeSynchronization();
  assert.deepEqual(cloud.rows, [['Date', 'Read', 'Run'], [date, '23', '✓'], ['', 'keep', 'trailing note']]);
  assert.deepEqual(cloud.definitions, definitions);
  assert.ok(!cloud.tabs.some(tab => tab.properties.title === 'HabitOrder'));
  const requests = cloud.calls.slice(before).flatMap(call => call.body?.requests ?? []);
  assert.equal(requests.filter(request => request.moveDimension).length, 1);
  assert.ok(!requests.some(request => request.updateCells?.start?.sheetId === 0));
  const device = setupTracker(t, { remote });
  device.sync.authorizeSynchronization(user.id, []); device.habits.getState().setSession(user, 'sheet-1');
  await device.habits.getState().loadHabitsAndValues(new Date(), new Date());
  assert.deepEqual(Array.from(device.habits.getState().habits, habit => habit.id), ['read', 'run']);
  assert.equal(device.habits.getState().habitValues[date].Read, '23');
});
