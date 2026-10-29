import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader,plain} from './load-module.mjs';
const session={user:{id:'one',email:'one@example.com',name:'One'},habitsId:'habits',workoutsId:'workouts'};
function setup(values=new Map(),failure=false) {
  const localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{if(failure)throw new Error('Storage full');values.set(key,value);},removeItem:key=>{if(failure)throw new Error('Storage full');values.delete(key);}};
  return {values,api:createLoader({globals:{localStorage}})('src/lib/session.ts')};
}
test('a fresh app has no session and new sessions survive reload until explicit sign-out',async()=>{
  const first=setup();assert.equal(await first.api.readLocalSession(),null);await first.api.saveLocalSession(session);
  const restored=setup(first.values);assert.deepEqual(plain(await restored.api.readLocalSession()),session);
  await restored.api.saveLocalSession(null);assert.equal(await first.api.readLocalSession(),null);
});
test('session storage contains only the public profile and selected sheet IDs',async()=>{
  const env=setup();await env.api.saveLocalSession({...session,accessToken:'secret',user:{...session.user,accessToken:'secret'}});
  assert.deepEqual(plain(await env.api.readLocalSession()),session);assert.ok(![...env.values.values()][0].includes('secret'));
});
test('malformed session data starts signed out and failed writes do not claim success',async()=>{
  for(const raw of ['{bad','{}','null','{"user":{"id":1,"email":"x"}}'])assert.equal(await setup(new Map([['feros-tracker:session',raw]])).api.readLocalSession(),null);
  const env=setup(new Map(),true);await assert.rejects(env.api.saveLocalSession(session),/Storage full/);assert.equal(await env.api.readLocalSession(),null);
});
