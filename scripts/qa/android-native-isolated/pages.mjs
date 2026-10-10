import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {adb,launch,waitFor,screenshot} from './driver.mjs';
import {scaledFontSizeMatches} from './font-ratio.mjs';
const out=resolve(process.env.ANDROID_QA_OUTPUT||'artifacts/android-native-isolated');mkdirSync(out,{recursive:true});
const originalScale=adb(['shell','settings','get','system','font_scale']).trim();
const targets={home:['.product-brand-copy strong','.product-home-screen .top .brand h1','.home-create-event-action'],event:['.product-brand-copy strong','.event-overview-header h1','.event-header-action-label','.expense-row strong','.event-workspace-tab strong'],notes:['.product-brand-copy strong','[data-screen-kind="event-notes"] h1','.event-note-title-line strong','.event-note-preview','.event-workspace-tab strong'],profile:['.product-brand-copy strong','[data-screen-kind="profile"] h1','.profile-identity-copy strong']};
const samples=[],checks=[];let page;
async function sample(scale,screen){
  await page.evaluate('document.fonts.ready.then(()=>true)');
  const rows=await page.evaluate(`(() => {const selectors=${JSON.stringify(targets[screen])};return {width:innerWidth,appWidth:document.querySelector('#app').scrollWidth,rootWidth:document.documentElement.scrollWidth,rows:selectors.map(selector=>({selector,values:[...document.querySelectorAll(selector)].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height;}).map(e=>({text:e.innerText,fontSize:parseFloat(getComputedStyle(e).fontSize),rect:e.getBoundingClientRect().toJSON(),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}))}))};})()`);
  samples.push({scale,screen,rows});screenshot(resolve(out,`pages-${screen}-scale-${scale}.png`));
  checks.push({name:`${scale}/${screen}: no horizontal overflow`,ok:rows.appWidth<=rows.width+1&&rows.rootWidth<=rows.width+1});
  for(const row of rows.rows){
    checks.push({name:`${scale}/${screen}/${row.selector}: target exists`,ok:row.values.length>0});
    if(scale>1){const baseline=samples.find(s=>s.scale===1&&s.screen===screen)?.rows.rows.find(r=>r.selector===row.selector)?.values[0];checks.push({name:`${scale}/${screen}/${row.selector}: exact requested OS ratio`,expectedRatio:scale,tolerancePx:.2,ok:Boolean(baseline)&&row.values.length>0&&row.values.every(value=>scaledFontSizeMatches(value.fontSize,baseline.fontSize,scale))});}
    if(row.selector==='.event-workspace-tab strong')checks.push({name:`${scale}/${screen}: tab label fits`,ok:row.values.every(value=>value.scrollWidth<=value.clientWidth+1)});
  }
  console.log(JSON.stringify({scale,screen,sizes:rows.rows.map(r=>({selector:r.selector,sizes:r.values.map(v=>v.fontSize)})),failed:checks.filter(c=>!c.ok)}));
}
try{
  for(const scale of [1,1.5,2]){
    adb(['shell','settings','put','system','font_scale',String(scale)]);page=await launch();
    await sample(scale,'home');await page.click('[data-action="open-event"][data-event-id="android-native-event"]');await sample(scale,'event');
    await page.click('[data-action="open-event-notes"]');await waitFor(()=>page.evaluate(`Boolean(document.querySelector('[data-screen-kind="event-notes"]'))`),'Notes');await sample(scale,'notes');
    await page.click('[data-action="edit-profile"]');await waitFor(()=>page.evaluate(`Boolean(document.querySelector('[data-screen-kind="profile"]'))`),'Profile');await sample(scale,'profile');page.close();page=null;
  }
}catch(error){checks.push({name:error.stack,ok:false});}
finally{page?.close();adb(['shell','settings','put','system','font_scale',originalScale]);writeFileSync(resolve(out,'pages.json'),JSON.stringify({source:process.env.ANDROID_QA_SOURCE,samples,checks},null,2));if(samples.length!==12||checks.some(check=>!check.ok))process.exitCode=1;}
