import {createHash} from 'node:crypto';
import {matrixExitCode} from './matrix-verdict.mjs';
import {assertNoTargetAppAnr} from './anr-diagnostics.mjs';
import {readFileSync} from 'node:fs';

export const SOURCE='c14a7665e8de361d8d33be183e7a88adec3ff7cb';
export const TREE='9bcf8cf40144d12507faa2cfea9ddadee42d819f';
function once(source,needle,replacement){
  if(source.split(needle).length!==2)throw new Error('Frozen harness instrumentation anchor missing or ambiguous');
  return source.replace(needle,replacement);
}
export function instrumentDriver(source,telemetryUrl){
  let text=`import {record,observedSpawnSync} from ${JSON.stringify(telemetryUrl)};\n`+source.replaceAll('\r\n','\n');
  text=once(text,'  constructor(url) {',"  constructor(url) {\n    this.diagnosticConnection=record('cdp-connection',{url}).sequence;this.diagnosticTimedOut=new Set();");
  text=once(text,"const result = spawnSync(adbPath,", "const result = observedSpawnSync(spawnSync,adbPath,");
  text=once(text,"const m = JSON.parse(String(e.data));",`const raw=String(e.data);let m;
      try{m=JSON.parse(raw);}catch(error){record('cdp-message',{connection:this.diagnosticConnection,id:null,raw,parseError:String(error),matched:false,late:false,unmatched:true,uiInputResponsiveProven:false});throw error;}
      const response=m!==null&&typeof m==='object'&&Object.prototype.hasOwnProperty.call(m,'id'),matched=response&&this.pending.has(m.id),late=response&&this.diagnosticTimedOut.has(m.id);
      record(response?'cdp-ack':'cdp-message',{connection:this.diagnosticConnection,id:response?m.id:null,raw,message:m,matched,late,unmatched:response&&!matched,uiInputResponsiveProven:false});`);
  text=once(text,'this.pending.delete(id); reject(new Error(`CDP ${method} timed out`));',"this.diagnosticTimedOut.add(id);record('cdp-timeout',{connection:this.diagnosticConnection,id,method,uiInputResponsiveProven:false});this.pending.delete(id); reject(new Error(`CDP ${method} timed out`));");
  text=once(text,"this.socket.send(JSON.stringify({ id, method, params }));", "record('cdp-send',{connection:this.diagnosticConnection,id,method,params});\n      this.socket.send(JSON.stringify({ id, method, params }));");
  text=once(text,"  return cdp;\n}", "  record('launch-returned-web-dom-and-fonts-ready',{uiInputResponsiveProven:false});\n  return cdp;\n}");
  return text;
}
export function instrumentPages(source,targetUrl,telemetryUrl){
  let text=`import {runTarget,cleanupBoundary} from ${JSON.stringify(targetUrl)};\nimport {record} from ${JSON.stringify(telemetryUrl)};\n`+source.replaceAll('\r\n','\n');
  const loop="for(const scale of [1,1.5,2])for(const [orientation,rotation] of [['portrait',0],['landscape',1]]){";
  text=once(text,loop,`pagesReplay: ${loop}\n    record('pages-case-boundary',{scale,orientation});\n    if(scale===2&&orientation==='portrait'){await runTarget({adb,launch,waitFor,sleep,launchForOwnedOrientation,onPage:value=>{page=value;}});break pagesReplay;}`);
  text=once(text,"}finally{page?.close();adb(","}finally{cleanupBoundary('start',{originalScale,originalRotation});page?.close();adb(");
  return once(text,"adb(['shell','wm','user-rotation','lock',originalRotation==='null'?'0':originalRotation]);writeFileSync", "adb(['shell','wm','user-rotation','lock',originalRotation==='null'?'0':originalRotation]);cleanupBoundary('complete',{originalScale,originalRotation});writeFileSync");
}
export const sha=value=>createHash('sha256').update(value).digest('hex');
export function assessClosedLog(file,logcatClosed){
  const report={logcatClosed,checkedAtUtc:new Date().toISOString(),anrHistoryReady:false};
  try{
    if(logcatClosed!==true)throw new Error('Require owned logcat close ACK before final full-file ANR predicate');
    const bytes=readFileSync(file);report.file={path:file,bytes:bytes.length,sha256:sha(bytes)};
    Object.assign(report,assertNoTargetAppAnr(bytes.toString('utf8')));report.anrHistoryReady=true;
  }catch(error){if(error.anrEvidence)Object.assign(report,error.anrEvidence);report.error=String(error);}
  return report;
}
export function targetDiagnosticComplete(target){
  if(!target||[target.error,target.clockAnchorError,target.capabilityError].some(value=>value!==undefined&&value!==null))return false;
  const anchors=target.clockAnchors;
  return target.foregroundBeforeRotationReached===true&&target.requestedScaleVerified===true&&target.rotationRequested===false&&target.clockAnchorsComplete===true&&Array.isArray(anchors)&&anchors.length===2&&anchors[0].label==='before-font-setting'&&anchors[1].label==='after-target-observation'&&anchors[0].bootId===anchors[1].bootId;
}
export function diagnosticOutcome(report){
  const targetComplete=targetDiagnosticComplete(report.target);
  const cleanupComplete=report.cleanup?.scope==='cleanup'&&report.cleanup?.complete===true&&report.cleanup?.rotationCommandAcknowledged===true;
  const closedHistoryReady=report.closedLog?.logcatClosed===true&&report.closedLog?.anrHistoryReady===true&&!report.closedLog?.error;
  const diagnosticComplete=Array.isArray(report.errors)&&report.errors.length===0&&report.trace?.captureComplete===true&&report.anr?.diagnosticsComplete===true&&report.prelude?.matrixPassed===true&&report.prelude?.pagesPassed===true&&cleanupComplete&&closedHistoryReady&&targetComplete;
  const anrObserved=(report.anr?.targetAppAnrLines?.length??0)>0||(report.closedLog?.targetAppAnrLines?.length??0)>0;
  return {targetComplete,diagnosticComplete,anrObserved,exitCode:diagnosticComplete&&!anrObserved&&report.anr?.anrHistoryReady===true?0:1,nativeAcceptance:false};
}
export function validatePrelude(matrix,pages){
  const checks=matrix.results.flatMap(row=>row.checks),holds=matrix.results.flatMap(row=>row.nativeHolds);
  const cases=pages.samples.map(s=>`${s.scale}/${s.orientation}/${s.screen}`);
  const expected=[1,1.5].flatMap(scale=>['portrait','landscape'].flatMap(orientation=>['home','event','notes','profile'].map(screen=>`${scale}/${orientation}/${screen}`)));
  return {matrixChecks:checks.length,matrixHolds:holds.length,matrixPassed:matrixExitCode(matrix.results)===0&&checks.length===216&&holds.length===6,pagesSamples:pages.samples.length,pagesChecks:pages.checks.length,pagesPassed:JSON.stringify(cases)===JSON.stringify(expected)&&pages.checks.length===203&&pages.checks.every(c=>c.ok===true),nativeAcceptance:false};
}
