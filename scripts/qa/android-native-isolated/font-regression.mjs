import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {adb,launch,waitFor,inspectExpression,screenshot} from './driver.mjs';
import {fontProbeExpression} from './font-probes.mjs';
import {scaledFontSizeMatches} from './font-ratio.mjs';
import {acceptanceRunProvenance} from './run-provenance.mjs';
const out=resolve(process.env.ANDROID_QA_OUTPUT||'artifacts/android-native-isolated/font-regression');mkdirSync(out,{recursive:true});
const report={provenance:acceptanceRunProvenance(),kind:'Controlled DOM CSS mutation in actual Native WebView; product source/Native settings unchanged',ready:false};
const originalScale=adb(['shell','settings','get','system','font_scale']).trim();let page,saved;
async function measure(){return {state:await page.evaluate(inspectExpression),probes:await page.evaluate(fontProbeExpression),brand:await page.evaluate(`parseFloat(getComputedStyle(document.querySelector('.product-brand-copy strong')).fontSize)`)};}
try{
  adb(['shell','settings','put','system','font_scale','1.5']);page=await launch();
  report.capabilities=await page.evaluate('Capacitor.Plugins.SogrimCapabilities.getCapabilities()');assert.equal(report.capabilities.fontScale,1.5);
  await waitFor(()=>page.evaluate(`document.documentElement.dataset.dynamicType==='extra-large'`),'Actual OS reflow');
  report.baseline=await measure();assert.ok(report.baseline.state.native&&report.baseline.state.platform==='android');
  assert.ok(scaledFontSizeMatches(parseFloat(report.baseline.state.rootFontSize),16,1.5));
  assert.ok(report.baseline.probes.every(probe=>scaledFontSizeMatches(probe.computed,16,1.5)));
  assert.ok(scaledFontSizeMatches(report.baseline.brand,17,1.5));
  saved=await page.evaluate(`({value:document.documentElement.style.getPropertyValue('font-size'),priority:document.documentElement.style.getPropertyPriority('font-size')})`);
  await page.evaluate(`document.documentElement.style.setProperty('font-size','calc(16px * var(--android-font-scale, 1))','important')`);
  report.mutated=await measure();
  report.actualGuardResults={root:scaledFontSizeMatches(parseFloat(report.mutated.state.rootFontSize),16,1.5),rem:scaledFontSizeMatches(report.mutated.probes[1].computed,16,1.5),brand:scaledFontSizeMatches(report.mutated.brand,17,1.5)};
  assert.deepEqual(report.actualGuardResults,{root:false,rem:false,brand:false});
  assert.ok(scaledFontSizeMatches(report.mutated.probes[0].computed,16,1.5),'Fixed pixels retain one Native scale while rem stacks CSS scale');
  screenshot(resolve(out,'controlled-double-scale.png'));
  await page.evaluate(`(()=>{const saved=${JSON.stringify(saved)};saved.value?document.documentElement.style.setProperty('font-size',saved.value,saved.priority):document.documentElement.style.removeProperty('font-size');})()`);saved=null;
  report.restored=await measure();assert.ok(scaledFontSizeMatches(parseFloat(report.restored.state.rootFontSize),16,1.5)&&scaledFontSizeMatches(report.restored.brand,17,1.5));
  report.ready=true;
}catch(error){report.error=error.stack;process.exitCode=1;}
finally{
  if(page&&saved)await page.evaluate(`(()=>{const saved=${JSON.stringify(saved)};saved.value?document.documentElement.style.setProperty('font-size',saved.value,saved.priority):document.documentElement.style.removeProperty('font-size');})()`).catch(()=>{});
  page?.close();adb(['shell','settings','put','system','font_scale',originalScale]);writeFileSync(resolve(out,'font-regression.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ready:report.ready,actualGuardResults:report.actualGuardResults,error:report.error}));
}
