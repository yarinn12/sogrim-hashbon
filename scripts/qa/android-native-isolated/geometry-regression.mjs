import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {adb,launch,waitFor,screenshot,sleep} from './driver.mjs';
import {textMeasurementExpression,glyphsFitContainer} from './text-measurement.mjs';
import {acceptanceRunProvenance} from './run-provenance.mjs';
const out=resolve(process.env.ANDROID_QA_OUTPUT||'artifacts/android-native-isolated/geometry-regression');mkdirSync(out,{recursive:true});
const report={provenance:acceptanceRunProvenance(),ready:false,checks:[]},original={font:adb(['shell','settings','get','system','font_scale']).trim(),rotation:adb(['shell','settings','get','system','user_rotation']).trim()};let page;
async function control(selector,label,count,axis){
  const before=await page.evaluate(textMeasurementExpression([selector]));assert.equal(before.length,count);assert.ok(before.every(row=>row.glyphs.length&&glyphsFitContainer(row)),'Normal actual text must fit');
  const inline=await page.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),old=e.getAttribute('style');e.style.setProperty('display','inline-block','important');e.style.setProperty(${JSON.stringify(axis==='x'?'width':'height')},'1px','important');${axis==='x'?"e.style.setProperty('min-width','0','important');e.style.setProperty('max-width','1px','important');e.style.setProperty('padding','0','important');":''}e.style.setProperty('overflow','hidden','important');return old;})()`);
  let clipped,after;
  try{
    clipped=await page.evaluate(textMeasurementExpression([selector]));
    assert.equal(clipped.length,count);assert.ok(clipped.every(row=>row.glyphs.length>0),'Clipping must fail on measured glyphs, not missing rows');
    assert.equal(clipped.every(glyphsFitContainer),false,'Actual one-pixel text clipping must turn the same gate red');
    screenshot(resolve(out,label+'-clipped.png'));
  }finally{await page.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});${inline===null?"e.removeAttribute('style')":`e.setAttribute('style',${JSON.stringify(inline)})`};return true;})()`);}
  after=await page.evaluate(textMeasurementExpression([selector]));assert.equal(after.length,count);assert.ok(after.every(glyphsFitContainer),'Restoring actual geometry must turn the gate green');
  screenshot(resolve(out,label+'-restored.png'));
  report.checks.push({selector,label,count,axis,before,clipped,after,ok:true});
}
try{
  adb(['shell','settings','put','system','font_scale','2']);adb(['shell','wm','user-rotation','lock','0']);await sleep(500);page=await launch();
  report.capabilities=await waitFor(async()=>{const cap=await page.evaluate('Capacitor.Plugins.SogrimCapabilities.getCapabilities()');return Math.abs(cap.fontScale-2)<.01&&cap;},'Actual Native OS2');
  await page.tap('[data-action="open-event"][data-event-id="android-native-event"]');await waitFor(()=>page.evaluate(`Boolean(document.querySelector('.event-header-action-label'))`),'Event header labels');
  await control('.event-header-action-label','event-header-label-height',3,'y');
  await control('.event-header-action-label','event-header-label-width',3,'x');
  await page.tap('[data-action="settle"]');await waitFor(()=>page.evaluate(`Boolean(document.querySelector('.personal-transfer-badge'))`),'Transfer badges');
  await control('.personal-transfer-badge','personal-transfer-badge-height',2,'y');
  await control('.personal-transfer-badge','personal-transfer-badge-width',2,'x');
  report.exceptions=page.exceptions;assert.equal(page.exceptions.length,0);assert.equal(report.checks.length,4);report.ready=true;
}catch(error){report.error=error.stack;process.exitCode=1;}
finally{page?.close();adb(['shell','settings','put','system','font_scale',original.font]);adb(['shell','wm','user-rotation','lock',original.rotation==='null'?'0':original.rotation]);writeFileSync(resolve(out,'geometry-regression.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ready:report.ready,checks:report.checks.map(({selector,ok})=>({selector,ok})),error:report.error}));}
