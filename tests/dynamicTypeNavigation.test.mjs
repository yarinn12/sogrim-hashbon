import test from 'node:test';
import assert from 'node:assert/strict';
import { primaryNavigationNeedsTwoRows } from '../src/ui/dynamicTypeNavigation.mjs';

test('enlarged Hebrew navigation labels reflow when the available phone width cannot contain them', () => {
  const labels = [35.2, 61.1, 80.1, 64.1];
  assert.equal(primaryNavigationNeedsTwoRows({ width: 280, labelWidths: labels }), true);
  assert.equal(primaryNavigationNeedsTwoRows({ width: 350, labelWidths: labels }), false);
  assert.equal(primaryNavigationNeedsTwoRows({ width: 350, labelWidths: labels.map(value => value * 40 / 34) }), true);
});

test('navigation reflow includes padding and inter-column gaps, including at the exact fit boundary', () => {
  assert.equal(primaryNavigationNeedsTwoRows({ width: 352, labelWidths: [20, 40, 84, 52] }), false);
  assert.equal(primaryNavigationNeedsTwoRows({ width: 344, labelWidths: [20, 40, 84, 52] }), true);
  assert.equal(primaryNavigationNeedsTwoRows({ width: 352, gap: 8, labelWidths: [20, 40, 84, 52] }), true);
});

test('returning to normal text or rotating to a wide viewport releases the stacked navigation', () => {
  const labels = [41, 72, 94, 75];
  assert.equal(primaryNavigationNeedsTwoRows({ width: 350, labelWidths: labels }), true);
  assert.equal(primaryNavigationNeedsTwoRows({ width: 720, labelWidths: labels }), false);
  assert.equal(primaryNavigationNeedsTwoRows({ width: 280, labelWidths: labels.map(value => value / 2.35) }), false);
});

test('unmeasurable or detached navigation does not request a layout change', () => {
  for (const value of [{ width: 0, labelWidths: [80] }, { width: 300, labelWidths: [] },
    { width: 300, labelWidths: [NaN] }, { width: 300, labelWidths: [80], gap: -1 }]) {
    assert.equal(primaryNavigationNeedsTwoRows(value), false);
  }
});

import { refreshDynamicTypeControls } from '../src/publicDynamicTypeLayer.mjs';
function controlFixture() {
 const classes=new Set(['dynamic-type-active']);const values=new Map();const writes=[];
 const root={classList:{contains:n=>classes.has(n),remove:n=>classes.delete(n),toggle(n,v){if(v)classes.add(n);else classes.delete(n);}},style:{getPropertyValue:n=>values.get(n)||'',setProperty(n,v){values.set(n,v);writes.push([n,v]);},removeProperty:n=>values.delete(n)}};
 const labels=[32,64,94,62].map(width=>({width}));
 const nav={clientWidth:300,getBoundingClientRect:()=>({width:nav.clientWidth,height:classes.has('dynamic-type-nav-stacked')?160:82}),querySelectorAll:()=>labels};
 const action={getBoundingClientRect:()=>({height:67.2})};
 root.ownerDocument={defaultView:{getComputedStyle:()=>({paddingLeft:'6px',paddingRight:'6px',columnGap:'2px'})},querySelectorAll:()=>[nav],querySelector:()=>action,createRange(){let e;return{selectNodeContents:v=>{e=v;},getBoundingClientRect:()=>({width:e.width})};}};
 return{root,classes,values,writes,nav};
}

test('measured navigation clearance follows reflow height without feedback growth or repeated style writes',()=>{
 const f=controlFixture();assert.equal(refreshDynamicTypeControls(f.root).stacked,true);
 assert.equal(f.values.get('--dynamic-type-measured-nav-block'),'160px');
 assert.equal(f.values.get('--dynamic-home-action-half'),'33.6px');
 const firstWrites=f.writes.length;refreshDynamicTypeControls(f.root);
 assert.equal(f.writes.length,firstWrites);
 f.nav.clientWidth=800;assert.equal(refreshDynamicTypeControls(f.root).stacked,false);
 assert.equal(f.values.get('--dynamic-type-measured-nav-block'),'82px');
});

test('normal text releases measured accessibility layout and restores the existing design',()=>{
 const f=controlFixture();refreshDynamicTypeControls(f.root);f.classes.delete('dynamic-type-active');
 refreshDynamicTypeControls(f.root);assert.equal(f.classes.has('dynamic-type-nav-stacked'),false);
 assert.equal(f.values.has('--dynamic-type-measured-nav-block'),false);
 assert.equal(f.values.has('--dynamic-home-action-half'),false);
});
