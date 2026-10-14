import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createEventPressGesture, normalizePointerTimeStamp} from '../src/ui/eventPressGesture.mjs';

const source = await readFile(process.env.EVENT_PRESS_SOURCE_FILE || 'src/app.mjs', 'utf8');
const functionSource = name => source.match(new RegExp('(?:async )?function ' + name + '\\([^]*?\\n\\}'))?.[0];

function harness({pauseTimers = false} = {}) {
  let clock = 0;
  let timerId = 0;
  const timers = new Map();
  const listeners = {app: new Map(), document: new Map()};
  const pending = [];
  const effects = {opened: 0, archived: 0};
  let context;
  const card = {dataset:{eventId:'qa-event'},isConnected:true,classList:{add(){},remove(){}},click(){throw new Error('The article wrapper is not the event activation button');}};
  function element(action = 'open-event') {
    const node = {
      dataset: {action, eventId: 'qa-event'}, isConnected: true, disabled: false,
      classList: {add() {}, remove() {}},
      closest(selector) {
        if (selector === '[data-action]') return node;
        if (selector.includes('[data-long-press-event=')) return action === 'open-event' ? card : null;
        if (selector === '[data-action="open-event"]') return action === 'open-event' ? node : null;
        if (selector.includes('event-status-select')) return action === 'event-status-select' ? node : null;
        return null;
      },
      click() { dispatch('click', {target: node, detail: 0, button: 0, pointerType: ''}); }
    };
    return node;
  }
  const row = element();
  const register = surface => (type, fn, options) => {
    const handlers = listeners[surface].get(type) || [];
    handlers.push({fn, capture: options === true || options?.capture});
    listeners[surface].set(type, handlers);
  };
  context = vm.createContext({
    createEventPressGesture,
    requestAnimationFrame: fn => {fn(); return 1;},
    performance: {now: () => clock, timeOrigin: 1792010000000},
    window: {setTimeout(fn, ms) { const id = ++timerId; timers.set(id, {at: clock + ms, fn}); return id; }, clearTimeout(id) { timers.delete(id); }},
    document: {addEventListener: register('document')},
    app: {addEventListener: register('app'), contains: node => node.isConnected, querySelector: () => ({focus() {}})},
    getEvent: id => id === 'qa-event' ? {id, name: 'Synthetic event'} : null,
    rememberDialogReturnFocus() {}, activateDialog() {}, isEditableTextTarget: target => target.editable === true,
    flushScheduledBrowserHistoryReplacement() {}, closeOpenTransientMenus() {}, dismissTransientBackdrop: () => false,
    rememberRecentEvent() { effects.opened++; }, requestResumeSyncAfterPaint() {},
    isEventPersonallyArchived: () => false, setEventPersonallyArchived() { effects.archived++; }, closeDialogWithHistory() {},
    runAppInteraction(fn, event) { pending.push(Promise.resolve(fn(event))); },
    render() {}, screen: {name: 'home'}, notice: '', expenseDraft: null, joinEventDraft: null, eventDialog: null, editingGroupDraft: null,
    eventStatusMenu: null, importantActionDialog: null
  });
  const first = Math.min(...['let eventLongPressTimer', 'let eventLongPressTarget', 'const eventPressGesture'].map(marker => source.indexOf(marker)).filter(i => i >= 0));
  const globals = source.slice(first, source.indexOf('let eventWorkspaceSwipe', first));
  const names = ['handleEventLongPressStart', 'handleEventLongPressMove', 'cancelEventLongPress', 'handleEventLongPressEnd', 'handleEventLongPressCancel', 'handleEventPressPointerDown', 'consumeEventPressClick', 'handleEventContextMenu', 'openEventStatusMenu', 'handleClickSafely', 'handleClick'];
  const dialogActions = source.match(/const DIALOG_OPEN_ACTIONS = new Set\(\[[^]*?\]\);/)[0];
  vm.runInContext('const EVENT_LONG_PRESS_DELAY_MS=560, EVENT_LONG_PRESS_MOVE_TOLERANCE_PX=12;\n' + dialogActions + '\n' + globals + '\n' + names.map(functionSource).filter(Boolean).join('\n'), context);
  for (const line of source.split('\n').filter(line => /^\s*(app|document)\.addEventListener\(/.test(line) && /EventLongPress|EventContextMenu|EventPressClick|EventPressPointerDown/.test(line))) vm.runInContext(line, context);
  register('app')('click', context.handleClickSafely);

  function dispatch(type, fields = {}) {
    const event = {type, target: row, isPrimary: true, pointerId: 1, pointerType: 'touch', button: 0, clientX: 50, clientY: 50, timeStamp: clock, detail: type === 'click' ? 1 : 0, ...fields};
    event.preventDefault = () => {event.defaultPrevented = true;};
    event.stopImmediatePropagation = () => {event.stopped = true;};
    event.stopPropagation = () => {event.stopped = true;};
    for (const surface of ['document', 'app']) for (const {fn} of listeners[surface].get(type) || []) {
      if (event.stopped) break;
      fn(event);
    }
    return event;
  }
  return {
    row, element, effects, dispatch,
    advance(to) {
      if (!pauseTimers) for (;;) {
        const next = [...timers].filter(([, t]) => t.at <= to).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        clock = next[1].at; timers.delete(next[0]); next[1].fn();
      }
      clock = to;
    },
    menu: () => vm.runInContext('eventStatusMenu', context),
    screen: () => context.screen.name,
    flush: async () => {await Promise.all(pending);}
  };
}

for (const route of ['timer', 'touch-contextmenu']) {
  test(`81ms tap opens once when UP is delivered at733ms: ${route}`, async () => {
    const h = harness({pauseTimers: route === 'touch-contextmenu'});
    h.dispatch('pointerdown', {timeStamp: 0});
    h.advance(560);
    if (route === 'touch-contextmenu') h.dispatch('contextmenu', {timeStamp: 560});
    h.advance(733);
    h.dispatch('pointerup', {timeStamp: 81});
    h.dispatch('click');
    await h.flush();
    assert.equal(h.screen(), 'event', 'Short original input must open the event despite delayed delivery');
    assert.equal(h.effects.opened, 1, 'One gesture opens exactly once');
    assert.equal(h.menu(), null, 'No event menu may remain from the short gesture');
  });
}

test('real560ms hold opens on release and consumes clicks on replacement DOM until the next pointerdown', async () => {
  const h = harness(); h.dispatch('pointerdown', {timeStamp: 0}); h.advance(560);
  assert.equal(h.menu(), null, 'Hold is classified at release');
  h.dispatch('pointerup', {timeStamp: 560});
  assert.ok(h.menu());
  const archive = h.element('toggle-personal-event-archive');
  h.dispatch('click', {target: archive}); h.dispatch('click', {target: archive}); await h.flush();
  h.dispatch('click', {target: archive, detail: 0, pointerType: 'touch'}); await h.flush();
  assert.equal(h.effects.archived, 0, 'Compatibility clicks cannot invoke an action after render');
  h.dispatch('pointerdown', {target: archive, timeStamp: 600});
  h.dispatch('pointerup', {target: archive, timeStamp: 650});
  h.dispatch('click', {target: archive}); await h.flush();
  assert.equal(h.effects.archived, 1, 'A new deliberate gesture can select the menu action');
});

test('an intentional new event tap is not swallowed by the previous gesture', async () => {
  const h = harness();
  for (const start of [0, 900]) {h.advance(start); h.dispatch('pointerdown', {timeStamp: start}); h.advance(start+81); h.dispatch('pointerup', {timeStamp: start+81}); h.dispatch('click');}
  await h.flush(); assert.equal(h.effects.opened, 2);
});

test('a new deliberate tap can open the event immediately after cancelling a real hold menu', async () => {
  const h = harness(); h.dispatch('pointerdown', {timeStamp: 0}); h.advance(560);
  h.dispatch('pointerup', {timeStamp: 560});
  h.dispatch('click', {target: h.element('cancel-event-status-menu'), detail: 0, pointerType: ''});
  h.advance(600); h.dispatch('pointerdown', {timeStamp: 600});
  h.advance(681); h.dispatch('pointerup', {timeStamp: 681}); h.dispatch('click');
  await h.flush(); assert.equal(h.effects.opened, 1); assert.equal(h.screen(), 'event');
});

for (const cancellation of ['move', 'cancel', 'additional-pointer', 'removed-target']) {
  test(`cancelled gesture does not navigate or open a menu: ${cancellation}`, async () => {
    const h = harness(); h.dispatch('pointerdown', {timeStamp: 0});
    if (cancellation === 'move') h.dispatch('pointermove', {clientX: 63});
    if (cancellation === 'cancel') h.dispatch('pointercancel');
    if (cancellation === 'additional-pointer') h.dispatch('pointerdown', {pointerId: 2, isPrimary: false});
    if (cancellation === 'removed-target') h.row.isConnected = false;
    h.advance(733); h.dispatch('pointerup', {timeStamp: 81}); h.dispatch('click'); await h.flush();
    assert.equal(h.effects.opened, 0); assert.equal(h.menu(), null);
  });
}

test('duplicate and delayed touch contextmenu cannot reopen a completed short gesture', async () => {
  const h = harness(); h.dispatch('pointerdown', {timeStamp: 0}); h.dispatch('contextmenu');
  h.advance(733); h.dispatch('pointerup', {timeStamp: 81}); h.dispatch('contextmenu'); h.dispatch('contextmenu'); h.dispatch('click');
  await h.flush(); assert.equal(h.effects.opened, 1); assert.equal(h.menu(), null);
});

for (const input of [{pointerType: 'mouse', button: 2}, {pointerType: '', button: 0, detail: 0, clientX: 0, clientY: 0}]) {
  test(`non-touch context remains immediate: ${JSON.stringify(input)}`, () => {
    const h = harness(); h.dispatch('contextmenu', input); assert.ok(h.menu());
  });
}

test('editable text retains its browser context menu', () => {
  const h = harness(); const target = {...h.row, editable: true};
  assert.equal(h.dispatch('contextmenu', {target}).defaultPrevented, undefined); assert.equal(h.menu(), null);
});

test('relative and epoch timestamps normalize without using delayed processing time', () => {
  const origin = 1792010000000;
  assert.equal(normalizePointerTimeStamp(81, origin), 81);
  assert.equal(normalizePointerTimeStamp(origin+81, origin), 81);
  for (const value of [NaN, Infinity, -1]) assert.equal(normalizePointerTimeStamp(value, origin), null);
  assert.equal(normalizePointerTimeStamp(origin+81, undefined), null);
  for (const [down, up] of [[0,81],[origin,origin+81],[origin,81],[0,origin+81],[NaN,Infinity],[100,81]]) {
    const g = createEventPressGesture({timeOrigin: () => origin});
    g.start({pointerId:1,timeStamp:down,clientX:0,clientY:0}, {});
    assert.equal(g.finish({pointerId:1,timeStamp:up}, () => true).kind, 'tap');
  }
});
