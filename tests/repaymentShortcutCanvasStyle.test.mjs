import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../e2e/repayment-shortcut-centering.spec.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const start=source.indexOf('function measurePaintedShortcut(button) {');
assert.ok(start>=0);
const end=source.indexOf('\n}\n',start);assert.ok(end>start);
const measureSource=source.slice(start,end+2);

// Synthetic font-engine boundary: QA540 recorded hinted Canvas advances of
// 187/52px beside DOM advances of 183.640625/49.296875px. The DOM uses
// geometricPrecision; an unconfigured off-DOM Canvas defaults to auto.
// Faithful-mode outlines below use the existing geometric DOM font metrics.
const cases=[
 {id:'large direct',text:'לפי מי ששילם',font:'32px',box:{left:12,top:253.96875,right:308,bottom:323.96875,width:296,height:70},range:{left:58.6875,top:269.96875,width:183.640625,height:38},auto:{width:187,left:-1,right:186,ascent:23,descent:2},faithful:{width:183.6318817138672,left:-1,right:183.5118865966797,ascent:23,descent:1},fontBox:[30,8],iconLeft:249.696875,iconTop:283.3375},
 {id:'phone optimized',text:'קיזוז חכם',font:'12px',box:{left:14,top:360.5625,right:162,bottom:404.5625,width:148,height:44},range:{left:53.859375,top:373.6875,width:49.296875,height:14},auto:{width:52,left:-1,right:52,ascent:8,descent:1},faithful:{width:49.29594421386719,left:0,right:49.32795715332031,ascent:7,descent:3},fontBox:[11,3],iconLeft:110.525,iconTop:376.93125}
];

function harness(fixture,{iconShift=0}={}){
 const label={};const text={textContent:fixture.text,parentElement:label};let mode='auto';const calls=[];
 const context={font:'',direction:'ltr',textAlign:'start',textBaseline:'alphabetic',
  get textRendering(){return mode},set textRendering(value){if(['auto','optimizeSpeed','optimizeLegibility','geometricPrecision'].includes(value))mode=value},
  measureText(){calls.push(mode);const m=mode==='geometricPrecision'?fixture.faithful:fixture.auto;return{width:m.width,actualBoundingBoxLeft:m.left,actualBoundingBoxRight:m.right,actualBoundingBoxAscent:m.ascent,actualBoundingBoxDescent:m.descent,fontBoundingBoxAscent:fixture.fontBox[0],fontBoundingBoxDescent:fixture.fontBox[1]}}
 };
 const scale=17/24,stroke=.95;
 const path={getBBox:()=>({x:5,y:5,width:14,height:14}),getScreenCTM:()=>({a:scale,d:scale,e:fixture.iconLeft+iconShift-(5-stroke)*scale,f:fixture.iconTop-(5-stroke)*scale})};
 const button={getBoundingClientRect:()=>fixture.box,querySelectorAll:()=>[path],contains:element=>element===button};
 const document={documentElement:{},createElement:()=>({getContext:()=>context}),createTreeWalker:()=>{let used=false;return{nextNode(){if(used)return null;used=true;return text}}},createRange:()=>({selectNodeContents(){},getBoundingClientRect:()=>fixture.range,getClientRects:()=>[fixture.range]}),elementFromPoint:()=>button};
 class DOMPoint{constructor(x,y){this.x=x;this.y=y}matrixTransform(m){return{x:this.x*m.a+m.e,y:this.y*m.d+m.f}}}
 const getComputedStyle=element=>element===label?{fontStyle:'normal',fontWeight:'700',fontSize:fixture.font,fontFamily:'Rubik, sans-serif',visibility:'visible',direction:'rtl',textRendering:'geometricprecision'}:element===path?{strokeWidth:'1.9'}:{fontSize:fixture.font,direction:'rtl',justifyContent:'center',display:'flex'};
 const measure=runInNewContext('('+measureSource+')',{document,NodeFilter:{SHOW_TEXT:4},DOMPoint,getComputedStyle,innerWidth:393,Math});
 return{read:()=>measure(button),calls};
}

for(const fixture of cases)test('repayment ink measurement uses the DOM rendering mode: '+fixture.id,()=>{
 const h=harness(fixture),m=h.read();
 assert.ok(m.visibleGap>=6&&m.visibleGap<=10,`painted gap must remain within the existing 6..10px contract; actual=${m.visibleGap}, rendering=${h.calls[0]}`);
 assert.equal(h.calls[0],'geometricPrecision','the lowercase CSS value must map to the Canvas keyword before measureText');
 assert.ok(Math.abs(m.centerX)<=1);
});

test('faithful Canvas rendering still rejects a genuinely undersized icon/text gap',()=>{
 const h=harness(cases[0],{iconShift:-3}),m=h.read();
 assert.ok(m.visibleGap<6,'the rendering-mode fix must not manufacture compliant geometry');
 assert.equal(h.calls[0],'geometricPrecision');
});
