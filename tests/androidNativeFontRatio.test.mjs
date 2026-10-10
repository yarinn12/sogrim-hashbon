import test from 'node:test';
import assert from 'node:assert/strict';
import {scaledFontSizeMatches} from '../scripts/qa/android-native-isolated/font-ratio.mjs';

test('native typography guard accepts one requested scale and rejects stacked zoom', () => {
  for (const scale of [1,1.5,2]) assert.equal(scaledFontSizeMatches(12*scale,12,scale),true);
  assert.equal(scaledFontSizeMatches(27,12,1.5),false,'OS1.5 plus CSS1.5 must fail the actual guard');
  assert.equal(scaledFontSizeMatches(48,12,2),false,'OS2 plus CSS2 must fail the actual guard');
  assert.equal(scaledFontSizeMatches(12,12,1.5),false,'frozen text must fail');
  assert.equal(scaledFontSizeMatches(NaN,12,1.5),false);
});
