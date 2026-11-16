import test from 'node:test';
import assert from 'node:assert/strict';
import {authoredNativeFontBase,authoredNativeFontMatches,actualAuthoredFontRules,hasAuthoredFontContract,readCurrentFontContract} from '../scripts/qa/android-native-isolated/font-contract.mjs';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
const context=(scale=1,pointerCoarse=false,orientation='portrait')=>({scale,pointerCoarse,pointerFine:!pointerCoarse,orientation,width:orientation==='portrait'?411:914,height:orientation==='portrait'?866:366,active:scale>1,dynamicType:scale===1?'normal':'extra-large',headerUtilitiesContained:true});
const home='.product-home-screen .top .brand h1',event='.event-overview-header h1',notes='[data-screen-kind="event-notes"] h1',profile='[data-screen-kind="profile"] h1',tabs='.event-workspace-tab strong',action='.event-header-action-label';
const summary='.settlement-hero-title-row .muted';

test('Native header and summary reference the approved authored rem rules',()=>{
 const source=readFileSync(new URL('../src/publicLedgerWorkspaceLayer.mjs',import.meta.url),'utf8');
 const selectors=[
  [action,'html.design-coherence-v1.ledger-workspace-v1 body #app .screen[data-screen-kind="event"] .event-header-utility-button .event-header-action-label'],
  [summary,'html.design-coherence-v1.ledger-workspace-v1.circle-design-v1 body #app .screen[data-screen-kind="event"][data-event-view="summary"] .settlement-hero[data-settlement-phase="interim"] .settlement-hero-title-row p'],
  [summary,'html.design-coherence-v1.ledger-workspace-v1.circle-design-v1 body #app .settlement-screen .settlement-hero[data-settlement-closed="true"] .settlement-hero-title-row p']
 ];
 for(const [target,selector] of selectors){
  const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const rule=[...source.matchAll(new RegExp(escaped+'\\s*\\{([^}]+)\\}','g'))].at(-1);
  assert.ok(rule,'Published rule must exist: '+selector);
  assert.match(rule[1],/font-size:\s*\.875rem\s*!important/,'Approved size comes from authored CSS, never measured Native output');
  assert.equal(authoredNativeFontBase(target,context()),14,target);
 }
});

test('failed dab14db Native matrix measurements match authored text sizes at every OS ratio',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/android-native-dab14db-font-reference.json',import.meta.url),'utf8'));
 assert.equal(fixture.sourceCommit,'dab14db12ce950cc53b6055486ead5341fdf1fac');
 assert.equal(fixture.rows.length,6);
 assert.deepEqual(fixture.rows.map(row=>[row.scale,row.orientation]),[1,1.5,2].flatMap(scale=>['portrait','landscape'].map(orientation=>[scale,orientation])));
 for(const row of fixture.rows){
  assert.equal(row.measurements.length,4);
  assert.equal(row.measurements.filter(measurement=>measurement.selector===summary).length,1);
  assert.equal(row.measurements.filter(measurement=>measurement.selector===action).length,3);
  for(const measurement of row.measurements){
   assert.equal(authoredNativeFontBase(measurement.selector,row.fontContract),14);
   assert.equal(authoredNativeFontMatches(measurement.fontSize,measurement.selector,row.fontContract),true);
   assert.equal(authoredNativeFontMatches(14*row.scale+.21,measurement.selector,row.fontContract),false,'Strict tolerance stays .2px');
   if(row.scale>1){
    assert.equal(authoredNativeFontMatches(14,measurement.selector,row.fontContract),false,'Frozen text must fail');
    assert.equal(authoredNativeFontMatches(14*row.scale*row.scale,measurement.selector,row.fontContract),false,'Stacked OS scaling must fail');
   }
  }
 }
});

test('compact Native typography follows the actual viewport with no primary pointer',()=>{
 for(const scale of [1,1.5,2])for(const orientation of ['portrait','landscape']){
  const c={...context(scale,false,orientation),pointerFine:false};
  assert.equal(c.pointerCoarse,false);
  assert.equal(c.pointerFine,false);
  assert.equal(authoredNativeFontBase(tabs,c),14);
  for(const selector of [home,event,notes,profile]){
   const expected=orientation==='portrait'?24:20;
   assert.equal(authoredNativeFontBase(selector,c),expected,selector+' '+orientation);
   assert.equal(authoredNativeFontMatches(expected*scale,selector,c),true);
  }
 }
});

test('route changes require fresh DOM provenance rather than the home snapshot',async()=>{
 let labels=[],reads=0;const header={};
 const page={evaluate:async expression=>{reads++;return runInNewContext(expression,{
  innerWidth:411,innerHeight:866,matchMedia:q=>({matches:q.includes('portrait')}),
  document:{documentElement:{dataset:{dynamicType:'normal'},classList:{contains:()=>false}},querySelectorAll:()=>labels}
 });}};
 const homeSnapshot=await readCurrentFontContract(page,1);
 assert.equal(homeSnapshot.headerUtilitiesContained,false);
 labels=Array.from({length:3},()=>({closest:()=>header}));
 const eventSnapshot=await readCurrentFontContract(page,1);
 assert.throws(()=>authoredNativeFontBase(action,homeSnapshot),/contained/,'The old home snapshot must fail despite the current event header');
 assert.equal(authoredNativeFontMatches(14,action,eventSnapshot),true);
 labels=[...labels.slice(0,2),{closest:()=>null}];
 const detachedSummary=await readCurrentFontContract(page,1);
 assert.throws(()=>authoredNativeFontBase(action,detachedSummary),/contained/,'Fresh summary provenance must still reject a detached utility');
 assert.equal(reads,3);
});

test('shared header sizes reject detached bars while tabs retain their authored contract',()=>{
 assert.equal(authoredNativeFontBase(tabs,context()),14);
 assert.equal(authoredNativeFontBase(action,context()),14);
 assert.equal(authoredNativeFontMatches(14,tabs,context()),true);
 assert.equal(authoredNativeFontMatches(13.5,tabs,context()),false);
 assert.equal(authoredNativeFontMatches(11.5,action,context()),false);
 assert.equal(authoredNativeFontMatches(14,action,context()),true);
 assert.equal(authoredNativeFontBase(home,context()),24);
 assert.equal(authoredNativeFontBase(home,context(1,false,'landscape')),20);
 for(const selector of [event,notes,profile])assert.equal(authoredNativeFontBase(selector,context()),24);
});

test('AX root scaling preserves the compact authored heading and rejects frozen text',()=>{
 for(const scale of [1.5,2]){
  assert.equal(authoredNativeFontBase(home,context(scale)),24);
  assert.equal(authoredNativeFontBase(event,context(scale)),24);
  assert.equal(authoredNativeFontBase(home,context(scale,false,'landscape')),20);
  for(const selector of [notes,profile])assert.equal(authoredNativeFontBase(selector,context(scale)),24);
  assert.equal(authoredNativeFontBase(action,context(scale)),14);
  assert.equal(authoredNativeFontMatches(24*scale,notes,context(scale)),true);
  assert.equal(authoredNativeFontMatches(24,notes,context(scale)),false);
 }
});

test('actual coarse pointer media retains the same compact rem rules',()=>{
 for(const scale of [1,1.5,2])for(const orientation of ['portrait','landscape']){
  const c=context(scale,true,orientation);
  assert.equal(authoredNativeFontBase(tabs,c),14);
  for(const selector of [home,event,notes,profile])assert.equal(authoredNativeFontBase(selector,c),orientation==='portrait'?24:20);
 }
 assert.equal(authoredNativeFontBase(tabs,{...context(1,true,'landscape'),height:451}),13.5);
});

test('short desktop height does not compact a wide viewport with any pointer',()=>{
 for(const pointer of [{pointerCoarse:false,pointerFine:false},{pointerCoarse:false,pointerFine:true},{pointerCoarse:true,pointerFine:false}]){
  const c={...context(1,false,'landscape'),...pointer,width:1280,height:400};
  assert.equal(authoredNativeFontBase(home,c),48);
  assert.equal(authoredNativeFontBase(tabs,c),13.5);
 }
 const compact={...context(1,false,'landscape'),width:1024,height:400};
 assert.equal(authoredNativeFontBase(home,compact),20);
 assert.equal(authoredNativeFontBase(tabs,compact),14);
});

test('all authored branches retain the original tolerance and reject frozen and stacked OS zoom',()=>{
 for(const scale of [1.5,2])for(const pointerCoarse of [false,true])for(const orientation of ['portrait','landscape'])for(const selector of [home,event,notes,profile,tabs,action,summary]){
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
 for(const changes of [{pointerCoarse:undefined},{pointerFine:undefined},{pointerCoarse:true,pointerFine:true},{width:NaN},{height:0},{scale:1.25},{orientation:'landscape'},{active:true},{dynamicType:'extra-large'}])assert.throws(()=>authoredNativeFontBase(tabs,{...context(),...changes}));
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


test('missing or detached header provenance cannot authorize label measurements',()=>{
 for(const headerUtilitiesContained of [false,undefined,null,'true']){
  assert.throws(()=>authoredNativeFontBase(action,{...context(),headerUtilitiesContained}),/contained/);
 }
 for(const scale of [1,1.5,2]){
  assert.equal(authoredNativeFontMatches(14*scale,action,context(scale)),true);
  assert.equal(authoredNativeFontMatches((scale===1?11.5:16)*scale,action,context(scale)),false);
 }
});
