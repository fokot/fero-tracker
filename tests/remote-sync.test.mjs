import test from 'node:test';
import assert from 'node:assert/strict';
import { setup as sheetsFixture } from './sheets-fixture.mjs';
import { plain } from './load-module.mjs';
const setup=options=>sheetsFixture({apiModule:'src/lib/remoteSync.ts',...options});
const op=change=>({id:crypto.randomUUID(),change});
const value=(habitId,date,value)=>op({type:'habit-value',habitId,date,value});
const rows=()=>[['Date','Run','Read'],['2026-10-25','✓','0'],['2026-10-26','','10']];
const receipt=()=>({properties:{sheetId:5,title:'FeroTrackerSync',gridProperties:{rowCount:1000,columnCount:2}},rows:[['Batch ID','Saved at']]});

test('a warm batch needs one scoped read and one write, preserving adjacent cells and unrelated tabs',async()=>{
  const extra={properties:{sheetId:9,title:'Other',gridProperties:{rowCount:10,columnCount:3}},rows:[['private','keep']]};
  const env=setup({rows:rows(),extraTabs:[receipt(),extra]});await env.sheets.readRemote('sheet-1','habits');env.calls.length=0;
  await env.sheets.sendRemote('sheet-1','habits',[value('run','2026-10-25',''),value('read','2026-10-26','11')],'batch-1');
  assert.equal(env.calls.length,2);assert.equal(env.calls[0].method,'GET');assert.equal(env.calls[1].method,'POST');
  assert.deepEqual(plain(env.rows),[['Date','Run','Read'],['2026-10-25','','0'],['2026-10-26','','11']]);
  assert.deepEqual(plain(env.tabs.find(tab=>tab.properties.title==='Other')),extra);
});
test('add, rename, value and delete share an atomic batch with stable habit IDs',async()=>{
  const env=setup({rows:rows()});
  await env.sheets.sendRemote('sheet-1','habits',[
    op({type:'habit-add',habit:{id:'sleep',name:'Sleep',type:'numeric'}}),value('sleep','2026-10-27','7.5'),
    op({type:'habit-rename',habitId:'sleep',name:'Spánok'}),op({type:'habit-delete',habitId:'run'}),value('read','2026-10-27','0'),
  ],'schema-batch');
  assert.deepEqual(plain(env.rows),[['Date','Read','Spánok'],['2026-10-25','0'],['2026-10-26','10'],['2026-10-27','0','7.5']]);
  assert.deepEqual(plain(env.definitions),[['ID','Name','Type'],['read','Read','numeric'],['sleep','Spánok','numeric']]);
  const ledger=env.tabs.find(tab=>tab.properties.title==='FeroTrackerSync');assert.equal(ledger.properties.hidden,true);assert.equal(ledger.rows[1][0],'schema-batch');
  assert.equal(env.calls.filter(call=>call.method==='POST').length,1);
});
test('a lost response retries against the receipt without replaying destructive changes',async()=>{
  const env=setup({rows:rows(),loseBatchResponse:true}), operations=[op({type:'habit-rename',habitId:'run',name:'Walk'}),value('run','2026-10-27','✓')];
  await assert.rejects(env.sheets.sendRemote('sheet-1','habits',operations,'same-batch'),/Response lost/);
  assert.equal(env.rows[0][1],'Walk');
  const data=await env.sheets.sendRemote('sheet-1','habits',operations,'same-batch');
  assert.equal(data.habits[0].name,'Walk');assert.equal(env.calls.filter(call=>call.method==='POST').length,1);
  assert.equal(env.rows.filter(row=>row[0]==='2026-10-27').length,1);
});
test('new dates append only once and clearing updates every duplicate date',async()=>{
  const env=setup({rows:[...rows(),['2026-10-25','✓','4']]});
  await env.sheets.sendRemote('sheet-1','habits',[value('run','2026-10-25',''),value('run','2026-10-27','✓'),value('read','2026-10-27','0')],'dates');
  assert.equal(env.rows.filter(row=>row[0]==='2026-10-27').length,1);
  assert.ok(env.rows.filter(row=>row[0]==='2026-10-25').every(row=>row[1]===''));
  assert.equal(env.rows[1][2],'0');assert.equal(env.rows[3][2],'4');
});
test('columns beyond Z and full grids grow before writing',async()=>{
  const names=Array.from({length:26},(_,i)=>`H${i}`), env=setup({rows:[['Date',...names]],definitions:[['ID','Name','Type'],...names.map(name=>[name,name,'boolean'])],columns:27,rowCount:1});
  await env.sheets.sendRemote('sheet-1','habits',[op({type:'habit-add',habit:{id:'new',name:'Extra',type:'boolean'}}),value('new','2026-10-27','✓')],'wide');
  assert.equal(env.rows[1][27],'✓');assert.equal(env.rows[0][27],'Extra');
});
test('workout batches preserve all sets in one cell, zero weights and other days',async()=>{
  const env=setup({sheetName:'Workouts',definitions:null,rows:[['Date','Bench'],['2026-10-25','5×100'],['2026-10-26','3×120']]});
  await env.sheets.sendRemote('sheet-1','workouts',[
    op({type:'workout-rename',previousName:'Bench',name:'Tlaky'}),
    op({type:'workout-sets',date:'2026-10-25',name:'Tlaky',sets:[{reps:5,weight:100},{reps:3,weight:0}]}),
    op({type:'workout-sets',date:'2026-10-26',name:'Tlaky',sets:[]}),
  ],'workout');
  assert.deepEqual(plain(env.rows),[['Date','Tlaky'],['2026-10-25','5×100, 3×0'],['2026-10-26','']]);
});
test('a schema conflict or failed batch never partially alters Google data',async()=>{
  const env=setup({rows:rows()});
  await assert.rejects(env.sheets.sendRemote('sheet-1','habits',[value('missing','2026-10-25','✓')],'conflict'),/neexistuje/);
  assert.equal(env.calls.filter(call=>call.method==='POST').length,0);
  const failed=setup({rows:rows(),failBatch:true});
  await assert.rejects(failed.sheets.sendRemote('sheet-1','habits',[value('run','2026-10-25','')],'fail'));
  assert.deepEqual(plain(failed.rows),rows());assert.equal(failed.tabs.some(tab=>tab.properties.title==='FeroTrackerSync'),false);
});
test('ambiguous stable habit IDs are rejected before a queued edit can target the wrong column',async()=>{
  const env=setup({definitions:[['ID','Name','Type'],['same','Run','boolean'],['same','Read','numeric']]});
  await assert.rejects(env.sheets.sendRemote('sheet-1','habits',[value('same','2026-10-25','✓')],'ambiguous'),/jedinečné ID/);
  assert.equal(env.calls.filter(call=>call.method==='POST').length,0);
});
