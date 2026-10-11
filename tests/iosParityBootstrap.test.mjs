import test from 'node:test';
import assert from 'node:assert/strict';
import { iosParityBootstrap } from '../scripts/qa/ios-parity/bootstrap.mjs';
import { nativeRuntimeCompatibility } from '../src/domain/nativeRuntimeCompatibility.mjs';

test('unsigned iOS QA bootstrap satisfies the real native release-builder compatibility boundary', () => {
  const build = 187;
  assert.deepEqual(nativeRuntimeCompatibility(iosParityBootstrap(build), { expectedAndroidBuild: build }),
    { ok: true, reason: '' });
});
