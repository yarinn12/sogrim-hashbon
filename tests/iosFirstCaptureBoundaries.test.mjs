import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const dir = new URL('../scripts/qa/ios-parity/', import.meta.url);
const journey = readFileSync(process.env.IOS_CAPTURE_BOUNDARY_JOURNEY || new URL('journey.js', dir), 'utf8');
const startup = readFileSync(process.env.IOS_CAPTURE_BOUNDARY_STARTUP || new URL('startup-diagnostics.js', dir), 'utf8');

function captureProbe({throwing = false} = {}) {
  const marks = [], frames = [], posts = [];
  let releaseFonts;
  const context = vm.createContext({
    document: {fonts: {ready: new Promise(resolve => {releaseFonts = resolve;})}, documentElement: {scrollWidth:393}},
    requestAnimationFrame: fn => frames.push(fn),
    __iosParityStartup: {mark(stage, fields) {if (throwing) throw Error('sink unavailable'); marks.push({stage, ...fields, postedCount:posts.length});}},
    visualCapture: phase => ({phase, screen:'home', splashAbsent:true, splashMarkMs:100, capturedAtMs:110}),
    measure: () => ({}), homeReference: () => ({}), keyboardLayout: () => null,
    Capacitor: {isNativePlatform: () => true, getPlatform: () => 'ios'},
    location: {href:'capacitor://localhost/'}, getComputedStyle: () => ({fontSize:'17px'}),
    innerWidth:393, innerHeight:852, visualViewport:{height:852}, scrollX:0, scrollY:0,
    localStorage: {getItem: () => null},
    webkit: {messageHandlers: {iosParity: {postMessage: value => posts.push(value)}}},
    sleep: () => new Promise(() => {}), keyboardGeometryReadbacks: async () => {},
  });
  const start = journey.indexOf('  function observeFirstCapture(');
  const body = journey.slice(start < 0 ? journey.indexOf('  async function capture(') : start,
    journey.indexOf('  globalThis.__iosParityCaptureCurrent'));
  vm.runInContext('let phase="starting", nativeStatusReady=false, captureIndex=0; const pending=new Map(), errors=[], trustedClicks=[], trustedInputs=[]; let openedNote=null;\n'+body, context);
  return {marks, frames, posts, releaseFonts, context,
    begin: name => context.capture(name, {}),
    ack: () => vm.runInContext('pending.get(1)()', context),
    ready: () => vm.runInContext('nativeStatusReady', context),
    drain: async () => {for(let i=0;i<8;i++)await Promise.resolve();},
  };
}

for (const phase of ['home','restored']) test(`first ${phase} capture identifies font/frame/ACK waits without advancing readiness`, async () => {
  const p=captureProbe(); const done=p.begin(phase);
  assert.deepEqual(p.marks.map(x=>x.stage),['capture-start','fonts-wait-start']);
  assert.equal(p.posts.length,0); assert.equal(p.ready(),false);
  p.releaseFonts(); await p.drain();
  assert.deepEqual(p.marks.map(x=>x.stage),['capture-start','fonts-wait-start','fonts-ready','raf-wait-start']);
  assert.equal(p.frames.length,1); assert.equal(p.posts.length,0); assert.equal(p.ready(),false);
  p.frames.shift()(); assert.equal(p.frames.length,1); assert.equal(p.posts.length,0);
  p.frames.shift()(); await p.drain();
  assert.deepEqual(p.marks.slice(-2).map(x=>x.stage),['raf-ready','capture-post']);
  assert.equal(p.posts.length,1); assert.equal(p.ready(),false);
  assert.equal(p.marks.at(-1).postedCount,1,'capture-post must follow the original postMessage call');
  p.ack(); await done;
  assert.deepEqual(p.marks.slice(-2).map(x=>x.stage),['capture-ack','readiness-committed']);
  assert.equal(p.ready(),true); assert.ok(p.marks.every(x=>x.phase===phase));
});

test('a failed first-capture telemetry sink cannot change font/frame/ACK requirements', async () => {
  const p=captureProbe({throwing:true}); const done=p.begin('home');
  assert.equal(p.posts.length,0); p.releaseFonts(); await p.drain();
  p.frames.shift()(); p.frames.shift()(); await p.drain();
  assert.equal(p.posts.length,1); assert.equal(p.ready(),false);
  p.ack(); await done; assert.equal(p.ready(),true);
});

test('capture observations are limited to first home/restored and never add waits to other phases', async () => {
  const p=captureProbe(); const done=p.begin('notes'); p.releaseFonts(); await p.drain();
  p.frames.shift()(); p.frames.shift()(); await p.drain(); p.ack(); await done;
  assert.equal(p.marks.length,0); assert.equal(p.posts.length,1); assert.equal(p.ready(),false);
});

test('bundled stylesheet load/error is observed without logging resource URLs or defining readiness', () => {
  const listeners=new Map(), messages=[];
  const context=vm.createContext({Date,URL,performance:{now:()=>10,timeOrigin:1000},
    document:{readyState:'loading',addEventListener:(type,fn,capture)=>listeners.set(type,{fn,capture})},
    location:{href:'capacitor://localhost/'},addEventListener(){},
    webkit:{messageHandlers:{iosParity:{postMessage:value=>messages.push(value)}}},
  });
  vm.runInContext(startup,context);
  assert.equal(listeners.get('load')?.capture,true);
  assert.equal(listeners.get('error')?.capture,true);
  const sheet={tagName:'LINK',dataset:{nativeLayers:'true'},media:'print',href:'PRIVATE_URL'};
  listeners.get('load').fn({target:sheet});
  sheet.media='all'; listeners.get('error').fn({target:sheet});
  listeners.get('load').fn({target:{...sheet,dataset:{}}});
  assert.deepEqual(messages.filter(x=>x.startup.stage.startsWith('native-style-')).map(x=>[x.startup.stage,x.startup.nativeStyleMedia]),
    [['native-style-load','print'],['native-style-error','all']]);
  assert.equal(JSON.stringify(messages).includes('PRIVATE_URL'),false);
  assert.equal(context.nativeStatusReady,undefined);
});
