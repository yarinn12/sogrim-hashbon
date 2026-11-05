import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8').replaceAll('\r\n','\n');
const native=read('../.github/workflows/android-native-parity-qa.yml');
const diagnostic=read('../.github/workflows/android-abcb-emulator-36310-qa.yml');
const proof=JSON.parse(read('../docs/android-abcb-emulator-36310-proof.json'));
const block=(workflow,start,end)=>{const from=workflow.indexOf(start),to=workflow.indexOf(end,from);assert.ok(from>=0&&to>from);return workflow.slice(from,to);};

test('emulator diagnostic permits only first push on the exact owned repository and branch',()=>{
 assert.match(diagnostic,/on:\n  push:\n    branches: \[codex\/android-abcb-emulator-36310-20261104\]/);
 const expression=/^    if: \$\{\{ (.+) \}\}$/m.exec(diagnostic)?.[1];
 assert.ok(expression);
 const github={repository:'yarinn12/sogrim-hashbon',ref:'refs/heads/codex/android-abcb-emulator-36310-20261104',run_attempt:1,run_number:1};
 assert.equal(runInNewContext(expression,{github}),true);
 for(const changed of [{repository:'foreign/repository'},{ref:'refs/heads/main'},{ref:'refs/heads/codex/test-release-459-20261104'},{run_attempt:2},{run_number:2},{run_attempt:undefined},{run_number:undefined}])assert.equal(runInNewContext(expression,{github:{...github,...changed}}),false,JSON.stringify(changed));
 for(const [variable,value] of Object.entries({GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_NUMBER:'1',GITHUB_REPOSITORY:'yarinn12/sogrim-hashbon',GITHUB_REF_NAME:'codex/android-abcb-emulator-36310-20261104'}))assert.ok(diagnostic.includes(`test "$${variable}" = "${value}"`));
 for(const forbidden of ['workflow_dispatch:','workflow_call:','pull_request:','schedule:','strategy:','continue-on-error','--retry','contents: write','actions: write'])assert.ok(!diagnostic.includes(forbidden),forbidden);
 assert.match(diagnostic,/permissions:\n  contents: read\n  actions: read/);
 assert.match(diagnostic,/runs-on: ubuntu-24.04\n    timeout-minutes: 45/);
 const deployment=JSON.parse(read('../vercel.json'));
 assert.equal(deployment.git.deploymentEnabled['codex/android-abcb-emulator-36310-20261104'],false);
});

test('original boot, prelude, scaling, glyph, geometry, trace and ANR blocks remain byte-identical',()=>{
 const start='      - name: Boot only the owned AVD',end='      - uses: actions/upload-artifact@v6';
 assert.equal(block(diagnostic,start,end),block(native,start,end));
 const avdStart='          printf \'no\\n\' |',avdEnd='      - name: Record actual host and guest DMA compatibility';
 assert.equal(block(diagnostic,avdStart,avdEnd),block(native,avdStart,avdEnd));
 const nativeBlob=createHash('sha1').update(`blob ${Buffer.byteLength(native)}\0`).update(native).digest('hex');
 assert.equal(nativeBlob,'816ec7ab5bccebd1f6cf3ff773b02115f1b0e3ee','Ordinary Native workflow must remain unchanged');
 assert.ok(diagnostic.indexOf('trace-diagnostics.mjs start')<diagnostic.indexOf('font-regression.mjs >'));
});

test('baseline SDK is verified then only official36.3.10 is installed and reverified before AVD creation',()=>{
 const sdk=block(diagnostic,'      - name: Install actual Android emulator SDK','      - name: Record actual host and guest DMA compatibility');
 const baseline=sdk.indexOf('verify-baseline-sdk "$ANDROID_HOME"');
 const install=sdk.indexOf('install-emulator "$ANDROID_HOME"');
 const verify=sdk.indexOf('verify-sdk "$ANDROID_HOME"');
 const avd=sdk.indexOf('avdmanager" create avd');
 assert.ok(baseline>=0&&install>baseline&&verify>install&&avd>verify);
 assert.ok(sdk.includes(proof.downloadUrl));
 assert.equal(proof.publishedSha256,'c8ab9ffbc4c2d11c02e06e81a9d9f81970177dc5ab599e3a30eb08a4a5496a67');
 assert.equal(proof.independentlyDownloadedSha256,proof.publishedSha256);
 assert.equal(proof.bytes,320951246);
 assert.equal(proof.replacementBuildId,'14472402');
 assert.ok(sdk.includes('Android emulator version 36.3.10.0 (build_id 14472402)'));
 assert.ok(sdk.includes("'system-images;android-36.1;google_apis_playstore;x86_64' -d pixel_6"));
 assert.equal(proof.nativeAcceptance,false);
 assert.equal(proof.anrFixed,false);
});

test('original failed abcb APK, source, tools and Debug certificate are frozen without rebuilding',()=>{
 assert.ok(diagnostic.includes(`ANDROID_QA_SOURCE: ${proof.applicationSource}`));
 assert.ok(diagnostic.includes(`ANDROID_HISTORICAL_QA_TOOLS: ${proof.qaToolsSource}`));
 assert.ok(diagnostic.includes(`test "$(git rev-parse HEAD^{tree})" = "${proof.applicationTree}"`));
 assert.ok(diagnostic.includes('cp -R "$GITHUB_WORKSPACE/historical-tools/scripts/qa/android-native-isolated"'));
 const prepare=block(diagnostic,'      - name: Prepare exact immutable original APK','      - name: Boot only the owned AVD');
 assert.ok(prepare.includes(`actions/artifacts/${proof.originalArtifactId}/zip`));
 assert.ok(prepare.includes('android-abcb-emulator-36310.py" prepare'));
 assert.ok(prepare.includes('apksigner" verify --print-certs'));
 assert.ok(prepare.includes('bd414dee7295f8cc62667913aa79f727fee8c76234b648a352f813f8be2b8e2a'));
 for(const forbidden of ['npm ci','native:prepare','assembleDebug','prepare-fixture.mjs','cap copy','upload-key','signRelease'])assert.ok(!diagnostic.includes(forbidden),forbidden);
 assert.match(diagnostic,/name: diagnostic-abcb-emulator-36310-/);
});

test('all diagnostic Bash boundaries parse without executing an emulator or download',()=>{
 const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
 const commands=[...diagnostic.matchAll(/^        run: \|\n((?:          .*\n|\n)+)/gm)].map(match=>match[1].split('\n').map(line=>line.replace(/^          /,'')).join('\n').replace(/\$\{\{[\s\S]*?\}\}/g,'QA_EXPRESSION'));
 assert.ok(commands.length>=10);
 for(const command of commands){const result=spawnSync(bash,['-n'],{input:command,encoding:'utf8',windowsHide:true,timeout:5000});assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);}
 assert.equal(commands.filter(command=>command.includes('curl --fail')).length,2);
 for(const command of commands)assert.ok(command.split('\n').filter(line=>line.trimEnd().endsWith('\\')).every(line=>!line.trimEnd().endsWith('\\\\')));
});
