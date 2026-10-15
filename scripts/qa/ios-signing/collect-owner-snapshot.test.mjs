import test from 'node:test';
import assert from 'node:assert/strict';
import {collectOwnerSnapshot} from './collect-owner-snapshot.mjs';

const APP = '6809952514', BUNDLE = 'com.sogrimhashbon.app';
const BUILD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OLD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // Synthetic193; never the historical real ID.
const G = '4646e3de-7401-4e70-ac32-9a00072e1376', T = '5d2040f0-3af9-4d98-a188-fd6eeb5547db';
const E = 'external-group', ET = 'external-tester', ORIGIN = 'https://api.appstoreconnect.apple.com';
const clone = structuredClone;
const row = (type, id, attributes) => attributes === undefined ? {type, id} : {type, id, attributes};
function fixture(options = {}) {
  const calls = [];
  const groups = [row('betaGroups', G, {name: 'Yarin Internal Testing', isInternalGroup: true,
    hasAccessToAllBuilds: false, publicLinkEnabled: false}),
    row('betaGroups', E, {name: 'Existing external', isInternalGroup: false,
      hasAccessToAllBuilds: null, publicLinkEnabled: false})];
  const membership = {[G]: [OLD], [E]: ['old-external']};
  if (options.assigned) membership[G].push(BUILD);
  if (options.both) membership[E].push(BUILD);
  const notes = [row('betaBuildLocalizations', 'note-he', {locale: 'he', whatsNew: 'עדכון אישי לבדיקה'}),
    row('betaBuildLocalizations', 'note-en', {locale: 'en-US', whatsNew: 'Personal beta update'})];
  const versions = [row('appStoreVersions', 'store457', {platform: 'IOS', versionString: '4.57',
    appStoreState: 'PENDING_DEVELOPER_RELEASE', releaseType: 'MANUAL'}),
    row('appStoreVersions', 'store455', {platform: 'IOS', versionString: '4.55',
      appStoreState: 'READY_FOR_SALE', releaseType: 'AFTER_APPROVAL'}),
    row('appStoreVersions', 'store458', {platform: 'IOS', versionString: '4.58',
      appStoreState: 'PREPARE_FOR_SUBMISSION', releaseType: 'MANUAL'})];
  const storeBuilds = {store457: 'old192', store455: 'old191', store458: null};
  const api = async (path, request) => {
    assert.deepEqual(request, {method: 'GET', redirect: 'error'});
    assert.ok(path.startsWith('/v1/') && !path.startsWith('//'));
    const u = new URL(path, ORIGIN), p = u.pathname, page = Number(u.searchParams.get('cursor') ?? '0');
    calls.push({path, method: request.method, at: Date.now()});
    let result, collection;
    if (p === '/v1/apps/' + APP || /^\/v1\/builds\/[^/]+\/app$/.test(p))
      result = {data: row('apps', options.foreignBuild && p.includes(options.foreignBuild) ? 'foreign' : APP, {bundleId: BUNDLE})};
    else if (p === '/v1/builds/' + BUILD) result = {data: row('builds', BUILD,
      {version: '194', processingState: 'VALID', expired: false, usesNonExemptEncryption: false})};
    else if (p.endsWith('/preReleaseVersion'))
      result = {data: row('preReleaseVersions', 'pre458', {version: '4.58', platform: 'IOS'})};
    else if (p.endsWith('/buildBetaDetail')) result = {data: row('buildBetaDetails', 'beta194',
      {internalBuildState: options.assigned ? 'IN_BETA_TESTING' : 'READY_FOR_BETA_TESTING',
        externalBuildState: 'READY_FOR_BETA_SUBMISSION'})};
    else if (p.endsWith('/betaBuildLocalizations')) collection = notes;
    else if (p === '/v1/apps/' + APP + '/betaGroups') collection = groups;
    else if (p === '/v1/betaGroups') {
      assert.equal(u.searchParams.get('filter[app]'), APP, 'Never read account-wide groups');
      assert.equal(u.searchParams.get('filter[builds]'), BUILD);
      collection = groups.filter(g => membership[g.id].includes(BUILD));
    } else if (/^\/v1\/betaGroups\/[^/]+\/relationships\/app$/.test(p))
      result = {data: row('apps', APP)};
    else if (/^\/v1\/betaGroups\/[^/]+$/.test(p))
      result = {data: clone(groups.find(g => g.id === p.split('/')[3]))};
    else if (p.endsWith('/relationships/builds'))
      collection = membership[p.split('/')[3]].map(id => row('builds', id));
    else if (p.endsWith('/relationships/betaTesters'))
      collection = [row('betaTesters', p.split('/')[3] === G ? T : ET)];
    else if (p.endsWith('/relationships/individualTesters')) collection = [];
    else if (p.endsWith('/relationships/appStoreVersion')) result = {data: null};
    else if (p === '/v1/apps/' + APP + '/appStoreVersions') {
      assert.equal(u.searchParams.get('filter[platform]'), 'IOS'); collection = versions;
    } else if (/^\/v1\/appStoreVersions\/[^/]+\/build$/.test(p)) {
      const id = storeBuilds[p.split('/')[3]];
      result = {data: id === null ? null : row('builds', id, {version: id === 'old192' ? '192' : '191'})};
    } else throw Error('Unplanned fixture endpoint: ' + p);
    if (collection !== undefined) {
      const data = collection.slice(page, page + 1);
      const next = page + 1 < collection.length ? new URL(u) : null;
      if (next) next.searchParams.set('cursor', String(page + 1));
      result = {data: clone(data), links: {next: next?.href ?? null},
        meta: {paging: {total: collection.length, limit: 200}}};
    }
    if (options.change) await options.change({path, p, u, page, result, calls});
    return result;
  };
  return {api, calls};
}
async function collect(options) {
  const f = fixture(options);
  return {...await collectOwnerSnapshot(f.api, {appId: APP, buildId: BUILD}), calls: f.calls};
}
function changeAt(match, mutate) {
  return ({p, result, ...ctx}) => { if (match(p, ctx)) mutate(result, ctx); };
}

export async function runCollectorControls() {
  const results = [];
  async function check(name, fn) {
    try { await fn(); results.push({name, passed: true}); }
    catch (error) { results.push({name, passed: false, error: error.message}); }
  }
  await check('normal paginated collection has the exact core contract, complete evidence and no account/tester PII calls', async () => {
    const {snapshot: s, evidence: e, calls} = await collect();
    assert.deepEqual(Object.keys(s).sort(), ['schemaVersion', 'observedAt', 'coverage', 'app', 'build',
      'notes', 'buildGroupIds', 'individualTesterIds', 'storeVersionId', 'groups', 'testers', 'appStoreVersions'].sort());
    assert.deepEqual(s.coverage, {appGroups: true, groupBuilds: true, groupTesters: true,
      buildGroups: true, individualTesters: true, storeVersions: true, storeBuildLinks: true, notes: true});
    assert.deepEqual(s.app, {id: APP, bundleId: BUNDLE});
    assert.deepEqual(s.build, {id: BUILD, appId: APP, version: '4.58', build: '194', platform: 'IOS',
      processingState: 'VALID', expired: false, usesNonExemptEncryption: false,
      internalBuildState: 'READY_FOR_BETA_TESTING', externalBuildState: 'READY_FOR_BETA_SUBMISSION'});
    assert.deepEqual(s.buildGroupIds, []); assert.deepEqual(s.individualTesterIds, []); assert.equal(s.storeVersionId, null);
    assert.equal(s.groups.find(g => g.id === E).hasAccessToAllBuilds, null);
    assert.ok(s.groups.find(g => g.id === G).buildIds.includes(OLD));
    assert.deepEqual(s.testers.find(t => t.id === T), {id: T, groupIds: [G]});
    assert.deepEqual(s.appStoreVersions.map(v => v.buildId).sort((a,b) => String(a).localeCompare(String(b))),
      [null, 'old191', 'old192'].sort((a,b) => String(a).localeCompare(String(b))));
    assert.equal(s.notes.length, 2);
    assert.equal(e.complete, true); assert.ok(e.collections.every(c => c.complete));
    assert.ok(e.collections.some(c => c.pages.length === 3));
    assert.ok(Date.parse(s.observedAt) <= calls[0].at);
    assert.ok(Date.parse(e.completedAt) >= calls.at(-1).at);
    assert.equal(e.startedAt, s.observedAt);
    assert.equal(e.transportAttestation, 'NOT_PROVIDED_BY_THIS_COLLECTOR');
    assert.ok(calls.every(c => c.method === 'GET'));
    assert.ok(!calls.some(c => /\/v1\/betaTesters|\/invitations|email|firstName|lastName/.test(c.path)));
  });
  await check('assigned owner build is faithfully collected; no policy or mutation is executed', async () => {
    const {snapshot: s} = await collect({assigned: true});
    assert.deepEqual(s.buildGroupIds, [G]); assert.equal(s.build.internalBuildState, 'IN_BETA_TESTING');
  });
  await check('explicit null flags and encryption are preserved, never converted to false', async () => {
    const {snapshot: s} = await collect({change: changeAt(p => p === '/v1/builds/' + BUILD,
      r => r.data.attributes.usesNonExemptEncryption = null)});
    assert.equal(s.build.usesNonExemptEncryption, null);
    assert.equal(s.groups.find(g => g.id === E).hasAccessToAllBuilds, null);
  });
  await check('observedAt is collection start, not a freshness reset at the end', async () => {
    const {snapshot: s, evidence: e} = await collect({change: async ({p}) => {
      if (p.endsWith('/appStoreVersions')) await new Promise(resolve => setTimeout(resolve, 5));
    }});
    assert.ok(Date.parse(e.completedAt) > Date.parse(s.observedAt));
  });
  for (const args of [{appId: 'another', buildId: BUILD}, {appId: APP, buildId: 'PENDING'},
    {appId: APP, buildId: '../194'}, {appId: APP}, {}])
    await check('invalid intake identity stops before any API read: ' + JSON.stringify(args), async () => {
      let count = 0;
      await assert.rejects(collectOwnerSnapshot(async () => { count++; }, args)); assert.equal(count, 0);
    });
  const firstNotes = (p, {page}) => p.endsWith('/betaBuildLocalizations') && page === 0;
  const secondNotes = (p, {page}) => p.endsWith('/betaBuildLocalizations') && page === 1;
  const paginationCases = [
    ['truncated links', firstNotes, r => r.links.next = null],
    ['missing paging total', firstNotes, r => delete r.meta.paging.total],
    ['string paging total', firstNotes, r => r.meta.paging.total = '2'],
    ['missing meta', firstNotes, r => delete r.meta],
    ['missing links', firstNotes, r => delete r.links],
    ['nonarray data', firstNotes, r => r.data = {}],
    ['missing page data', firstNotes, r => delete r.data],
    ['duplicate resource page', secondNotes, r => r.data[0].id = 'note-he'],
    ['changing total', secondNotes, r => r.meta.paging.total = 3],
    ['invalid limit', firstNotes, r => r.meta.paging.limit = 0],
    ['overlarge collection', firstNotes, r => r.meta.paging.total = 4001],
    ['wrong resource type', firstNotes, r => r.data[0].type = 'apps'],
    ['invalid resource ID', firstNotes, r => r.data[0].id = '../note'],
    ['empty intermediate page', firstNotes, r => r.data = []],
    ['cursor mismatch', firstNotes, r => r.meta.paging.nextCursor = 'wrong'],
    ['foreign origin', firstNotes, r => r.links.next = 'https://evil.invalid/v1/builds/x'],
    ['http scheme', firstNotes, r => r.links.next = r.links.next.replace('https:', 'http:')],
    ['foreign collection path', firstNotes, r => { const u = new URL(r.links.next); u.pathname = '/v1/betaTesters'; r.links.next = u.href; }],
    ['credentials in URL', firstNotes, r => r.links.next = r.links.next.replace('https://', 'https://user:pass@')],
    ['network-path URL', firstNotes, r => r.links.next = '//api.appstoreconnect.apple.com/v1/builds/x'],
    ['fragment', firstNotes, r => r.links.next += '#hidden'],
    ['duplicate query parameter', firstNotes, r => r.links.next += '&limit=200'],
    ['unplanned query parameter', firstNotes, r => r.links.next += '&include=betaTesters'],
    ['next-page filter removed', firstNotes, r => { const u = new URL(r.links.next); u.searchParams.delete('fields[betaBuildLocalizations]'); r.links.next = u.href; }],
    ['same page URL', firstNotes, (r, {path}) => r.links.next = ORIGIN + path],
    ['API error envelope', firstNotes, r => r.errors = [{status: '403'}]]
  ];
  for (const [name, match, mutate] of paginationCases)
    await check('paging refuses ' + name, async () => {
      await assert.rejects(collect({change: changeAt(match, mutate)}));
    });
  await check('page budget is finite and failure exposes only incomplete evidence, never a partial snapshot', async () => {
    const f = fixture({change: ({p, u, page, result: r}) => {
      if (!p.endsWith('/betaBuildLocalizations')) return;
      r.data = [row('betaBuildLocalizations', 'n-' + page, {locale: 'locale-' + page, whatsNew: 'note'})];
      r.meta.paging.total = 100; const next = new URL(u); next.searchParams.set('cursor', String(page + 1));
      r.links.next = next.href;
    }});
    let caught;
    try { await collectOwnerSnapshot(f.api, {appId: APP, buildId: BUILD}); } catch (error) { caught = error; }
    assert.ok(caught); assert.equal(caught.evidence.complete, false); assert.equal(caught.snapshot, undefined);
    assert.equal(f.calls.filter(c => c.path.includes('/betaBuildLocalizations')).length, 20);
  });
  await check('relative next links and omitted terminal next are accepted when exact total proves completion', async () => {
    const {evidence} = await collect({change: ({result: r}) => {
      if (!r.links) return;
      if (r.links.next) { const u = new URL(r.links.next); r.links.next = u.pathname + u.search; }
      else delete r.links.next;
    }});
    assert.equal(evidence.complete, true);
  });
  await check('filtered build-group pagination cannot widen app or build scope', async () => {
    await assert.rejects(collect({assigned: true, both: true, change: changeAt(
      (p, {page}) => p === '/v1/betaGroups' && page === 0, r => {
        const u = new URL(r.links.next); u.searchParams.delete('filter[app]'); r.links.next = u.href;
      })}));
  });
  for (const target of [BUILD, OLD, 'old192'])
    await check('foreign app ownership rejected for target/group/Store build: ' + target,
      async () => assert.rejects(collect({foreignBuild: target})));
  const dataCases = [
    ['wrong target build ID', p => p === '/v1/builds/' + BUILD, r => r.data.id = OLD],
    ['wrong build number', p => p === '/v1/builds/' + BUILD, r => r.data.attributes.version = '193'],
    ['missing encryption declaration', p => p === '/v1/builds/' + BUILD, r => delete r.data.attributes.usesNonExemptEncryption],
    ['foreign bundle', p => p === '/v1/apps/' + APP, r => r.data.attributes.bundleId = 'other.bundle'],
    ['wrong prerelease', p => p.endsWith('/preReleaseVersion'), r => r.data.attributes.version = '4.57'],
    ['wrong prerelease OS', p => p.endsWith('/preReleaseVersion'), r => r.data.attributes.platform = 'MAC_OS'],
    ['missing beta state', p => p.endsWith('/buildBetaDetail'), r => delete r.data.attributes.internalBuildState],
    ['null notes', firstNotes, r => r.data[0].attributes.whatsNew = null],
    ['missing notes locale', firstNotes, r => delete r.data[0].attributes.locale],
    ['duplicate note locale', secondNotes, r => r.data[0].attributes.locale = 'he'],
    ['foreign group owner app', p => p.endsWith('/relationships/app'), r => r.data.id = 'other-app'],
    ['missing listed manual flag', p => p === '/v1/apps/' + APP + '/betaGroups', r => delete r.data[0].attributes.hasAccessToAllBuilds],
    ['missing detailed public flag', p => p === '/v1/betaGroups/' + G, r => delete r.data.attributes.publicLinkEnabled],
    ['string group flag', p => p === '/v1/apps/' + APP + '/betaGroups', r => r.data[0].attributes.publicLinkEnabled = 'false'],
    ['null internal scope', p => p === '/v1/apps/' + APP + '/betaGroups', r => r.data[0].attributes.isInternalGroup = null],
    ['metadata changed mid-collection', p => p === '/v1/betaGroups/' + G, r => r.data.attributes.hasAccessToAllBuilds = true],
    ['build group outside app roster', p => p === '/v1/betaGroups', r => {
      r.data = [row('betaGroups', 'foreign-group', {name: 'Foreign', isInternalGroup: true, hasAccessToAllBuilds: false, publicLinkEnabled: false})];
      r.meta.paging.total = 1;
    }],
    ['missing reverse build group', p => p === '/v1/betaGroups', r => {
      r.data = []; r.meta.paging.total = 0; r.links.next = null;
    }],
    ['missing Store state', p => p.endsWith('/appStoreVersions'), r => delete r.data[0].attributes.appStoreState],
    ['non-iOS Store version', p => p.endsWith('/appStoreVersions'), r => r.data[0].attributes.platform = 'TV_OS'],
    ['inconsistent Store reverse link', p => p.endsWith('/relationships/appStoreVersion'), r => r.data = row('appStoreVersions', 'store458')]
  ];
  for (const [name, match, mutate] of dataCases)
    await check('resource validation refuses ' + name, async () =>
      assert.rejects(collect({assigned: name === 'missing reverse build group', change: changeAt(match, mutate)})));
  await check('PII supplied unexpectedly by a mock is neither requested nor copied into snapshot/evidence', async () => {
    const out = await collect({change: ({p, result: r}) => {
      if (p.endsWith('/relationships/betaTesters'))
        for (const t of r.data) t.attributes = {email: 'private@example.invalid', firstName: 'PII'};
    }});
    assert.ok(!JSON.stringify(out).includes('private@example.invalid'));
    assert.ok(!JSON.stringify(out).includes('firstName'));
  });
  await check('injected transport rejection is not retried and cannot return complete coverage', async () => {
    let count = 0, caught;
    try { await collectOwnerSnapshot(async () => { count++; throw Error('private-token'); }, {appId: APP, buildId: BUILD}); }
    catch (error) { caught = error; }
    assert.equal(count, 1); assert.ok(caught); assert.equal(caught.evidence.complete, false);
    assert.ok(!caught.message.includes('private-token'));
  });
  await check('opaque cursor contents are hashed in evidence and never echoed in failure messages', async () => {
    const f = fixture({change: changeAt(firstNotes, r => {
      const u = new URL(r.links.next); u.searchParams.set('cursor', 'private@example.invalid'); r.links.next = u.href;
    })});
    let caught;
    try { await collectOwnerSnapshot(f.api, {appId: APP, buildId: BUILD}); } catch (error) { caught = error; }
    assert.ok(caught);
    assert.ok(!JSON.stringify(caught.evidence).includes('private'));
    assert.ok(!caught.message.includes('private'));
    assert.ok(caught.evidence.requests.some(r => typeof r.cursorSha256 === 'string'));
  });
  return {total: results.length, passed: results.filter(x => x.passed).length,
    failed: results.filter(x => !x.passed).length, skipped: 0, failures: results.filter(x => !x.passed)};
}

// Node --test must execute the controls rather than merely import this helper file.
test('owner collector: 65 injected-API controls', async () => {
  const report = await runCollectorControls();
  assert.equal(report.total, 65);
  assert.equal(report.failed, 0, JSON.stringify(report.failures));
});
