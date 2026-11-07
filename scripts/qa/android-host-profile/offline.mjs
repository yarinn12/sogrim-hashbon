import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
export const OFFLINE={timeoutMs:30000,maxInputBytes:128*1024*1024};
export function analyzeStoppedProfile({profile,snapshots,workloadStopped,output,env,run=spawnSync}){
  mkdirSync(output,{recursive:true});
  const save=(name,value)=>writeFileSync(join(output,name),JSON.stringify(value,null,2)+'\n');
  // No symbol parsing or module reads until both measured processes have stopped.
  if(!workloadStopped||profile?.cleanupVerified!==true||!profile?.parsed){
    const result={ready:false,executed:false,reason:'Measured workload/profiler stop or parsed profile unavailable',nativeAcceptance:false,releaseAcceptance:false};save('offline-result.json',result);return result;
  }
  const input=JSON.stringify({profile,snapshots});assert.ok(Buffer.byteLength(input)<=OFFLINE.maxInputBytes,'Offline input exceeds bounded byte budget');
  const inputPath=join(output,'offline-input.json'),outputPath=join(output,'offline-symbols.json');writeFileSync(inputPath,input+'\n');
  const began=performance.now();
  const command=run('/usr/bin/python3',['-I','-B',join(here,'offline-symbols.py'),inputPath,outputPath],{env,encoding:'utf8',windowsHide:true,timeout:OFFLINE.timeoutMs,maxBuffer:1024*1024});
  const execution={exitCode:command.status??null,signal:command.signal??null,error:command.error?.message??null,elapsedMs:performance.now()-began,timeoutMs:OFFLINE.timeoutMs,stdout:command.stdout??'',stderr:command.stderr??''};save('offline-execution.json',execution);
  let decoding=null,readError=null;try{if(existsSync(outputPath))decoding=JSON.parse(readFileSync(outputPath,'utf8'));}catch(error){readError=error.message;}
  const result={ready:execution.exitCode===0&&!execution.signal&&!execution.error&&decoding?.complete===true,executed:true,execution,decoding,readError,afterMeasuredProcessesStopped:true,externalSymbolsDownloaded:false,processMemoryRead:false,nativeAcceptance:false,releaseAcceptance:false};save('offline-result.json',result);return result;
}
