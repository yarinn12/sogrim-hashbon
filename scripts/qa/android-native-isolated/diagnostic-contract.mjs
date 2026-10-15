import {requireHostCohortCoverage} from './cohort-observation-coverage.mjs';

export const DIAGNOSTIC_CONTRACT=Object.freeze({version:2,name:'owned-transport-and-cohort-v2',start:'owned-trace-start-v2',host:'owned-host-observer-v2',finish:'owned-trace-finish-v2'});
export function diagnosticMetadata(producer){return {diagnosticsVersion:DIAGNOSTIC_CONTRACT.version,diagnosticsContract:DIAGNOSTIC_CONTRACT.name,diagnosticsProducer:producer};}
export function requireDiagnosticMetadata(value,producer){
  if(value?.diagnosticsVersion!==2||value.diagnosticsContract!==DIAGNOSTIC_CONTRACT.name||value.diagnosticsProducer!==producer)throw new Error('Owned diagnostic schema/producer is missing or obsolete');
}
function stopTarget(start){
  const owner=start.hostOwner??start.owner;
  if(!/^[a-f0-9]{40}$/.test(start.source||'')||!/^sogrim_ci_[a-z0-9_]+_[a-f0-9]{16}$/.test(start.session||'')||!Number.isSafeInteger(owner?.pid)||owner.pid<=1||typeof owner.startTicks!=='string'||!/^\d+$/.test(owner.startTicks))throw new Error('Owned host stop requires an exact source/session/PID/start identity');
  return {stopVersion:1,source:start.source,session:start.session,owner:{pid:owner.pid,startTicks:owner.startTicks}};
}
export function ownedHostStopRequest(start){requireDiagnosticMetadata(start,DIAGNOSTIC_CONTRACT.start);return stopTarget(start);}
export function verifyOwnedHostStop(request,start){
  const expected=stopTarget(start);
  if(request?.stopVersion!==1||request.source!==expected.source||request.session!==expected.session||request.owner?.pid!==expected.owner.pid||request.owner.startTicks!==expected.owner.startTicks)throw new Error('Host stop does not match this owned source/session/PID/start');
  return request;
}
export function addHostObservationError(summary,error){const text=error.stack??String(error);summary.observationErrors.push(text);summary.errors.push(text);}
export function addHostWindowError(summary,code,error){const text=error.stack??String(error);summary.windowErrors.push({code,error:text});summary.errors.push(text);}
const windowCodes=new Set(['MISSING_OWNED_STOP','INVALID_OWNED_STOP','DURATION_CAP']);
export function hostObservationStatus(summary,start){
  requireDiagnosticMetadata(summary,DIAGNOSTIC_CONTRACT.host);
  if(summary.source!==start.source||summary.session!==start.session||summary.owner?.pid!==start.hostOwner?.pid||summary.owner?.startTicks!==start.hostOwner?.startTicks)throw new Error('Owned host scheduling source/owner/session mismatch');
  if(!Array.isArray(summary.observationErrors)||!summary.observationErrors.every(x=>typeof x==='string')||!Array.isArray(summary.windowErrors)||!summary.windowErrors.every(x=>windowCodes.has(x.code)&&typeof x.error==='string')||!Array.isArray(summary.errors)||JSON.stringify([...summary.errors].sort())!==JSON.stringify([...summary.observationErrors,...summary.windowErrors.map(x=>x.error)].sort()))throw new Error('Host diagnostic error accounting is malformed');
  let integrity=false;
  try{requireHostCohortCoverage({...summary,errors:summary.observationErrors});integrity=true;}catch{/* The recorded failures remain in the summary; this flag is derived, never a repair. */}
  integrity=integrity&&Number.isSafeInteger(summary.data?.bytes)&&summary.data.bytes>0&&summary.data.bytes<64*1024*1024&&/^[a-f0-9]{64}$/.test(summary.data.sha256||'')&&summary.expectedJournal?.bytes===summary.data.bytes&&summary.expectedJournal.sha256===summary.data.sha256;
  let stopped=false;
  if(summary.ownedStop){verifyOwnedHostStop(summary.ownedStop,start);stopped=summary.ownedStop.verified===true&&Number.isFinite(Date.parse(summary.ownedStop.observedAtUtc));}
  return {hostObservationIntegrity:integrity,hostCaptureWindowComplete:integrity&&stopped&&summary.windowErrors.length===0};
}
export function setHostObservationStatus(summary,start){const status=hostObservationStatus(summary,start);Object.assign(summary,status,{captureComplete:status.hostCaptureWindowComplete});return status;}
export function verifyHostObservationStatus(summary,start){
  const status=hostObservationStatus(summary,start);
  if(summary.hostObservationIntegrity===true&&!status.hostObservationIntegrity)requireHostCohortCoverage({...summary,errors:summary.observationErrors});
  if(summary.hostObservationIntegrity!==status.hostObservationIntegrity||summary.hostCaptureWindowComplete!==status.hostCaptureWindowComplete||summary.captureComplete!==status.hostCaptureWindowComplete)throw new Error('Host diagnostic completion claims do not match observations/owned stop');
  return status;
}
