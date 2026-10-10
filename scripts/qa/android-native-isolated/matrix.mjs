import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { adb, launch, waitFor, screenshot, inspectExpression, sleep } from './driver.mjs';
import {matrixExitCode} from './matrix-verdict.mjs';
const out = resolve(process.env.ANDROID_QA_OUTPUT || 'artifacts/android-native-isolated');
mkdirSync(out, { recursive: true });
const results = [], source = process.env.ANDROID_QA_SOURCE;
const original = Object.fromEntries(['font_scale','accelerometer_rotation','user_rotation'].map(k=>[k,adb(['shell','settings','get','system',k]).trim()]));
let page;
try {
  adb(['shell','settings','put','system','accelerometer_rotation','0']);
  for (const scale of [1,1.5,2]) for (const [orientation,rotation] of [['portrait',0],['landscape',1]]) {
    try {
    adb(['shell','settings','put','system','font_scale',String(scale)]);
    adb(['shell','wm','user-rotation','lock',String(rotation)]);
    await sleep(750);
    page = await launch();
    await waitFor(()=>page.evaluate(`(${orientation==='portrait'?'innerHeight>innerWidth':'innerWidth>innerHeight'})`),'Actual '+orientation+' WebView viewport',15000);
    const capabilities = await page.evaluate('Capacitor.Plugins.SogrimCapabilities.getCapabilities()');
    await waitFor(()=>page.evaluate(`Math.abs(Number(getComputedStyle(document.documentElement).getPropertyValue('--android-font-scale'))-${scale})<.01`),'Product CSS observes requested OS font scale',15000);
    await page.click('[data-action="open-event"][data-event-id="android-native-event"]');
    await page.click('[data-action="settle"]');
    await waitFor(()=>page.evaluate(`document.querySelector('#app')?.dataset.screen==='settlement'`),'Settlement screen');
    const nativeTaps=[];
    if(!await page.evaluate(`document.querySelector('.transfer-row .transfer-explanation')?.open===true`))nativeTaps.push(await page.tap('.transfer-row .personal-transfer-badge'));
    await waitFor(()=>page.evaluate(`document.querySelector('.transfer-row .transfer-explanation')?.open===true`),'Transfer breakdown is really expanded');
    await sleep(250);
    const state = await page.evaluate(inspectExpression);
    const text = await page.evaluate(`(() => { const selectors=['.event-header-action-label','.settlement-hero-title-row .muted','.settlement-hero-title-row h2','.settlement-hero .status-chip','.settlement-stage-heading small','.product-brand-copy strong','.transfer-participant-copy strong','.transfer-amount > .amount','.personal-transfer-badge','.transfer-debt-summary','.transfer-equation-item > span']; const rows=[]; for(const selector of selectors) for(const e of document.querySelectorAll(selector)){const r=e.getBoundingClientRect(),s=getComputedStyle(e);if(r.width&&r.height&&e.innerText.trim()&&!e.closest('details:not([open])')){const range=document.createRange(); range.selectNodeContents(e); const ink=range.getBoundingClientRect(); const parent=e.closest('button,.transfer-row,.settlement-hero')?.getBoundingClientRect();rows.push({selector,text:e.innerText,fontSize:parseFloat(s.fontSize),lineHeight:s.lineHeight,rect:r.toJSON(),ink:ink.toJSON(),parent:parent?.toJSON(),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,overflow:s.overflow,textOverflow:s.textOverflow});}} return rows; })()`);
    const required = {'.settlement-hero-title-row .muted':12,'.product-brand-copy strong':17,'.event-header-action-label':11,'.transfer-participant-copy strong':14,'.transfer-amount > .amount':20,'.personal-transfer-badge':11,'.transfer-debt-summary':14,'.transfer-equation-item > span':10};
    const checks = Object.entries(required).map(([selector,size])=>({name:selector+' scales with OS',ok:text.some(x=>x.selector===selector)&&text.filter(x=>x.selector===selector).every(x=>Math.abs(x.fontSize-size*scale)<.2)}));
    if(process.env.ANDROID_QA_INJECT_FAILURE==='1'&&results.length===0)checks.push({name:'Controlled QA failure injection',ok:false});
    checks.push({name:'Native plugin reports actual OS scale',ok:Math.abs(capabilities.fontScale-scale)<.01},{name:'Requested orientation is actually displayed',ok:orientation==='portrait'?state.dimensions.height>state.dimensions.width:state.dimensions.width>state.dimensions.height},{name:'Capacitor Android shell active',ok:state.native&&state.platform==='android'},{name:'No horizontal app overflow',ok:state.dimensions.appWidth<=state.dimensions.width+1});
    const labels=text.filter(x=>x.selector==='.event-header-action-label');
    checks.push({name:'Header labels fit their buttons',ok:labels.every(x=>x.ink.left>=x.parent.left-1&&x.ink.right<=x.parent.right+1&&x.ink.bottom<=x.parent.bottom+1)});
    const names=text.filter(x=>x.selector==='.transfer-participant-copy strong');
    checks.push({name:'Long names fit transfer rows',ok:names.every(x=>x.ink.left>=x.parent.left-1&&x.ink.right<=x.parent.right+1)});
    const descriptions=text.filter(x=>x.selector==='.settlement-hero-title-row .muted');
    checks.push({name:'Summary description glyphs stay inside hero',ok:descriptions.length>0&&descriptions.every(x=>x.ink.bottom<=x.parent.bottom+1&&x.scrollHeight<=x.clientHeight+1)});
    const helpers=text.filter(x=>x.selector==='.transfer-equation-item > span'||x.selector==='.transfer-debt-summary');
    checks.push({name:'Expanded breakdown text fits transfer row',ok:helpers.length>0&&helpers.every(x=>x.ink.left>=x.parent.left-1&&x.ink.right<=x.parent.right+1&&x.ink.bottom<=x.parent.bottom+1)});
    screenshot(resolve(out,`${orientation}-scale-${scale}.png`));
    await page.evaluate(`document.querySelector('.settlement-hero')?.scrollIntoView({block:'center'})`);await sleep(150);screenshot(resolve(out,`${orientation}-scale-${scale}-hero.png`));
    await page.evaluate(`document.querySelector('.settlement-transfer-board .transfer-row')?.scrollIntoView({block:'center'})`);await sleep(150);screenshot(resolve(out,`${orientation}-scale-${scale}-transfer.png`));
    results.push({scale,orientation,capabilities,state,text,checks,nativeTaps,exceptions:page.exceptions});
    console.log(JSON.stringify({scale,orientation,native:state.native,capabilities,dimensions:state.dimensions,checks}));
    } catch(error) {results.push({scale,orientation,error:error.stack,state:page?await page.evaluate(inspectExpression).catch(e=>({error:e.message})):null});console.log(JSON.stringify({scale,orientation,error:error.message}));}
    finally {page?.close();page=null;}
  }
} catch(error) { results.push({error:error.stack});process.exitCode=1; }
finally {
  page?.close();
  for(const [key,value] of Object.entries(original)) adb(value==='null'?['shell','settings','delete','system',key]:['shell','settings','put','system',key,value]);
  writeFileSync(resolve(out,'matrix.json'),JSON.stringify({source,original,results},null,2));
  process.exitCode=matrixExitCode(results);
}

