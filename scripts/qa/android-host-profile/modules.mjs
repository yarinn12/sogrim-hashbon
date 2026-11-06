import assert from 'node:assert/strict';
import {readFileSync,readlinkSync,statSync,writeFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {readOwner} from './owned.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function parseMappings(text){
  const rows=[];for(const line of text.trim().split('\n')){const m=line.match(/^([a-f0-9]+)-([a-f0-9]+)\s+([-rwxps]{4})\s+([a-f0-9]+)\s+([a-f0-9]+):([a-f0-9]+)\s+(\d+)(?:\s+(.*))?$/i);assert.ok(m,'Unparsed owned-process mapping');rows.push({start:'0x'+m[1],end:'0x'+m[2],permissions:m[3],fileOffset:'0x'+m[4],deviceMajor:'0x'+m[5],deviceMinor:'0x'+m[6],inode:m[7],path:m[8]||null});}return rows;
}
export function moduleFileIdentity(mapping,info){
  assert.equal(BigInt(mapping.inode),info.ino,'Mapped file inode differs from path');
  const major=((info.dev>>8n)&0xfffn)|((info.dev>>32n)&0xfffff000n),minor=(info.dev&0xffn)|((info.dev>>12n)&0xffffff00n);
  assert.equal(BigInt(mapping.deviceMajor),major,'Mapped file device differs');assert.equal(BigInt(mapping.deviceMinor),minor,'Mapped file device differs');
  return {inode:String(info.ino),device:String(info.dev),bytes:String(info.size)};
}
export function addressMapping(address,mappings){
  const pc=BigInt(address),matches=mappings.filter(m=>BigInt(m.start)<=pc&&pc<BigInt(m.end));assert.ok(matches.length<=1,'Ambiguous address mapping');
  return matches.length?{...matches[0],elfFileOffset:'0x'+(pc-BigInt(matches[0].start)+BigInt(matches[0].fileOffset)).toString(16)}:null;
}
export function captureModules(owner,destination,env){
  const monotonicStartedNs=process.hrtime.bigint().toString(),began=performance.now(),before=readOwner(owner),proc='/proc/'+owner.pid,mapsText=readFileSync(join(proc,'maps'),'utf8'),exe=readlinkSync(join(proc,'exe'));
  writeFileSync(destination+'.maps.txt',mapsText);const mappings=parseMappings(mapsText),files=[],unavailable=[],seen=new Set();
  for(const mapping of mappings){
    const path=mapping.path;if(!path?.startsWith('/')||seen.has(path))continue;seen.add(path);
    // Do not read arbitrary mapped files. SDK executables and public OS ELF
    // libraries only; anonymous/JIT/deleted/private paths remain unresolved.
    if(path.endsWith(' (deleted)')||![/^\/usr\/local\/lib\/android\/sdk\/emulator\//,/^\/usr\/lib\//,/^\/lib\//].some(r=>r.test(path))){unavailable.push({path,reason:'Outside approved public ELF roots or deleted mapping'});continue;}
    try{
      const resolved=realpathSync(path);assert.ok(resolved.startsWith('/usr/local/lib/android/sdk/emulator/')||resolved.startsWith('/usr/lib/')||resolved.startsWith('/lib/'),'Redirected public module');
      const initial=statSync(resolved,{bigint:true});moduleFileIdentity(mapping,initial);const bytes=readFileSync(resolved);if(!bytes.subarray(0,4).equals(Buffer.from([0x7f,0x45,0x4c,0x46])))continue;
      const notes=spawnSync('/usr/bin/readelf',['-n',resolved],{env,encoding:'utf8',timeout:10000,windowsHide:true,maxBuffer:4*1024*1024});
      const final=statSync(resolved,{bigint:true});assert.equal(final.ino,initial.ino);assert.equal(final.dev,initial.dev);assert.equal(final.size,initial.size);assert.equal(final.mtimeNs,initial.mtimeNs);readOwner(owner);
      const buildIds=[...(notes.stdout||'').matchAll(/Build ID:\s*([a-f0-9]+)/gi)].map(m=>m[1]);
      files.push({path,resolved,...moduleFileIdentity(mapping,final),sha256:sha(bytes),buildIds,readelfExitCode:notes.status,readelfError:notes.error?.message??null,readelfStderr:notes.stderr||'',buildIdAvailable:notes.status===0&&buildIds.length===1});
    }catch(error){unavailable.push({path,reason:error.message});}
  }
  const after=readOwner(owner);assert.deepEqual(after,before);
  const result={atUtc:new Date().toISOString(),monotonicStartedNs,monotonicCompletedNs:process.hrtime.bigint().toString(),ownerBefore:before,ownerAfter:after,exe,mapsSha256:sha(Buffer.from(mapsText)),mappings,files,unavailable,durationMs:performance.now()-began,lifetimeModuleCoverageProven:false,anonymousJitSymbolizationAvailable:false,framesResolvedToFunctions:false,scope:'Snapshot of the verified emulator only; public ELF reads bound by device/inode and hashes. No private mapped files, raw process memory or foreign maps.'};
  writeFileSync(destination+'.json',JSON.stringify(result,null,2)+'\n');return result;
}
