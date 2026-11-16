import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const current=fileURLToPath(new URL('../scripts/qa/ios-parity/prepare.py',import.meta.url));
const baseline=process.env.IOS_NATIVE_SCHEME_PREPARE_SOURCE||current;
const scheme=readFileSync(new URL('../ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const contract=JSON.parse(readFileSync(new URL('./fixtures/qa537-native-launch-contract.json',import.meta.url),'utf8'));
if(process.env.IOS_NATIVE_SCHEME_PREPARE_SOURCE)assert.equal(createHash('sha256').update(readFileSync(baseline,'utf8').replace(/\r\n/g,'\n')).digest('hex'),contract.originalPrepareSha256);
const python=[process.env.PYTHON_EXECUTABLE,process.env.PYTHON,'python3','python'].filter(Boolean).find(command=>{
 const probe=spawnSync(command,['--version'],{encoding:'utf8',timeout:10_000,windowsHide:true});
 return probe.status===0&&/\bPython 3\./.test(String(probe.stdout||'')+String(probe.stderr||''));
});
assert.ok(python,'Python3 is required for the actual Native QA scheme controls; none may be skipped');
const harness=String.raw`import ast,contextlib,io,json,pathlib,sys,tempfile,textwrap,xml.etree.ElementTree as ET
p=json.load(sys.stdin);src=pathlib.Path(p['source']).read_text(encoding='utf8');helper=pathlib.Path(p['helper']).read_text(encoding='utf8');ns={}
for node in ast.parse(helper).body:
 if isinstance(node,ast.FunctionDef)and node.name=='prepare_native_probe_scheme':exec(compile(ast.Module(body=[node],type_ignores=[]),'native-scheme-helper','exec'),ns)
if p['op']=='prepare':
 try:out=ns['prepare_native_probe_scheme'](p['xml'],'AC1010260000000000000000');print(json.dumps({'ok':True,'xml':out}))
 except (ValueError,AssertionError)as e:print(json.dumps({'ok':False,'error':str(e)}))
else:
 with tempfile.TemporaryDirectory(prefix='native-launch-scheme-')as tmp:
  root=pathlib.Path(tmp);path=root/'ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme';path.parent.mkdir(parents=True);path.write_text(p['xml'],encoding='utf8')
  if p['op']=='baseline':ns['prepare_native_probe_scheme']=lambda text,target:text
  ns.update(app=root,target='AC1010260000000000000000');start=src.index('    scheme = app / "ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme"');end=src.index('    (app / "ios/App/ParityProbeUITests.swift")',start)
  with contextlib.redirect_stdout(io.StringIO())as messages:exec(textwrap.dedent(src[start:end]),ns)
  out=path.read_text(encoding='utf8');tree=ET.fromstring(out)
  print(json.dumps({'xml':out,'test':dict(tree.find('TestAction').attrib),'run':dict(tree.find('LaunchAction').attrib),'testables':len(tree.findall('./TestAction/Testables/TestableReference')),'messages':messages.getvalue()}))
`;
function run(op,xml=scheme,source=baseline){const r=spawnSync(python,['-c',harness],{input:JSON.stringify({op,xml,source,helper:current}),encoding:'utf8',timeout:15_000,windowsHide:true});assert.ifError(r.error);assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout)}
const generated=()=>run('generate');

test('actual generated Native Test action launches without optional LLDB attachment',()=>{const p=generated();assert.equal(p.test.selectedDebuggerIdentifier,'');assert.equal(p.test.selectedLauncherIdentifier,'Xcode.IDEFoundation.Launcher.PosixSpawn')});
test('actual generated Native Run action cannot reintroduce optional LLDB attachment',()=>{const p=generated();assert.equal(p.run.selectedDebuggerIdentifier,'');assert.equal(p.run.selectedLauncherIdentifier,'Xcode.IDEFoundation.Launcher.PosixSpawn')});
test('Native QA scheme keeps every byte beyond the four debugger/launcher attributes',()=>{
 const before=run('baseline'),after=generated();assert.equal(after.testables,1);
 assert.equal(after.xml.replaceAll('selectedDebuggerIdentifier = ""','selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"').replaceAll('selectedLauncherIdentifier = "Xcode.IDEFoundation.Launcher.PosixSpawn"','selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"'),before.xml);
});
test('Native launch preparation refuses a scheme without its exact enabled UI-test target',()=>assert.equal(run('prepare',scheme,current).ok,false));
test('Native launch preparation refuses duplicate action blocks',()=>{const s=run('baseline').xml;assert.equal(run('prepare',s.replace('</Scheme>','<TestAction/></Scheme>'),current).ok,false)});
test('Native launch preparation refuses unknown launchers rather than silently rewriting them',()=>{const s=run('baseline').xml.replace('Xcode.DebuggerFoundation.Launcher.LLDB','unrecognized.launcher');assert.equal(run('prepare',s,current).ok,false)});
test('Native launch preparation is idempotent on its exact already prepared scheme',()=>{const a=generated();const b=run('prepare',a.xml,current);assert.equal(b.ok,true);assert.equal(b.xml,a.xml)});
test('Native driver, frames, capture ACK, policy controls, bridge and shipping scheme retain canonical LF bytes',()=>{
 for(const [path,expected]of Object.entries(contract.canonicalLfProtectedFiles)){
  const raw=readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
  assert.equal(createHash('sha256').update(raw).digest('hex'),expected,path);
 }
 assert.match(scheme,/selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"/);
});
