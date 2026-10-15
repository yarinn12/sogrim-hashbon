import {appendFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';

export const COMMAND_EVIDENCE_CAP=64*1024*1024;
const hash=value=>createHash('sha256').update(value).digest('hex');
export const stamp=()=>({atUtc:new Date().toISOString(),monotonicNs:process.hrtime.bigint().toString()});

// A command ACK proves only the recorded process/protocol response, never UI readiness.
export function createTelemetry(directory,{clock=stamp,cap=COMMAND_EVIDENCE_CAP}={}){
  if(!directory)throw new Error('Require isolated command evidence directory');
  const root=resolve(directory);mkdirSync(root,{recursive:true});let sequence=0,bytesWritten=0;
  function reserve(bytes){if(bytesWritten+bytes>cap)throw new Error('Diagnostic command evidence cap reached; retain incomplete result');bytesWritten+=bytes;}
  function record(kind,data={}){
    const row={sequence:++sequence,kind,...clock(),data},line=JSON.stringify(row)+'\n';
    reserve(Buffer.byteLength(line));appendFileSync(join(root,'commands.jsonl'),line);return row;
  }
  function payload(value,label){
    if(value===null||value===undefined)return null;
    const bytes=Buffer.isBuffer(value)?value:Buffer.from(String(value));
    // Existing screenshot files retain binary output; do not duplicate it in this journal.
    const receipt={bytes:bytes.length,sha256:hash(bytes),binary:Buffer.isBuffer(value)};
    if(!receipt.binary){reserve(bytes.length);receipt.path=`${sequence+1}-${label}.txt`;writeFileSync(join(root,receipt.path),bytes,{flag:'wx'});}
    return receipt;
  }
  function observedSpawnSync(run,command,args,options){
    const sent=record('adb-command-send',{command,args});let result;
    try{result=run(command,args,options);}catch(error){record('adb-command-throw',{requestSequence:sent.sequence,error:String(error)});throw error;}
    const ended=clock();
    record('adb-command-ack',{requestSequence:sent.sequence,responseObserved:ended,status:result.status,signal:result.signal??null,error:result.error?String(result.error):null,stdout:payload(result.stdout,'stdout'),stderr:payload(result.stderr,'stderr'),successfulProcessExit:!result.error&&result.status===0,uiReadinessProven:false});
    return result;
  }
  return {record,observedSpawnSync};
}

let active,activeDirectory;
function telemetry(){const directory=process.env.ANDROID_RESTART_COMMAND_EVIDENCE;if(!active||activeDirectory!==directory){active=createTelemetry(directory);activeDirectory=directory;}return active;}
export const record=(...args)=>telemetry().record(...args);
export const observedSpawnSync=(...args)=>telemetry().observedSpawnSync(...args);

// /proc/uptime is quantized to hundredths of a second. The remote read happened
// somewhere inside the measured host round trip, rather than at its midpoint.
export function boundedUptimeAnchor(before,after,raw){
  if(!/^\d+\.\d{2} \d+\.\d{2}\s*$/.test(raw))throw new Error('Require original hundredth-second guest uptime readback');
  const [whole,fraction]=raw.trim().split(' ')[0].split('.');
  const guestLo=BigInt(whole)*1000000000n+BigInt(fraction)*10000000n,guestHi=guestLo+10000000n;
  const hostLo=BigInt(before.monotonicNs),hostHi=BigInt(after.monotonicNs);
  if(hostHi<hostLo)throw new Error('Host monotonic clock regressed');
  const roundTrip=hostHi-hostLo;
  const wallElapsed=Date.parse(after.atUtc)-Date.parse(before.atUtc);
  if(!Number.isFinite(wallElapsed))throw new Error('Invalid host UTC stamps');
  const wallStep=Math.abs(wallElapsed-Number(roundTrip)/1e6)>100;
  return {before,after,raw,guestClock:'proc-uptime/BOOTTIME; require actual trace BOOTTIME snapshot before mapping trace',guestLoNs:guestLo.toString(),guestHiExclusiveNs:guestHi.toString(),hostMinusGuestLoNs:(hostLo-guestHi).toString(),hostMinusGuestHiNs:(hostHi-guestLo).toString(),roundTripNs:roundTrip.toString(),quantizationNs:'10000000',usablePointAnchor:roundTrip<=500000000n&&!wallStep,hostWallStepObserved:wallStep,interpolationOrDriftBoundProven:false,hostGuestCausalAlignmentProven:false};
}

export const CLOCK_PROBE=Object.freeze(['shell','cat','/proc/sys/kernel/random/boot_id','/proc/uptime','/proc/sys/kernel/random/boot_id']);
export function boundedGuestClockAnchor(before,after,raw){
  const lines=raw.trim().split(/\r?\n/),uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
  if(lines.length!==3||!uuid.test(lines[0])||lines[0]!==lines[2])throw new Error('Guest boot identity missing or changed around uptime read');
  return {...boundedUptimeAnchor(before,after,lines[1]),bootId:lines[0],originalClockProbe:raw};
}
