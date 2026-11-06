import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readlinkSync,realpathSync,statSync,openSync,readSync,closeSync,createReadStream} from 'node:fs';
import {readOwner} from './owned.mjs';
import {compareSdkBinaries} from './sdk-identity.mjs';

function header(path){const fd=openSync(path,'r'),bytes=Buffer.alloc(4);try{assert.equal(readSync(fd,bytes,0,4,0),4);return bytes;}finally{closeSync(fd);}}
async function hash(path){const h=createHash('sha256');for await(const bytes of createReadStream(path))h.update(bytes);return h.digest('hex');}
const digest=text=>createHash('sha256').update(text).digest('hex');
function inventoryByResolvedPath(report){
  const result=new Map();
  for(const file of report.files){const prior=result.get(file.resolvedPath);if(prior)assert.ok(prior.sha256===file.sha256&&prior.bytes===file.bytes,'Conflicting SDK aliases');result.set(file.resolvedPath,file);}
  return result;
}
export async function captureLoadedSdk(context,inventory,baseline,{
  owner=readOwner,read=readFileSync,link=readlinkSync,real=realpathSync,info=path=>statSync(path,{bigint:true}),elfHeader=header,fileHash=hash,onSnapshot=()=>{}
}={}){
  const began=performance.now(),ownerBefore=owner(context);
  compareSdkBinaries(baseline,inventory);
  const sdk=real(context.sdk),prefix=sdk+'/emulator/',proc='/proc/'+context.pid;
  const rawExe=link(proc+'/exe'),rawMaps=read(proc+'/maps','utf8');
  const snapshotOwnerAfter=owner(context);onSnapshot({rawExe,rawMaps,ownerBefore,snapshotOwnerAfter});
  assert.ok(typeof rawExe==='string'&&!rawExe.endsWith(' (deleted)'),'Missing/deleted owned executable');
  assert.ok(typeof rawMaps==='string'&&rawMaps.trim(),'Missing owned process maps');
  const executable=real(rawExe);assert.ok(executable.startsWith(prefix),'Owned executable redirects outside SDK emulator');
  const mappings=new Map();
  for(const row of rawMaps.split(/\r?\n/).filter(Boolean)){
    const parsed=row.match(/^[\da-f]+-[\da-f]+\s+([rwxps-]{4})\s+[\da-f]+\s+\S+\s+(\d+)(?:\s+(.*))?$/i);
    assert.ok(parsed,'Malformed process maps row');
    const path=(parsed[3]||'').replace(/\\([0-7]{3})/g,(_,octal)=>String.fromCharCode(parseInt(octal,8)));
    if(!path.startsWith(sdk+'/'))continue;
    assert.ok(path.startsWith(prefix)&&!path.endsWith(' (deleted)'),'SDK mapping is outside emulator scope or deleted');
    const resolved=real(path);assert.ok(resolved.startsWith(prefix),'SDK mapping redirects outside emulator root');
    const prior=mappings.get(resolved);if(prior)assert.equal(prior.inode,parsed[2],'Conflicting mapped SDK inode');
    mappings.set(resolved,{path,resolved,inode:parsed[2],executable:(prior?.executable||false)||parsed[1].includes('x')});
  }
  assert.ok(mappings.get(executable)?.executable,'Owned executable absent from executable SDK mappings');
  const current=inventoryByResolvedPath(inventory),first=inventoryByResolvedPath(baseline),files=[],nonElfMappings=[];
  for(const mapped of [...mappings.values()].sort((a,b)=>a.resolved.localeCompare(b.resolved))){
    const relative=mapped.resolved.slice(sdk.length+1),elf=elfHeader(mapped.resolved).equals(Buffer.from([0x7f,0x45,0x4c,0x46]));
    if(!elf){assert.ok(!mapped.executable,'Executable SDK mapping is not ELF');nonElfMappings.push(relative);continue;}
    const expected=current.get(relative),a1=first.get(relative);
    assert.ok(expected&&a1,'Loaded SDK ELF absent from fingerprint inventory: '+relative);
    const before=info(mapped.resolved);assert.ok(before.isFile(),'Loaded SDK object is not a file');
    assert.equal(String(before.ino),mapped.inode,'Loaded SDK mapping inode differs from hashed file');
    const sha256=await fileHash(mapped.resolved),after=info(mapped.resolved);
    assert.equal(before.size,after.size,'Loaded SDK object changed during hashing');
    assert.deepEqual([before.ino,before.mtimeNs,before.ctimeNs],[after.ino,after.mtimeNs,after.ctimeNs],'Loaded SDK object changed during hashing');
    assert.equal(sha256,expected.sha256,'Loaded SDK object changed from preboot inventory');
    const bytes=Number(after.size);assert.ok(Number.isSafeInteger(bytes));
    assert.equal(sha256,a1.sha256,'Loaded SDK object differs from A1');assert.equal(bytes,expected.bytes);assert.equal(bytes,a1.bytes);
    files.push({path:relative,bytes,inode:mapped.inode,sha256,executableMapping:mapped.executable});
  }
  assert.ok(files.some(file=>file.path===executable.slice(sdk.length+1)),'Executable ELF not covered');
  const ownerAfter=owner(context);
  return {atUtc:new Date().toISOString(),ownerBefore,ownerAfter,executable:executable.slice(sdk.length+1),files,nonElfMappings,
    rawExe,rawMaps,mapsSha256:digest(rawMaps),exeReadlinkSha256:digest(rawExe),durationMs:performance.now()-began,
    coverage:'postboot-observed-sdk-elf-mappings',lifetimeLoadedModuleCoverageProven:false,historicalBinaryComparison:false,verified:true};
}
