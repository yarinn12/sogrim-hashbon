import test from 'node:test';
import assert from 'node:assert/strict';
import measure from '../e2e/helpers/expenseFlowTypography.mjs';

// Recorded Windows WebKit geometry at root20/320, matching the original Linux
// CI failure. The transparent absolute date input is57px high; its visible
// button is44.25px and the date's glyph range is23px, completely inside the bdi.
const box=(x,y,width,height)=>({x,y,width,height,right:x+width,bottom:y+height});
function scene(change={}) {
 const element=(text,font,bounds,ranges)=>({textContent:text,font,bounds,ranges,getBoundingClientRect(){return this.bounds;}});
 const label=element('תאריך ההוצאה',16.25,box(120,520,168,25),[box(122,521,164,22)]);
 const caption=element('05.11.2026',change.captionFont??18.75,box(167.9375,567.875,109.0625,26.25),
  [change.captionOverflow?box(167.94,569.5,130,23):box(167.9438,569.5,109.0499,23)]);
 const control=element(caption.textContent,16.25,box(128.9375,558.875,159.0625,44.25),
  [box(128.9375,558.875,159.0625,44.25),...caption.ranges,box(128.9375,558.875,159.0625,57)]);
 if(change.labelOverflow)label.ranges=[box(110,521,180,22)];
 const modal={dataset:{expenseStep:'review'},getBoundingClientRect:()=>box(0,0,320,852),
  querySelectorAll(selector){
   if(selector==='.field > span')return[label,control];
   if(selector==='.field > span:not(.expense-date-control)')return[label];
   if(selector==='[data-expense-date-caption]')return[caption];
   return[];
  }};
 const globals={document:{querySelector:()=>modal,documentElement:{clientWidth:320,scrollWidth:change.pageOverflow?340:320},
   createRange(){let selected;return{selectNodeContents(e){selected=e;},getClientRects(){return selected.ranges;}};}},
  getComputedStyle:e=>({fontSize:String(e.font)}),innerWidth:320,innerHeight:852};
 const previous=Object.fromEntries(Object.keys(globals).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 try{for(const[k,v]of Object.entries(globals))Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});return measure();}
 finally{for(const[k,v]of Object.entries(previous))if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}
}
const date=result=>{const rows=result.leaves.filter(row=>row.selector==='[data-expense-date-caption]');assert.equal(rows.length,1,'the actual visible date must be measured');return rows[0];};

test('date glyph measurement ignores the transparent native input but includes the visible caption',()=>{
 const result=scene();
 assert.ok(result.leaves.every(row=>row.fits),'transparent date picker is not visible glyph overflow');
 assert.equal(date(result).font,20*.9375);
 assert.equal(date(result).ratio,.9375);
 assert.equal(result.leaves.filter(row=>row.text==='תאריך ההוצאה').length,1);
});
test('date caption clipping remains a failed glyph measurement',()=>assert.equal(date(scene({captionOverflow:true})).fits,false));
test('date caption font measurement detects a non-scaled value',()=>assert.notEqual(date(scene({captionFont:15})).font,20*.9375));
test('field-label clipping remains a failed glyph measurement',()=>assert.equal(scene({labelOverflow:true}).leaves.find(row=>row.text==='תאריך ההוצאה').fits,false));
test('page overflow remains a failed geometry measurement',()=>assert.equal(scene({pageOverflow:true}).noHorizontalOverflow,false));
