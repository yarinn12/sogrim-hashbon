import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {observeFreshWebViewBounds} from '../scripts/qa/android-native-isolated/native-observation.mjs';

const driver = readFileSync(new URL('../scripts/qa/android-native-isolated/driver.mjs', import.meta.url), 'utf8');
const matrix = readFileSync(new URL('../scripts/qa/android-native-isolated/matrix.mjs', import.meta.url), 'utf8');
const classSource = driver.slice(driver.indexOf('class Cdp {'), driver.indexOf('\nexport async function launch()'));
const packageName = 'com.sogrimhashbon.app.debug';

function nativePage({coveredOn = 0, inputFails = false, foreignBounds = false} = {}) {
  const commands = [];
  let hitCount = 0;
  const element = {
    disabled: false, dataset: {action: 'open-event'},
    scrollIntoView() {}, click() {throw new Error('DOM click cannot prove a Native hold');},
    getBoundingClientRect() {return {x: 50, y: 50, width: 100, height: 40};},
    contains() {return false;}
  };
  const browser = vm.createContext({
    document: {
      querySelector: () => element,
      elementFromPoint() {hitCount++; return hitCount === coveredOn ? {outerHTML: '<div class="cover">'} : element;}
    },
    devicePixelRatio: 2,
    requestAnimationFrame: callback => queueMicrotask(callback)
  });
  const adb = args => {
    commands.push(args);
    if (args[1] === 'uiautomator') return `UI hierchary dumped to: ${args.at(-1)}`;
    if (args[1] === 'cat') return `<hierarchy><node class="android.webkit.WebView" package="${foreignBounds ? 'other.app' : packageName}" bounds="[0,80][1080,2300]"/></hierarchy>`;
    if (args[1] === 'input' && inputFails) throw new Error('Native input rejected');
    return '';
  };
  const context = vm.createContext({adb, observeFreshWebViewBounds, packageName, sleep: async () => {}});
  vm.runInContext(`${classSource}\nglobalThis.Cdp = Cdp;`, context);
  const page = Object.create(context.Cdp.prototype);
  page.sequence = 0;
  page.nativeObservations = [];
  page.evaluate = expression => vm.runInContext(expression, browser);
  return {page, commands, hits: () => hitCount};
}

test('trusted Native hold uses one same-point ADB swipe after fresh geometry and records its receipt', async () => {
  const {page, commands, hits} = nativePage();
  const receipt = await page.hold('[data-action="open-event"]', 650);
  // vm-created arrays have a different prototype; compare the full ADB payload as host arrays.
  assert.deepEqual(commands.filter(args => args[1] === 'input').map(args => Array.from(args)), [['shell','input','swipe','200','220','200','220','650']]);
  assert.equal(commands.filter(args => args[1] === 'uiautomator').length, 1);
  assert.equal(hits(), 2, 'The target is hit-tested again after Native bounds observation');
  assert.equal(receipt.action, 'open-event');
  assert.equal(receipt.durationMs, 650);
  assert.deepEqual(Array.from(receipt.webViewBounds), [0,80,1080,2300]);
  assert.deepEqual(Array.from(receipt.inputCommand), ['shell','input','swipe','200','220','200','220','650']);
});

test('invalid duration, covered target, foreign bounds and failed Native input never yield a hold receipt', async () => {
  for (const duration of [0, 649, 651, 650.5, NaN, '650']) {
    const {page, commands} = nativePage();
    await assert.rejects(page.hold('[data-action="open-event"]', duration), /650.*integer|integer.*650/i);
    assert.equal(commands.length, 0);
  }
  for (const options of [{coveredOn: 1}, {coveredOn: 2}, {foreignBounds: true}, {inputFails: true}]) {
    const {page, commands} = nativePage(options);
    await assert.rejects(page.hold('[data-action="open-event"]', 650));
    assert.ok(commands.filter(args => args[1] === 'input').length <= (options.inputFails ? 1 : 0));
    assert.ok(commands.every(args => args[1] !== 'input' || args[2] === 'swipe'));
  }
});

test('six scale/orientation cases require Native hold, Native close, then the original event tap and tabs', () => {
  assert.match(matrix, /for\(const scale of \[1,1\.5,2\]\)for\(const \[orientation,rotation\] of \[\['portrait',0\],\['landscape',1\]\]\)/);
  const hold = matrix.indexOf('await page.hold(');
  const close = matrix.indexOf("await page.tap('[data-action=\"cancel-event-status-menu\"]')");
  const open = matrix.indexOf("row.nativeTaps.push(await page.tap('[data-action=\"open-event\"][data-event-id=\"android-native-event\"]'))");
  const tabs = matrix.indexOf("'Three event tabs'");
  assert.ok(hold >= 0 && close > hold && open > close && tabs > open, 'Native hold and close must precede the unchanged event tap and tab assertion');
  assert.match(matrix, /event-status-menu\[data-event-id/);
  assert.match(matrix, /dataset\.screen==='home'/);
  assert.match(matrix, /row\.nativeHolds\.push/);
  assert.doesNotMatch(matrix.slice(hold, open), /page\.click\(/);
});

test('matrix gates the original event tap on a visible Home menu and Native close', async () => {
  const start = matrix.indexOf('row.nativeHolds.push(await page.hold(');
  const tabsAssertion = "await waitFor(()=>page.evaluate(`Boolean(document.querySelector('.event-workspace-nav'))`),'Three event tabs');";
  const end = matrix.indexOf(tabsAssertion, start);
  assert.ok(start >= 0 && end > start, 'The actual matrix sequence is available for execution');
  const sequence = matrix.slice(start, end + tabsAssertion.length);

  async function exercise({holdOpensMenu = true, closeWorks = true} = {}) {
    const state = {screen: 'home', menu: false, tabs: false};
    const calls = [], checks = [], row = {nativeHolds: [], nativeTaps: []};
    const browser = vm.createContext({document: {querySelector(selector) {
      if (selector === '#app') return {dataset: {screen: state.screen}};
      if (selector === '.event-status-menu[data-event-id="android-native-event"]') return state.menu ? {} : null;
      if (selector === '.event-workspace-nav') return state.tabs ? {} : null;
      if (selector === '[data-action="open-event"][data-event-id="android-native-event"]') return state.screen === 'home' ? {} : null;
      throw new Error(`Unexpected selector: ${selector}`);
    }}});
    const page = {
      async hold(selector, duration) {
        calls.push(['hold', selector, duration]);
        if (holdOpensMenu) state.menu = true;
        else {state.screen = 'event'; state.tabs = true;}
        return {durationMs: duration};
      },
      async tap(selector) {
        calls.push(['tap', selector]);
        if (selector === '[data-action="cancel-event-status-menu"]') {
          assert.equal(state.menu, true, 'Close targets the opened menu');
          if (closeWorks) state.menu = false;
        } else {
          assert.equal(state.menu, false, 'Original tap follows menu close');
          state.screen = 'event'; state.tabs = true;
        }
        return {selector};
      },
      evaluate(expression) {return vm.runInContext(expression, browser);}
    };
    const waitFor = async (predicate, label) => {
      const result = await predicate();
      if (!result) throw new Error(`${label} not observed`);
      return result;
    };
    const check = (name, ok) => checks.push({name, ok: Boolean(ok)});
    const run = vm.runInNewContext(`(async()=>{${sequence}})`, {page, row, waitFor, check});
    await run();
    return {calls, checks, row};
  }

  const good = await exercise();
  assert.deepEqual(good.calls.map(call => call[0]), ['hold', 'tap', 'tap']);
  assert.equal(good.calls[0][2], 650);
  assert.equal(good.calls[1][1], '[data-action="cancel-event-status-menu"]');
  assert.ok(good.checks.every(check => check.ok));
  assert.equal(good.row.nativeHolds.length, 1);
  assert.equal(good.row.nativeTaps.length, 2);
  await assert.rejects(exercise({holdOpensMenu: false}), /Native hold did not leave event options open on Home/);
  await assert.rejects(exercise({closeWorks: false}), /Native tap closes event options not observed/);
});
