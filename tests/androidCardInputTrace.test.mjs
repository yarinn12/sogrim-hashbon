import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {cardInputTraceInstallExpression} from '../scripts/qa/android-native-isolated/card-input-trace.mjs';

function recorder() {
  const listeners = new Map();
  const options = [];
  let now = 733, menu = false;
  const context = vm.createContext({
    window: {addEventListener(type, fn, settings) {listeners.set(type, fn); options.push(settings);}},
    document: {querySelector: () => menu ? {} : null},
    performance: {now: () => now, timeOrigin: 1792010000000}
  });
  vm.runInContext(cardInputTraceInstallExpression, context);
  return {
    options, menu: value => {menu = value;},
    emit(type, action, fields = {}) {
      const event = {target: {closest: () => ({dataset: {action, eventId: 'private-id', text: 'private text'}})}, isPrimary: true, pointerId: 1, pointerType: 'touch', timeStamp: 81, ...fields};
      listeners.get(type)(event);
    },
    entries: () => JSON.parse(JSON.stringify(context.__qaCardInputTrace)),
    installAgain: () => vm.runInContext(cardInputTraceInstallExpression, context)
  };
}

test('passive QA observation retains separate input and processing clocks with an explicit schema', () => {
  const r = recorder(); r.emit('pointerdown', 'open-event', {timeStamp: 0});
  r.menu(true); r.emit('pointerup', undefined); r.emit('click', 'toggle-personal-event-archive');
  const entries = r.entries(); assert.equal(entries.length, 3);
  assert.deepEqual(entries[1], {type:'pointerup', eventTimeStamp:81, processedAt:733, timeOrigin:1792010000000, pointerId:1, pointerType:'touch', action:'open-event', menuVisible:true});
  assert.ok(r.options.every(o => o.capture === true && o.passive === true));
  assert.ok(!JSON.stringify(entries).includes('private'));
});

test('QA observation is capped at32, installs once and excludes unrelated actions/releases', () => {
  const r = recorder(); r.installAgain();
  r.emit('pointerdown', 'save-profile'); r.emit('pointerup', undefined); r.emit('click', 'save-profile');
  assert.equal(r.entries().length, 0);
  for (let i=0; i<40; i++) r.emit('click', 'open-event');
  assert.equal(r.entries().length, 32); assert.equal(r.options.length, 4);
});

test('Native tap producer and original opening assertion remain unchanged', async () => {
  const driver = await readFile('scripts/qa/android-native-isolated/driver.mjs','utf8');
  const matrix = await readFile('scripts/qa/android-native-isolated/matrix.mjs','utf8');
  assert.match(driver, /adb\(\['shell','input','tap',String\(x\),String\(y\)\]\)/);
  assert.match(driver, /await cdp\.evaluate\(`\$\{cardInputTraceInstallExpression\}; document\.fonts\.ready\.then\(\(\) => true\)`\)/);
  assert.match(driver, /cardInputTrace,/);
  assert.match(matrix, /row\.nativeTaps\.push\(await page\.tap\('\[data-action="open-event"\]\[data-event-id="android-native-event"\]'\)\)/);
  assert.match(matrix, /waitFor\([^]*?'Three event tabs'\)/);
});
