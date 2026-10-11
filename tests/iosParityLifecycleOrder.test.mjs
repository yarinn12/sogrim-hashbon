import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

// Local timing control only; ParityProbeUITests on iOS is the real boundary.
const source = await readFile(process.env.IOS_PARITY_XCTEST_SOURCE ||
  new URL('../scripts/qa/ios-parity/ParityUITests.swift', import.meta.url), 'utf8');
const bridgeSource = await readFile(process.env.IOS_PARITY_BRIDGE_SOURCE ||
  new URL('../scripts/qa/ios-parity/ParityBridge.swift', import.meta.url), 'utf8');

function planFromXCTest(swift) {
  const start = swift.indexOf('wait("acknowledged save"');
  const end = swift.indexOf('systemScreenshot("resumed")', start);
  assert.ok(start >= 0 && end > start, 'the native save-to-resume journey must exist');
  const path = swift.slice(start, end);
  const actions = [...path.matchAll(/XCUIDevice\.shared\.press\(\.home\)|wait\("native background"|app\.activate\(\)|wait\("native background and foreground"/g)]
    .map(match => match[0].includes('press') ? 'home' : match[0].includes('activate') ? 'activate' :
      match[0].includes('and foreground') ? 'await-resume' : 'await-background');
  const sharedDeadline = /let end = deadline \?\? Date\(\)\.addingTimeInterval\(timeout\)/.test(swift) &&
    /let lifecycleDeadline = Date\(\)\.addingTimeInterval\(35\)/.test(path) &&
    /wait\("native background", deadline: lifecycleDeadline\)/.test(path) &&
    /wait\("native background and foreground", deadline: lifecycleDeadline\)/.test(path);
  return {
    actions, sharedDeadline,
    observesBackground: /app\.state == \.runningBackground/.test(path),
    observesSuspendedBackground: /app\.state == \.runningBackgroundSuspended/.test(path),
    observesForeground: /app\.state == \.runningForeground/.test(path),
    requiresNewBackground: /backgrounds[^\n]*>[^\n]*priorBackgrounds/.test(path),
    requiresNewForeground: /foregrounds[^\n]*>[^\n]*priorForegrounds/.test(path),
    requiresCapture: /\["phase"\] as\? String == "resumed"/.test(path),
    activationCount: (path.match(/app\.activate\(\)/g) || []).length,
    restoreBudget: /wait\("persisted expense after real relaunch", timeout: 45\)/.test(swift)
  };
}

function runLifecycle(plan, {
  homeDelay = 6, activationDelay = 1, foregroundCallback = true,
  resumedDelay = 2, forceResumed = false, forceBackgroundAfterActivation = false,
  initialBackgrounds = 0
} = {}) {
  let now = 0;
  let state = 'foreground';
  let backgrounds = initialBackgrounds;
  let foregrounds = 1;
  let phase = 'saved';
  let activated = false;
  let homeAt = Infinity;
  let resumeAt = Infinity;
  let renewedBackgroundAt = Infinity;
  function advance(target) {
    for (let second = now + 1; second <= target; second++) {
      if (second === homeAt) { state = 'background'; backgrounds++; }
      if (second === renewedBackgroundAt) state = 'background';
      if (second === resumeAt) phase = 'resumed';
    }
    now = target;
  }
  function waitUntil(predicate, deadline) {
    while (now <= deadline) {
      if (predicate()) return true;
      if (now === deadline) return false;
      advance(now + 1);
    }
    return false;
  }
  for (const action of plan.actions) {
    if (action === 'home') homeAt = now + homeDelay;
    if (action === 'await-background') {
      const deadline = plan.sharedDeadline ? 35 : now + 35;
      if (!waitUntil(() => plan.observesBackground && state === 'background', deadline))
        return { accepted: false, activated, now, state };
    }
    if (action === 'activate') {
      activated = true;
      advance(now + activationDelay);
      state = 'foreground';
      if (foregroundCallback && backgrounds > initialBackgrounds) foregrounds++;
      if ((foregroundCallback && backgrounds > initialBackgrounds) || forceResumed) resumeAt = now + resumedDelay;
      if (forceBackgroundAfterActivation) renewedBackgroundAt = now + 1;
    }
    if (action === 'await-resume') {
      const deadline = plan.sharedDeadline ? 35 : now + 35;
      const accepted = waitUntil(() =>
        (plan.observesForeground ? state === 'foreground' : true) &&
        (plan.requiresNewBackground ? backgrounds > initialBackgrounds : backgrounds > 0) &&
        (plan.requiresNewForeground ? foregrounds > 1 : foregrounds > 0) &&
        (plan.requiresCapture ? phase === 'resumed' : true), deadline);
      return { accepted, activated, now, state };
    }
  }
  return { accepted: false, activated, now, state };
}

test('delayed Home completion cannot strand a single activation', () => {
  const plan = planFromXCTest(source);
  const result = runLifecycle(plan, { homeDelay: 6, activationDelay: 1 });
  assert.equal(result.accepted, true, JSON.stringify(result));
  assert.equal(result.state, 'foreground');
  assert.equal(plan.activationCount, 1);
  assert.equal(plan.observesSuspendedBackground, true);
  assert.equal(plan.requiresCapture, true);
});

test('Home failing to reach background cannot trigger activation', () => {
  const result = runLifecycle(planFromXCTest(source), { homeDelay: Infinity });
  assert.equal(result.accepted, false);
  assert.equal(result.activated, false);
  assert.equal(result.now, 35);
});

test('old foreground callback cannot satisfy resumed capture', () => {
  const result = runLifecycle(planFromXCTest(source), { foregroundCallback: false, forceResumed: true });
  assert.equal(result.accepted, false, JSON.stringify(result));
});

test('background app cannot satisfy resumed capture despite fresh counters', () => {
  const plan = planFromXCTest(source);
  const result = runLifecycle(plan, { forceBackgroundAfterActivation: true });
  assert.equal(result.accepted, false, JSON.stringify(result));
  assert.equal(runLifecycle({ ...plan, observesForeground: false }, { forceBackgroundAfterActivation: true }).accepted,
    true, 'dropping the foreground-state guard must falsely accept the capture');
});

test('prior background cannot replace a new Home transition', () => {
  const result = runLifecycle(planFromXCTest(source), { homeDelay: Infinity, initialBackgrounds: 1, forceResumed: true });
  assert.equal(result.accepted, false, JSON.stringify(result));
  assert.equal(result.activated, false);
});

test('lifecycle waits share 35 seconds while relaunch keeps 45 seconds', () => {
  const plan = planFromXCTest(source);
  const scenario = { homeDelay: 30, activationDelay: 1, resumedDelay: 6 };
  const result = runLifecycle(plan, scenario);
  assert.equal(result.accepted, false, JSON.stringify(result));
  assert.equal(result.now, 35);
  assert.equal(runLifecycle({ ...plan, sharedDeadline: false }, scenario).accepted, true,
    'removing the shared budget must make this over-budget journey falsely pass');
  assert.equal(plan.restoreBudget, true);
});

test('native resumed capture starts only after a new active callback', () => {
  const start = bridgeSource.indexOf('if state["phase"] as? String == "saved"');
  const end = bridgeSource.indexOf('if let error = error', start);
  assert.ok(start >= 0 && end > start);
  const guard = bridgeSource.slice(start, end);
  const requiresActive = /UIApplication\.shared\.applicationState == \.active/.test(guard);
  const requiresFreshForeground = /foregrounds > foregroundsAtLastBackground/.test(guard) &&
    /foregroundsAtLastBackground = foregrounds/.test(bridgeSource);
  let latch = false;
  function poll(active, foregrounds, lastBackgroundForegrounds) {
    if (latch) return false;
    if (requiresActive && !active) return false;
    if (requiresFreshForeground ? foregrounds <= lastBackgroundForegrounds : foregrounds <= 0) return false;
    latch = true;
    return true;
  }
  // Initial launch already counted one foreground. WebKit may continue polling
  // after Home while JavaScript capture cannot complete in the background.
  assert.equal(poll(false, 1, 1), false, 'background polling must not consume the capture latch');
  assert.equal(poll(true, 2, 1), true, 'a fresh foreground callback may request the capture once');
});
