import test from 'node:test';
import assert from 'node:assert/strict';
import { deferred, plain } from './load-module.mjs';
import { setupLocal, user, habitData, tick } from './local-fixture.mjs';
const change = value => ({ type: 'habit-value', habitId: 'run', date: '2026-10-25', value });
const until = async predicate => { for(let i=0; i<30 && !predicate(); i++) await tick(); assert.ok(predicate(), 'async step reached'); };

test('several durable edits share one cloud batch and acknowledge only committed IDs', async () => {
  const env=setupLocal(), key=await env.seed();
  await Promise.all(['✓','','✓'].map(value=>env.sync.enqueueLocal(key,()=>change(value))));
  assert.equal((await env.database.api.readLocal(key)).operations.length,3);assert.equal(env.sends.length,0);
  env.sync.authorizeSynchronization(user.id);await env.sync.synchronizeRecord(key);
  const saved=await env.database.api.readLocal(key);
  assert.equal(env.sends.length,1);assert.equal(env.sends[0][2].length,3);assert.equal(saved.operations.length,0);
  assert.equal(saved.base.values['2026-10-25'].Run,'✓');assert.equal(saved.batch,null);env.sync.pauseSynchronization();
});
test('a new local edit during a cloud request is preserved for the following batch',async()=>{
  const gate=deferred(), env=setupLocal({remote:{sendRemote:()=>gate.promise}}),key=await env.seed();
  await env.sync.enqueueLocal(key,()=>change('✓'));env.sync.authorizeSynchronization(user.id);
  const sending=env.sync.synchronizeRecord(key);await until(()=>env.status.getState().syncing.length>0 && !!env.database.records.get(key).batch);
  await env.sync.enqueueLocal(key,()=>change(''));
  gate.resolve({...habitData,values:{'2026-10-25':{Run:'✓'}}});await sending;
  const record=await env.database.api.readLocal(key);
  assert.equal(record.operations.length,1);assert.equal(env.model.projectRecord(record).values['2026-10-25'].Run,'');
  env.sync.pauseSynchronization();
});
test('offline edits survive a new runtime and wait for that account to be verified',async()=>{
  const env=setupLocal(),key=await env.seed();env.status.setState({online:false});
  await env.sync.enqueueLocal(key,()=>change('✓'));env.sync.authorizeSynchronization(user.id);await env.sync.synchronizeRecord(key);
  assert.equal(env.sends.length,0);env.sync.pauseSynchronization();
  const next=setupLocal({database:env.database});await next.sync.synchronizeRecord(key);assert.equal(next.sends.length,0);
  next.sync.authorizeSynchronization('someone-else');await next.sync.synchronizeRecord(key);assert.equal(next.sends.length,0);
  next.sync.authorizeSynchronization(user.id);await next.sync.synchronizeRecord(key);assert.equal(next.sends.length,1);next.sync.pauseSynchronization();
});
test('network errors preserve the exact batch ID through reload for safe retry',async()=>{
  const first=setupLocal({remote:{sendRemote:async()=>{throw new Error('Timeout');}}}),key=await first.seed();
  await first.sync.enqueueLocal(key,()=>change('✓'));first.sync.authorizeSynchronization(user.id);await first.sync.synchronizeRecord(key);
  const saved=await first.database.api.readLocal(key);assert.equal(saved.operations.length,1);assert.equal(saved.syncError,'Timeout');assert.ok(saved.batch.id);
  first.sync.pauseSynchronization();const second=setupLocal({database:first.database});second.sync.authorizeSynchronization(user.id);await second.sync.synchronizeRecord(key);
  assert.equal(second.sends[0][3],saved.batch.id);assert.equal((await second.database.api.readLocal(key)).operations.length,0);second.sync.pauseSynchronization();
});
test('switching authorization during a request cannot acknowledge or upload another account queue',async()=>{
  const gate=deferred(),env=setupLocal({remote:{sendRemote:()=>gate.promise}}),key=await env.seed();
  await env.sync.enqueueLocal(key,()=>change('✓'));env.sync.authorizeSynchronization(user.id);
  const sending=env.sync.synchronizeRecord(key);await until(()=>!!env.database.records.get(key).batch);
  env.expire();env.sync.authorizeSynchronization('two');gate.resolve({...habitData,values:{'2026-10-25':{Run:'✓'}}});await sending;
  assert.equal((await env.database.api.readLocal(key)).operations.length,1);assert.equal(env.status.getState().authorizedUserId,'two');env.sync.pauseSynchronization();
});
test('a refresh merges edits added during its request instead of replacing them',async()=>{
  const gate=deferred(),env=setupLocal({remote:{readRemote:()=>gate.promise}}),key=await env.seed();env.sync.authorizeSynchronization(user.id);
  const refresh=env.sync.synchronizeRecord(key,true);await until(()=>env.status.getState().syncing.includes(key));
  await env.sync.enqueueLocal(key,()=>change('✓'));gate.resolve({data:{...habitData,values:{'2026-10-26':{Read:'0'}}}});await refresh;
  const projected=env.model.projectRecord(await env.database.api.readLocal(key));
  assert.deepEqual(plain(projected.values),{'2026-10-25':{Run:'✓'},'2026-10-26':{Read:'0'}});env.sync.pauseSynchronization();
});
test('remote schema conflicts retain the prior projection and queue for recovery',async()=>{
  const env=setupLocal({remote:{sendRemote:async()=>{throw new Error('Návyk už neexistuje');}}}),key=await env.seed();
  await env.sync.enqueueLocal(key,()=>change('✓'));env.sync.authorizeSynchronization(user.id);await env.sync.synchronizeRecord(key);
  const record=await env.database.api.readLocal(key);assert.equal(env.model.projectRecord(record).values['2026-10-25'].Run,'✓');assert.match(record.syncError,/neexistuje/);env.sync.pauseSynchronization();
});
test('fallback leases block simultaneous clients until expiry',async()=>{
  const env=setupLocal({globals:{navigator:{onLine:true}}}),key=await env.seed();
  await env.sync.enqueueLocal(key,()=>change('✓'));
  await env.database.api.updateLocal(key,record=>({...record,lease:{owner:'other-device-tab',expires:Date.now()+90000}}));
  env.sync.authorizeSynchronization(user.id);await env.sync.synchronizeRecord(key);assert.equal(env.sends.length,0);
  await env.database.api.updateLocal(key,record=>({...record,lease:{owner:'other-device-tab',expires:0}}));
  await env.sync.synchronizeRecord(key);assert.equal(env.sends.length,1);assert.equal((await env.database.api.readLocal(key)).lease,undefined);env.sync.pauseSynchronization();
});
test('an expired request from an earlier login cannot pause a new verified session',async()=>{
  const gate=deferred(),env=setupLocal({remote:{sendRemote:()=>gate.promise}}),key=await env.seed();
  await env.sync.enqueueLocal(key,()=>change('✓'));env.sync.authorizeSynchronization(user.id);
  const pending=env.sync.synchronizeRecord(key);await until(()=>!!env.database.records.get(key).batch);
  env.expire();env.sync.authorizeSynchronization(user.id);gate.reject(new env.auth.SessionExpiredError());await pending;
  assert.equal(env.status.getState().authorizedUserId,user.id);assert.equal((await env.database.api.readLocal(key)).operations.length,1);env.sync.pauseSynchronization();
});
test('failure to persist a Google acknowledgement keeps the outbox, and a successful retry clears storage errors',async()=>{
  const env=setupLocal(),key=await env.seed();
  const send=env.cloud.sendRemote;
  env.cloud.sendRemote=async(...args)=>{const data=await send(...args);env.database.fail(new Error('Storage full'));return data;};
  await env.sync.enqueueLocal(key,()=>change('✓'));env.sync.authorizeSynchronization(user.id);await env.sync.synchronizeRecord(key);
  const before=await env.database.api.readLocal(key);assert.equal(before.operations.length,1);assert.ok(before.batch);assert.equal(env.status.getState().error,'Storage full');
  env.database.fail(null);env.cloud.sendRemote=send;await env.sync.synchronizeRecord(key);
  assert.equal((await env.database.api.readLocal(key)).operations.length,0);assert.equal(env.status.getState().error,null);env.sync.pauseSynchronization();
});
