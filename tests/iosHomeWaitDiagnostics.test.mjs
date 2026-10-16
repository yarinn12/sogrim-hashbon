import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const startup = readFileSync(new URL('../scripts/qa/ios-parity/startup-diagnostics.js', import.meta.url), 'utf8');
const journey = readFileSync(new URL('../scripts/qa/ios-parity/journey.js', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../scripts/qa/ios-parity/ParityBridge.swift', import.meta.url), 'utf8');

function simulator({appearsAt = Infinity, width = 120, height = 48, display = 'block', visibility = 'visible', styleThrows = false} = {}) {
  let now = 0;
  const timers = [], messages = [];
  const classes = values => ({contains: value => values.has(value)});
  const root = {classList: classes(new Set(['native-styles-pending', 'app-splash-active']))};
  const app = {classList: {contains: value => value === 'app-boot' && now < appearsAt},
    dataset: {get screen() {return now >= appearsAt ? 'home' : 'boot';}}};
  const home = {textContent: 'PRIVATE USER TEXT', getBoundingClientRect: () => ({x: 4, y: 12, left: 4, top: 12, right: 4 + width, bottom: 12 + height, width, height})};
  const document = {
    readyState: 'loading', documentElement: root, fonts: {status: 'loading'},
    addEventListener() {},
    querySelector: selector => selector === '#app' ? app : selector === 'link[data-native-layers="true"]' ? {media:'print',sheet:null} : null,
    querySelectorAll: selector => selector === '[data-screen-kind="home"]' && now >= appearsAt ? [home] : [],
  };
  const performance = {
    timeOrigin: 1792010108829, now: () => now,
    getEntriesByName: name => name === 'sogrim:start:first-screen-rendered' && now >= 300 ? [{startTime:300}] : [],
    getEntriesByType: () => [],
  };
  class FakeDate extends Date { static now() { return now; } }
  const context = vm.createContext({
    Date: FakeDate, document, performance, location: {protocol:'capacitor:', href:'capacitor://localhost/PRIVATE_PATH'},
    addEventListener() {}, getComputedStyle: () => {if(styleThrows)throw Error('computed style failed');return {display, visibility};},
    setTimeout: (callback, ms) => {timers.push({at:now + ms, callback});return timers.length;},
    webkit: {messageHandlers:{iosParity:{postMessage: message => messages.push(JSON.parse(JSON.stringify(message)))}}},
    localStorage: {getItem(){throw Error('Private storage must not be read by the home wait');}},
  });
  vm.runInContext(startup, context, {filename:'startup-diagnostics.js'});
  vm.runInContext(journey, context, {filename:'journey.js'});
  async function advanceTo(target) {
    while (true) {
      timers.sort((a,b) => a.at-b.at);
      if (!timers.length || timers[0].at > target) break;
      const timer = timers.shift();now = timer.at;timer.callback();
      for (let i=0;i<5;i++) await Promise.resolve();
    }
    now=target;
    for (let i=0;i<5;i++) await Promise.resolve();
  }
  const homeEvents = () => messages.filter(message => message.kind === 'startup-diagnostic' && message.startup.stage.startsWith('home-wait-')).map(message => message.startup);
  return {advanceTo,homeEvents,messages,app,document,context};
}

test('real QA producer records bounded entry and ready without changing 30s/100ms home wait', async () => {
  const run=simulator({appearsAt:500});
  await run.advanceTo(500);
  const events=run.homeEvents();
  assert.deepEqual(events.map(row=>row.stage),['home-wait-start','home-wait-ready']);
  assert.deepEqual(events.map(row=>row.probeCount),[0,6]);
  assert.ok(events.every(row=>row.deadlineEpochMs===30000 && row.timeoutMs===30000));
  assert.equal(events[1].homeCount,1);
  assert.equal(events[1].homeVisible,true);
  assert.equal(events[1].homeWidth,120);
  assert.equal(events[1].appScreen,'home');
  assert.equal(events[1].firstScreenRenderedMs,300);
  assert.equal(events[1].urlScheme,'capacitor');
  assert.equal(events[1].fontStatus,'loading');
  assert.equal(events[1].nativeStyleMedia,'print');
  assert.ok(!JSON.stringify(run.messages).includes('PRIVATE USER TEXT'));
  assert.ok(!JSON.stringify(run.messages).includes('PRIVATE_PATH'));
});

test('real QA producer preserves exact timeout and reports absent home after 300 probes', async () => {
  const run=simulator();
  await run.advanceTo(30000);
  assert.deepEqual(run.homeEvents().map(row=>row.stage),['home-wait-start','home-wait-timeout']);
  assert.equal(run.homeEvents()[1].probeCount,300);
  assert.equal(run.homeEvents()[1].homeCount,0);
  assert.ok(run.messages.some(message=>message.phase==='error' && message.errors?.some(error=>error.includes('iOS QA timed out: home'))));
});

test('home appearing after the deadline cannot turn a timeout into success', async () => {
  const run=simulator({appearsAt:30100});
  await run.advanceTo(30100);
  assert.deepEqual(run.homeEvents().map(row=>row.stage),['home-wait-start','home-wait-timeout']);
  assert.equal(run.homeEvents()[1].homeCount,0);
});

test('present but zero-sized home remains unready and exposes geometry only', async () => {
  const run=simulator({appearsAt:0,width:0});
  await run.advanceTo(30000);
  const events=run.homeEvents();
  assert.deepEqual(events.map(row=>row.stage),['home-wait-start','home-wait-timeout']);
  assert.equal(events[1].homeCount,1);
  assert.equal(events[1].homeVisible,false);
  assert.equal(events[1].homeWidth,0);
});

test('a throwing telemetry sink cannot change the original home result', async () => {
  const run=simulator({appearsAt:500});
  run.context.__iosParityStartup={mark(){throw Error('telemetry unavailable');}};
  await run.advanceTo(30000);
  assert.equal(run.messages.some(message=>message.phase==='error'),false);
  assert.equal(run.homeEvents().some(row=>row.stage==='home-wait-timeout'),false);
});

test('predicate failure is still terminal and emits a bounded error observation', async () => {
  const run=simulator({appearsAt:0,styleThrows:true});
  await run.advanceTo(0);
  assert.deepEqual(run.homeEvents().map(row=>row.stage),['home-wait-start','home-wait-error']);
  assert.equal(run.homeEvents()[1].probeCount,0);
  assert.ok(run.messages.some(message=>message.phase==='error' && message.errors?.some(error=>error.includes('computed style failed'))));
  assert.ok(!JSON.stringify(run.homeEvents()).includes('computed style failed'));
});

test('native receiver admits the same bounded home fields and never accepts free-form text', () => {
  for(const value of ['home-wait-start','home-wait-ready','home-wait-timeout','deadlineEpochMs','probeCount','homeCount','homeVisible','homeWidth','fontStatus','urlScheme'])
    assert.ok(bridge.includes(`"${value}"`),`Native receiver omits ${value}`);
  assert.doesNotMatch(bridge,/"homeText"|"storageValue"|"requestUrl"/);
});
