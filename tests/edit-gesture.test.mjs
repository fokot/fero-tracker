import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader} from './load-module.mjs';

function setup() {
  let now=0,id=0,opened=0,disabled=false;
  const timers=new Map();
  const {createEditGesture}=createLoader({globals:{setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimeout:(key)=>timers.delete(key)}})('src/lib/editGesture.ts');
  return {gesture:createEditGesture(()=>opened++,()=>disabled),get opened(){return opened;},disable(){disabled=true;},advance(ms){now+=ms;for(const [id,timer] of timers) if(timer.at<=now){timers.delete(id);timer.fn();}}};
}
const touch={pointerType:'touch',button:0,isPrimary:true,clientX:30,clientY:40};
test('a brief touch does not edit; a deliberate hold opens once and consumes its following click',()=>{
  const env=setup(),g=env.gesture;
  g.pointerDown(touch);env.advance(100);g.cancel();g.click({detail:1});env.advance(1000);
  g.click({detail:0,pointerType:'touch'});
  assert.equal(env.opened,0);
  g.pointerDown(touch);env.advance(500);assert.equal(env.opened,0);env.advance(50);
  assert.equal(env.opened,1);g.cancel();g.click({detail:1});env.advance(1000);assert.equal(env.opened,1);
});
test('scrolling, cancellation, unmount and disabling stop a pending long press',()=>{
  for(const cancel of [env=>env.gesture.pointerMove({clientX:30,clientY:60}),env=>env.gesture.cancel(),env=>env.disable()]) {
    const env=setup();env.gesture.pointerDown(touch);env.advance(300);cancel(env);env.advance(1000);assert.equal(env.opened,0);
  }
  const env=setup();env.gesture.pointerDown({...touch,isPrimary:false});env.advance(1000);assert.equal(env.opened,0);
});
test('mouse and accessible keyboard clicks open directly, while touch suppresses the native context menu',()=>{
  const env=setup(),g=env.gesture;
  g.pointerDown({...touch,pointerType:'mouse'});g.click({detail:1});assert.equal(env.opened,1);
  g.pointerDown(touch);g.cancel();g.click({detail:0});assert.equal(env.opened,2);
  let prevented=false;g.contextMenu({preventDefault:()=>prevented=true});assert.equal(prevented,true);
  env.disable();g.click({detail:0});assert.equal(env.opened,2);
});
