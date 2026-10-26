import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader} from './load-module.mjs';

function setup() {
  let callback,version=0,disposed=0;const calls=[],listeners=new Map();
  class Builder {
    addView(){return this;}
    setDeveloperKey(value){calls.push(['key',value]);return this;}
    setAppId(value){calls.push(['app',value]);return this;}
    setOAuthToken(value){calls.push(['token',value]);return this;}
    setOrigin(value){calls.push(['origin',value]);return this;}
    setTitle(){return this;}setLocale(){return this;}
    setCallback(value){callback=value;return this;}
    build(){return{setVisible:()=>{},dispose:()=>disposed++};}
  }
  const window={google:{picker:{View:class{setMimeTypes(){return this;}},ViewId:{SPREADSHEETS:'sheets'},PickerBuilder:Builder}},location:{origin:'https://tracker.test'},addEventListener:(key,value)=>listeners.set(key,value),removeEventListener:key=>listeners.delete(key)};
  const api=createLoader({env:{VITE_GOOGLE_PICKER_API_KEY:'public-key',VITE_GOOGLE_PROJECT_NUMBER:'123'},globals:{window},mocks:{'./googleOAuth':{getAuthVersion:()=>version,getValidAccessToken:()=>'existing-token',SessionExpiredError:class extends Error{}}}})('src/lib/googlePicker.ts');
  return{api,calls,listeners,reply:value=>callback(value),expire:()=>version++,get disposed(){return disposed;}};
}
test('picker uses the existing token and restricted project and cleans up on selection',async()=>{
  const env=setup(),pending=env.api.pickGoogleSpreadsheet();await Promise.resolve();await Promise.resolve();
  env.reply({action:'picked',docs:[{id:'sheet-id',name:'Chosen'}]});
  const result=await pending;assert.equal(result.id,'sheet-id');assert.equal(result.name,'Chosen');
  assert.ok(env.calls.some(([key,value])=>key==='token'&&value==='existing-token'));
  assert.ok(env.calls.some(([key,value])=>key==='app'&&value==='123'));
  assert.equal(env.disposed,1);assert.equal(env.listeners.size,0);
});
test('canceling the picker returns no selection and late callbacks cannot change it',async()=>{
  const env=setup(),pending=env.api.pickGoogleSpreadsheet();await Promise.resolve();await Promise.resolve();
  env.reply({action:'cancel'});assert.equal(await pending,null);
  env.reply({action:'picked',docs:[{id:'late'}]});assert.equal(env.disposed,1);
});
test('stale account responses and expiry close the picker instead of applying a selection',async()=>{
  for(const trigger of [env=>{env.expire();env.reply({action:'picked',docs:[{id:'old-account'}]});},env=>env.listeners.get('google-session-expired')()]){
    const env=setup(),pending=env.api.pickGoogleSpreadsheet();await Promise.resolve();await Promise.resolve();trigger(env);
    await assert.rejects(pending);assert.equal(env.disposed,1);assert.equal(env.listeners.size,0);
  }
});
test('missing Picker configuration fails clearly without requesting broader OAuth access',async()=>{
  const api=createLoader()('src/lib/googlePicker.ts');
  assert.equal(api.isPickerConfigured(),false);await assert.rejects(api.initGooglePicker(),/zatiaľ nie je nastavený/);
});
