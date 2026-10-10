import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const {glyphsFitContainer,paintedGlyphRect,notePreviewFitsContainer,textMeasurementExpression}=await import(process.env.ANDROID_QA_GEOMETRY_TEST_MODULE||'../scripts/qa/android-native-isolated/text-measurement.mjs');
test('all rendered Native glyphs use the same one-pixel containment limit',()=>{
  const row=right=>({rendered:true,inViewport:true,glyphs:[{left:0,right,top:0,bottom:20}],parent:{left:0,right:100,top:0,bottom:24},clientWidth:100,scrollWidth:100,clientHeight:24,scrollHeight:24});
  assert.equal([row(100),row(100),row(101.5)].every(glyphsFitContainer),false,'Array position cannot weaken glyph bounds');
  assert.equal([row(100),row(100.5),row(101)].every(glyphsFitContainer),true);
  assert.equal(glyphsFitContainer({...row(100),inViewport:false}),false);
  assert.equal(glyphsFitContainer({...row(100),glyphs:[]}),false);
});

test('scrolling brings an occluded event tab into view before the sensor decides it is hidden',async()=>{
  let visible=false;const bounds={left:0,right:100,top:0,bottom:24,width:100,height:24,toJSON(){return {...this};}};
  const element={textContent:'Tab',get innerText(){return visible?'Tab':'';},scrollWidth:100,clientWidth:100,scrollHeight:24,clientHeight:24,scrollIntoView(){visible=true;},getBoundingClientRect:()=>bounds,closest:()=>null,parentElement:null};element.parentElement={getBoundingClientRect:()=>bounds,parentElement:null};
  const node={textContent:'Tab',parentElement:element};
  const context={Intl,NodeFilter:{SHOW_TEXT:4},innerHeight:100,innerWidth:100,requestAnimationFrame:fn=>fn(),getComputedStyle:()=>({visibility:visible?'visible':'hidden',display:'block',fontStyle:'normal',fontWeight:'400',fontSize:'20px',fontFamily:'test',overflowX:'visible',overflowY:'visible',whiteSpace:'normal'}),document:{querySelectorAll:()=>[element],createRange:()=>({selectNodeContents(){},setStart(){},setEnd(){},getBoundingClientRect:()=>bounds,getClientRects:()=>[bounds]}),createTreeWalker:()=>{let read=false;return {nextNode:()=>read?null:(read=true,node)};},createElement:()=>({getContext:()=>({measureText:()=>({fontBoundingBoxAscent:18,fontBoundingBoxDescent:6,actualBoundingBoxAscent:12,actualBoundingBoxDescent:2})})})}};
  const rows=await vm.runInNewContext(textMeasurementExpression(['.event-workspace-tab strong']),context);
  assert.equal(rows.length,1,'Offscreen navigation must be measured after reflow');assert.equal(rows[0].rendered,true);assert.equal(glyphsFitContainer(rows[0]),true);
});

test('painted metrics exclude unused em overhang while retaining actual ink outside clipping bounds',()=>{
  const rect={left:0,right:100,top:-2,bottom:22,height:24},metrics={fontBoundingBoxAscent:18,fontBoundingBoxDescent:6,actualBoundingBoxAscent:12,actualBoundingBoxDescent:2};
  const ink=paintedGlyphRect(rect,metrics);assert.deepEqual(ink,{left:0,right:100,top:4,bottom:18});
  const row={rendered:true,inViewport:true,inkMetricsValid:true,glyphs:[ink],parent:{left:0,right:100,top:0,bottom:20},clips:[{axis:'y',top:0,bottom:20}]};
  assert.equal(glyphsFitContainer(row),true);
  assert.equal(glyphsFitContainer({...row,glyphs:[paintedGlyphRect(rect,{...metrics,actualBoundingBoxAscent:19.5})]}),false,'Painted ink 1.5px beyond clipping is still rejected');
  assert.equal(paintedGlyphRect(rect,{...metrics,fontBoundingBoxAscent:NaN}),null);
  assert.equal(paintedGlyphRect({...rect,height:30},metrics),null,'Canvas and DOM metrics must agree; no inferred fallback');
});

test('only intentional note-list ellipses with successful complete disclosure may clip preview width',()=>{
  const row={selector:'.event-note-preview',text:'Long complete note',rendered:true,inViewport:true,inkMetricsValid:true,glyphs:[{left:0,right:180,top:2,bottom:18}],parent:{left:0,right:100,top:0,bottom:20},rect:{left:0,right:100,top:0,bottom:20},clips:[{axis:'x',left:0,right:100},{axis:'y',top:0,bottom:20}],textOverflow:'ellipsis',whiteSpace:'nowrap',overflowX:'hidden'};
  assert.equal(glyphsFitContainer(row),false);assert.equal(notePreviewFitsContainer(row,false),false);assert.equal(notePreviewFitsContainer(row,true),true);
  assert.equal(notePreviewFitsContainer({...row,selector:'.transfer-amount > .amount'},true),false);
  assert.equal(notePreviewFitsContainer({...row,textOverflow:'clip'},true),false);
  assert.equal(notePreviewFitsContainer({...row,glyphs:[{left:0,right:180,top:-1.5,bottom:18}]},true),false,'Intentional horizontal ellipsis cannot hide actual vertical clipping');
});

test('visible linebox overflow is checked against the actual card rather than falsely classified as clipping',()=>{
  const row={rendered:true,inViewport:true,glyphs:[{left:0,right:100,top:2,bottom:24}],parent:{left:0,right:100,top:0,bottom:30},clientWidth:100,scrollWidth:100,clientHeight:20,scrollHeight:24,overflowX:'visible',overflowY:'visible',clips:[]};
  assert.equal(glyphsFitContainer(row),true,'Overflow-visible text inside its card is painted in full');
  assert.equal(glyphsFitContainer({...row,clips:[{axis:'y',top:0,bottom:20}]}),false,'A real clipping ancestor must reject the same text');
  assert.equal(glyphsFitContainer({...row,glyphs:[{left:0,right:101.5,top:2,bottom:24}]}),false,'The one-pixel card limit remains unchanged');
});
