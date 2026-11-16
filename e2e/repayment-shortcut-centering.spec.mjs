import {test,expect} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {installSyntheticSystemText} from './helpers/accessibilityPresentation.mjs';
import {openRenderedHome} from './helpers/typographyReadiness.mjs';
import {waitForStaticVisualGeometry} from './helpers/staticVisualGeometry.mjs';
import {pointClick} from './helpers/eventNotesBatchPresentation.mjs';

const fixture=readFileSync(new URL('./fixtures/eventRepaymentBootstrap.js',import.meta.url),'utf8');
test.use({serviceWorkers:'block'});

// Local OLD-code evidence: substitute immutable Git-exported modules, without
// overwriting the final worktree. Normal CI uses the actual final modules.
const baselineRoot=process.env.REPAYMENT_SHORTCUT_BASELINE_ROOT;
const baselineModules=baselineRoot?new Map(['app.mjs','publicLedgerWorkspaceLayer.mjs'].map(name=>['/src/'+name,readFileSync(join(baselineRoot,'src',name),'utf8')])):null;

// Canvas ink metrics exclude letter side bearings; SVG bounds include the
// painted stroke rather than the empty area inside its 24-unit viewBox.
function measurePaintedShortcut(button) {
 const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
 const box=rect(button),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),texts=[];
 const walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);let node;
 while(node=walker.nextNode()) {
  if(!node.textContent.trim())continue;
  const style=getComputedStyle(node.parentElement),range=document.createRange();range.selectNodeContents(node);
  const r=range.getBoundingClientRect();if(!r.width||!r.height||style.visibility==='hidden')continue;
  if(range.getClientRects().length!==1)throw Error('Repayment shortcut label wraps: '+JSON.stringify({text:node.textContent,lines:range.getClientRects().length,button:box,labelWidth:r.width}));
  ctx.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  ctx.direction=style.direction;ctx.textAlign='left';ctx.textBaseline='alphabetic';
  // The DOM uses geometricPrecision. On Linux, Canvas auto can use hinted
  // advances, so measuring it would compare a different rendering to the SVG.
  const rendering={auto:'auto',optimizespeed:'optimizeSpeed',optimizelegibility:'optimizeLegibility',geometricprecision:'geometricPrecision'}[String(style.textRendering||'auto').toLowerCase()];
  if('textRendering' in ctx)ctx.textRendering=rendering||'auto';
  const m=ctx.measureText(node.textContent),baseline=r.top+m.fontBoundingBoxAscent;
  texts.push({text:node.textContent,font:style.fontSize,width:m.width,lines:range.getClientRects().length,DOMRendering:style.textRendering,canvasRendering:'textRendering' in ctx?ctx.textRendering:null,
   left:r.left-m.actualBoundingBoxLeft,right:r.left+m.actualBoundingBoxRight,
   top:baseline-m.actualBoundingBoxAscent,bottom:baseline+m.actualBoundingBoxDescent,
   layout:{left:r.left,top:r.top,width:r.width,height:r.height},fontBox:[m.fontBoundingBoxAscent,m.fontBoundingBoxDescent]});
 }
 const paths=[...button.querySelectorAll('svg path')].map(p=>{
  const b=p.getBBox(),m=p.getScreenCTM(),stroke=parseFloat(getComputedStyle(p).strokeWidth)/2,
   a=new DOMPoint(b.x-stroke,b.y-stroke).matrixTransform(m),z=new DOMPoint(b.x+b.width+stroke,b.y+b.height+stroke).matrixTransform(m);
  return {left:a.x,right:z.x,top:a.y,bottom:z.y};
 });
 const union=items=>({left:Math.min(...items.map(x=>x.left)),right:Math.max(...items.map(x=>x.right)),top:Math.min(...items.map(x=>x.top)),bottom:Math.max(...items.map(x=>x.bottom))});
 const ink=union([...texts,...paths]),icon=union(paths),label=texts[0];
 return {box,ink,icon,texts,root:getComputedStyle(document.documentElement).fontSize,direction:getComputedStyle(button).direction,
  justify:getComputedStyle(button).justifyContent,display:getComputedStyle(button).display,
  centerX:(ink.left+ink.right-box.left-box.right)/2,centerY:(ink.top+ink.bottom-box.top-box.bottom)/2,
  iconTextCenterY:(icon.top+icon.bottom-label.top-label.bottom)/2,
  visibleGap:icon.left-label.right,overflow:document.documentElement.scrollWidth-innerWidth,
  hit:button.contains(document.elementFromPoint((box.left+box.right)/2,(box.top+box.bottom)/2))};
}

for (const [id,width,height,root,system] of [['phone',393,852,16],['narrow',320,852,16],['wide-phone',411,852,16],['medium',360,740,20],['large',320,852,32],['landscape',852,393,32],['system',411,852,32,true]]) {
 test('repayment shortcut painted group is centered '+id,async({page},info)=>{
  const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{const url=new URL(r.request().url());if(url.hostname!=='127.0.0.1'){external.push(r.request().url());return r.abort()}const body=baselineModules?.get(url.pathname);return body?r.fulfill({contentType:'text/javascript',body}):r.continue()});
  await page.addInitScript({content:fixture});if(system)await page.addInitScript(installSyntheticSystemText);await page.setViewportSize({width,height});
  const measures=[];
  for(const direct of [true,false]) {
   await openRenderedHome(page,{path:'/?review=1&requests=accepted&reward=inactive'+(direct?'&repayment-direct=1':'')+(!system&&root>16?'&dynamic-type-preview='+root:''),bootTimeoutMs:30000});
   await pointClick(page.locator('.product-home-screen .event-list [data-action="open-event"][data-event-id="friend-weekend"]'));
   await pointClick(page.getByRole('button',{name:'פתיחת הסיכום: מי מעביר למי',exact:true}));
   const button=page.locator('.settlement-repayment-shortcut');await expect(button).toBeVisible();
   await page.evaluate(()=>document.fonts.ready);await button.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
   await waitForStaticVisualGeometry(page.locator('.settlement-screen'));
   const m=await button.evaluate(measurePaintedShortcut);measures.push({id,direct,...m});
   const mode=direct?'direct':'optimized',geometryPath=info.outputPath(`geometry-${mode}.json`);writeFileSync(geometryPath,JSON.stringify(m,null,2));
   await info.attach(`geometry-${mode}`,{path:geometryPath,contentType:'application/json'});
   for(const [kind,locator] of [['full',null],['viewport',null],['heading',page.locator('.settlement-stage-heading')]]){
    const path=info.outputPath(`synthetic-${mode}-${kind}.png`);if(locator)await locator.screenshot({path});else await page.screenshot({path,fullPage:kind==='full'});
    await info.attach(`synthetic-${mode}-${kind}`,{path,contentType:'image/png'});
   }
   console.log('REPAYMENT_GEOMETRY '+JSON.stringify({id,direct,...m}));
   expect.soft(m.root).toBe(root+'px');expect.soft(m.direction).toBe('rtl');expect.soft(m.box.width).toBeGreaterThanOrEqual(44);expect.soft(m.box.height).toBeGreaterThanOrEqual(44);
   expect.soft(m.overflow).toBeLessThanOrEqual(0);expect.soft(m.hit).toBe(true);
   expect.soft(Math.abs(m.centerX),'painted icon and text must be horizontally centered as one group').toBeLessThanOrEqual(1);
   expect.soft(Math.abs(m.centerY),'painted group must be vertically centered').toBeLessThanOrEqual(1.5);
   expect.soft(Math.abs(m.iconTextCenterY),'icon ink and letter ink must share a vertical center').toBeLessThanOrEqual(1.5);
   for(const t of m.texts) {
    expect.soft(t.lines,'button label must remain readable on one line').toBe(1);
    expect.soft(t.left).toBeGreaterThanOrEqual(m.box.left);expect.soft(t.right).toBeLessThanOrEqual(m.box.right);
   }
   expect.soft(m.visibleGap).toBeGreaterThanOrEqual(6);expect.soft(m.visibleGap).toBeLessThanOrEqual(10);
   // Negative control: the same real DOM measurement must reject a genuinely
   // smaller gap. Restore the original element before any further UI action.
   const held=await button.elementHandle();
   const previous=await held.evaluate(e=>{const prior={value:e.style.getPropertyValue('gap'),priority:e.style.getPropertyPriority('gap')};e.style.setProperty('gap','2px','important');return prior});
   try{
    const tooClose=await held.evaluate(measurePaintedShortcut);
    expect(tooClose.visibleGap,'the calibrated Canvas must still detect a real undersized gap').toBeLessThan(6);
   }finally{
    await held.evaluate((e,prior)=>{if(prior.value)e.style.setProperty('gap',prior.value,prior.priority);else e.style.removeProperty('gap')},previous);
    await held.dispose();
   }

   // Scan the bottom of the same summary in its real viewport, rather than
   // treating a full-page screenshot as proof of clearance above fixed nav.
   const sharing=page.locator('.settlement-list-actions > summary');await pointClick(sharing);
   const last=page.locator('.settlement-list-actions [data-action="copy-event-report"]');
   await last.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
   const bottom=await last.evaluate(e=>{const b=e.getBoundingClientRect(),nav=document.querySelector('.product-app-nav')?.getBoundingClientRect(),hit=document.elementFromPoint((b.left+b.right)/2,(b.top+b.bottom)/2);return{width:b.width,height:b.height,bottom:b.bottom,navTop:nav?.top??innerHeight,hit:!!hit&&(e===hit||e.contains(hit)),overflow:document.documentElement.scrollWidth-innerWidth}});
   expect(bottom.width).toBeGreaterThanOrEqual(44);expect(bottom.height).toBeGreaterThanOrEqual(44);expect(bottom.hit).toBe(true);expect(bottom.bottom).toBeLessThanOrEqual(bottom.navTop+1);expect(bottom.overflow).toBeLessThanOrEqual(0);
   const bottomPath=info.outputPath(`synthetic-${mode}-bottom.png`);await page.screenshot({path:bottomPath});await info.attach(`synthetic-${mode}-bottom`,{path:bottomPath,contentType:'image/png'});
   await pointClick(sharing);
   const before=await page.evaluate(()=>({writes:__friendInviteQa.canonicalWrites.length,events:JSON.parse(localStorage.getItem('settle-friends-state:friend-invitation-space')).events}));
   await pointClick(button);const menu=page.locator('.event-modal:has([data-action="set-event-repayment-mode"])');
   await expect(menu).toBeVisible();await expect(menu.locator(`[data-repayment-mode="${direct?'direct':'optimized'}"]`)).toHaveAttribute('aria-checked','true');
   await pointClick(menu.locator('[data-action="event-settings-back"]'));
   expect(await page.evaluate(()=>({writes:__friendInviteQa.canonicalWrites.length,events:JSON.parse(localStorage.getItem('settle-friends-state:friend-invitation-space')).events}))).toEqual(before);
  }
  expect(errors).toEqual([]);expect(external).toEqual([]);
 });
}
