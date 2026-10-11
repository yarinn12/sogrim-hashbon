import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {stackedAndroidStylesheetFault,applyStylesheetFontFaultExpression,restoreStylesheetFontFaultExpression} from '../scripts/qa/android-native-isolated/font-fault.mjs';

const android=`html.dynamic-type-active.dynamic-type-android {
  /* Android WebView text zoom already applies the OS font scale. */
  font-size: 16px !important;
}`;
const css=`html { text-size-adjust:100%; }
html.dynamic-type-apple { font-size:calc(16px * var(--apple-font-scale,1)) !important; }
${android}
html.dynamic-type-active { --dynamic-text-16:1rem; --dynamic-text-17:1.0625rem; }
.product-brand-copy strong { font-size:var(--dynamic-text-17,17px) !important; }
`;

test('font control restores the old Android stylesheet declaration, not an inline root-only override',()=>{
  const plan=stackedAndroidStylesheetFault(css);
  assert.equal(plan.original,css);
  assert.equal(plan.mutated,css.replace('font-size: 16px !important;','font-size: calc(16px * var(--android-font-scale, 1)) !important;'));
  assert.equal(plan.mutated.replace('font-size: calc(16px * var(--android-font-scale, 1)) !important;','font-size: 16px !important;'),css);
  assert.equal(plan.selector,'html.dynamic-type-active.dynamic-type-android');
  assert.ok(plan.mutated.includes('--dynamic-text-16:1rem; --dynamic-text-17:1.0625rem;'));
  assert.ok(plan.mutated.includes('font-size:var(--dynamic-text-17,17px) !important;'));
});

test('font control refuses absent, ambiguous, overridden and already-faulted Android guards',()=>{
  for(const text of ['',css.replace(android,''),css+'\n'+android,css.replace('16px !important;','18px !important;'),css.replace('font-size: 16px !important;','font-size:16px;'),css.replace('font-size: 16px !important;','font-size:16px !important; color:red;'),stackedAndroidStylesheetFault(css).mutated])assert.throws(()=>stackedAndroidStylesheetFault(text));
});

// These are CSSOM adapter boundary tests, not a renderer or Native font model.
function fixture(){
  const style=text=>{let value='',priority='';const result={getPropertyValue:()=>value,getPropertyPriority:()=>priority,setProperty:(_name,next,nextPriority)=>{value=next;priority=nextPriority;}};Object.defineProperty(result,'cssText',{get:()=>value?`font-size: ${value}${priority?' !'+priority:''};`:'',set:next=>{const match=/^font-size:\s*(.*?)\s*(?:!(important))?;$/.exec(next);if(next&&!match)throw new Error('Unexpected fixture declaration');value=match?.[1]||'';priority=match?.[2]||'';}});result.cssText=text;return result;};
  const rootStyle=style(''),root={style:rootStyle,getAttribute:()=>`--android-font-scale: 1.5;${rootStyle.cssText}`};
  const rule={selectorText:'html.dynamic-type-active.dynamic-type-android',style:style('font-size: 16px !important;')};
  Object.defineProperty(rule,'cssText',{get:()=>`${rule.selectorText} { ${rule.style.cssText} }`});
  const other={cssText:'.product-brand-copy strong { font-size: 1.0625rem !important; }'};
  const element={id:'public-dynamic-type-style',textContent:css,sheet:{cssRules:[other,rule]}};
  return{element,root,rule,context:{document:{documentElement:root,getElementById:id=>id===element.id?element:null}}};
}

test('CSSOM fault changes one actual rule and exact restore preserves root inline state and all other rules',()=>{
  const f=fixture(),before=f.element.sheet.cssRules.map(rule=>rule.cssText),inline=f.root.getAttribute('style');
  const saved=runInNewContext(applyStylesheetFontFaultExpression,f.context);
  assert.equal(saved.ruleIndex,1);assert.equal(saved.beforeRule,before[1]);assert.equal(saved.afterRule,f.rule.cssText);
  assert.equal(f.rule.style.getPropertyValue('font-size'),'calc(16px * var(--android-font-scale, 1))');
  assert.equal(f.element.sheet.cssRules[0].cssText,before[0]);assert.equal(f.root.getAttribute('style'),inline);assert.equal(f.element.textContent,css);
  const restored=runInNewContext(restoreStylesheetFontFaultExpression(saved),f.context);
  assert.equal(restored.exactTextRestored,true);assert.equal(restored.exactRulesRestored,true);assert.equal(restored.rootInlineUnchanged,true);
  assert.deepEqual(f.element.sheet.cssRules.map(rule=>rule.cssText),before);assert.equal(f.root.getAttribute('style'),inline);
});

test('CSSOM fault refuses an inline font override or a stylesheet whose live guard differs from its text',()=>{
  for(const change of [f=>f.root.style.setProperty('font-size','24px','important'),f=>f.rule.style.setProperty('font-size','20px','important'),f=>f.element.sheet.cssRules.push(f.rule)]){
    const f=fixture();change(f);const before=f.element.sheet.cssRules.map(rule=>rule.cssText);
    assert.throws(()=>runInNewContext(applyStylesheetFontFaultExpression,f.context));
    assert.deepEqual(f.element.sheet.cssRules.map(rule=>rule.cssText),before);
  }
});

test('font fault restoration refuses concurrent source, CSSOM or root inline changes instead of overwriting them',()=>{
  for(const change of [f=>f.element.textContent+='/* external edit */',f=>f.element.sheet.cssRules[0].cssText+='/* external edit */',f=>f.root.style.setProperty('font-size','18px','important')]){
    const f=fixture(),saved=runInNewContext(applyStylesheetFontFaultExpression,f.context);change(f);
    const before={source:f.element.textContent,rules:f.element.sheet.cssRules.map(rule=>rule.cssText),inline:f.root.getAttribute('style')};
    assert.throws(()=>runInNewContext(restoreStylesheetFontFaultExpression(saved),f.context),/changed/);
    assert.deepEqual({source:f.element.textContent,rules:f.element.sheet.cssRules.map(rule=>rule.cssText),inline:f.root.getAttribute('style')},before);
  }
});
