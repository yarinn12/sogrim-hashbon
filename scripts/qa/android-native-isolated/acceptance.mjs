import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {acceptanceRunProvenance} from './run-provenance.mjs';
const root=resolve(process.env.ANDROID_QA_OUTPUT||'artifacts/android-native-isolated/acceptance');mkdirSync(root,{recursive:true});
const report={provenance:acceptanceRunProvenance(),ready:false,stages:[]};
for(const name of ['matrix','pages','journey']){
  const startedAtUtc=new Date().toISOString();
  const run=spawnSync(process.execPath,[join(dirname(fileURLToPath(import.meta.url)),name+'.mjs')],{env:{...process.env,ANDROID_QA_OUTPUT:join(root,name)},encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:20*1024*1024});
  writeFileSync(join(root,name+'.log'),(run.stdout||'')+(run.stderr||''));
  report.stages.push({name,startedAtUtc,completedAtUtc:new Date().toISOString(),exitCode:run.status,error:run.error?.message});
  writeFileSync(join(root,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.stages.at(-1)));
}
report.ready=report.stages.length===3&&report.stages.every(stage=>stage.exitCode===0&&!stage.error);
writeFileSync(join(root,'acceptance.json'),JSON.stringify(report,null,2));process.exitCode=report.ready?0:1;
