import test from 'node:test';
import assert from 'node:assert/strict';
import {glyphsFitContainer} from '../scripts/qa/android-native-isolated/text-measurement.mjs';
test('all rendered Native glyphs use the same one-pixel containment limit',()=>{
  const row=right=>({rendered:true,inViewport:true,glyphs:[{left:0,right,top:0,bottom:20}],parent:{left:0,right:100,top:0,bottom:24},clientWidth:100,scrollWidth:100,clientHeight:24,scrollHeight:24});
  assert.equal([row(100),row(100),row(101.5)].every(glyphsFitContainer),false,'Array position cannot weaken glyph bounds');
  assert.equal([row(100),row(100.5),row(101)].every(glyphsFitContainer),true);
  assert.equal(glyphsFitContainer({...row(100),inViewport:false}),false);
  assert.equal(glyphsFitContainer({...row(100),glyphs:[]}),false);
});
