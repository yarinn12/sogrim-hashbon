import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PATHS,PRIORITIES,prepareMirrorPriorities,main} from '../scripts/qa/prepare-playwright-apt-mirrors.mjs';

const ROUTE='mirror+file:'+PATHS.mirrors;
const AZURE='http://azure.archive.ubuntu.com/ubuntu/';
const ARCHIVE='https://archive.ubuntu.com/ubuntu/';
const SECURITY='https://security.ubuntu.com/ubuntu/';
const oldMirrors=()=>Buffer.from(AZURE+'\tpriority:1\n'+ARCHIVE+'\tpriority:2\n'+SECURITY+'\tpriority:3\n');
const stanza=suites=>[
  'Types: deb','URIs: '+ROUTE,'Suites: '+suites,
  'Components: main restricted universe multiverse',
  'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg'
].join('\n');
function snapshot(){
 return {os:Buffer.from('NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="24.04"\n'),
  ubuntu:Buffer.from('# unchanged Ubuntu source\n'+stanza('noble noble-updates noble-backports')+'\n\n'+stanza('noble-security')+'\n'),
  mirrors:oldMirrors(),otherSources:{[PATHS.legacy]:Buffer.from('# no active legacy source\n'),
   [PATHS.sources+'/microsoft-prod.list']:Buffer.from('deb [arch=amd64] https://packages.microsoft.com/ubuntu/24.04/prod noble main\n')}};
}
const hosted={GITHUB_ACTIONS:'true',RUNNER_OS:'Linux',RUNNER_ARCH:'X64',RUNNER_ENVIRONMENT:'github-hosted'};
test('strict noble mirror preparation never runs on the mutable ubuntu-latest image',()=>{
 const root=new URL('../.github/workflows/',import.meta.url);let prepared=0;
 for(const name of readdirSync(root).filter(name=>name.endsWith('.yml'))){
  const workflow=readFileSync(new URL(name,root),'utf8');
  const jobs=[...workflow.matchAll(/^  ([a-z][a-z0-9-]*):\r?$/gm)];
  for(let i=0;i<jobs.length;i++){
   const body=workflow.slice(jobs[i].index,jobs[i+1]?.index??workflow.length);
   if(!body.includes('prepare-playwright-apt-mirrors.mjs --github-hosted-ubuntu24'))continue;
   prepared++;
   assert.match(body,/^    runs-on: ubuntu-24\.04\r?$/m,`${name}:${jobs[i][1]} must use the supported noble image`);
  }
 }
 assert.ok(prepared>=9,'Every browser preparation lane must remain covered');
});
function directSecuritySnapshot(uri){
 const s=snapshot();
 s.ubuntu=Buffer.from('# unchanged Ubuntu source\n'+stanza('noble noble-updates noble-backports')+'\n\n'+stanza('noble-security').replace('URIs: '+ROUTE,'URIs: '+uri)+'\n');
 return s;
}
function fake(s=snapshot(),options={}){
 const files=new Map([[PATHS.os,Buffer.from(s.os)],[PATHS.ubuntu,Buffer.from(s.ubuntu)],[PATHS.mirrors,Buffer.from(s.mirrors)],
   ...Object.entries(s.otherSources).map(([p,b])=>[p,Buffer.from(b)])]);
 const calls=[],writes=[],descriptor=17;
 const info=path=>({dev:1,ino:101,size:files.get(path)?.length??0,mode:0o100644,uid:0,gid:0,nlink:1,
   isFile:()=>true,isDirectory:()=>false,isSymbolicLink:()=>false,...(path===PATHS.mirrors?options.mirrorStat:{})});
 const adapter={
  constants:{O_RDWR:2,O_NOFOLLOW:0x20000},
  lstatSync(path){calls.push(['lstat',path]);if(path===PATHS.sources)return {isDirectory:()=>true,isSymbolicLink:()=>false};
   assert.ok(files.has(path),'Unexpected/missing fake path '+path);return info(path);},
  readdirSync(path){assert.equal(path,PATHS.sources);return [...files.keys()].filter(p=>p.startsWith(PATHS.sources+'/')).map(p=>p.slice(PATHS.sources.length+1));},
  readFileSync(path){calls.push(['readFile',path]);assert.ok(files.has(path));return Buffer.from(files.get(path));},
  existsSync(path){return files.has(path);},
  openSync(path,flags){calls.push(['open',path]);assert.equal(path,PATHS.mirrors);assert.equal(flags,2|0x20000);return descriptor;},
  fstatSync(fd){assert.equal(fd,descriptor);return {...info(PATHS.mirrors),...options.openStat};},
  readSync(fd,target,offset,length,position){assert.equal(fd,descriptor);const b=files.get(PATHS.mirrors);
   const count=Math.min(length,options.partialReads?5:length);b.copy(target,offset,position,position+count);return count;},
  writeSync(fd,data,offset,length,position){assert.equal(fd,descriptor);assert.equal(length,1);assert.match(data.toString(),/^[123]$/);
   if(options.writeError)throw Error('synthetic write failure');
   const before=Buffer.from(files.get(PATHS.mirrors));data.copy(files.get(PATHS.mirrors),position,offset,offset+length);
   writes.push({position,before:before[position],after:data[offset]});return length;},
  fsyncSync(fd){assert.equal(fd,descriptor);calls.push(['fsync',PATHS.mirrors]);},
  closeSync(fd){assert.equal(fd,descriptor);calls.push(['close',PATHS.mirrors]);}
 };
 const logs=[],run=overrides=>main({adapter,env:{...hosted},argv:['--github-hosted-ubuntu24'],platform:'linux',arch:'x64',log:x=>logs.push(x),...overrides});
 return {files,calls,writes,logs,adapter,run};
}
function unchangedExceptPriorities(before,after){
 assert.equal(before.length,after.length);const changed=[];
 for(let i=0;i<before.length;i++)if(before[i]!==after[i])changed.push(i);
 assert.equal(changed.length,3);for(const i of changed){assert.match(String.fromCharCode(before[i]),/^[123]$/);assert.match(String.fromCharCode(after[i]),/^[123]$/);}
}
function httpsFirst(bytes){
 const entries=bytes.toString().trim().split('\n').map(line=>line.split('\tpriority:')).sort((a,b)=>Number(a[1])-Number(b[1]));
 assert.equal(entries[0][0],ARCHIVE,'HTTPS archive must be first');
 assert.equal(entries[1][0],SECURITY,'HTTPS security must be second');
 assert.equal(entries[2][0],AZURE,'Azure must remain the third fallback');
}
test('OLD unchanged runner priorities fail HTTPS-first assertion; FINAL passes without a speed claim',()=>{
 const s=snapshot();assert.throws(()=>httpsFirst(s.mirrors),/HTTPS archive must be first/);
 const p=prepareMirrorPriorities(s);assert.equal(p.changed,true);httpsFirst(p.after);unchangedExceptPriorities(s.mirrors,p.after);
 assert.deepEqual(PRIORITIES,{[AZURE]:3,[ARCHIVE]:1,[SECURITY]:2});
});
test('CRLF, comments, non-ASCII bytes and absent final newline survive byte-for-byte except priority digits',()=>{
 const s=snapshot();s.mirrors=Buffer.concat([Buffer.from('# preserved \u05de\u05e8\u05d0\u05d5\u05ea\r\n# raw '),Buffer.from([255]),Buffer.from('\r\n\r\n'+oldMirrors().toString().replaceAll('\n','\r\n').trimEnd())]);
 const p=prepareMirrorPriorities(s);unchangedExceptPriorities(s.mirrors,p.after);
 const original=Buffer.from(s.mirrors);for(const {offset}of p.edits)original[offset]=p.after[offset];assert.ok(original.equals(p.after));
 assert.equal(prepareMirrorPriorities({...s,mirrors:p.after}).changed,false);
});
test('already preferred and physically reordered known mirrors are idempotent with zero writes',()=>{
 const s=snapshot();s.mirrors=Buffer.from(ARCHIVE+'\tpriority:1\n'+SECURITY+'\tpriority:2\n'+AZURE+'\tpriority:3\n');
 const f=fake(s),before=Buffer.from(f.files.get(PATHS.mirrors)),r=f.run();assert.equal(r.changed,false);
 assert.equal(f.writes.length,0);assert.ok(f.files.get(PATHS.mirrors).equals(before));assert.equal(f.calls.filter(c=>c[0]==='fsync').length,0);
});
test('actual CLI body changes only three mirror bytes through the fake descriptor; other files and metadata survive',()=>{
 const f=fake(),before=new Map([...f.files].map(([p,b])=>[p,Buffer.from(b)])),r=f.run();
 assert.equal(f.writes.length,3);unchangedExceptPriorities(before.get(PATHS.mirrors),f.files.get(PATHS.mirrors));
 for(const [path,b]of before)if(path!==PATHS.mirrors)assert.ok(b.equals(f.files.get(path)),path);
 assert.equal(r.aptExecuted,false);assert.equal(r.speedImprovementVerified,false);assert.equal(r.changed,true);
 assert.match(r.beforeSha256,/^[0-9a-f]{64}$/);assert.notEqual(r.beforeSha256,r.afterSha256);
 assert.equal(f.calls.filter(c=>c[0]==='open').length,1);assert.equal(f.calls.at(-1)[0],'close');
 assert.equal(JSON.parse(f.logs[0]).afterSha256,r.afterSha256);
});

for(const uri of ['http://security.ubuntu.com/ubuntu','http://security.ubuntu.com/ubuntu/',
 'https://security.ubuntu.com/ubuntu','https://security.ubuntu.com/ubuntu/'])
test('known direct noble-security route preserves original sources and only adjusts mirror priorities: '+uri,()=>{
 const s=directSecuritySnapshot(uri),f=fake(s),before=new Map([...f.files].map(([p,b])=>[p,Buffer.from(b)]));
 const result=f.run();assert.equal(result.changed,true);assert.equal(f.writes.length,3);
 unchangedExceptPriorities(before.get(PATHS.mirrors),f.files.get(PATHS.mirrors));
 for(const [path,b]of before)if(path!==PATHS.mirrors)assert.ok(b.equals(f.files.get(path)),path);
 httpsFirst(f.files.get(PATHS.mirrors));
 assert.equal(f.run().changed,false);assert.equal(f.writes.length,3,'Second invocation must not write');
});
for(const uri of ['http://security.ubuntu.com.evil.invalid/ubuntu','http://security.ubuntu.com:8080/ubuntu',
 'http://security.ubuntu.com/ubuntu?mirror=1','http://security.ubuntu.com/other',
 'https://archive.ubuntu.com/ubuntu/','mirror+file:/tmp/apt-mirrors.txt'])
test('unknown direct security route is rejected before any write: '+uri,()=>{
 const f=fake(directSecuritySnapshot(uri));assert.throws(()=>f.run());assert.equal(f.writes.length,0);
});
test('official direct security endpoint cannot replace the main archive stanza',()=>{
 const s=snapshot();s.ubuntu=Buffer.from(s.ubuntu.toString().replace(ROUTE,'http://security.ubuntu.com/ubuntu'));
 const f=fake(s);assert.throws(()=>f.run());assert.equal(f.writes.length,0);
});
test('known direct security route still requires the original suites and trust anchor',()=>{
 for(const [from,to]of [['noble-security','noble-proposed'],['ubuntu-archive-keyring.gpg','other.gpg']]){
  const s=directSecuritySnapshot('http://security.ubuntu.com/ubuntu');s.ubuntu=Buffer.from(s.ubuntu.toString().replace(from,to));
  const f=fake(s);assert.throws(()=>f.run());assert.equal(f.writes.length,0);
 }
});
test('short descriptor reads are completed before the bounded update',()=>{const f=fake(snapshot(),{partialReads:true});f.run();assert.equal(f.writes.length,3);});
const badMirrors=[
 ['foreign host',()=>Buffer.from(oldMirrors().toString().replace(AZURE,'https://foreign.invalid/ubuntu/'))],
 ['changed Azure scheme',()=>Buffer.from(oldMirrors().toString().replace('http://azure','https://azure'))],
 ['missing known endpoint',()=>Buffer.from(oldMirrors().toString().split('\n').slice(0,2).join('\n'))],
 ['duplicate endpoint',()=>Buffer.concat([oldMirrors(),Buffer.from(AZURE+'\tpriority:1\n')])],
 ['unknown priority',()=>Buffer.from(oldMirrors().toString().replace('priority:1','priority:4'))],
 ['duplicate metadata',()=>Buffer.from(oldMirrors().toString().replace('priority:1','priority:1 priority:2'))],
 ['duplicate numeric priority',()=>Buffer.from(oldMirrors().toString().replace('priority:2','priority:1'))],
 ['mixed old and final priorities',()=>Buffer.from(oldMirrors().toString().replace('priority:1','priority:3'))],
 ['unknown mirror metadata',()=>Buffer.from(oldMirrors().toString().replace('priority:1','priority:1\tarch:amd64'))],
 ['URI without known slash',()=>Buffer.from(oldMirrors().toString().replace('/ubuntu/','/ubuntu'))]
];
for(const [name,value]of badMirrors)test('reject '+name+' before any fake write',()=>{
 const s=snapshot();s.mirrors=value();const f=fake(s);assert.throws(()=>f.run());assert.equal(f.writes.length,0);assert.equal(f.logs.length,0);
});
const badSources=[
 ['foreign managed source URI',s=>s.ubuntu=Buffer.from(s.ubuntu.toString().replace(ROUTE,'https://foreign.invalid/ubuntu'))],
 ['direct URI bypass',s=>s.ubuntu=Buffer.from(s.ubuntu.toString().replace(ROUTE,'https://archive.ubuntu.com/ubuntu/'))],
 ['unknown mirrorfile path',s=>s.ubuntu=Buffer.from(s.ubuntu.toString().replace('/etc/apt/apt-mirrors.txt','/tmp/apt-mirrors.txt'))],
 ['duplicate deb822 field',s=>s.ubuntu=Buffer.from(s.ubuntu.toString().replace('Types: deb','Types: deb\nTypes: deb'))],
 ['duplicate suite stanza',s=>s.ubuntu=Buffer.concat([s.ubuntu,Buffer.from('\n'+stanza('noble-security')+'\n')])],
 ['duplicate suite token',s=>s.ubuntu=Buffer.from(s.ubuntu.toString().replace('noble noble-updates','noble noble noble-updates'))],
 ['missing suite',s=>s.ubuntu=Buffer.from(s.ubuntu.toString().replace(' noble-backports',''))],
 ['changed component',s=>s.ubuntu=Buffer.from(s.ubuntu.toString().replace('main restricted','main foreign'))],
 ['duplicate component',s=>s.ubuntu=Buffer.from(s.ubuntu.toString().replace('main restricted','main main restricted'))],
 ['changed keyring',s=>s.ubuntu=Buffer.from(s.ubuntu.toString().replace('/usr/share/keyrings/ubuntu-archive-keyring.gpg','/tmp/other.gpg'))],
 ['trusted bypass',s=>s.ubuntu=Buffer.from(s.ubuntu.toString().replace('Types: deb','Trusted: yes\nTypes: deb'))],
 ['disabled source',s=>s.ubuntu=Buffer.from(s.ubuntu.toString().replace('Types: deb','Enabled: no\nTypes: deb'))],
 ['wrong architecture',s=>s.ubuntu=Buffer.from(s.ubuntu.toString().replace('Types: deb','Architectures: arm64\nTypes: deb'))],
 ['extra mirror route',s=>s.otherSources[PATHS.sources+'/duplicate.list']=Buffer.from('deb '+ROUTE+' noble main\n')],
 ['extra direct Ubuntu archive',s=>s.otherSources[PATHS.sources+'/duplicate.list']=Buffer.from('deb https://archive.ubuntu.com/ubuntu/ noble main\n')],
 ['wrong OS',s=>s.os=Buffer.from('ID=debian\nVERSION_ID="24.04"\n')],
 ['wrong OS version',s=>s.os=Buffer.from('ID=ubuntu\nVERSION_ID="26.04"\n')],
 ['duplicate OS identity',s=>s.os=Buffer.from('ID=ubuntu\nID=ubuntu\nVERSION_ID="24.04"\n')]
];
for(const [name,change]of badSources)test('reject '+name+' before any fake write',()=>{
 const s=snapshot();change(s);const f=fake(s);assert.throws(()=>f.run());assert.equal(f.writes.length,0);
});
for(const [name,change]of [
 ['missing mirror file',f=>f.files.delete(PATHS.mirrors)],['missing Ubuntu config',f=>f.files.delete(PATHS.ubuntu)],
 ['empty mirror file',f=>f.files.set(PATHS.mirrors,Buffer.alloc(0))],
 ['symlink mirror',f=>{const read=f.adapter.lstatSync;f.adapter.lstatSync=p=>p===PATHS.mirrors?{...read(p),isFile:()=>false,isSymbolicLink:()=>true}:read(p);}],
 ['changed descriptor identity',f=>{const read=f.adapter.fstatSync;f.adapter.fstatSync=fd=>({...read(fd),ino:102});}]
])test('fail closed on '+name,()=>{const f=fake();change(f);assert.throws(()=>f.run());assert.equal(f.writes.length,0);});
for(const metadata of [{uid:1001},{nlink:2},{mode:0o100666}])test('reject untrusted mirror metadata '+JSON.stringify(metadata),()=>{
 const f=fake(snapshot(),{mirrorStat:metadata});assert.throws(()=>f.run());assert.equal(f.writes.length,0);
});
test('write failure closes the fake descriptor, emits no success and cannot invoke apt',()=>{
 const f=fake(snapshot(),{writeError:true});assert.throws(()=>f.run(),/synthetic write failure/);
 assert.equal(f.writes.length,0);assert.equal(f.logs.length,0);assert.equal(f.calls.at(-1)[0],'close');
});
for(const overrides of [{argv:[]},{argv:['--other']},{platform:'win32'},{arch:'arm64'},
 {env:{...hosted,GITHUB_ACTIONS:'false'}},{env:{...hosted,RUNNER_OS:'Windows'}},
 {env:{...hosted,RUNNER_ARCH:'ARM64'}},{env:{...hosted,RUNNER_ENVIRONMENT:'self-hosted'}}])
test('refuse local/unknown execution before accessing even fake filesystem '+JSON.stringify(overrides),()=>{
 const adapter=new Proxy({},{get(){throw Error('FILESYSTEM_ACCESSED');}});
 assert.throws(()=>main({adapter,env:{...hosted},argv:['--github-hosted-ubuntu24'],platform:'linux',arch:'x64',...overrides}),e=>!e.message.includes('FILESYSTEM_ACCESSED'));
});
test('helper has no apt/network/subprocess execution or alternative output path',()=>{
 const source=readFileSync(new URL('../scripts/qa/prepare-playwright-apt-mirrors.mjs',import.meta.url),'utf8');
 for(const token of ['child_process','execFile','spawnSync','fetch(','https.request','http.request','chmod','chown','apt-get install'])assert.ok(!source.includes(token),token);
 assert.ok(source.includes('adapter.writeSync(fd,Buffer.from(String(edit.value)),0,1,edit.offset)'));
});
test('each Ubuntu Playwright install in qa is immediately preceded by the guarded helper; Native jobs have none',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/qa.yml',import.meta.url),'utf8').replaceAll('\r\n','\n');
 const expected=['mobile','mobile-iphone-webkit-shard-1','mobile-iphone-webkit-shard-2','mobile-iphone-large-text-shard-1',
  'mobile-iphone-large-text-shard-2','cross-platform-shard-1','cross-platform-shard-2','two-client-sync'];
 const hooked=[];
 for(const part of workflow.split(/(?=^  [a-z][a-z0-9-]*:\n)/m)){
  const name=/^  ([a-z][a-z0-9-]*):/.exec(part)?.[1];if(!name)continue;
  const installs=[...part.matchAll(/        run: npx playwright install --with-deps [^\n]+/g)];
  const prepares=[...part.matchAll(/scripts\/qa\/prepare-playwright-apt-mirrors\.mjs --github-hosted-ubuntu24/g)];
  assert.equal(prepares.length,installs.length,name);
  if(installs.length){
   assert.match(part,/runs-on: ubuntu-(?:latest|24\.04)/);assert.equal(installs.length,1);
   assert.ok(prepares[0].index<installs[0].index);
   const between=part.slice(prepares[0].index,installs[0].index);assert.equal((between.match(/      - name:/g)??[]).length,1);
   assert.match(part,/sudo --preserve-env=GITHUB_ACTIONS,RUNNER_OS,RUNNER_ARCH,RUNNER_ENVIRONMENT/);hooked.push(name);
  }
 }
 assert.deepEqual(hooked,expected);
});

test('font provenance guards the same Ubuntu24 dependency installation before browsers',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/cross-engine-font-provenance-qa.yml',import.meta.url),'utf8').replaceAll('\r\n','\n');
 const hook='scripts/qa/prepare-playwright-apt-mirrors.mjs --github-hosted-ubuntu24';
 assert.equal(workflow.split(hook).length-1,1,'Font installation must use the guarded existing mirrors');
 assert.match(workflow,/runs-on: ubuntu-24\.04/);
 const before=workflow.indexOf(hook),install=workflow.indexOf('run: npx playwright install --with-deps chromium firefox webkit');
 assert.ok(before>=0&&install>before);
 assert.equal((workflow.slice(before,install).match(/      - name:/g)??[]).length,1);
 assert.match(workflow.slice(0,install),/sudo --preserve-env=GITHUB_ACTIONS,RUNNER_OS,RUNNER_ARCH,RUNNER_ENVIRONMENT/);
});
