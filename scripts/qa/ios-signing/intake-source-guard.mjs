import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const RELEASE_SOURCE = '2cf78afc23c1d9330834de63ed5f81ba4da5b052';
export const RELEASE_TREE = '52105dddf3b9a8edb61032c6149eac1b392c460a';
export const SOURCE = process.env.SOURCE_SHA;
export const ARTIFACT_NAME = 'sogrim-ios-4.58-194-encrypted';
export const APPLE_APP_ID = '6809952514';
export const SOURCE_BRANCH = 'codex/platform-visual-candidate-20261014';
assert.match(SOURCE ?? '', /^[0-9a-f]{40}$/, 'source_sha must be a full commit');
assert.equal(SOURCE, RELEASE_SOURCE, 'Only the coordinator frozen release source is authorized');

export function requiredRuns(env) {
  const rows = [
    [env.SOURCE_QA_RUN, '.github/workflows/qa.yml'],
    [env.SOURCE_WINDOWS_QA_RUN, '.github/workflows/qa-windows.yml'],
    [env.SOURCE_FONT_QA_RUN, '.github/workflows/cross-engine-font-provenance-qa.yml'],
    [env.SOURCE_AUTH_QA_RUN, '.github/workflows/ios-auth-return-qa.yml']
  ];
  for (const [id] of rows) assert.match(id ?? '', /^[1-9][0-9]*$/, 'Required CI run ID missing');
  assert.equal(new Set(rows.map(([id]) => id)).size, rows.length, 'CI run IDs must be distinct');
  return rows;
}

async function githubRead(fetchImpl, token, path) {
  assert.ok(token, 'GitHub read token required');
  assert.ok(path.startsWith('/') && !path.startsWith('//'));
  const response = await fetchImpl('https://api.github.com/repos/yarinn12/sogrim-hashbon' + path, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'}
  });
  assert.ok(response.ok, 'Cannot read required GitHub proof');
  return response.json();
}

export async function verifyCommit(fetchImpl, token, tree) {
  assert.equal(tree, RELEASE_TREE);
  const commit = await githubRead(fetchImpl, token, '/git/commits/' + SOURCE);
  assert.equal(commit.sha, SOURCE);
  assert.equal(commit.tree?.sha, tree, 'GitHub tree differs from checked-out source');
}

export async function verifyRuns(fetchImpl, token, env) {
  const proofs = [];
  for (const [id, path] of requiredRuns(env)) {
    const run = await githubRead(fetchImpl, token, '/actions/runs/' + id);
    assert.equal(String(run.id), id);
    assert.equal(run.repository?.full_name, 'yarinn12/sogrim-hashbon');
    assert.equal(run.head_repository?.full_name, 'yarinn12/sogrim-hashbon', 'Fork CI is forbidden');
    assert.equal(run.head_sha, SOURCE, 'CI must be on source_sha');
    assert.equal(run.head_branch, SOURCE_BRANCH, 'Private candidate CI must belong to its explicit source branch');
    assert.ok(['push', 'pull_request', 'workflow_dispatch'].includes(run.event), 'Unsupported private CI event');
    assert.equal(run.path, path);
    assert.equal(run.status, 'completed');
    assert.equal(run.conclusion, 'success');
    assert.equal(run.run_attempt, 1, 'Release CI must pass its original attempt');
    const jobs = [];
    let complete = false;
    for (let page = 1; page <= 20; page++) {
      const result = await githubRead(fetchImpl, token, '/actions/runs/' + id + '/attempts/1/jobs?per_page=100&page=' + page);
      assert.ok(Array.isArray(result.jobs) && Number.isSafeInteger(result.total_count) && result.total_count > 0);
      jobs.push(...result.jobs);
      if (jobs.length === result.total_count) {complete = true; break;}
      assert.ok(jobs.length < result.total_count && result.jobs.length > 0, 'Incomplete CI jobs');
    }
    assert.ok(complete, 'CI job pagination is incomplete');
    assert.equal(new Set(jobs.map(job => job.id)).size, jobs.length);
    for (const job of jobs) {
      assert.equal(String(job.run_id), id);
      assert.equal(job.head_sha, SOURCE, 'Native/job source must equal source_sha');
      assert.equal(job.status, 'completed');
      assert.equal(job.conclusion, 'success', 'Failed, skipped or cancelled CI job');
    }
    if (path === '.github/workflows/qa.yml') {
      const required = ['unit', 'cross-platform', 'cross-platform-shard-1', 'cross-platform-shard-2',
        'two-client-sync', 'unit-and-mobile', 'backup-runtime',
        ...['android-mobile', 'iphone-webkit', 'ipad-webkit', 'iphone-large-text', 'reflow-200'].map(p => 'mobile (' + p + ')'),
        'ios-native / native-parity', 'android-native / native-parity',
        'mobile-iphone-large-text-shard-1', 'mobile-iphone-large-text-shard-2',
        'mobile-iphone-webkit-shard-1', 'mobile-iphone-webkit-shard-2'];
      for (const name of required) assert.equal(jobs.filter(job => job.name === name).length, 1, 'Missing QA lane: ' + name);
    } else {
      const requiredName = {'.github/workflows/qa-windows.yml':'windows-unit',
        '.github/workflows/cross-engine-font-provenance-qa.yml':'linux-font-provenance',
        '.github/workflows/ios-auth-return-qa.yml':'native'}[path];
      assert.ok(requiredName, 'Unknown private acceptance workflow');
      assert.equal(jobs.filter(job => job.name === requiredName).length, 1, 'Missing acceptance lane: ' + requiredName);
    }
    proofs.push({id, path, source: run.head_sha, attempt: run.run_attempt, conclusion: run.conclusion,
      jobs: jobs.map(({id, name, conclusion, head_sha}) => ({id, name, conclusion, source: head_sha})), updatedAt: run.updated_at});
  }
  return proofs;
}

export async function requireUnusedArtifactSlot(fetchImpl, token) {
  const query = new URLSearchParams({name: ARTIFACT_NAME, per_page: '100'});
  const result = await githubRead(fetchImpl, token, '/actions/artifacts?' + query);
  assert.ok(Array.isArray(result.artifacts) && Number.isSafeInteger(result.total_count));
  assert.equal(result.total_count, 0, 'Build194 already has a retained preparation; inspect it instead of rebuilding');
  assert.equal(result.artifacts.length, 0, 'Existing preparation blocks duplicate signing');
  return {name: ARTIFACT_NAME, existingPreparations: 0, reserved: false, checkedAt: new Date().toISOString()};
}

export async function readUnusedBuild(request) {
  const app = (await request('/v1/apps/' + APPLE_APP_ID, {method: 'GET'})).data;
  assert.equal(app?.attributes?.bundleId, 'com.sogrimhashbon.app');
  let next = '/v1/builds?' + new URLSearchParams({
    'filter[app]': APPLE_APP_ID, 'filter[preReleaseVersion.platform]': 'IOS', 'fields[builds]': 'version', limit: '200'
  });
  let maximum = 0;
  for (let page = 0; next && page < 20; page++) {
    if (next.startsWith('http')) {
      const url = new URL(next);
      assert.equal(url.origin, 'https://api.appstoreconnect.apple.com');
      next = url.pathname + url.search;
    }
    assert.ok(next.startsWith('/v1/builds?'), 'Unexpected Apple pagination target');
    const response = await request(next, {method: 'GET'});
    assert.ok(Array.isArray(response.data), 'Incomplete Apple build list');
    for (const build of response.data) {
      assert.match(build.attributes?.version ?? '', /^[1-9][0-9]*$/);
      const number = Number(build.attributes.version);
      assert.ok(Number.isSafeInteger(number));
      maximum = Math.max(maximum, number);
    }
    next = response.links?.next;
  }
  assert.ok(!next, 'Apple pagination incomplete');
  assert.ok(maximum < 194, '194 is no longer unused; coordinator must select a new candidate');
  return {appId: APPLE_APP_ID, maximumUploadedBuild: maximum, candidateBuild: 194,
    reserved: false, checkedAt: new Date().toISOString()};
}

export function verifyCheckout(runGit, readText, env) {
  assert.equal(env.GITHUB_REPOSITORY, 'yarinn12/sogrim-hashbon');
  if (env.GITHUB_EVENT_NAME === 'push') {
    assert.equal(env.GITHUB_REF, 'refs/heads/codex/ios194-11b-intake-only-20261015');
    assert.equal(env.GITHUB_WORKFLOW_REF,
      'yarinn12/sogrim-hashbon/.github/workflows/ios194-11b-intake-only.yml@refs/heads/codex/ios194-11b-intake-only-20261015');
    assert.equal(String(env.GITHUB_RUN_ATTEMPT), '1', 'No signing retry');
    assert.equal(String(env.GITHUB_RUN_NUMBER), '1', 'Only the first one-shot signing run may proceed');
  } else {
    assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  }
  assert.equal(env.APPLE_TEAM_ID, 'MA9S4L7WKS');
  assert.equal(env.SOURCE_SHA, SOURCE);
  assert.equal(env.IOS_VERSION, '4.58');
  assert.equal(env.IOS_BUILD, '194');
  assert.equal(runGit(['rev-parse', 'HEAD']), SOURCE);
  assert.equal(runGit(['rev-parse', 'HEAD^{tree}']), RELEASE_TREE);
  const pwa = readText('src/pwaBootstrap.mjs').match(/const PWA_RELEASE = "(\d+)"/)?.[1];
  assert.equal(pwa, '516');
  const metadata = JSON.parse(readText('docs/store-submission/app-store-metadata-he.json'));
  assert.equal(metadata.version?.number, '4.58');
  assert.equal(String(metadata.version?.build), '194');
  return {sourceCommit: SOURCE, sourceTree: RELEASE_TREE, pwaRelease: pwa};
}

async function main() {
  const phase = process.argv[2];
  assert.ok(['ci-only', 'before-build', 'after-export', 'before-upload'].includes(phase));
  const env = process.env;
  const runGit = args => execFileSync('git', args, {encoding: 'utf8'}).trim();
  const source = verifyCheckout(runGit, path => readFileSync(path, 'utf8'), env);
  if (phase === 'ci-only') assert.equal(runGit(['status', '--porcelain']), '', 'App checkout must start clean');
  await verifyCommit(fetch, env.GH_TOKEN, source.sourceTree);
  const ci = await verifyRuns(fetch, env.GH_TOKEN, env);
  let apple = null, artifactSlot = null;
  if (phase !== 'ci-only') {
    const {createAppStoreClient} = await import(pathToFileURL(resolve('scripts/lib/app-store-release.mjs')));
    const api = createAppStoreClient({issuerId: env.APPSTORE_ISSUER_ID, keyId: env.APPSTORE_API_KEY_ID,
      privateKey: env.APPSTORE_API_PRIVATE_KEY});
    apple = await readUnusedBuild(api);
    if (phase !== 'before-upload') artifactSlot = await requireUnusedArtifactSlot(fetch, env.GH_TOKEN);
  }
  const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');
  const paths = execFileSync('git', ['ls-files', '--cached', '-z'], {encoding: 'utf8'}).split('\0').filter(Boolean)
    .filter(path => !/^(android\/|ios\/|\.well-known\/)/.test(path) ||
      (/^ios\/.+\.swift$/.test(path) && !path.endsWith('/Package.swift'))).sort();
  assert.ok(paths.length > 500, 'Incomplete source fingerprint');
  const sourceInputs = Object.fromEntries(paths.map(path => [path, sha256(path)]));
  if (phase !== 'ci-only') {
    const before = JSON.parse(readFileSync('build/ios/source-ci-only.json', 'utf8'));
    assert.deepEqual(sourceInputs, before.sourceInputs, 'Application inputs changed during native preparation');
    assert.equal(before.sourceCommit, SOURCE); assert.equal(before.sourceTree, RELEASE_TREE);
  }
  mkdirSync('build/ios', {recursive: true});
  writeFileSync('build/ios/source-' + phase + '.json', JSON.stringify({
    ...source, phase, ci, apple, artifactSlot, version: env.IOS_VERSION, build: env.IOS_BUILD,
    packageSha256: sha256('package.json'), packageLockSha256: sha256('package-lock.json'), sourceInputs,
    workflowCommit: env.WORKFLOW_COMMIT, workflowRef: env.WORKFLOW_REF,
    buildRunId: env.GITHUB_RUN_ID, buildRunAttempt: env.GITHUB_RUN_ATTEMPT,
    checkedAt: new Date().toISOString(), appleUploadPerformed: false
  }, null, 2) + '\n');
  console.log('Exact release source, tree and all CI verified (' + phase + '); no Apple write.');
}
if (import.meta.url.startsWith('file:') && process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
