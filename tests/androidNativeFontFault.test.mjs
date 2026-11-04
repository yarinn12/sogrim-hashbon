import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {stackedAndroidStylesheetFault,applyStylesheetFontFaultExpression,restoreStylesheetFontFaultExpression} from '../scripts/qa/android-native-isolated/font-fault.mjs';
import {refreshDynamicTypeControls} from '../src/publicDynamicTypeLayer.mjs';

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
  const style=text=>{
    const values=new Map(),priorities=new Map();
    const result={getPropertyValue:name=>values.get(name)||'',getPropertyPriority:name=>priorities.get(name)||'',setProperty(name,value,priority=''){values.set(name,value);priorities.set(name,priority);},removeProperty(name){values.delete(name);priorities.delete(name);}};
    Object.defineProperty(result,'cssText',{get:()=>[...values].map(([name,value])=>`${name}: ${value}${priorities.get(name)?' !'+priorities.get(name):''};`).join(' '),set:next=>{values.clear();priorities.clear();for(const declaration of next.split(';')){const separator=declaration.indexOf(':');if(separator<0)continue;const name=declaration.slice(0,separator).trim(),value=declaration.slice(separator+1).trim();result.setProperty(name,value.replace(/\s*!important$/,''),/!important$/.test(value)?'important':'');}}});
    result.cssText=text;return result;
  };
  const rootStyle=style('--android-font-scale: 1.5;'),root={style:rootStyle,getAttribute:()=>rootStyle.cssText};
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

// Exercise the real product layout writer against the unmodified font-control
// adapter. These are synthetic CSSOM boundaries, not Native rendering evidence.
function measuredLayout(f){
  const classes=new Set(['dynamic-type-active']),metrics={navHeight:82,actionHeight:56};
  const labels=[20,20,20,20].map(width=>({width}));
  const nav={clientWidth:800,getBoundingClientRect:()=>({width:800,height:metrics.navHeight}),querySelectorAll:()=>labels};
  f.root.classList={contains:name=>classes.has(name),remove:name=>classes.delete(name),toggle(name,on){on?classes.add(name):classes.delete(name);}};
  f.root.ownerDocument={defaultView:{getComputedStyle:()=>({paddingLeft:'6px',paddingRight:'6px',columnGap:'2px'})},querySelectorAll:()=>[nav],querySelector:()=>({getBoundingClientRect:()=>({height:metrics.actionHeight})}),createRange(){let element;return{selectNodeContents:value=>{element=value;},getBoundingClientRect:()=>({width:element.width})};}};
  refreshDynamicTypeControls(f.root);
  return metrics;
}

test('font restoration preserves independently updated product layout measurements',async t=>{
  for(const [name,navHeight,actionHeight] of [['navigation block only',160,56],['home action half only',82,84],['both measured properties',160,84]])await t.test(name,()=>{
    const f=fixture(),metrics=measuredLayout(f),beforeRules=f.element.sheet.cssRules.map(rule=>rule.cssText);
    const saved=runInNewContext(applyStylesheetFontFaultExpression,f.context);
    metrics.navHeight=navHeight;metrics.actionHeight=actionHeight;refreshDynamicTypeControls(f.root);
    const liveInline=f.root.getAttribute('style');
    assert.notEqual(liveInline,saved.rootInlineStyle,'the real layout writer must change root style');
    const restored=runInNewContext(restoreStylesheetFontFaultExpression(saved),f.context);
    assert.equal(restored.exactRulesRestored,true);assert.equal(restored.rootFontStateUnchanged,true);assert.equal(restored.rootInlineUnchanged,false);
    assert.equal(f.root.getAttribute('style'),liveInline,'restore must preserve current measured layout');
    assert.equal(f.root.style.getPropertyValue('--dynamic-type-measured-nav-block'),`${navHeight}px`);
    assert.equal(f.root.style.getPropertyValue('--dynamic-home-action-half'),`${actionHeight/2}px`);
    assert.equal(f.root.style.getPropertyValue('--android-font-scale'),'1.5');assert.equal(f.root.style.getPropertyValue('font-size'),'');
    assert.deepEqual(f.element.sheet.cssRules.map(rule=>rule.cssText),beforeRules,'only the injected CSSOM font fault is removed');
  });
});

test('restoring the controlled font preserves unrelated live inline declarations and priorities',()=>{
  const f=fixture(),saved=runInNewContext(applyStylesheetFontFaultExpression,f.context);
  f.root.style.setProperty('color','green','important');f.root.style.setProperty('--another-layout-offset','23px');
  const live=f.root.getAttribute('style'),restored=runInNewContext(restoreStylesheetFontFaultExpression(saved),f.context);
  assert.equal(restored.rootFontStateUnchanged,true);assert.equal(f.root.getAttribute('style'),live);
  assert.equal(f.root.style.getPropertyPriority('color'),'important');assert.equal(f.rule.style.getPropertyValue('font-size'),'16px');
});

test('concurrent changes to the controlled font value or priority fail without a blind restore',()=>{
  for(const [value,priority] of [['18px','important'],['calc(16px * var(--android-font-scale, 1))',''],['','']]){
    const f=fixture(),saved=runInNewContext(applyStylesheetFontFaultExpression,f.context);
    if(value)f.rule.style.setProperty('font-size',value,priority);else f.rule.style.removeProperty('font-size');
    const before=f.rule.style.cssText;
    assert.throws(()=>runInNewContext(restoreStylesheetFontFaultExpression(saved),f.context),/changed/);
    assert.equal(f.rule.style.cssText,before,'a real concurrent font change must remain visible');
  }
});

test('live root font and scale changes remain failures even when layout variables also change',()=>{
  for(const [name,value,priority] of [['font-size','18px','important'],['font','18px serif','important'],['--android-font-scale','2',''],['--dynamic-text-16','2rem',''],['--dynamic-text-17','2rem',''],['text-size-adjust','120%',''],['-webkit-text-size-adjust','120%',''],['--android-font-scale','1.5','important']]){
    const f=fixture(),saved=runInNewContext(applyStylesheetFontFaultExpression,f.context);
    f.root.style.setProperty('--dynamic-type-measured-nav-block','160px');f.root.style.setProperty(name,value,priority);
    const before={root:f.root.getAttribute('style'),rule:f.rule.style.cssText};
    assert.throws(()=>runInNewContext(restoreStylesheetFontFaultExpression(saved),f.context),/changed/);
    assert.deepEqual({root:f.root.getAttribute('style'),rule:f.rule.style.cssText},before);
  }
});
