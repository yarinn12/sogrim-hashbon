import assert from 'node:assert/strict';

export const PIN = Object.freeze({
  repository: 'yarinn12/sogrim-hashbon',
  branch: 'codex/android-renderer-ab-boot-20261014',
  source: 'c053989b217740fa9855edfbc2ec83456f498dfc',
  tree: '2b0845ff0be978c344148eb855827beb0d4f7ccb',
  tools: '9ee0e857073ff891257189c027efea924dbcb506',
  run: 38611164699, artifact: 11918988498,
  zipBytes: 121573483,
  zipSha: '2a50fda848f13200553c07145253c98d206909eabf696c7ae66238de069d1755',
  apkBytes: 23883384,
  apkSha: 'e13e32a4ed5903bf527127e2dee4d039df923b5120f69d11aa63333b3afb28c5',
  certificate: '145e6df069a8c39662d0d72f0709ebd5620d0d0f95b03500fb5d200c877baa66',
  emulator: '37.2.12', emulatorBuild: '16428233',
  image: 'system-images;android-36.1;google_apis_playstore;x86_64',
  reviewToken: 'c053-e13e-renderer-ab-once',
});
export const ARMS = Object.freeze([{id: 'A', gpu: 'software'}, {id: 'B', gpu: 'swiftshader'}]);
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
  assert.equal(env.GITHUB_WORKFLOW_REF, PIN.repository + '/.github/workflows/android-renderer-ab-c053-boot-once.yml@refs/heads/' + PIN.branch);
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

export function assertArtifactIdentity(value) {
  for (const [key, expected] of Object.entries({
    source: PIN.source, tree: PIN.tree, tools: PIN.tools,
    zipSha256: PIN.zipSha, zipBytes: PIN.zipBytes,
    apkSha256: PIN.apkSha, apkBytes: PIN.apkBytes, assets: 214, fonts: 13,
  })) assert.equal(value[key], expected, 'Original artifact identity mismatch: ' + key);
  assert.equal(value.privateEnvDisabled, true);
  assert.equal(value.syntheticBootstrap, true);
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
  if (gpu === 'software') {
    assert.equal(glesMode, 'swangle');
    assert.equal(vulkanMode, 'lavapipe');
    assert.match(log, /setCurrentRenderer: swangle lavapipe gles:Angle Indirect vulkan:Lavapipe\s*$/m);
  } else {
    assert.equal(glesMode, 'swiftshader', 'B must select a distinct GLES renderer; fallback is invalid');
    assert.equal(vulkanMode, 'swiftshader');
    assert.doesNotMatch(log, /setCurrentRenderer:.*gles:Angle Indirect/);
  }
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
    assert.equal(arm.apkSha256, PIN.apkSha);
    assert.equal(arm.attempts, 1);
    assert.equal(arm.state, 'completed', 'Arm missing or interrupted');
    assert.deepEqual(arm.phases.map(p => p.name), [...PHASES], 'Missing, duplicated or reordered phase');
  }
  const passed = arms.every(arm => arm.phases.every(p => p.state === 'passed') && arm.closed === true && arm.evidenceRetained === true);
  const sameInputs = arms.every(a => a.sdkDigest && a.sdkDigest === arms[0].sdkDigest);
  const distinctRenderers = arms[0].renderer?.glesMode === 'swangle' && arms[1].renderer?.glesMode === 'swiftshader';
  return {comparisonComplete: arms.every(a => a.evidenceRetained && a.closed), controlsPassed: passed && sameInputs && distinctRenderers,
    sameSdkInputs: sameInputs, distinctRenderers, nativeAcceptance: false, releaseAcceptance: false,
    status: passed && sameInputs && distinctRenderers ? 'diagnostic-pair-completed' : 'failed-or-incomplete-diagnostic-pair'};
}

// The injected adapter lets tests exercise the same phase scheduling and
// finally path without creating an AVD, executing an APK or contacting GitHub.
export async function executePair(adapter, {onRecord = () => {}, shouldStop = () => false} = {}) {
  const arms = ARMS.map(arm => ({...arm, source: PIN.source, tree: PIN.tree, apkSha256: PIN.apkSha,
    attempts: 1, state: 'planned', phases: PHASES.map(name=>({name,state:'planned',source:PIN.source,tree:PIN.tree,apkSha256:PIN.apkSha})), closed: false, evidenceRetained: false}));
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
