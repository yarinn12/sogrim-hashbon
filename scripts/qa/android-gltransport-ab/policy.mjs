import assert from 'node:assert/strict';

export const PIN = Object.freeze({
  repository: 'yarinn12/sogrim-hashbon',
  branch: 'codex/android-gltransport-ab-20261015',
  source: '3606feae297326fcd89a963cc3994499f6a8e696',
  tree: '3e84e7d2b8615689e69ac7590e973667aa464b17',
  tools: '3606feae297326fcd89a963cc3994499f6a8e696',
  reusedRunner: '1c86a9d2635fc8670e854bdceb41bc88ff0291f6',
  emulator: '37.2.12', emulatorBuild: '16428233',
  hardwarePropertiesSha256: '13a89cc7cfa84c5fe48cd7eb8d296bca321dcd0d90f7bcb751efd963ae2c653d',
  image: 'system-images;android-36.1;google_apis_playstore;x86_64',
  reviewToken: '3606-pipe-asg-once',
});
export const ARMS = Object.freeze([
  Object.freeze({id: 'A', gpu: 'swiftshader', transport: 'pipe'}),
  Object.freeze({id: 'B', gpu: 'swiftshader', transport: 'asg'}),
]);
export const MEASURE_PHASES = Object.freeze([
  'prepare', 'renderer-sdk', 'boot', 'network', 'install',
  'health-before', 'renderer', 'continuous-log', 'trace-start',
  'font-regression', 'acceptance', 'geometry', 'health-after',
]);
export const FINAL_PHASES = Object.freeze(['trace-finish', 'anr-history', 'cleanup', 'retain-evidence']);
export const PHASES = Object.freeze([...MEASURE_PHASES, ...FINAL_PHASES]);

export function assertContext(env, {platform, toolingHead, source, tools}) {
  assert.equal(platform, 'linux', 'Native executor requires the reviewed Linux CI host');
  assert.equal(env.GITHUB_ACTIONS, 'true');
  assert.equal(env.GITHUB_EVENT_NAME, 'push');
  assert.equal(env.GITHUB_WORKFLOW_REF, PIN.repository + '/.github/workflows/android-gltransport-ab-3606-once.yml@refs/heads/' + PIN.branch);
  assert.equal(env.GITHUB_RUN_NUMBER, '1', 'Only the first registered activation may execute');
  assert.equal(env.GITHUB_REPOSITORY, PIN.repository);
  assert.equal(env.GITHUB_REF, 'refs/heads/' + PIN.branch);
  assert.equal(env.GITHUB_RUN_ATTEMPT, '1', 'A rerun cannot replace the retained first attempt');
  assert.match(env.GITHUB_RUN_ID || '', /^\d+$/);
  assert.match(toolingHead || '', /^[a-f0-9]{40}$/);
  assert.equal(env.ANDROID_AB_REVIEWED_SHA, toolingHead, 'Review must name the exact executor commit');
  assert.equal(env.GITHUB_SHA, toolingHead);
  assert.equal(env.ANDROID_AB_REVIEW_TOKEN, PIN.reviewToken);
  assert.equal(env.ANDROID_AB_REQUESTED_SOURCE, PIN.source, 'Diagnostic source is immutable');
  assert.deepEqual(source, {commit: PIN.source, tree: PIN.tree, clean: true});
  assert.deepEqual(tools, {commit: PIN.tools, tree: PIN.tree, clean: true});
}

// The original Native workflow uses the headless QEMU binary. Metadata queries
// must select that same binary rather than loading the unused GUI dependency set.
export async function probeEmulator(command, executable) {
  const version = await command('emulator-version', executable, ['-no-window', '-version'], {timeout:20000});
  const help = await command('emulator-help-gpu', executable, ['-no-window', '-help-gpu'], {timeout:20000});
  return {version:version.stdout + version.stderr, gpuHelp:help.stdout + help.stderr};
}

export function assertSdk(sdk, version, gpuHelp) {
  assert.equal(sdk.files.hostVersion.revision, PIN.emulator);
  assert.equal(sdk.files.guestVersion.revision, '4');
  const expected = {
    hostFeatures: '0f4532724ad5d666139607ab64bfb3eb42af140343ffb69c97afe72cb686d5f8',
    hostVersion: 'ba13085f647fb8389a4d06a1de0e4104ac4e841733e50f67223ac230e1ce685a',
    guestFeatures: '6fc0aa05761982d23c9084b78fda14f4f6b49dfd176e3782686bba750c806316',
    guestVersion: 'fb476989442a827bf45fe141abe7fa8a002efeab6e7f15f6bed78f0484a211aa',
  };
  for (const [name, digest] of Object.entries(expected)) assert.equal(sdk.files[name].sha256, digest, 'SDK drift: ' + name);
  assert.match(version, /Android emulator version 37\.2\.12(?:\.0)? \(build_id 16428233\)/);
  for (const mode of ARMS.map(a => a.gpu)) assert.match(gpuHelp, new RegExp('(^|[^\\w])' + mode + '([^\\w]|$)'), 'Installed binary does not advertise ' + mode);
}

function only(log, regex, label) {
  const values = [...log.matchAll(regex)].map(row => row.slice(1));
  assert.equal(values.length, 1, 'Missing or ambiguous renderer evidence: ' + label);
  return values[0];
}
export function assertRenderer(log, gpu, capabilities) {
  assert.ok(ARMS.some(a => a.gpu === gpu), 'Unexpected GPU treatment');
  assert.equal(capabilities.compatible, true);
  assert.deepEqual(capabilities.observations, {GlDirectMem: [1], HasSharedSlotsHostMemoryAllocator: [1]});
  const [backend] = only(log, /^INFO\s*\|\s*Graphics backend:\s*(\S+)\s*$/gm, 'backend');
  assert.equal(backend, 'gfxstream');
  const [vulkanMode, glesMode] = only(log, /^INFO\s*\|\s*emuglConfig_init: vulkan_mode_selected:(\S+) gles_mode_selected:(\S+)\s*$/gm, 'selected modes');
  const [vulkanActive] = only(log, /^DEBUG\s*\|\s*gfxstreamFeature:Vulkan = ([01])\s*$/gm, 'Vulkan activation');
  assert.equal(vulkanActive, '0', 'Keep original GLES-only comparison; Vulkan activation drift invalidates the arm');
  const [adapter] = only(log, /^INFO\s*\|\s*Graphics Adapter (?!Vendor)(.+)\s*$/gm, 'adapter');
  const [api] = only(log, /^INFO\s*\|\s*Graphics API Version (.+)\s*$/gm, 'API');
  assert.match(adapter, /SwiftShader/i);
  assert.match(api, /OpenGL ES 3\.0.*SwiftShader/i);
  assert.match(log, /androidboot\.debug\.hwui\.renderer=skiagl\s*$/m);
  assert.match(log, /Performing composition using CompositorGl\./);
  assert.equal(glesMode, 'swiftshader', 'Both arms must keep the same SwiftShader GLES renderer');
  assert.equal(vulkanMode, 'swiftshader');
  assert.doesNotMatch(log, /setCurrentRenderer:.*gles:Angle Indirect/);
  return {requestedGpu: gpu, backend, vulkanMode, glesMode, vulkanActive: Number(vulkanActive), adapter, api};
}

export function pairVerdict(arms) {
  assert.equal(arms.length, 2, 'Missing arm');
  assert.deepEqual(arms.map(a => a.id), ARMS.map(a => a.id), 'Missing, duplicated or reordered arm');
  for (let index = 0; index < arms.length; index++) {
    const arm = arms[index];
    assert.equal(arm.gpu, ARMS[index].gpu);
    assert.equal(arm.source, PIN.source);
    assert.equal(arm.tree, PIN.tree);
    assert.match(arm.apkSha256 || '', /^[a-f0-9]{64}$/);
    assert.equal(arm.apkSha256, arms[0].apkSha256, 'Both arms require the same sealed APK');
    assert.equal(arm.transport, ARMS[index].transport);
    assert.equal(arm.attempts, 1);
    assert.equal(arm.state, 'completed', 'Arm missing or interrupted');
    assert.deepEqual(arm.phases.map(p => p.name), [...PHASES], 'Missing, duplicated or reordered phase');
  }
  const passed = arms.every(arm => arm.phases.every(p => p.state === 'passed') && arm.closed === true && arm.evidenceRetained === true);
  const sameInputs = arms.every(a => a.sdkDigest && a.sdkDigest === arms[0].sdkDigest);
  const matchedSelection = arms.every(a => a.renderer?.glesMode === 'swiftshader' &&
    a.transportProof?.verified === true && a.transportProof.transport === a.transport &&
    a.configProof?.matched === true && a.installedAPKVerified === true);
  return {comparisonComplete: arms.every(a => a.evidenceRetained && a.closed), controlsPassed: passed && sameInputs && matchedSelection,
    sameSdkInputs: sameInputs, matchedSelection, nativeAcceptance: false, releaseAcceptance: false,
    status: passed && sameInputs && matchedSelection ? 'diagnostic-pair-completed' : 'failed-or-incomplete-diagnostic-pair'};
}

// The injected adapter lets tests exercise the same phase scheduling and
// finally path without creating an AVD, executing an APK or contacting GitHub.
export async function executePair(adapter, {apkSha256, onRecord = () => {}, shouldStop = () => false} = {}) {
  assert.match(apkSha256 || '', /^[a-f0-9]{64}$/, 'Require the once-built APK seal before scheduling');
  const arms = ARMS.map(arm => ({...arm, source: PIN.source, tree: PIN.tree, apkSha256: apkSha256,
    attempts: 1, state: 'planned', phases: PHASES.map(name=>({name,state:'planned',source:PIN.source,tree:PIN.tree,apkSha256:apkSha256})), closed: false, evidenceRetained: false}));
  onRecord(arms);
  for (const arm of arms) {
    if (shouldStop()) break;
    arm.state = 'running'; onRecord(arms);
    let failed = false;
    for (const name of MEASURE_PHASES) {
      const row = arm.phases.find(p=>p.name===name);
      Object.assign(row,{state:failed||shouldStop()?'not-run-after-failure':'running',startedAtUtc:new Date().toISOString()}); onRecord(arms);
      if (failed || shouldStop()) continue;
      try { row.result = await adapter.phase(arm, name); row.state = 'passed'; }
      catch (error) {row.state = 'failed'; row.error = error.stack || String(error); failed = true;}
      row.completedAtUtc = new Date().toISOString(); onRecord(arms);
    }
    // All finalizers are attempted independently, even if trace finalization
    // fails. No finalizer can overwrite a failed measurement's state.
    for (const name of FINAL_PHASES) {
      const row=arm.phases.find(p=>p.name===name);
      Object.assign(row,{state:'running',startedAtUtc:new Date().toISOString()}); onRecord(arms);
      try {row.result = await adapter.phase(arm, name); row.state = 'passed';}
      catch (error) {row.state = 'failed'; row.error = error.stack || String(error);}
      row.completedAtUtc = new Date().toISOString(); onRecord(arms);
    }
    arm.state = 'completed'; onRecord(arms);
    if (!arm.closed) break; // An unrelated/reused PID must never be killed to start B.
  }
  let verdict;
  try {verdict = pairVerdict(arms);}
  catch (error) {verdict = {status: 'missing-or-interrupted-arm', error: error.message, controlsPassed: false, nativeAcceptance: false, releaseAcceptance: false};}
  return {arms, ...verdict};
}
