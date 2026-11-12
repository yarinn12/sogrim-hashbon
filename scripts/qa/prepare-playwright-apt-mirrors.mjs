import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const PATHS=Object.freeze({
  os:'/etc/os-release',sources:'/etc/apt/sources.list.d',
  ubuntu:'/etc/apt/sources.list.d/ubuntu.sources',
  legacy:'/etc/apt/sources.list',mirrors:'/etc/apt/apt-mirrors.txt'
});
export const PRIORITIES=Object.freeze({
  'http://azure.archive.ubuntu.com/ubuntu/':3,
  'https://archive.ubuntu.com/ubuntu/':1,
  'https://security.ubuntu.com/ubuntu/':2
});
const ORIGINAL=Object.freeze(Object.fromEntries(Object.keys(PRIORITIES).map((url,i)=>[url,i+1])));
const ROUTE='mirror+file:'+PATHS.mirrors;
// Hosted Ubuntu images can retain the official direct security stanza while
// routing the main archive through the mirror file. Neither source is rewritten.
const DIRECT_SECURITY=new Set(['http://security.ubuntu.com/ubuntu','http://security.ubuntu.com/ubuntu/',
  'https://security.ubuntu.com/ubuntu','https://security.ubuntu.com/ubuntu/']);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// Preserve only bounded format facts when a hosted image changes. Never print
// a raw URI, credentials, query, fragment or an unrecognized host/path.
function rejectedMirrorDiagnostic(line){
  const token=/^\S+/.exec(line)?.[0]??'';
  const result={lineSha256:sha(Buffer.from(line,'latin1')),lineBytes:Buffer.byteLength(line,'latin1'),
    separator:[...(/^\s+/.exec(line.slice(token.length))?.[0]??'')].slice(0,16).map(c=>c.charCodeAt(0)),
    priority:/\bpriority:([0-9]{1,6})(?=\s|$)/.exec(line)?.[1]??'[unrecognized]'};
  try{
    const url=new URL(token);
    Object.assign(result,{
      protocol:['http:','https:'].includes(url.protocol)?url.protocol:'[unrecognized]',
      hostname:url.hostname.length<=255&&/^(?:[a-z0-9-]+\.)*ubuntu\.com$/.test(url.hostname)?url.hostname:'[unrecognized]',
      pathname:['/ubuntu','/ubuntu/'].includes(url.pathname)?url.pathname:'[unrecognized]',
      hasCredentials:Boolean(url.username||url.password),hasQuery:Boolean(url.search),hasFragment:Boolean(url.hash)
    });
  }catch{result.uriParseable=false;}
  return result;
}
const active=text=>text.split(/\r?\n/).filter(line=>line.trim()&&!line.trimStart().startsWith('#')).join('\n');
function bytes(value,limit){
  assert.ok(Buffer.isBuffer(value),'Expected original filesystem bytes');
  assert.ok(value.length>0&&value.length<=limit,'Missing or oversized APT input');
  return value;
}
function uniqueTokens(value){
  const tokens=value.trim().split(/\s+/);assert.equal(new Set(tokens).size,tokens.length,'Duplicate APT token');return tokens;
}
function validateUbuntu(source){
  const fields=[],allowed=new Set(['types','uris','suites','components','signed-by','architectures','enabled']);
  let stanza=new Map();
  const finish=()=>{if(stanza.size){fields.push(stanza);stanza=new Map();}};
  for(const line of bytes(source,65536).toString('utf8').split(/\r?\n/)){
    if(!line.trim()){finish();continue;}if(line.trimStart().startsWith('#'))continue;
    const match=/^([A-Za-z][A-Za-z-]*):[ \t]*(\S.*)$/.exec(line);
    assert.ok(match,'Unknown deb822 line or continuation');
    const key=match[1].toLowerCase();assert.ok(allowed.has(key),'Unknown deb822 field');
    assert.ok(!stanza.has(key),'Duplicate deb822 field');stanza.set(key,match[2]);
  }
  finish();assert.equal(fields.length,2,'Expected two known Ubuntu noble stanzas');
  const suites=new Set();
  for(const row of fields){
    for(const key of ['types','uris','suites','components','signed-by'])assert.ok(row.has(key),'Missing Ubuntu field: '+key);
    assert.equal(row.get('types'),'deb');
    assert.equal(row.get('signed-by'),'/usr/share/keyrings/ubuntu-archive-keyring.gpg','Unknown Ubuntu trust anchor');
    if(row.has('architectures'))assert.equal(row.get('architectures'),'amd64');
    if(row.has('enabled'))assert.equal(row.get('enabled'),'yes');
    assert.deepEqual(uniqueTokens(row.get('components')).sort(),['main','multiverse','restricted','universe']);
    const values=uniqueTokens(row.get('suites'));
    assert.ok(values.join(' ')==='noble-security'||[...values].sort().join(' ')==='noble noble-backports noble-updates','Unknown noble suites');
    const securityOnly=values.length===1&&values[0]==='noble-security';
    assert.ok(row.get('uris')===ROUTE||(securityOnly&&DIRECT_SECURITY.has(row.get('uris'))),'Unknown Ubuntu archive/security route');
    for(const value of values){assert.ok(!suites.has(value),'Duplicate Ubuntu suite');suites.add(value);}
  }
  assert.deepEqual([...suites].sort(),['noble','noble-backports','noble-security','noble-updates']);
}
export function prepareMirrorPriorities(snapshot){
  const os=bytes(snapshot.os,16384).toString('utf8');
  for(const [key,want]of [['ID','ubuntu'],['VERSION_ID','24.04']]){
    const rows=os.split(/\r?\n/).filter(line=>line.startsWith(key+'='));
    assert.equal(rows.length,1,'Missing/duplicate OS identity');
    assert.ok([key+'='+want,key+'="'+want+'"',key+"='"+want+"'"].includes(rows[0]),'Unsupported OS identity');
  }
  validateUbuntu(snapshot.ubuntu);
  for(const [path,value]of Object.entries(snapshot.otherSources??{})){
    assert.ok(path!==PATHS.ubuntu,'Duplicate managed Ubuntu source');
    assert.ok(Buffer.isBuffer(value)&&value.length<=65536,'Oversized extra source');
    // Other package vendors remain opaque and byte-identical. Another Ubuntu
    // archive or mirror+file route would bypass/duplicate this managed policy.
    assert.ok(!/mirror(?:\+file)?:|apt-mirrors\.txt|https?:\/\/(?:[a-z0-9.-]+\.)?ubuntu\.com\/ubuntu(?:\/|\s|$)/i.test(active(value.toString('utf8'))),
      'Additional/duplicate Ubuntu mirror configuration');
  }
  const before=bytes(snapshot.mirrors,16384),text=before.toString('latin1'),seen=new Map(),edits=[];
  let offset=0;
  for(const raw of text.match(/[^\n]*\n|[^\n]+$/g)??[]){
    const line=raw.replace(/\r?\n$/,'');
    if(line.trim()&&!line.trimStart().startsWith('#')){
      const match=/^(\S+)(\tpriority:)([1-3])$/.exec(line);
      assert.ok(match&&Object.hasOwn(PRIORITIES,match[1]),
        'Unknown mirror URI, protocol, metadata or priority; mirrorDiagnostic='+JSON.stringify(rejectedMirrorDiagnostic(line)));
      const url=match[1];assert.ok(!seen.has(url),'Duplicate mirror URI');seen.set(url,Number(match[3]));
      if(Number(match[3])!==PRIORITIES[url])edits.push({offset:offset+match[1].length+match[2].length,value:PRIORITIES[url]});
    }
    offset+=raw.length;
  }
  assert.equal(seen.size,3,'Missing known mirror');
  const mapping=Object.fromEntries(seen);
  const matches=want=>Object.keys(want).every(url=>mapping[url]===want[url]);
  assert.ok(matches(ORIGINAL)||matches(PRIORITIES),'Unknown/mixed priority configuration');
  const after=Buffer.from(before);
  for(const edit of edits)after[edit.offset]=String(edit.value).charCodeAt(0);
  return {before,after,edits,changed:edits.length>0};
}
function regular(adapter,path){
  const stat=adapter.lstatSync(path);
  assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'Expected regular APT input: '+path);
  return stat;
}
function readDescriptor(adapter,fd,size){
  assert.ok(Number.isSafeInteger(size)&&size>0&&size<=16384,'Invalid mirror size');
  const data=Buffer.alloc(size);let offset=0;
  while(offset<size){const count=adapter.readSync(fd,data,offset,size-offset,offset);assert.ok(count>0,'Incomplete mirror read');offset+=count;}
  return data;
}
export function main({adapter=fs,env=process.env,argv=process.argv.slice(2),
  platform=process.platform,arch=process.arch,log=console.log}={}){
  assert.deepEqual(argv,['--github-hosted-ubuntu24'],'Explicit hosted-runner invocation required');
  assert.equal(platform,'linux');assert.equal(arch,'x64');
  for(const [key,value]of Object.entries({GITHUB_ACTIONS:'true',RUNNER_OS:'Linux',RUNNER_ARCH:'X64',RUNNER_ENVIRONMENT:'github-hosted'}))
    assert.equal(env[key],value,'Refuse non-hosted/local runner: '+key);
  assert.ok(Number.isInteger(adapter.constants.O_NOFOLLOW)&&adapter.constants.O_NOFOLLOW>0,'O_NOFOLLOW unavailable');
  const directory=adapter.lstatSync(PATHS.sources);
  assert.ok(directory.isDirectory()&&!directory.isSymbolicLink(),'Unknown APT source directory');
  const names=adapter.readdirSync(PATHS.sources);
  assert.equal(new Set(names).size,names.length,'Duplicate source entry');
  assert.equal(names.filter(name=>name==='ubuntu.sources').length,1,'Missing Ubuntu source');
  const snapshot={os:adapter.readFileSync(PATHS.os),ubuntu:null,otherSources:{},mirrors:null};
  for(const name of names.filter(name=>/\.(?:sources|list)$/.test(name))){
    assert.ok(/^[A-Za-z0-9_.-]+$/.test(name),'Unknown source filename');
    const path=PATHS.sources+'/'+name;regular(adapter,path);
    const value=adapter.readFileSync(path);
    if(path===PATHS.ubuntu)snapshot.ubuntu=value;else snapshot.otherSources[path]=value;
  }
  if(adapter.existsSync(PATHS.legacy)){regular(adapter,PATHS.legacy);snapshot.otherSources[PATHS.legacy]=adapter.readFileSync(PATHS.legacy);}
  const original=regular(adapter,PATHS.mirrors);
  assert.ok(original.uid===0&&original.nlink===1&&(original.mode&0o022)===0,'Untrusted mirror file metadata');
  const fd=adapter.openSync(PATHS.mirrors,adapter.constants.O_RDWR|adapter.constants.O_NOFOLLOW);
  try{
    const stat=adapter.fstatSync(fd);
    for(const key of ['dev','ino','size','mode','uid','gid','nlink'])assert.equal(stat[key],original[key],'Mirror file changed before open');
    snapshot.mirrors=readDescriptor(adapter,fd,stat.size);
    const plan=prepareMirrorPriorities(snapshot);
    assert.ok(readDescriptor(adapter,fd,stat.size).equals(plan.before),'Mirror bytes changed before update');
    for(const edit of plan.edits)assert.equal(adapter.writeSync(fd,Buffer.from(String(edit.value)),0,1,edit.offset),1,'Incomplete priority write');
    if(plan.changed)adapter.fsyncSync(fd);
    const after=readDescriptor(adapter,fd,stat.size);
    assert.ok(after.equals(plan.after),'Mirror bytes differ after priority-only update');
    const final=adapter.fstatSync(fd);
    for(const key of ['dev','ino','size','mode','uid','gid','nlink'])assert.equal(final[key],stat[key],'Mirror metadata changed');
    const receipt={scope:'EPHEMERAL_GITHUB_UBUNTU24_APT_PRIORITIES_ONLY',changed:plan.changed,
      beforeSha256:sha(plan.before),afterSha256:sha(after),priorities:PRIORITIES,
      aptExecuted:false,speedImprovementVerified:false};
    log(JSON.stringify(receipt));return receipt;
  }finally{adapter.closeSync(fd);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main();
