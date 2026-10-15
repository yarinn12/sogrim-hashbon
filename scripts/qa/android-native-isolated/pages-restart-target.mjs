import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {record,stamp,boundedGuestClockAnchor,CLOCK_PROBE} from './pages-restart-telemetry.mjs';

export const armScale=arm=>{if(!['A','B'].includes(arm))throw new Error('Require predeclared A or B arm');return arm==='A'?2:1.5;};
export async function runTarget({adb,launch,waitFor,sleep,launchForOwnedOrientation,onPage},arm=process.env.ANDROID_RESTART_ARM){
  const scale=armScale(arm),output=process.env.ANDROID_RESTART_TARGET_OUTPUT;
  if(!output)throw new Error('Require isolated target output');
  const report={arm,scale,diagnosticOnly:true,nativeAcceptance:false,releaseAuthorized:false,rotationRequested:false,foregroundBeforeRotationReached:false,clockAnchors:[]};
  let page;const boundary=new Error('DIAGNOSTIC_STOP_BEFORE_ROTATION');
  function anchor(label){const before=stamp(),raw=adb([...CLOCK_PROBE]),after=stamp(),value={label,...boundedGuestClockAnchor(before,after,raw)};report.clockAnchors.push(value);record('target-clock-anchor',value);}
  try{
    anchor('before-font-setting');
    record('target-before-font-setting',{arm,scale,requestedOrientation:'portrait'});
    // Only this argument differs across A and B. Prelude, sleeps and launch stay identical.
    adb(['shell','settings','put','system','font_scale',String(scale)]);await sleep(750);
    await launchForOwnedOrientation({launch,waitFor,orientation:'portrait',rotation:0,
      onPage:value=>{page=value;onPage?.(value);record('target-launch-returned-web-dom-and-fonts-ready',{uiInputResponsiveProven:false});},
      adb:args=>{
        if(JSON.stringify(args)===JSON.stringify(['shell','wm','user-rotation','lock','0'])){
          report.foregroundBeforeRotationReached=true;record('target-foreground-before-rotation',{wouldRequest:args,commandActuallySent:false});throw boundary;
        }
        return adb(args);
      }});
    throw new Error('Diagnostic failed to intercept exact rotation boundary');
  }catch(error){
    report.orientationReceipt=error.rotationReceipt??null;
    if(error!==boundary){report.error=String(error.stack||error);record('target-error',{error:report.error});}
  }finally{
    try{anchor('after-target-observation');}catch(error){report.clockAnchorError=String(error);}
    report.clockAnchorsComplete=report.clockAnchors.length===2&&report.clockAnchors[0].bootId===report.clockAnchors[1].bootId&&BigInt(report.clockAnchors[1].guestLoNs)>=BigInt(report.clockAnchors[0].guestLoNs);
    report.clockPointQualityMet=report.clockAnchorsComplete&&report.clockAnchors.every(value=>value.usablePointAnchor);
    if(page&&report.foregroundBeforeRotationReached){
      try{report.capabilities=await page.evaluate('Capacitor.Plugins.SogrimCapabilities.getCapabilities()');report.requestedScaleVerified=Math.abs(report.capabilities.fontScale-scale)<.01;}
      catch(error){report.capabilityError=String(error);}
    }
    record('target-observation-finished',{foregroundBeforeRotationReached:report.foregroundBeforeRotationReached,error:report.error??null});
    writeFileSync(join(output,'target.json'),JSON.stringify(report,null,2));
  }
  return report;
}
