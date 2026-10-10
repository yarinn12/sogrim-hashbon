import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {adb,launch,waitFor,screenshot,inspectExpression,sleep} from './driver.mjs';
import {scaledFontSizeMatches} from './font-ratio.mjs';
import {textMeasurementExpression,glyphsFitContainer} from './text-measurement.mjs';
import {acceptanceRunProvenance} from './run-provenance.mjs';
const out=resolve(process.env.ANDROID_QA_OUTPUT||'artifacts/android-native-isolated/pages');mkdirSync(out,{recursive:true});
const provenance=acceptanceRunProvenance(),originalScale=adb(['shell','settings','get','system','font_scale']).trim(),originalRotation=adb(['shell','settings','get','system','user_rotation']).trim();
const targets={home:['.product-brand-copy strong','.product-home-screen .top .brand h1','.home-create-event-action'],event:['.product-brand-copy strong','.event-overview-header h1','.event-header-action-label','.expense-row strong','.event-workspace-tab strong'],notes:['.product-brand-copy strong','[data-screen-kind="event-notes"] h1','.event-note-title-line strong','.event-note-preview','.event-workspace-tab strong'],profile:['.product-brand-copy strong','[data-screen-kind="profile"] h1','.profile-identity-copy strong']};
const samples=[],checks=[];let page;
async function sample(scale,orientation,screen){
  await page.evaluate('document.fonts.ready.then(()=>true)');
  const rows=await page.evaluate(textMeasurementExpression(targets[screen]));
  const state=await page.evaluate(inspectExpression);samples.push({scale,orientation,screen,rows,state});
  screenshot(resolve(out,`${orientation}-${screen}-scale-${scale}.png`));
  const prefix=`${scale}/${orientation}/${screen}`;
  checks.push({name:prefix+': no horizontal overflow',ok:state.dimensions.appWidth<=state.dimensions.width+1&&state.dimensions.rootWidth<=state.dimensions.width+1});
  for(const selector of targets[screen]){
    const values=rows.filter(row=>row.selector===selector);checks.push({name:prefix+'/'+selector+': rendered text exists',ok:values.length>0});
    checks.push({name:prefix+'/'+selector+': visible glyphs fit container',ok:values.length>0&&values.every(glyphsFitContainer)});
    if(scale>1){const baseline=samples.find(sample=>sample.scale===1&&sample.orientation===orientation&&sample.screen===screen)?.rows.filter(row=>row.selector===selector)||[];checks.push({name:prefix+'/'+selector+': exact requested OS ratio',expectedRatio:scale,tolerancePx:.2,ok:values.length>0&&values.every(value=>{const base=baseline.find(row=>row.text===value.text);return base&&scaledFontSizeMatches(value.fontSize,base.fontSize,scale);})});}
    if(selector==='.event-workspace-tab strong')checks.push({name:prefix+': exactly three distinct visible tabs',ok:values.length===3&&new Set(values.map(value=>value.text)).size===3});
  }
  console.log(JSON.stringify({scale,orientation,screen,sizes:rows.map(row=>({selector:row.selector,size:row.fontSize})),failed:checks.filter(check=>check.name.startsWith(prefix)&&!check.ok)}));
}
try{
  for(const scale of [1,1.5,2])for(const [orientation,rotation] of [['portrait',0],['landscape',1]]){
    try{
      adb(['shell','settings','put','system','font_scale',String(scale)]);adb(['shell','wm','user-rotation','lock',String(rotation)]);await sleep(750);page=await launch();
      await waitFor(()=>page.evaluate(orientation==='portrait'?'innerHeight>innerWidth':'innerWidth>innerHeight'),'Actual '+orientation+' viewport');
      await waitFor(async()=>Math.abs((await page.evaluate('Capacitor.Plugins.SogrimCapabilities.getCapabilities()')).fontScale-scale)<.01,'Actual native OS font scale');
      await sample(scale,orientation,'home');await page.click('[data-action="open-event"][data-event-id="android-native-event"]');await sample(scale,orientation,'event');
      await page.click('[data-action="open-event-notes"]');await waitFor(()=>page.evaluate(`Boolean(document.querySelector('[data-screen-kind="event-notes"]'))`),'Notes');await sample(scale,orientation,'notes');
      await page.click('[data-action="edit-profile"]');await waitFor(()=>page.evaluate(`Boolean(document.querySelector('[data-screen-kind="profile"]'))`),'Profile');await sample(scale,orientation,'profile');
    }catch(error){checks.push({name:`${scale}/${orientation}: `+error.stack,ok:false});}
    finally{page?.close();page=null;writeFileSync(resolve(out,'pages.json'),JSON.stringify({provenance,navigationMethod:'DOM for typography measurements; Native taps tested by matrix and journey',samples,checks},null,2));}
  }
}finally{page?.close();adb(['shell','settings','put','system','font_scale',originalScale]);adb(['shell','wm','user-rotation','lock',originalRotation==='null'?'0':originalRotation]);writeFileSync(resolve(out,'pages.json'),JSON.stringify({provenance,samples,checks},null,2));if(samples.length!==24||checks.some(check=>!check.ok))process.exitCode=1;}
