import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const current=fileURLToPath(new URL('../scripts/qa/native-auth-session/native-auth-session-probe.py',import.meta.url));
const baseline=process.env.IOS_AUTH_SCHEME_PROBE_SOURCE||current;
const scheme=readFileSync(new URL('../ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme',import.meta.url),'utf8');
const contract=JSON.parse(readFileSync(new URL('./fixtures/auth110-launch-contract.json',import.meta.url),'utf8'));
const python=process.env.PYTHON_EXECUTABLE||(process.platform==='win32'?'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe':'python3');
const harness=String.raw`import ast,contextlib,io,json,pathlib,sys,tempfile,xml.etree.ElementTree as ET
p=json.load(sys.stdin);src=pathlib.Path(p['source']).read_text(encoding='utf-8');helper=pathlib.Path(p['helper']).read_text(encoding='utf-8');ns={}
for node in ast.parse(helper).body:
 if isinstance(node,ast.FunctionDef)and node.name=='prepare_auth_probe_scheme':exec(compile(ast.Module(body=[node],type_ignores=[]),'scheme-helper','exec'),ns)
if p['op']=='prepare':
 try:out=ns['prepare_auth_probe_scheme'](p['xml'],'AC0719100000000000000000');print(json.dumps({'ok':True,'xml':out}))
 except (ValueError,AssertionError)as e:print(json.dumps({'ok':False,'error':str(e)}))
else:
 with tempfile.TemporaryDirectory(prefix='auth-launch-scheme-')as tmp:
  root=pathlib.Path(tmp);path=root/'ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme';path.parent.mkdir(parents=True);path.write_text(p['xml'],encoding='utf-8')
  if p['op']=='baseline':ns['prepare_auth_probe_scheme']=lambda text,target:text
  ns.update(root=root,target='AC0719100000000000000000');start=src.index("scheme=root/'ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme'");end=src.index("\ntest=r'''",start)
  with contextlib.redirect_stdout(io.StringIO()):exec(src[start:end],ns)
  out=path.read_text(encoding='utf-8');tree=ET.fromstring(out)
  print(json.dumps({'xml':out,'test':dict(tree.find('TestAction').attrib),'run':dict(tree.find('LaunchAction').attrib),'testables':len(tree.findall('./TestAction/Testables/TestableReference'))}))
`;
function run(op,xml=scheme,source=baseline){const r=spawnSync(python,['-c',harness],{input:JSON.stringify({op,xml,source,helper:current}),encoding:'utf8',timeout:15_000,windowsHide:true});assert.ifError(r.error);assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout)}
const generated=()=>run('generate');
test('actual generated auth Test action launches without optional LLDB attachment',()=>{const p=generated();assert.equal(p.test.selectedDebuggerIdentifier,'');assert.equal(p.test.selectedLauncherIdentifier,'Xcode.IDEFoundation.Launcher.PosixSpawn')});
test('actual generated auth Run action cannot reintroduce optional LLDB attachment',()=>{const p=generated();assert.equal(p.run.selectedDebuggerIdentifier,'');assert.equal(p.run.selectedLauncherIdentifier,'Xcode.IDEFoundation.Launcher.PosixSpawn')});
test('generated QA scheme keeps every byte beyond the four debugger/launcher attributes',()=>{
 const before=run('baseline'),after=generated();assert.equal(after.testables,1);
 assert.equal(after.xml.replaceAll('selectedDebuggerIdentifier = ""','selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"').replaceAll('selectedLauncherIdentifier = "Xcode.IDEFoundation.Launcher.PosixSpawn"','selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"'),before.xml);
});
test('auth launch preparation refuses a scheme without its exact enabled UI-test target',()=>assert.equal(run('prepare',scheme,current).ok,false));
test('auth launch preparation refuses duplicate action blocks',()=>{const s=run('baseline').xml;assert.equal(run('prepare',s.replace('</Scheme>','<TestAction/></Scheme>'),current).ok,false)});
test('auth launch preparation refuses unknown launchers rather than silently rewriting them',()=>{const s=run('baseline').xml.replace('Xcode.DebuggerFoundation.Launcher.LLDB','unrecognized.launcher');assert.equal(run('prepare',s,current).ok,false)});
test('auth launch preparation is idempotent on its exact already prepared scheme',()=>{const a=generated();const b=run('prepare',a.xml,current);assert.equal(b.ok,true);assert.equal(b.xml,a.xml)});
test('original cold launches, complete auth assertions and deadlines remain byte-identical; shipping scheme retains debugging',()=>{
 const p=readFileSync(current,'utf8'),start=p.indexOf("test=r'''"),end=p.indexOf("'''.replace('BEFORE'",start);
 assert.equal(createHash('sha256').update(p.slice(start,end)).digest('hex'),contract.originalXctestLiteralSha256);
 assert.equal(createHash('sha256').update(scheme).digest('hex'),contract.shippingSchemeSha256);
 assert.match(scheme,/selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"/);
});
