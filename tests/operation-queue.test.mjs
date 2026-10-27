import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader,plain} from './load-module.mjs';
import {habitData,workoutData} from './local-fixture.mjs';
const load=createLoader(),{compactOperations}=load('src/lib/operationQueue.ts'),{applyChange}=load('src/lib/localModel.ts');
const op=change=>({id:crypto.randomUUID(),change});
const value=(value,date='2026-10-25')=>op({type:'habit-value',habitId:'run',date,value});
const workout=(sets,name='Bench')=>op({type:'workout-sets',date:'2026-10-25',name,sets});
const project=(base,ops)=>ops.reduce((data,{change})=>applyChange(data,change),base);
function equalResult(base,ops,protectedIds=[]){const compact=compactOperations(base,ops,protectedIds);assert.deepEqual(plain(project(base,compact)),plain(project(base,ops)));return compact;}
test('only the last absolute value per habit and day survives, including explicit clears',()=>{
  const ops=[value('✓'),value('✓','2026-10-26'),value(''),value('✓'),value('')];
  const result=equalResult(habitData,ops);assert.equal(result.length,2);assert.equal(result[1].change.value,'');
});
test('a frozen batch is immutable and only later unsent edits can be replaced',()=>{
  const ops=[value('✓'),value(''),value('✓'),value('')], frozen=ops.slice(0,2), result=equalResult(habitData,ops,frozen.map(op=>op.id));
  assert.deepEqual(plain(result.slice(0,2)),plain(frozen));assert.equal(result.length,3);assert.equal(result[2].id,ops[3].id);
});
test('renaming or deleting a habit is an ordering barrier',()=>{
  const rename=op({type:'habit-rename',habitId:'run',name:'Walk'});
  const ops=[value('✓'),rename,value(''),value('✓'),op({type:'habit-delete',habitId:'run'})];
  const result=equalResult(habitData,ops);assert.equal(result.length,4);assert.equal(result[1].id,rename.id);
});
test('workout coalescing retains creation of a new exercise even if its final sets are cleared',()=>{
  const sets=[{reps:5,weight:0}],ops=[workout(sets,'New exercise'),workout([{reps:8,weight:10}],'new exercise'),workout([],'New exercise')];
  const result=equalResult(workoutData,ops);assert.equal(result.length,2);assert.deepEqual(result[1].change.sets,[]);
});
test('canonical workout names coalesce, while global renaming retains the right order',()=>{
  const ops=[workout([{reps:5,weight:0}],'bench'),workout([],'Bench'),op({type:'workout-rename',previousName:'Bench',name:'Tlaky'}),workout([{reps:1,weight:125}],'Tlaky'),workout([],'tlaky')];
  assert.equal(equalResult(workoutData,ops).length,3);
});
