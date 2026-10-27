import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader,plain,deferred} from './load-module.mjs';

test('listing accessible sheets handles pages and omits files the user cannot edit',async()=>{
  const calls=[];
  const api=createLoader({mocks:{'./googleApi':{googleRequest:async(url)=>{calls.push(url);return calls.length===1?{files:[{id:'a',name:'One',capabilities:{canEdit:true}},{id:'b',name:'Read only',capabilities:{canEdit:false}}],nextPageToken:'next'}:{files:[{id:'c',name:'Two',capabilities:{canEdit:true}}]};}}}})('src/lib/sheetConnections.ts');
  assert.deepEqual(plain(await api.listAccessibleSheets()),[{id:'a',name:'One'},{id:'c',name:'Two'}]);
  assert.match(calls[1],/pageToken=next/);
});
test('file inspection refuses non-sheets, trash and read-only files and creation produces a blank tracker',async()=>{
  let file={id:'a',name:'Sheet',mimeType:'application/vnd.google-apps.spreadsheet',capabilities:{canEdit:true}},body;
  const api=createLoader({mocks:{'./googleApi':{googleRequest:async(url,options)=>{if(options){body=JSON.parse(options.body);return{spreadsheetId:'new'};}return file;}}}})('src/lib/sheetConnections.ts');
  assert.deepEqual(plain(await api.getSpreadsheetInfo('a')),{id:'a',name:'Sheet'});
  for(const change of [{mimeType:'text/plain'},{trashed:true},{capabilities:{canEdit:false}}]){const previous=file;file={...file,...change};await assert.rejects(api.getSpreadsheetInfo('a'));file=previous;}
  const created=await api.createTrackerSpreadsheet('workouts');assert.equal(created.id,'new');
  assert.equal(body.sheets[0].properties.title,'Workouts');assert.equal(body.sheets[0].data[0].rowData[0].values[0].userEnteredValue.stringValue,'Date');
});

function switchSetup(prepare=async()=>{}) {
  const values=new Map();let version=0;
  const load=createLoader({globals:{localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}},mocks:{
    './sheetConnections':{prepareSheetConnection:prepare},'./googleOAuth':{getAuthVersion:()=>version},
    './localSync':{canSynchronize:()=>true,requestSync:()=>{}}, './remoteSync':{invalidateRemote:()=>{}},
    '../lib/localSync':{ensureLocal:()=>new Promise(()=>{}),requestSync:()=>{}},
    '../lib/localDatabase':{subscribeLocal:()=>()=>{}},
  }});
  const habits=load('src/store/useHabitStore.ts').useHabitStore,workouts=load('src/store/useWorkoutStore.ts').useWorkoutStore;
  const user={id:'user',email:'test@example.com'};
  habits.getState().setSession(user,'old-habits');habits.setState({hasLoaded:true,habits:[{id:'one',name:'Run',type:'boolean'}]});
  workouts.getState().setUser(user);workouts.getState().setSpreadsheet('old-workouts');
  return {habits,workouts,values,apply:load('src/lib/applySheetConnection.ts').applySheetConnection,expire:()=>version++};
}
test('a successful switch affects only its tracker and persists the choice after validation',async()=>{
  const env=switchSetup();
  assert.equal(await env.apply('habits',{id:'new-habits',name:'New habits'}),true);
  assert.equal(env.habits.getState().spreadsheetId,'new-habits');assert.equal(env.habits.getState().hasLoaded,false);
  assert.equal(env.workouts.getState().spreadsheetId,'old-workouts');
  assert.equal(JSON.parse(env.values.get('feros-tracker:sheets:user')).habits.id,'new-habits');
  await env.apply('workouts',{id:'new-workouts',name:'New workouts'});assert.equal(env.workouts.getState().spreadsheetId,'new-workouts');
});
test('a failed, conflicting or busy switch retains existing data and saved preferences',async()=>{
  const env=switchSetup(async()=>{throw new Error('Offline');});
  await assert.rejects(env.apply('habits',{id:'new',name:'New'}),/Offline/);
  await assert.rejects(env.apply('habits',{id:'old-workouts',name:'Wrong'}),/dve rôzne/);
  env.habits.setState({pendingWrites:1});await assert.rejects(env.apply('habits',{id:'new',name:'New'}),/Počkaj/);
  assert.equal(env.habits.getState().spreadsheetId,'old-habits');assert.equal(env.habits.getState().habits.length,1);assert.equal(env.values.size,0);
});
test('an expired selection cannot switch or persist into a different account',async()=>{
  const gate=deferred(),env=switchSetup(()=>gate.promise);
  const pending=env.apply('habits',{id:'new',name:'New'});
  env.expire();env.habits.getState().setSession({id:'other',email:'other@example.com'},'other-sheet');
  gate.resolve();assert.equal(await pending,null);assert.equal(env.habits.getState().spreadsheetId,'other-sheet');assert.equal(env.values.size,0);
});
