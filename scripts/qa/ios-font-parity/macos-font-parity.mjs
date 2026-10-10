import { chromium, webkit } from '../../../app/node_modules/playwright/index.mjs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import assert from 'node:assert/strict';
import { calculateSettlement } from '../../../app/src/domain/settlement.mjs';
const root = process.env.GITHUB_WORKSPACE || process.cwd();
const origin = process.env.FONT_PARITY_ORIGIN || 'http://127.0.0.1:4287';
const output = root + '/font-parity-evidence';
await mkdir(output,{recursive:true});
const source = await readFile(root+'/app/e2e/mobile-layout.spec.mjs','utf8');
const fixtureCode = source.slice(source.indexOf('const EVENT_ID ='),source.indexOf('test.beforeEach('));
const {seededState,EVENT_ID,OWNER_ID}=Function('calculateSettlement',fixtureCode+'\nreturn {seededState,EVENT_ID,OWNER_ID};')(calculateSettlement);
const index=await readFile(root+'/app/index.html','utf8');
const fontUrl=index.match(/href="(https:\/\/fonts.googleapis.com[^"]+)"/)[1].replaceAll('&amp;','&');
const records=[];
for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await type.launch({headless:true});
 try {
  for(const mode of ['normal','blocked']){
   const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'he-IL',reducedMotion:'reduce',serviceWorkers:'block'});
   const page=await context.newPage();const errors=[];const fontResponses=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('response',async response=>{if(/fonts\.(googleapis|gstatic)\.com/.test(response.url())){try{const body=await response.body();fontResponses.push({url:response.url(),status:response.status(),bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')});}catch{}}});
   await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return mode==='blocked'?route.abort('internetdisconnected'):route.continue();
    return url.hostname==='127.0.0.1'?route.continue():route.abort();
   });
   let control=null;
   if(mode==='normal'){
    await page.setContent('<!doctype html><html lang="he" dir="rtl"><head><link rel="stylesheet" href="'+fontUrl+'"><style>body{margin:0;padding:20px;background:white;color:#111;font-family:Rubik,sans-serif}.weight{font-size:32px;line-height:1.4;margin:12px 0}</style></head><body>'+[400,500,700,900].map(w=>'<div class="weight" data-weight="'+w+'" style="font-weight:'+w+'">משקל '+w+' — אפשר לראות את המצב כרגע</div>').join('')+'</body></html>');
    await page.evaluate(async()=>{for(const w of [400,500,700,900])await document.fonts.load(w+' 32px Rubik','אפשר לראות את המצב כרגע');await document.fonts.ready;});
    control=await page.evaluate(()=>[...document.querySelectorAll('.weight')].map(el=>{
     const w=Number(el.dataset.weight),c=document.createElement('canvas');c.width=800;c.height=70;const x=c.getContext('2d');x.font=w+' 32px Rubik';x.fillText('אפשר לראות את המצב כרגע',0,45);let alphaMass=0;const data=x.getImageData(0,0,c.width,c.height).data;for(let i=3;i<data.length;i+=4)alphaMass+=data[i];return{weight:w,width:x.measureText('אפשר לראות את המצב כרגע').width,alphaMass,computedWeight:getComputedStyle(el).fontWeight,loadedFaces:[...document.fonts].filter(f=>f.family==='Rubik'&&f.status==='loaded').map(f=>({family:f.family,weight:f.weight,range:f.unicodeRange}))};
    }));
    assert(control.every(x=>x.loadedFaces.length>0),'Rubik face must load before control capture');
    await capture(page,engine+'-rubik-weight-control');
   }
   const reset=await context.request.post(origin+'/api/reset');assert(reset.ok(),'local reset');
   const seed=await context.request.put(origin+'/api/state',{data:seededState});assert(seed.ok(),'local synthetic fixture');
   await page.addInitScript(({state,owner})=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('settle-friends-state',JSON.stringify(state));localStorage.setItem('settle-friends-local-profile',JSON.stringify({participantId:owner,displayName:'ירין יצחק',avatarPreset:'avatar-1'}));localStorage.setItem('settle-friends-current-participant',owner);sessionStorage.setItem('settle-friends-skip-next-splash','1');},{state:seededState,owner:OWNER_ID});
   await page.goto(origin,{waitUntil:'domcontentloaded'});
   await page.locator('[data-action="open-event"][data-event-id="'+EVENT_ID+'"]').first().waitFor({state:'visible'});
   await page.locator('[data-action="open-event"][data-event-id="'+EVENT_ID+'"]').first().click();
   await page.locator('[data-action="settle"][data-event-id="'+EVENT_ID+'"]').first().click();
   await page.locator('[data-event-view="summary"]').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.documentElement.classList.contains('design-coherence-v1'));
   if(mode==='normal')await page.waitForFunction(()=>document.querySelector('link[rel="stylesheet"][href*="fonts.googleapis.com"]')?.media==='all'&&[...document.fonts].some(f=>f.family==='Rubik'&&f.status==='loaded'));
   await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   const summary=await page.evaluate(()=>{
    const selectors=['.screen-header h1','.settlement-hero-title-row h2','.settlement-hero-title-row p.muted','.settlement-stage-heading small'];
    const elements=[];
    for(const selector of selectors)for(const el of document.querySelectorAll(selector)){
     const rect=el.getBoundingClientRect();if(!rect.width||!rect.height)continue;const cs=getComputedStyle(el);const lineMap=new Map();const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
     while(walker.nextNode()){const node=walker.currentNode;for(let i=0;i<node.length;i++){const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);const box=range.getBoundingClientRect();if(!box.height)continue;const top=Math.round(box.top*100)/100;lineMap.set(top,(lineMap.get(top)||'')+node.textContent[i]);}}
     const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;const text=el.textContent.trim();elements.push({selector,text,x:rect.x,y:rect.y,width:rect.width,height:rect.height,fontFamily:cs.fontFamily,fontWeight:cs.fontWeight,fontSize:cs.fontSize,lineHeight:cs.lineHeight,lines:[...lineMap].sort((a,b)=>a[0]-b[0]).map(([top,text])=>({top,text})),cssStackCanvasWidth:ctx.measureText(text).width,actualPlatformFontNameVerified:false});
    }
    return{elements,htmlClasses:document.documentElement.className,viewport:{innerWidth,innerHeight,dpr:devicePixelRatio},documentWidth:document.documentElement.scrollWidth,fontFaces:[...document.fonts].filter(f=>f.status==='loaded').map(f=>({family:f.family,weight:f.weight,range:f.unicodeRange}))};
   });
   assert(summary.elements.some(x=>x.text.startsWith('אפשר לראות את המצב כרגע')),'exact reported summary paragraph must be rendered');
   assert(summary.elements.some(x=>x.selector==='.settlement-stage-heading small'),'transfer paragraph must be rendered');
   if(mode==='normal')assert(summary.fontFaces.some(f=>f.family==='Rubik'),'normal mode must load Rubik');
   assert.equal(summary.documentWidth,390,'horizontal viewport overflow');
   assert.deepEqual(errors,[],'runtime page errors');
   await capture(page,engine+'-'+mode+'-summary');
   const record={engine,browserVersion:browser.version(),mode,scope:'Immutable source379 served as web on macOS; NOT compiled native WWW, simulator or iPhone',weightControl:control,summary,fontResponses,errors};
   records.push(record);console.log('FONT_PARITY_RECORD '+JSON.stringify(record));await context.close();
  }
 }finally{await browser.close();}
}
const result={checkedAt:new Date().toISOString(),platform:os.platform(),osRelease:os.release(),sourceCommit:'379f3c910429b92e4d5b4a21caf895ebaa6f4120',sourceTree:'89dc47488227fec0df41e76bf6af20625f86eca7',runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,workflowCommit:process.env.GITHUB_SHA,fixtureSha256:createHash('sha256').update(JSON.stringify(seededState)).digest('hex'),nativeBuildPerformed:false,signedIpaOpened:false,simulatorRun:false,physicalIphoneAcceptance:false,records};
await writeFile(output+'/results.json',JSON.stringify(result,null,2));
console.log('FONT_PARITY_RESULT '+JSON.stringify(result));
async function capture(page,name){
 const bytes=await page.screenshot({path:output+'/'+name+'.png',animations:'disabled'});const base64=bytes.toString('base64');const size=6000;const parts=Math.ceil(base64.length/size);for(let i=0;i<parts;i++)console.log('FONT_PARITY_PNG '+JSON.stringify({name,index:i,parts,sha256:createHash('sha256').update(bytes).digest('hex'),data:base64.slice(i*size,(i+1)*size)}));
}
