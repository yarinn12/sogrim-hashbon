import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {adb,launch,waitFor,screenshot,inspectExpression,sleep} from './driver.mjs';
import {matrixExitCode} from './matrix-verdict.mjs';
import {scaledFontSizeMatches} from './font-ratio.mjs';
import {textMeasurementExpression,glyphsFitContainer} from './text-measurement.mjs';
import {fontProbeExpression} from './font-probes.mjs';
import {acceptanceRunProvenance} from './run-provenance.mjs';
import {readCurrentFontContract,authoredNativeFontBase,authoredNativeFontMatches,actualAuthoredFontRules} from './font-contract.mjs';
import {launchForOwnedOrientation} from './orientation.mjs';
import {captureHoldFailure} from './hold-failure-evidence.mjs';
const out=resolve(process.env.ANDROID_QA_OUTPUT||'artifacts/android-native-isolated/matrix');mkdirSync(out,{recursive:true});
const provenance=acceptanceRunProvenance(),results=[];
const original=Object.fromEntries(['font_scale','accelerometer_rotation','user_rotation'].map(key=>[key,adb(['shell','settings','get','system',key]).trim()]));
const required={'.settlement-hero-title-row .muted':{size:12,count:1},'.product-brand-copy strong':{size:17,count:1},'.event-header-action-label':{size:11.5,count:3},'.transfer-participant-copy strong':{size:14,count:4},'.transfer-amount > .amount':{size:20,count:2},'.personal-transfer-badge':{size:11,count:2},'.transfer-debt-summary':{size:14,count:1},'.transfer-equation-item > span':{size:10,count:3}};
let page;
try{
  adb(['shell','settings','put','system','accelerometer_rotation','0']);
  for(const scale of [1,1.5,2])for(const [orientation,rotation] of [['portrait',0],['landscape',1]]){
    const row={scale,orientation,checks:[],nativeHolds:[],nativeTaps:[]};results.push(row);
    let measuringHold=false,holdPhase;
    const check=(name,ok,detail={})=>row.checks.push({name,ok:Boolean(ok),...detail});
    try{
      adb(['shell','settings','put','system','font_scale',String(scale)]);await sleep(750);
      const oriented=await launchForOwnedOrientation({launch,adb,waitFor,orientation,rotation,timeout:15000,onPage:value=>{page=value;}});row.rotationReceipt=oriented.receipt;
      row.capabilities=await waitFor(async()=>{const cap=await page.evaluate('Capacitor.Plugins.SogrimCapabilities.getCapabilities()');return Math.abs(cap.fontScale-scale)<.01&&cap;},'Actual Native OS font scale');
      await waitFor(()=>page.evaluate(`document.documentElement.dataset.dynamicType===${JSON.stringify(scale===1?'normal':'extra-large')}`),'Product reflow responds to actual OS preference');
      row.nativeTaps.push(await page.tap('[data-action="open-event"][data-event-id="android-native-event"]'));
      await waitFor(()=>page.evaluate(`Boolean(document.querySelector('.event-workspace-nav'))`),'Three event tabs');
      row.fontContract=await readCurrentFontContract(page,scale);
      await page.evaluate(`document.querySelector('.event-workspace-nav').scrollIntoView({block:'center'})`);await sleep(250);
      row.tabs=await page.evaluate(textMeasurementExpression(['.event-workspace-tab strong'],false));
      row.tabFontContractRules=await actualAuthoredFontRules(page,['.event-workspace-tab strong']);
      check('Exactly three rendered event tabs',row.tabs.length===3&&new Set(row.tabs.map(tab=>tab.text)).size===3);
      check('All three tab labels fit their actual buttons',row.tabs.length===3&&row.tabs.every(glyphsFitContainer));
      check('Three tab labels have exact OS ratio',row.tabs.length===3&&row.tabs.every(tab=>authoredNativeFontMatches(tab.fontSize,'.event-workspace-tab strong',row.fontContract)),{baselinePx:authoredNativeFontBase('.event-workspace-tab strong',row.fontContract),expectedRatio:scale,tolerancePx:.2,baselineSource:'Published authored CSS and actual viewport/pointer/class readbacks'});
      screenshot(resolve(out,`${orientation}-scale-${scale}-tabs.png`));
      row.nativeTaps.push(await page.tap('[data-action="settle"]'));
      await waitFor(()=>page.evaluate(`document.querySelector('#app')?.dataset.screen==='settlement'`),'Settlement');await sleep(250);
      if(!await page.evaluate(`document.querySelector('.transfer-explanation')?.open===true`))row.nativeTaps.push(await page.tap('.transfer-row .personal-transfer-badge'));
      await waitFor(()=>page.evaluate(`document.querySelector('.transfer-explanation')?.open===true`),'Visible expanded transfer breakdown');await sleep(250);
      row.settlementFontContract=await readCurrentFontContract(page,scale);
      row.text=await page.evaluate(textMeasurementExpression(Object.keys(required)));
      row.fontProbes=await page.evaluate(fontProbeExpression);row.state=await page.evaluate(inspectExpression);
      row.fontContractRules=await actualAuthoredFontRules(page,['.event-header-action-label']);
      for(const [selector,{size,count}] of Object.entries(required)){
        const baseline=selector==='.event-header-action-label'?authoredNativeFontBase(selector,row.settlementFontContract):size;
        const targets=row.text.filter(target=>target.selector===selector);
        check(selector+': required visible count',targets.length>=count,{minimumCount:count,actualCount:targets.length});
        check(selector+': exact OS ratio',targets.length>=count&&targets.every(target=>scaledFontSizeMatches(target.fontSize,baseline,scale)),{baselinePx:baseline,expectedRatio:scale,tolerancePx:.2});
        check(selector+': text glyphs fit container',targets.length>=count&&targets.every(glyphsFitContainer));
      }
      check('Root font applies OS scale exactly once',scaledFontSizeMatches(parseFloat(row.state.rootFontSize),16,scale));
      check('Fixed16px and1rem probes both apply OS scale once',row.fontProbes.length===2&&row.fontProbes.every(probe=>scaledFontSizeMatches(probe.computed,16,scale)));
      check('Actual Android bridge is active without diagnostic method',row.state.native&&row.state.platform==='android'&&!row.state.nativeMethods.includes('getQaWebViewTypography')&&row.state.nativeMethods.includes('getCapabilities'));
      check('No horizontal root or app overflow',row.state.dimensions.appWidth<=row.state.dimensions.width+1&&row.state.dimensions.rootWidth<=row.state.dimensions.width+1);
      check('No unhandled fixture requests or JS exceptions',!row.state.fixtureUnhandled.length&&!page.exceptions.length);
      check('Actual requested viewport orientation',orientation==='portrait'?row.state.dimensions.height>row.state.dimensions.width:row.state.dimensions.width>row.state.dimensions.height);
      if(process.env.ANDROID_QA_INJECT_FAILURE==='1'&&results.length===1)check('Controlled QA failure injection',false);
      for(const [label,selector] of [['header','.product-app-identity'],['hero','.settlement-hero'],['transfer','.transfer-row']]){await page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);await sleep(200);screenshot(resolve(out,`${orientation}-scale-${scale}-${label}.png`));}
      // Keep the original first tap cold; exercise hold only in a separate launch.
      row.exceptions=page.exceptions;
      measuringHold=true;
      holdPhase='foreground-orientation';
      page.close();page=null;
      const heldOriented=await launchForOwnedOrientation({launch,adb,waitFor,orientation,rotation,timeout:15000,onPage:value=>{page=value;}});
      row.holdRotationReceipt=heldOriented.receipt;
      holdPhase='hold-input';
      row.nativeHolds.push(await page.hold('[data-action="open-event"][data-event-id="android-native-event"]',650));
      holdPhase='menu-open';
      const held=await waitFor(()=>page.evaluate(`(()=>{const app=document.querySelector('#app'),menu=Boolean(document.querySelector('.event-status-menu[data-event-id="android-native-event"]')),tabs=Boolean(document.querySelector('.event-workspace-nav'));return menu||app?.dataset.screen!=='home'||tabs?{home:app?.dataset.screen==='home',menu,tabs}:false})()`),'Native hold opens event options on Home');
      check('Native hold opens event options on Home',held.home&&held.menu&&!held.tabs,held);
      if(!held.home||!held.menu||held.tabs)throw new Error('Native hold did not leave event options open on Home');
      holdPhase='menu-close';
      row.nativeTaps.push(await page.tap('[data-action="cancel-event-status-menu"]'));
      const closed=await waitFor(()=>page.evaluate(`(()=>{const app=document.querySelector('#app'),menu=Boolean(document.querySelector('.event-status-menu[data-event-id="android-native-event"]')),open=Boolean(document.querySelector('[data-action="open-event"][data-event-id="android-native-event"]'));return !menu?{home:app?.dataset.screen==='home',menu,open}:false})()`),'Native tap closes event options');
      check('Native tap closes event options on Home',closed.home&&!closed.menu&&closed.open,closed);
      if(!closed.home||closed.menu||!closed.open)throw new Error('Native tap did not close event options on Home');
      holdPhase='ordinary-tap';
      row.nativeTaps.push(await page.tap('[data-action="open-event"][data-event-id="android-native-event"]'));
      await waitFor(()=>page.evaluate(`Boolean(document.querySelector('.event-workspace-nav'))`),'Three event tabs');
      holdPhase='final-state';
      row.holdState=await page.evaluate(inspectExpression);
      row.holdExceptions=page.exceptions;
      check('Native hold session has no JS exceptions',row.holdExceptions.length===0);
    }catch(error){
      row.error=error.stack;
      if(measuringHold){
        const errorAtUtc=new Date().toISOString();
        try{row.holdFailureEvidence=captureHoldFailure({error,errorAtUtc,phase:holdPhase,scale,orientation,source:provenance.sourceCommit,device:process.env.ANDROID_QA_DEVICE,avd:process.env.ANDROID_QA_AVD,adbPath:process.env.ADB_PATH,emulatorPidFile:'artifacts/android-native-isolated/emulator.pid',traceStartFile:'artifacts/android-native-isolated/trace-diagnostics/trace-start.json',output:resolve(out,`hold-failure-${orientation}-scale-${scale}`)});}
        catch(diagnosticError){row.holdFailureEvidence={diagnosticOnly:true,errorAtUtc,unavailable:diagnosticError.message};}
      }
      const failureState=page?await page.evaluate(inspectExpression).catch(error=>({error:error.message})):null;
      if(measuringHold){
        row.holdRotationReceipt=error.rotationReceipt||row.holdRotationReceipt;
        row.holdState=failureState;row.holdExceptions=page?.exceptions||[];
      }else{
        row.rotationReceipt=error.rotationReceipt||row.rotationReceipt;row.state=failureState;
      }
    }
    finally{page?.close();page=null;writeFileSync(resolve(out,'matrix.json'),JSON.stringify({provenance,original,results},null,2));console.log(JSON.stringify({scale,orientation,failed:row.checks.filter(check=>!check.ok),error:row.error}));}
  }
}finally{
  page?.close();for(const [key,value] of Object.entries(original))adb(value==='null'?['shell','settings','delete','system',key]:['shell','settings','put','system',key,value]);
  adb(['shell','wm','user-rotation','lock',original.user_rotation==='null'?'0':original.user_rotation]);
  writeFileSync(resolve(out,'matrix.json'),JSON.stringify({provenance,original,results},null,2));process.exitCode=matrixExitCode(results);
}
