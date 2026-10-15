import {createHash} from 'node:crypto';
import {matrixExitCode} from './matrix-verdict.mjs';

export const SOURCE='c14a7665e8de361d8d33be183e7a88adec3ff7cb';
export const TREE='9bcf8cf40144d12507faa2cfea9ddadee42d819f';
function once(source,needle,replacement){
  if(source.split(needle).length!==2)throw new Error('Frozen harness instrumentation anchor missing or ambiguous');
  return source.replace(needle,replacement);
}
export function instrumentDriver(source,telemetryUrl){
  let text=`import {record,observedSpawnSync} from ${JSON.stringify(telemetryUrl)};\n`+source.replaceAll('\r\n','\n');
  text=once(text,'  constructor(url) {',"  constructor(url) {\n    this.diagnosticConnection=record('cdp-connection',{url}).sequence;");
  text=once(text,"const result = spawnSync(adbPath,", "const result = observedSpawnSync(spawnSync,adbPath,");
  text=once(text,"const { resolve, reject, timer } = this.pending.get(m.id);", "record('cdp-ack',{connection:this.diagnosticConnection,id:m.id,message:m,uiInputResponsiveProven:false});\n        const { resolve, reject, timer } = this.pending.get(m.id);");
  text=once(text,"this.socket.send(JSON.stringify({ id, method, params }));", "record('cdp-send',{connection:this.diagnosticConnection,id,method,params});\n      this.socket.send(JSON.stringify({ id, method, params }));");
  text=once(text,"  return cdp;\n}", "  record('launch-returned-web-dom-and-fonts-ready',{uiInputResponsiveProven:false});\n  return cdp;\n}");
  return text;
}
export function instrumentPages(source,targetUrl,telemetryUrl){
  let text=`import {runTarget} from ${JSON.stringify(targetUrl)};\nimport {record} from ${JSON.stringify(telemetryUrl)};\n`+source.replaceAll('\r\n','\n');
  const loop="for(const scale of [1,1.5,2])for(const [orientation,rotation] of [['portrait',0],['landscape',1]]){";
  return once(text,loop,`pagesReplay: ${loop}\n    record('pages-case-boundary',{scale,orientation});\n    if(scale===2&&orientation==='portrait'){await runTarget({adb,launch,waitFor,sleep,launchForOwnedOrientation,onPage:value=>{page=value;}});break pagesReplay;}`);
}
export const sha=value=>createHash('sha256').update(value).digest('hex');
export function targetDiagnosticComplete(target){
  if(!target||[target.error,target.clockAnchorError,target.capabilityError].some(value=>value!==undefined&&value!==null))return false;
  const anchors=target.clockAnchors;
  return target.foregroundBeforeRotationReached===true&&target.requestedScaleVerified===true&&target.rotationRequested===false&&target.clockAnchorsComplete===true&&Array.isArray(anchors)&&anchors.length===2&&anchors[0].label==='before-font-setting'&&anchors[1].label==='after-target-observation'&&anchors[0].bootId===anchors[1].bootId;
}
export function diagnosticOutcome(report){
  const targetComplete=targetDiagnosticComplete(report.target);
  const diagnosticComplete=Array.isArray(report.errors)&&report.errors.length===0&&report.trace?.captureComplete===true&&report.anr?.diagnosticsComplete===true&&report.prelude?.matrixPassed===true&&report.prelude?.pagesPassed===true&&targetComplete;
  const anrObserved=(report.anr?.targetAppAnrLines?.length??0)>0;
  return {targetComplete,diagnosticComplete,anrObserved,exitCode:diagnosticComplete&&!anrObserved&&report.anr?.anrHistoryReady===true?0:1,nativeAcceptance:false};
}
export function validatePrelude(matrix,pages){
  const checks=matrix.results.flatMap(row=>row.checks),holds=matrix.results.flatMap(row=>row.nativeHolds);
  const cases=pages.samples.map(s=>`${s.scale}/${s.orientation}/${s.screen}`);
  const expected=[1,1.5].flatMap(scale=>['portrait','landscape'].flatMap(orientation=>['home','event','notes','profile'].map(screen=>`${scale}/${orientation}/${screen}`)));
  return {matrixChecks:checks.length,matrixHolds:holds.length,matrixPassed:matrixExitCode(matrix.results)===0&&checks.length===216&&holds.length===6,pagesSamples:pages.samples.length,pagesChecks:pages.checks.length,pagesPassed:JSON.stringify(cases)===JSON.stringify(expected)&&pages.checks.length===203&&pages.checks.every(c=>c.ok===true),nativeAcceptance:false};
}
