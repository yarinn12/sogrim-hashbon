import assert from 'node:assert/strict';
import fs from 'node:fs';
const files = process.argv.slice(2);
assert.equal(files.length, 2, 'Provide the immutable before and fixed native logs');
function observation(path) {
  const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
  assert(lines.includes('PROBE_CALLBACK_APPLE_BROWSER:true'), 'Actual Apple browser must have opened');
  assert(lines.includes('PROBE_CALLBACK_DELIVERED:true'), 'Actual Capacitor proxy must have accepted callback');
  const finals = lines.filter(l => l.startsWith('PROBE_CALLBACK_FINAL:'));
  assert.equal(finals.length, 1, 'Exactly one completed native observation');
  const result = JSON.parse(finals[0].slice('PROBE_CALLBACK_FINAL:'.length));
  assert.equal(result.proxyRetainsCallback, true);
  assert.equal(result.feedback, true, 'Both gates display the intentional provider rejection');
  assert.equal(result.markLoaded, true, 'Observe the fully rendered production gate');
  assert.equal(result.reloads, lines.filter(l => l.startsWith('PROBE_CALLBACK_RELOAD:')).length);
  return result;
}
const before = observation(files[0]), fixed = observation(files[1]);
// The original native probe incorrectly required two observable loads in the
// failing control. The pinned SDK control instead reached one load, rendered
// rejection feedback, and remained unusable after the probe's 90-second deadline.
// Check the actual retry/bridge failure; do not relax any fixed-source assertion.
assert.equal(before.reloads, 1);
assert.equal(before.mark, './icon-192.png');
assert.equal(before.ready, false, 'Released control leaves the Apple button disabled');
assert.equal(before.retainedLaunch, false, 'Released control never completes the fresh App.getLaunchUrl observation');
assert.equal(fixed.reloads, 1, 'Fixed source delivers the callback exactly once');
assert.equal(fixed.mark, './app-icon-exterior-192.png');
assert.equal(fixed.ready, true, 'Fixed Apple button must permit a fresh attempt');
assert.equal(fixed.retainedLaunch, true, 'Fresh real SDK call returns its retained URL without replaying the callback');
console.log('NATIVE_CALLBACK_RETAINED_EVIDENCE_PASS:' + JSON.stringify({
  before: { reloads: before.reloads, retryReady: before.ready, freshLaunchObservation: before.retainedLaunch },
  fixed: { reloads: fixed.reloads, retryReady: fixed.ready, freshLaunchObservation: fixed.retainedLaunch, currentLogoLoaded: true }
}));
