import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(process.env.DIALOG_SCROLL_TEST_APP||new URL('../src/app.mjs',import.meta.url),'utf8');
const start=source.indexOf('function reactivateDialogAfterRender('),end=source.indexOf('function rememberDialogReturnFocus(',start);
assert.ok(start>=0&&end>start);
function harness(initial=0){
 const frames=[],document={activeElement:null,body:{classList:{contains:()=>true,add(){}}}};
 const field={closest:()=>null,focus(){document.activeElement=this}};
 const makeDialog=scrollTop=>({scrollTop,querySelector:()=>field,contains:e=>e===field,focus(){document.activeElement=this}});
 let dialog=makeDialog(initial);
 const context=vm.createContext({document,window:{},dialogReturnFocus:{},importantActionDialog:null,setDialogBackgroundInert(){},requestAnimationFrame:cb=>frames.push(cb),app:{querySelector:()=>dialog}});
 vm.runInContext(source.slice(start,end),context);
 return {document,field,get dialog(){return dialog},activate:()=>context.activateDialog('.event-modal'),reactivate:scroll=>context.reactivateDialogAfterRender('.event-modal','',scroll),flush:()=>frames.splice(0).forEach(cb=>cb()),replace:()=>dialog=makeDialog(240)};
}
test('opening initializes dialog scroll before accepting interaction',()=>{
 const h=harness(80);h.activate();assert.equal(h.dialog.scrollTop,0);
});
test('a delayed opening focus preserves a newer user scroll',()=>{
 const h=harness();h.activate();h.dialog.scrollTop=140;h.flush();assert.equal(h.dialog.scrollTop,140);
});
test('a delayed reactivation preserves a newer user scroll',()=>{
 const h=harness();h.reactivate(31);h.dialog.scrollTop=140;h.flush();assert.equal(h.dialog.scrollTop,140);
});
test('an untouched reactivation retains its requested restored offset',()=>{
 const h=harness();h.reactivate(97);h.flush();assert.equal(h.dialog.scrollTop,97);
});
test('old opening callbacks cannot scroll a replacement dialog',()=>{
 const h=harness();h.reactivate(31);h.replace();h.flush();assert.equal(h.dialog.scrollTop,240);
});
test('opening focus still respects a newer field selection',()=>{
 const h=harness();h.activate();h.dialog.scrollTop=140;h.field.focus();h.flush();assert.equal(h.document.activeElement,h.field);assert.equal(h.dialog.scrollTop,140);
});

function renderRestoreHarness(){
 const frames=[],dialog={scrollTop:0,dataset:{}};
 const context=vm.createContext({renderGeneration:1,app:{querySelector:s=>s==='.event-modal'?dialog:null},document:{body:{classList:{add(){}}},activeElement:{isConnected:true}},setDialogBackgroundInert(){},requestAnimationFrame:cb=>frames.push(cb),getEvent(){}});
 const a=source.indexOf('function restoreRenderInteractionState('),b=source.indexOf('function dialogRenderSelector(',a);assert.ok(a>=0&&b>a);vm.runInContext(source.slice(a,b),context);
 return{dialog,restore:()=>context.restoreRenderInteractionState({dialogSelector:'.event-modal',dialogScrollTop:171},1),flush:()=>frames.splice(0).forEach(cb=>cb())};
}
test('render restores its captured scroll before a newly opened view takes ownership',()=>{
 const h=renderRestoreHarness();h.restore();assert.equal(h.dialog.scrollTop,171);
 h.dialog.scrollTop=0;h.flush();assert.equal(h.dialog.scrollTop,0);
});
test('deferred render focus cannot replace a newer user scroll',()=>{
 const h=renderRestoreHarness();h.restore();h.dialog.scrollTop=140;h.flush();assert.equal(h.dialog.scrollTop,140);
});
