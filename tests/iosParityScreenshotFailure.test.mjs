import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(process.env.IOS_PARITY_XCTEST_SOURCE ||
  new URL('../scripts/qa/ios-parity/ParityUITests.swift', import.meta.url), 'utf8');
const phases = ['keyboard-amount', 'keyboard-name', 'resumed', 'restored'];

// Source-backed control-flow model, not execution of XCTest on Windows.
// The original QA531 XCTest log demonstrates that an async method continued
// after its screenshot request recorded a failure. Actual SDK execution remains
// required in ios-native; a passing local model cannot accept a native build.
function afterScreenshot(swift, phase, failureCount) {
  const call = `systemScreenshot("${phase}")`;
  const begin = swift.indexOf(call);
  assert.ok(begin >= 0, `The required ${phase} screenshot must remain`);
  const tail = swift.slice(begin + call.length).replace(/\/\/[^\r\n]*/g, '');
  const guard = /^\s*guard testRun\?\.totalFailureCount == 0 else \{ return \}/.test(tail);
  const continues = !guard || failureCount === 0;
  return { continues, failed: failureCount > 0, guard };
}

test('a recorded system screenshot failure stops before later native actions and success', () => {
  for (const phase of phases) {
    const result = afterScreenshot(source, phase, 1);
    assert.equal(result.continues, false, `${phase}: failed screenshot must stop the async XCTest method`);
    assert.equal(result.failed, true, 'Stopping must retain the original failure');
  }
});

test('uncaught exceptions and missing XCTest run state cannot authorize native continuation', () => {
  for (const phase of phases) {
    assert.equal(afterScreenshot(source, phase, 2).continues, false);
    assert.equal(afterScreenshot(source, phase, undefined).continues, false);
  }
});

test('healthy system screenshots retain all native input, ACK, lifecycle and relaunch checks', () => {
  for (const phase of phases) assert.equal(afterScreenshot(source, phase, 0).continues, true);
  for (const required of [
    'XCUIScreen.main.screenshot()', 'attachment.lifetime = .keepAlways',
    'app.typeText("120")', 'app.typeText("QA iOS")', 'tap("savePoint")',
    'wait("acknowledged save", timeout: 45)', 'waitForNativeBackground(deadline: lifecycleDeadline)',
    'app.terminate(); app.launch()', 'wait("persisted expense after real relaunch", timeout: 45)',
    'XCTAssertEqual(state()["restored"] as? Bool, true)',
    'NATIVE_PARITY_XCTEST_SUCCESS:', 'let lifecycleDeadline = Date().addingTimeInterval(35)'
  ]) assert.ok(source.includes(required), required);
  const originalContinuation = source.replace(/\n\s*guard testRun\?\.totalFailureCount == 0 else \{ return \}/g, '');
  assert.notEqual(originalContinuation, source);
  assert.equal(afterScreenshot(originalContinuation, 'keyboard-amount', 1).continues, true,
    'Removing the guard must reproduce QA531 continuation after the screenshot failure');
});
