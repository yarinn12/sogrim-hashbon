import test from 'node:test';
import assert from 'node:assert/strict';
import {authoredNativeFontBase,authoredNativeFontMatches,actualAuthoredFontRules,hasAuthoredFontContract} from '../scripts/qa/android-native-isolated/font-contract.mjs';
const context=(scale=1,pointerCoarse=false,orientation='portrait')=>({scale,pointerCoarse,orientation,width:orientation==='portrait'?411:914,height:orientation==='portrait'?866:366,active:scale>1,dynamicType:scale===1?'normal':'extra-large'});
const home='.product-home-screen .top .brand h1',event='.event-overview-header h1',notes='[data-screen-kind="event-notes"] h1',profile='[data-screen-kind="profile"] h1',tabs='.event-workspace-tab strong',action='.event-header-action-label';

test('authored ordinary sizes reject the obsolete fourteen/eleven pixel fixture',()=>{
 assert.equal(authoredNativeFontBase(tabs,context()),13.5);
 assert.equal(authoredNativeFontBase(action,context()),11.5);
 assert.equal(authoredNativeFontMatches(13.5,tabs,context()),true);
 assert.equal(authoredNativeFontMatches(14,tabs,context()),false);
 assert.equal(authoredNativeFontMatches(11.5,action,context()),true);
 assert.equal(authoredNativeFontMatches(11,action,context()),false);
 assert.equal(authoredNativeFontBase(home,context()),29);
 assert.equal(authoredNativeFontBase(home,context(1,false,'landscape')),48);
 for(const selector of [event,notes,profile])assert.equal(authoredNativeFontBase(selector,context()),28);
});

test('AX semantic promotion is independent of the ordinary measured heading',()=>{
 for(const scale of [1.5,2]){
  assert.equal(authoredNativeFontBase(home,context(scale)),28);
  assert.equal(authoredNativeFontBase(event,context(scale)),28);
  assert.equal(authoredNativeFontBase(home,context(scale,false,'landscape')),32);
  for(const selector of [notes,profile])assert.equal(authoredNativeFontBase(selector,context(scale)),32);
  assert.equal(authoredNativeFontBase(action,context(scale)),16);
  assert.equal(authoredNativeFontMatches(32*scale,notes,context(scale)),true);
  assert.equal(authoredNativeFontMatches(28*scale,notes,context(scale)),false);
 }
});

test('actual coarse pointer media chooses the independently authored compact rem rules',()=>{
 for(const scale of [1,1.5,2])for(const orientation of ['portrait','landscape']){
  const c=context(scale,true,orientation);
  assert.equal(authoredNativeFontBase(tabs,c),14);
  for(const selector of [home,event,notes,profile])assert.equal(authoredNativeFontBase(selector,c),orientation==='portrait'?24:20);
 }
 assert.equal(authoredNativeFontBase(tabs,{...context(1,true,'landscape'),height:451}),13.5);
});

test('all authored branches retain the original tolerance and reject frozen and stacked OS zoom',()=>{
 for(const scale of [1.5,2])for(const pointerCoarse of [false,true])for(const orientation of ['portrait','landscape'])for(const selector of [home,event,notes,profile,tabs,action]){
  const c=context(scale,pointerCoarse,orientation),base=authoredNativeFontBase(selector,c),expected=base*scale;
  assert.equal(authoredNativeFontMatches(expected,selector,c),true);
  assert.equal(authoredNativeFontMatches(base,selector,c),false,'Frozen font must fail');
  assert.equal(authoredNativeFontMatches(expected*scale,selector,c),false,'Stacked zoom must fail');
  assert.equal(authoredNativeFontMatches(expected+.21,selector,c),false,'Tolerance must not expand');
 }
});

test('missing readbacks, stale classes and wrong orientation cannot choose a permissive contract',()=>{
 assert.equal(hasAuthoredFontContract('.expense-row strong'),false);
 assert.throws(()=>authoredNativeFontBase('.expense-row strong',context()),/No authored/);
 for(const changes of [{pointerCoarse:undefined},{width:NaN},{height:0},{scale:1.25},{orientation:'landscape'},{active:true},{dynamicType:'extra-large'}])assert.throws(()=>authoredNativeFontBase(tabs,{...context(),...changes}));
});

test('actual font evidence uses the connected target CSS protocol without styling mutation',async()=>{
 const calls=[];
 const page={command:async(method,args)=>{calls.push({method,args});if(method==='DOM.getDocument')return{root:{nodeId:1}};if(method==='DOM.querySelector')return{nodeId:2};if(method==='CSS.getMatchedStylesForNode')return{matchedCSSRules:[{rule:{selectorList:{text:'.test'},origin:'regular',styleSheetId:'actual-sheet',style:{cssProperties:[{name:'font-size',value:'13.5px'},{name:'color',value:'red'}]}}}],inherited:[]};if(method==='CSS.getComputedStyleForNode')return{computedStyle:[{name:'font-size',value:'27px'},{name:'color',value:'red'}]};return{};}};
 const result=await actualAuthoredFontRules(page,[tabs]);
 assert.equal(result.rows[0].computed[0].value,'27px');
 assert.equal(result.rows[0].matched[0].styleSheetId,'actual-sheet');
 assert.equal(result.rows[0].matched[0].properties.length,1);
 assert.ok(calls.every(c=>!c.method.includes('set')&&!c.method.includes('Runtime')));
 await assert.rejects(()=>actualAuthoredFontRules({command:async(method)=>method==='DOM.getDocument'?{root:{nodeId:1}}:method==='DOM.querySelector'?{nodeId:0}:{}},[tabs]),/target missing/);
});
