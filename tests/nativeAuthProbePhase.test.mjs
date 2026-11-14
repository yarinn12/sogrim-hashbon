import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const probe = readFileSync(new URL('../scripts/qa/native-auth-session/native-auth-session-probe.py', import.meta.url), 'utf8');
const fixture = readFileSync(new URL('../scripts/qa/native-auth-session/native-auth-session-fixture.js', import.meta.url), 'utf8');
const condition = probe.match(/if (ready \|\| [^\r\n]+) \{/)[1];
const authAge = probe.match(/let authTicks = ([^\r\n]+)/)?.[1] ?? '0';
const js = expression => expression.replaceAll('self.probeTicks', 'ticks')
  .replaceAll('self.probeAuthStartTick', 'startTick').replaceAll('self.probeSawSafari', 'safari');
// Execute the arithmetic and boolean expressions emitted into the real Swift
// probe, rather than a second hand-written verdict model. Inputs are typed
// booleans/integers. SDK execution remains required in the original Native CI.
const finalize = new Function('ticks', 'startTick', 'ready', 'safari',
  `const authTicks = ${js(authAge)}; return ${js(condition)};`);

for (const [name, ticks, startTick] of [
  ['a late document starts authentication at tick75, not at view appearance', 90, 75],
  ['a late provider start still has an active bounded phase', 100, 80]
]) test(name, () => assert.equal(finalize(ticks, startTick, false, false), false));

test('the legacy Safari observation uses the same authentication phase', () =>
  assert.equal(finalize(45, 30, false, true), false));
test('an authentication phase that consumed90 ticks still fails', () =>
  assert.equal(finalize(95, 5, false, false), true));
test('a document that never offers authentication still fails at90 ticks', () =>
  assert.equal(finalize(90, 0, false, false), true));
test('startup before its90 tick boundary has not timed out', () =>
  assert.equal(finalize(89, 0, false, false), false));
test('actual complete account success can finish immediately', () =>
  assert.equal(finalize(20, 10, true, false), true));
test('the original negative Safari case still finishes after45 phase ticks', () =>
  assert.equal(finalize(50, 5, false, true), true));
test('the existing150 tick hard stop is retained before evaluating JavaScript', () => {
  assert.match(probe, /self\.probeTicks \+= 1\s+if self\.probeTicks > 150 \{ timer\.invalidate\(\); return \}/);
});
test('the outer130 second journey and single in-flight evaluation remain unchanged', () => {
  assert.match(probe, /let deadline = Date\(\)\.addingTimeInterval\(130\)/);
  assert.match(probe, /if self\.probeEvaluating \|\| self\.probeCompleted \{ return \}/);
  assert.match(probe, /!localStorage\.getItem\('probe-started'\)/);
});
test('success still requires the complete real account, event and final write', () => {
  assert.match(probe, /let ready = signedIn && state\["gate"\] as\? Bool == false && state\["eventVisible"\] as\? Bool == true && \(state\["writes"\] as\? Int \?\? 0\) > 0 && state\["writeValid"\] as\? Bool == true/);
  for (const field of ['signedIn', 'gate', 'eventVisible', 'pkce', 'bound', 'writeValid']) {
    assert.ok(probe.includes(`XCTAssertEqual(state["${field}"]`));
  }
  assert.ok(probe.includes('XCTAssertGreaterThan(state["writes"]'));
});
test('the phase-start observation reads the actual single-click marker', () => {
  assert.match(probe, /if self\.probeAuthStartTick == 0 && state\["started"\] as\? Bool == true \{\s+self\.probeAuthStartTick = self\.probeTicks\s+\}/);
  assert.match(probe, /let authTicks = self\.probeAuthStartTick > 0 \? self\.probeTicks - self\.probeAuthStartTick : 0/);
  const local = new Map();
  const storage = { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, String(value)), clear: () => local.clear() };
  const context = vm.createContext({ localStorage: storage, sessionStorage: { ...storage, clear() {} },
    fetch: async () => { throw Error('Unexpected external request'); }, URL, Response,
    location: { href: 'capacitor://localhost/' }, document: { getElementById: () => null, body: { textContent: '' } } });
  vm.runInContext(fixture, context);
  assert.equal(context.__nativeAuthProbeState().started, false);
  storage.setItem('probe-started', '1');
  assert.equal(context.__nativeAuthProbeState().started, true);
  assert.equal(context.__nativeAuthProbeState().pkce, 0, 'starting the phase does not fabricate a token exchange');
});
