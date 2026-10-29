import test from 'node:test';
import assert from 'node:assert/strict';
import * as sdk from '@fokot/sheetbase';
import { setupTracker,user,date,habitData,tick } from './tracker-fixture.mjs';
import { setup } from './sheets-fixture.mjs';
test('the actual tracker stores sync dynamic schema and readable values through the Google adapter',async t=>{
  const cloud=setup({rows:[['Date','Run','Read'],[date,'','0']]});
  const legacy=[{userId:user.id,sheetId:'sheet-1',kind:'habits',base:habitData,initialized:true,syncedAt:1,operations:[],batch:null}];
  const remote=sdk.createGoogleSheetsRemote({getCredentials:()=>({accountId:user.id,accessToken:'token'}),fetch:async(url,options)=>new Response(JSON.stringify(await cloud.request(url,options))),legacyLedgers:['FeroTrackerSync']});
  const env=setupTracker(t,{legacy,remote});env.habits.getState().setSession(user,'sheet-1');await env.habits.getState().loadHabitsAndValues(new Date(),new Date());
  await env.habits.getState().toggleHabit('Run',date);await env.habits.getState().addHabit('Sleep','numeric');
  const sleep=env.habits.getState().habits.find(habit=>habit.name==='Sleep');await env.habits.getState().setNumericValue('Sleep',date,'7.5');await env.habits.getState().renameHabit(sleep.id,'Spánok');
  env.sync.authorizeSynchronization(user.id,[]);await tick();await env.sync.wakeSynchronization();
  assert.deepEqual(cloud.rows,[['Date','Run','Read','Spánok'],[date,'✓','0','7.5']]);
  assert.ok(cloud.definitions.some(row=>row[0]===sleep.id&&row[1]==='Spánok'&&row[2]==='numeric'));
  await env.habits.getState().deleteHabit('run');await env.sync.synchronizeRecord(env.habits.getState().localKey);
  assert.deepEqual(cloud.rows,[['Date','Read','Spánok'],[date,'0','7.5']]);assert.ok(cloud.tabs.some(tab=>tab.properties.title==='_Sheetbase'));
});
