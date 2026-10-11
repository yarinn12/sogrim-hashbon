import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {adb,launch,waitFor,inspectExpression,screenshot} from './driver.mjs';
import {fontProbeExpression,fontPaintDiagnosticExpression} from './font-probes.mjs';
import {applyStylesheetFontFaultExpression,restoreStylesheetFontFaultExpression,actualFontRuleDiagnostic} from './font-fault.mjs';
import {scaledFontSizeMatches} from './font-ratio.mjs';
import {acceptanceRunProvenance} from './run-provenance.mjs';
const out=resolve(process.env.ANDROID_QA_OUTPUT||'artifacts/android-native-isolated/font-regression');mkdirSync(out,{recursive:true});
const report={provenance:acceptanceRunProvenance(),kind:'Controlled DOM CSS mutation in actual Native WebView; product source/Native settings unchanged',ready:false};
const originalScale=adb(['shell','settings','get','system','font_scale']).trim();let page,saved;
async function measure(){return {state:await page.evaluate(inspectExpression),probes:await page.evaluate(fontProbeExpression),brand:await page.evaluate(`parseFloat(getComputedStyle(document.querySelector('.product-brand-copy strong')).fontSize)`),brandGlyph:await page.evaluate(`(() => {const e=document.querySelector('.product-brand-copy strong');if(!e)throw new Error('Actual rendered brand missing');const range=document.createRange();range.selectNodeContents(e);return range.getBoundingClientRect().toJSON();})()`)};}
try{
  adb(['shell','settings','put','system','font_scale','1.5']);page=await launch();
  report.capabilities=await page.evaluate('Capacitor.Plugins.SogrimCapabilities.getCapabilities()');assert.equal(report.capabilities.fontScale,1.5);
  await waitFor(()=>page.evaluate(`document.documentElement.dataset.dynamicType==='extra-large'`),'Actual OS reflow');
  report.baseline=await measure();assert.ok(report.baseline.state.native&&report.baseline.state.platform==='android');
  assert.ok(scaledFontSizeMatches(parseFloat(report.baseline.state.rootFontSize),16,1.5));
  assert.ok(report.baseline.probes.every(probe=>scaledFontSizeMatches(probe.computed,16,1.5)));
  assert.ok(scaledFontSizeMatches(report.baseline.brand,17,1.5));
  report.baselineFontRules=await actualFontRuleDiagnostic(page);
  screenshot(resolve(out,'controlled-baseline.png'));
  saved=await page.evaluate(applyStylesheetFontFaultExpression);
  report.fontFault={selector:saved.selector,ruleIndex:saved.ruleIndex,beforeRule:saved.beforeRule,afterRule:saved.afterRule,originalDeclaration:saved.originalDeclaration,mutatedDeclaration:saved.mutatedDeclaration,kind:'Actual Android CSSOM root rule restored to the original stacked-scale defect; no inline font override'};
  report.mutated=await measure();
  report.mutatedCapabilities=await page.evaluate('Capacitor.Plugins.SogrimCapabilities.getCapabilities()');assert.equal(report.mutatedCapabilities.fontScale,1.5,'CSS fault must not change the actual Native OS scale');
  report.actualGuardResults={root:scaledFontSizeMatches(parseFloat(report.mutated.state.rootFontSize),16,1.5),rem:scaledFontSizeMatches(report.mutated.probes[1].computed,16,1.5),brand:scaledFontSizeMatches(report.mutated.brand,17,1.5)};
  report.mutatedFontRules=await actualFontRuleDiagnostic(page);
  report.mutatedPaintDiagnostic=await page.evaluate(fontPaintDiagnosticExpression);
  assert.deepEqual(report.actualGuardResults,{root:false,rem:false,brand:false});
  assert.ok(scaledFontSizeMatches(report.mutated.probes[0].computed,16,1.5),'Fixed pixels retain one Native scale while rem stacks CSS scale');
  assert.ok(report.mutated.probes[1].glyph.width>report.baseline.probes[1].glyph.width*1.25,'The actual rem text range must visibly grow under the stylesheet fault');
  assert.ok(report.mutated.brandGlyph.height>report.baseline.brandGlyph.height*1.25,'The actual brand text range must visibly grow under the stylesheet fault');
  screenshot(resolve(out,'controlled-double-scale.png'));
  report.exactRestore=await page.evaluate(restoreStylesheetFontFaultExpression(saved));saved=null;
  report.restored=await measure();assert.ok(scaledFontSizeMatches(parseFloat(report.restored.state.rootFontSize),16,1.5)&&report.restored.probes.every(probe=>scaledFontSizeMatches(probe.computed,16,1.5))&&scaledFontSizeMatches(report.restored.brand,17,1.5));
  report.restoredFontRules=await actualFontRuleDiagnostic(page);
  report.restoredCapabilities=await page.evaluate('Capacitor.Plugins.SogrimCapabilities.getCapabilities()');assert.equal(report.restoredCapabilities.fontScale,1.5);
  screenshot(resolve(out,'controlled-restored.png'));
  report.ready=true;
}catch(error){report.error=error.stack;process.exitCode=1;}
finally{
  if(page&&saved)try{
    report.exactRecoveryRestore=await page.evaluate(restoreStylesheetFontFaultExpression(saved));
    report.recoveryPaintDiagnostic=await page.evaluate(fontPaintDiagnosticExpression);
  }catch(error){report.recoveryError=error.stack;process.exitCode=1;}
  try{originalScale==='null'?adb(['shell','settings','delete','system','font_scale']):adb(['shell','settings','put','system','font_scale',originalScale]);const readback=adb(['shell','settings','get','system','font_scale']).trim();report.osScaleRestore={original:originalScale,readback,exact:readback===originalScale};assert.equal(readback,originalScale,'Restore exact actual OS font_scale');}catch(error){report.osScaleRestoreError=error.stack;report.ready=false;process.exitCode=1;}
  page?.close();
  writeFileSync(resolve(out,'font-regression.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ready:report.ready,actualGuardResults:report.actualGuardResults,error:report.error,osScaleRestore:report.osScaleRestore,osScaleRestoreError:report.osScaleRestoreError}));
}
