import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {adb,launch,waitFor,screenshot,inspectExpression,sleep} from './driver.mjs';
import {scaledFontSizeMatches} from './font-ratio.mjs';
import {textMeasurementExpression,glyphsFitContainer,notePreviewFitsContainer} from './text-measurement.mjs';
import {acceptanceRunProvenance} from './run-provenance.mjs';
import {fontContractContextExpression,hasAuthoredFontContract,authoredNativeFontBase,authoredNativeFontMatches,actualAuthoredFontRules} from './font-contract.mjs';
import {launchForOwnedOrientation} from './orientation.mjs';
const out=resolve(process.env.ANDROID_QA_OUTPUT||'artifacts/android-native-isolated/pages');mkdirSync(out,{recursive:true});
const provenance=acceptanceRunProvenance(),originalScale=adb(['shell','settings','get','system','font_scale']).trim(),originalRotation=adb(['shell','settings','get','system','user_rotation']).trim();
const targets={home:['.product-brand-copy strong','.product-home-screen .top .brand h1','.home-create-event-action'],event:['.product-brand-copy strong','.event-overview-header h1','.event-header-action-label','.expense-row strong','.event-workspace-tab strong'],notes:['.product-brand-copy strong','[data-screen-kind="event-notes"] h1','.event-note-title-line strong','.event-note-preview','.event-workspace-tab strong'],profile:['.product-brand-copy strong','[data-screen-kind="profile"] h1','.profile-identity-copy strong']};
const samples=[],checks=[],orientationAttempts=[];let page;
async function noteDisclosure(rows,scale,orientation){
  const title=rows.find(row=>row.selector==='.event-note-title-line strong')?.text,body=rows.find(row=>row.selector==='.event-note-preview')?.text;
  await page.click('.event-note-open[data-note-id="native-seeded-note"]');
  await waitFor(()=>page.evaluate(`Boolean(document.querySelector('[data-action="event-note-title"]'))`),'Full note editor');
  await page.evaluate(`(()=>{const title=document.querySelector('[data-action="event-note-title"]');title.scrollIntoView({block:'center'});title.focus({preventScroll:true});return true;})()`);
  adb(['shell','input','keyevent','122']);await sleep(100);
  const start=await page.evaluate(`(()=>{const e=document.querySelector('[data-action="event-note-title"]');return {selection:e.selectionStart,scrollLeft:e.scrollLeft};})()`);
  adb(['shell','input','keyevent','123']);await sleep(100);
  const end=await page.evaluate(`(()=>{const e=document.querySelector('[data-action="event-note-title"]');return {selection:e.selectionStart,scrollLeft:e.scrollLeft};})()`);
  const disclosure=await page.evaluate(`(async()=>{
    const title=document.querySelector('[data-action="event-note-title"]'),body=document.querySelector('[data-action="event-note-body"]'),frames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const describe=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {value:e.value,fontSize:parseFloat(s.fontSize),rect:r.toJSON(),clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,clientHeight:e.clientHeight,scrollHeight:e.scrollHeight,overflowX:s.overflowX,overflowY:s.overflowY,visible:r.width>0&&r.height>0&&s.visibility==='visible'};};
    title.blur();
    body.scrollIntoView({block:'center'});await frames();const bodyStart=body.scrollTop;body.scrollTop=body.scrollHeight;await frames();const bodyEnd=body.scrollTop;
    return {title:describe(title),body:describe(body),bodyStart,bodyEnd};
  })()`);
  Object.assign(disclosure,{start,end,caretNavigation:'Actual Android KEYCODE_MOVE_HOME/END, no text edit'});
  const baseline=samples.find(sample=>sample.scale===1&&sample.orientation===orientation&&sample.screen==='notes')?.disclosure;
  disclosure.ok=disclosure.title.value===title&&disclosure.body.value===body&&disclosure.title.visible&&disclosure.body.visible&&disclosure.start.selection===0&&disclosure.end.selection===title?.length&&(disclosure.title.scrollWidth<=disclosure.title.clientWidth+1||Math.abs(disclosure.end.scrollLeft-disclosure.start.scrollLeft)>1)&&disclosure.body.scrollWidth<=disclosure.body.clientWidth+1&&(disclosure.body.scrollHeight<=disclosure.body.clientHeight+1||disclosure.bodyEnd>disclosure.bodyStart)&&(scale===1||baseline&&scaledFontSizeMatches(disclosure.title.fontSize,baseline.title.fontSize,scale)&&scaledFontSizeMatches(disclosure.body.fontSize,baseline.body.fontSize,scale));
  screenshot(resolve(out,`${orientation}-notes-full-disclosure-scale-${scale}.png`));
  await page.click('[data-action="close-event-dialog"]');await waitFor(()=>page.evaluate(`!document.querySelector('[data-action="event-note-title"]')`),'Note editor closed without changes');
  return disclosure;
}
async function sample(scale,orientation,screen){
  await page.evaluate('document.fonts.ready.then(()=>true)');
  const fontContract={...(await page.evaluate(fontContractContextExpression)),scale};
  const fontContractRules=await actualAuthoredFontRules(page,targets[screen].filter(hasAuthoredFontContract));
  const rows=await page.evaluate(textMeasurementExpression(targets[screen]));
  const state=await page.evaluate(inspectExpression),disclosure=screen==='notes'?await noteDisclosure(rows,scale,orientation):null;samples.push({scale,orientation,screen,rows,state,disclosure,fontContract,fontContractRules});
  screenshot(resolve(out,`${orientation}-${screen}-scale-${scale}.png`));
  const prefix=`${scale}/${orientation}/${screen}`;
  checks.push({name:prefix+': no horizontal overflow',ok:state.dimensions.appWidth<=state.dimensions.width+1&&state.dimensions.rootWidth<=state.dimensions.width+1});
  if(screen==='notes')checks.push({name:prefix+': full note title/body retained, reachable and scaled in disclosure',ok:disclosure.ok});
  for(const selector of targets[screen]){
    const values=rows.filter(row=>row.selector===selector);checks.push({name:prefix+'/'+selector+': rendered text exists',ok:values.length>0});
    checks.push({name:prefix+'/'+selector+': visible glyphs fit container',ok:values.length>0&&values.every(value=>['.event-note-title-line strong','.event-note-preview'].includes(selector)?notePreviewFitsContainer(value,disclosure?.ok):glyphsFitContainer(value))});
    if(hasAuthoredFontContract(selector))checks.push({name:prefix+'/'+selector+': exact authored size at requested OS ratio',baselinePx:authoredNativeFontBase(selector,fontContract),baselineSource:'Published authored CSS and actual viewport/pointer/class readbacks',expectedRatio:scale,tolerancePx:.2,ok:values.length>0&&values.every(value=>authoredNativeFontMatches(value.fontSize,selector,fontContract))});
    else if(scale>1){const baseline=samples.find(sample=>sample.scale===1&&sample.orientation===orientation&&sample.screen===screen)?.rows.filter(row=>row.selector===selector)||[];checks.push({name:prefix+'/'+selector+': exact requested OS ratio',expectedRatio:scale,tolerancePx:.2,ok:values.length>0&&values.every(value=>{const base=baseline.find(row=>row.text===value.text);return base&&scaledFontSizeMatches(value.fontSize,base.fontSize,scale);})});}
    if(selector==='.event-workspace-tab strong')checks.push({name:prefix+': exactly three distinct visible tabs',ok:values.length===3&&new Set(values.map(value=>value.text)).size===3});
  }
  console.log(JSON.stringify({scale,orientation,screen,sizes:rows.map(row=>({selector:row.selector,size:row.fontSize})),failed:checks.filter(check=>check.name.startsWith(prefix)&&!check.ok)}));
}
try{
  for(const scale of [1,1.5,2])for(const [orientation,rotation] of [['portrait',0],['landscape',1]]){
    try{
      adb(['shell','settings','put','system','font_scale',String(scale)]);await sleep(750);
      const oriented=await launchForOwnedOrientation({launch,adb,waitFor,orientation,rotation,onPage:value=>{page=value;}});orientationAttempts.push({...oriented.receipt,scale});
      await waitFor(async()=>Math.abs((await page.evaluate('Capacitor.Plugins.SogrimCapabilities.getCapabilities()')).fontScale-scale)<.01,'Actual native OS font scale');
      await sample(scale,orientation,'home');await page.click('[data-action="open-event"][data-event-id="android-native-event"]');await sample(scale,orientation,'event');
      await page.click('[data-action="open-event-notes"]');await waitFor(()=>page.evaluate(`Boolean(document.querySelector('[data-screen-kind="event-notes"]'))`),'Notes');await sample(scale,orientation,'notes');
      await page.click('[data-action="edit-profile"]');await waitFor(()=>page.evaluate(`Boolean(document.querySelector('[data-screen-kind="profile"]'))`),'Profile');await sample(scale,orientation,'profile');
    }catch(error){if(error.rotationReceipt)orientationAttempts.push({...error.rotationReceipt,scale});checks.push({name:`${scale}/${orientation}: `+error.stack,ok:false});}
    finally{page?.close();page=null;writeFileSync(resolve(out,'pages.json'),JSON.stringify({provenance,navigationMethod:'DOM for typography measurements; Native taps tested by matrix and journey',orientationAttempts,samples,checks},null,2));}
  }
}finally{page?.close();adb(['shell','settings','put','system','font_scale',originalScale]);adb(['shell','wm','user-rotation','lock',originalRotation==='null'?'0':originalRotation]);writeFileSync(resolve(out,'pages.json'),JSON.stringify({provenance,orientationAttempts,samples,checks},null,2));if(samples.length!==24||checks.some(check=>!check.ok))process.exitCode=1;}
