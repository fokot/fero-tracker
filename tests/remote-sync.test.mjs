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
test('ordinary values read only fresh row/column indexes, and preserve server neighbors and cached history',async()=>{
  const env=setup({rows:rows(),extraTabs:[receipt()]}),base=(await env.sheets.readRemote('sheet-1','habits')).data;env.calls.length=0;
  env.rows.splice(1,0,['2026-10-24','✓','99']);env.rows[3][2]='external edit';
  const result=await env.sheets.sendRemote('sheet-1','habits',[value('run','2026-10-26','✓')],'fast',base);
  assert.equal(env.calls.length,2);
  assert.deepEqual(new URL(env.calls[0].url).searchParams.getAll('ranges'),["'Habits'!1:1","'Habits'!A2:A","'HabitDefinitions'!A:C","'FeroTrackerSync'!A:A","'FeroTrackerSync'!B1"]);
  assert.equal(env.rows[3][1],'✓');assert.equal(env.rows[3][2],'external edit');assert.equal(env.rows[2][2],'0');
  assert.equal(result.values['2026-10-26'].Run,'✓');assert.equal(result.values['2026-10-25'].Read,'0');
});
test('new dates append once without touching trailing notes with blank date cells',async()=>{
  const env=setup({rows:[...rows(),['','do not overwrite','tail note']]}),base=(await env.sheets.readRemote('sheet-1','habits')).data;
  await env.sheets.sendRemote('sheet-1','habits',[value('run','2026-10-27','✓'),value('read','2026-10-27','0')],'append-fast',base);
  assert.deepEqual(plain(env.rows[3]),['','do not overwrite','tail note']);assert.deepEqual(plain(env.rows[4]),['2026-10-27','✓','0']);
  assert.equal(env.rows.filter(row=>row[0]==='2026-10-27').length,1);
});
test('fast clears update duplicate dates but never append an empty day',async()=>{
  const env=setup({rows:[...rows(),['2026-10-25','✓','4']]}),base=(await env.sheets.readRemote('sheet-1','habits')).data;
  await env.sheets.sendRemote('sheet-1','habits',[value('run','2026-10-25',''),value('run','2026-10-30','')],'clear-fast',base);
  assert.ok(env.rows.filter(row=>row[0]==='2026-10-25').every(row=>row[1]===''));assert.equal(env.rows.length,4);assert.equal(env.rows[3][2],'4');
});
test('a reordered schema falls back to a complete snapshot before locating the target cell',async()=>{
  const env=setup({rows:rows()}),base=(await env.sheets.readRemote('sheet-1','habits')).data;env.calls.length=0;
  for(const row of env.rows)[row[1],row[2]]=[row[2],row[1]];
  await env.sheets.sendRemote('sheet-1','habits',[value('run','2026-10-26','✓')],'reorder',base);
  assert.equal(env.rows[2][2],'✓');assert.equal(env.rows[2][1],'10');
  assert.ok(env.calls.some(call=>new URL(call.url).searchParams.getAll('ranges').includes("'Habits'")));
});
test('a lost fast-append acknowledgement uses the receipt on retry and does not append twice',async()=>{
  const env=setup({rows:rows(),loseBatchResponse:true}),base=(await env.sheets.readRemote('sheet-1','habits')).data,ops=[value('run','2026-10-27','✓')];
  await assert.rejects(env.sheets.sendRemote('sheet-1','habits',ops,'lost-fast',base),/Response lost/);
  const result=await env.sheets.sendRemote('sheet-1','habits',ops,'lost-fast',base);
  assert.equal(result.values['2026-10-27'].Run,'✓');assert.equal(env.rows.filter(row=>row[0]==='2026-10-27').length,1);assert.equal(env.calls.filter(call=>call.method==='POST').length,1);
});
test('fast workout saves retain set order and zero, and clear only the intended day',async()=>{
  const env=setup({sheetName:'Workouts',definitions:null,rows:[['Date','Bench','Drep'],['2026-10-25','5×100','8×80'],['2026-10-26','3×120','']]}),base=(await env.sheets.readRemote('sheet-1','workouts')).data;env.calls.length=0;
  const result=await env.sheets.sendRemote('sheet-1','workouts',[op({type:'workout-sets',date:'2026-10-25',name:'bench',sets:[{reps:5,weight:0},{reps:3,weight:120}]}),op({type:'workout-sets',date:'2026-10-26',name:'Bench',sets:[]})],'workout-fast',base);
  assert.equal(env.rows[1][1],'5×0, 3×120');assert.equal(env.rows[1][2],'8×80');assert.equal(env.rows[2][1],'');assert.equal(result.days['2026-10-25'].Drep[0].weight,80);
  assert.ok(!new URL(env.calls[0].url).searchParams.getAll('ranges').includes("'Workouts'"));
});
test('new workout columns still use the full structural path and keep their header after clearing',async()=>{
  const env=setup({sheetName:'Workouts',definitions:null,rows:[['Date','Bench']]}),base=(await env.sheets.readRemote('sheet-1','workouts')).data;
  await env.sheets.sendRemote('sheet-1','workouts',[op({type:'workout-sets',date:'2026-10-25',name:'New',sets:[{reps:5,weight:0}]}),op({type:'workout-sets',date:'2026-10-25',name:'New',sets:[]})],'new-column',base);
  assert.deepEqual(plain(env.rows[0]),['Date','Bench','New']);assert.equal(env.rows[1][2],'');
});
test('1000 days and 30 habits transfer over 95 percent fewer grid cells for a normal write',async t=>{
  const names=Array.from({length:30},(_,i)=>`H${i}`),dates=Array.from({length:1000},(_,i)=>new Date(Date.UTC(2024,0,1)+i*86400000).toISOString().slice(0,10));
  const env=setup({rows:[['Date',...names],...dates.map(date=>[date,...names.map(()=> '✓')])],definitions:[['ID','Name','Type'],...names.map(name=>[name,name,'boolean'])],columns:31,extraTabs:[receipt()]}),base=(await env.sheets.readRemote('sheet-1','habits')).data;
  const before=env.gridCellsRead;await env.sheets.sendRemote('sheet-1','habits',[value('H20',dates[500],'')],'large-fast',base);
  const after=env.gridCellsRead-before;assert.ok(after/before<0.05,`${after} / ${before}`);assert.equal(env.rows[501][21],'');
  t.diagnostic(`Grid cells read: ${before} before, ${after} after (${(100*(1-after/before)).toFixed(1)}% less).`);
});
