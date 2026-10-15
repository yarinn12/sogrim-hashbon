import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OWNER_APP_ID = '6809952514';
export const OWNER_BUNDLE_ID = 'com.sogrimhashbon.app';
const ORIGIN = 'https://api.appstoreconnect.apple.com';
const MAX_PAGES = 20, MAX_ROWS = 4000, MAX_REQUESTS = 2000, MAX_ALL_ROWS = 20000;
const own = (x, k) => x !== null && typeof x === 'object' && Object.hasOwn(x, k);
const sha = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sortIds = x => [...x].sort();
function resourceId(x) {
  assert.ok(typeof x === 'string' && /^[A-Za-z0-9-]{1,128}$/.test(x), 'Invalid resource identifier');
  return x;
}
function field(obj, key) {
  assert.ok(own(obj, key), 'Missing required field: ' + key);
  return obj[key];
}
function text(x) { assert.equal(typeof x, 'string', 'Expected string'); return x; }
function boolean(x) { assert.equal(typeof x, 'boolean', 'Expected boolean'); return x; }
function nullableBoolean(x) { assert.ok(x === null || typeof x === 'boolean', 'Expected explicit boolean/null'); return x; }
function resource(x, type, expectedId) {
  assert.ok(x && !Array.isArray(x) && typeof x === 'object', 'Missing resource');
  assert.equal(x.type, type, 'Wrong resource type');
  resourceId(x.id);
  if (expectedId !== undefined) assert.equal(x.id, expectedId, 'Wrong resource ID');
  return x;
}
function sameIds(a, b) { assert.deepEqual(sortIds(a), sortIds(b), 'Relationship reads disagree'); }
function query(path, params) { return path + '?' + new URLSearchParams(params); }
function auditPath(path) {
  const u = new URL(path, ORIGIN), cursor = u.searchParams.get('cursor');
  u.searchParams.delete('cursor');
  return {path: u.pathname + u.search, requestSha256: sha(path), cursorSha256: cursor === null ? null : sha(cursor)};
}
function groupAttributes(g) {
  const a = field(g, 'attributes');
  return {name: text(field(a, 'name')), isInternalGroup: boolean(field(a, 'isInternalGroup')),
    hasAccessToAllBuilds: nullableBoolean(field(a, 'hasAccessToAllBuilds')),
    publicLinkEnabled: nullableBoolean(field(a, 'publicLinkEnabled'))};
}
function urlFor(value, original) {
  assert.ok(typeof value === 'string' && value.length <= 8192 && !/[\s\\#]/.test(value), 'Invalid paging URL');
  assert.ok(value.startsWith('/v1/') || value.startsWith(ORIGIN + '/v1/'), 'Foreign paging URL');
  const url = new URL(value, ORIGIN);
  assert.equal(url.origin, ORIGIN); assert.equal(url.username, ''); assert.equal(url.password, '');
  assert.equal(url.hash, ''); assert.equal(url.pathname, original.pathname, 'Paging collection changed');
  const keys = [...url.searchParams.keys()];
  assert.equal(new Set(keys).size, keys.length, 'Duplicate query parameter');
  for (const [k, v] of original.searchParams) assert.equal(url.searchParams.get(k), v, 'Paging filter changed');
  for (const k of keys) assert.ok(original.searchParams.has(k) || k === 'cursor', 'Unexpected paging parameter');
  if (url.searchParams.has('cursor')) assert.ok(url.searchParams.get('cursor').length > 0, 'Empty cursor');
  url.searchParams.sort();
  return url;
}

/**
 * Injected JSON API only. Returns {snapshot,evidence}; neither object is written.
 * api(path,{method:'GET',redirect:'error'}) must reject HTTP errors/redirects and
 * enforce Apple's origin itself. This module cannot attest the injected transport.
 */
export async function collectOwnerSnapshot(api, {appId, buildId} = {}) {
  assert.equal(typeof api, 'function');
  assert.equal(appId, OWNER_APP_ID, 'Collector is limited to the existing app');
  assert.match(buildId ?? '', /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i, 'A real intake build ID is required');
  const observedAt = new Date().toISOString();
  const evidence = {schemaVersion: 1, mode: 'INJECTED_API_GET_ONLY', appId, buildId, startedAt: observedAt,
    completedAt: null, complete: false, transportAttestation: 'NOT_PROVIDED_BY_THIS_COLLECTOR',
    requests: [], collections: [], derivations: {testerGroupIds: 'Union of membership IDs from every app group; no global tester request'}};
  let rowBudget = 0;
  async function get(path) {
    assert.ok(evidence.requests.length < MAX_REQUESTS, 'Read budget exceeded');
    assert.ok(path.startsWith('/v1/') && !/[\s\\#]/.test(path), 'Invalid generated GET path');
    const row = {method: 'GET', ...auditPath(path), completed: false};
    evidence.requests.push(row);
    let result;
    try { result = await api(path, {method: 'GET', redirect: 'error'}); }
    catch { throw new Error('Injected GET failed for ' + path.split('?')[0]); }
    assert.ok(result && typeof result === 'object' && !Array.isArray(result));
    assert.ok(own(result, 'data') && !own(result, 'errors'), 'Unsuccessful or incomplete API envelope');
    row.completed = true;
    return result;
  }
  async function one(path, type, expectedId, nullable = false) {
    const r = await get(path);
    if (r.data === null) { assert.ok(nullable, 'Unexpected null relationship'); return null; }
    return resource(r.data, type, expectedId);
  }
  async function many(initial, type) {
    const original = new URL(initial, ORIGIN), seenPages = new Set(), seenIds = new Set(), rows = [];
    const trace = {initialPath: initial, type, total: null, complete: false, pages: []};
    evidence.collections.push(trace);
    let next = initial;
    for (let page = 0; next !== null; page++) {
      assert.ok(page < MAX_PAGES, 'Page budget exceeded');
      const url = urlFor(next, original);
      assert.ok(!seenPages.has(url.href), 'Repeated pagination page'); seenPages.add(url.href);
      const path = url.pathname + url.search;
      const r = await get(path);
      assert.ok(Array.isArray(r.data), 'Collection missing');
      const paging = field(field(r, 'meta'), 'paging');
      const total = field(paging, 'total'), limit = field(paging, 'limit');
      assert.ok(Number.isSafeInteger(total) && total >= 0 && total <= MAX_ROWS, 'Unproven collection total');
      assert.ok(Number.isSafeInteger(limit) && limit >= 0 && limit <= 200 && r.data.length <= limit, 'Invalid page limit');
      if (trace.total === null) trace.total = total;
      else assert.equal(total, trace.total, 'Collection total changed between pages');
      const links = field(r, 'links');
      assert.ok(links && !Array.isArray(links) && typeof links === 'object', 'Missing paging links');
      assert.ok(!own(links, 'next') || links.next === null || typeof links.next === 'string', 'Invalid next link');
      const continuation = own(links, 'next') ? links.next : null;
      const nextUrl = continuation === null ? null : urlFor(continuation, original);
      if (own(paging, 'nextCursor') && paging.nextCursor !== null) {
        assert.ok(typeof paging.nextCursor === 'string' && paging.nextCursor.length > 0);
        assert.equal(nextUrl?.searchParams.get('cursor'), paging.nextCursor, 'Cursor/link disagree');
      }
      const pageIds = [];
      for (const item of r.data) {
        resource(item, type);
        assert.ok(!seenIds.has(item.id), 'Duplicate resource across collection pages');
        seenIds.add(item.id); pageIds.push(item.id); rows.push(item);
      }
      rowBudget += r.data.length; assert.ok(rowBudget <= MAX_ALL_ROWS, 'Aggregate row budget exceeded');
      assert.ok(rows.length <= total, 'Collection exceeded its total');
      trace.pages.push({request: auditPath(path), count: r.data.length, idsSha256: sha(pageIds),
        nextRequest: nextUrl ? auditPath(nextUrl.pathname + nextUrl.search) : null});
      if (nextUrl) {
        assert.ok(r.data.length > 0 && rows.length < total, 'Empty or redundant continuation');
        next = nextUrl.pathname + nextUrl.search;
      } else {
        assert.equal(rows.length, total, 'Collection truncated');
        next = null;
      }
    }
    trace.complete = true; trace.idsSha256 = sha(sortIds(rows.map(x => x.id)));
    return rows;
  }
  const appFields = {'fields[apps]': 'bundleId'};
  const groupFields = {'fields[betaGroups]': 'name,isInternalGroup,hasAccessToAllBuilds,publicLinkEnabled'};
  const ownedBuilds = new Set();
  async function checkBuildApp(id) {
    if (ownedBuilds.has(id)) return;
    const app = await one(query('/v1/builds/' + resourceId(id) + '/app', appFields), 'apps', appId);
    assert.equal(text(field(field(app, 'attributes'), 'bundleId')), OWNER_BUNDLE_ID, 'Foreign build app');
    ownedBuilds.add(id);
  }
  try {
    const app = await one(query('/v1/apps/' + appId, appFields), 'apps', appId);
    assert.equal(text(field(field(app, 'attributes'), 'bundleId')), OWNER_BUNDLE_ID);
    const build = await one(query('/v1/builds/' + buildId, {'fields[builds]':
      'version,processingState,expired,usesNonExemptEncryption'}), 'builds', buildId);
    await checkBuildApp(buildId);
    const ba = field(build, 'attributes');
    assert.equal(text(field(ba, 'version')), '194', 'Not the intake194 build');
    const pre = await one(query('/v1/builds/' + buildId + '/preReleaseVersion',
      {'fields[preReleaseVersions]': 'version,platform'}), 'preReleaseVersions');
    assert.equal(text(field(pre.attributes, 'version')), '4.58');
    assert.equal(text(field(pre.attributes, 'platform')), 'IOS');
    const beta = await one(query('/v1/builds/' + buildId + '/buildBetaDetail',
      {'fields[buildBetaDetails]': 'internalBuildState,externalBuildState'}), 'buildBetaDetails');
    const notesRows = await many(query('/v1/builds/' + buildId + '/betaBuildLocalizations',
      {'fields[betaBuildLocalizations]': 'locale,whatsNew', limit: '200'}), 'betaBuildLocalizations');
    const notes = notesRows.map(n => ({id: n.id, locale: text(field(n.attributes, 'locale')),
      whatsNew: text(field(n.attributes, 'whatsNew'))}));
    assert.equal(new Set(notes.map(n => n.locale)).size, notes.length, 'Duplicate locale');
    const appGroups = await many(query('/v1/apps/' + appId + '/betaGroups',
      {...groupFields, limit: '200'}), 'betaGroups');
    const groups = [];
    for (const g of appGroups) {
      const listed = groupAttributes(g);
      const scope = await one('/v1/betaGroups/' + g.id + '/relationships/app', 'apps', appId);
      assert.equal(scope.id, appId);
      const detail = await one(query('/v1/betaGroups/' + g.id, groupFields), 'betaGroups', g.id);
      assert.deepEqual(groupAttributes(detail), listed, 'Group metadata changed between reads');
      const builds = await many(query('/v1/betaGroups/' + g.id + '/relationships/builds', {limit: '200'}), 'builds');
      for (const b of builds) await checkBuildApp(b.id);
      const testers = await many(query('/v1/betaGroups/' + g.id + '/relationships/betaTesters', {limit: '200'}), 'betaTesters');
      groups.push({id: g.id, appId, ...listed, buildIds: sortIds(builds.map(b => b.id)),
        testerIds: sortIds(testers.map(t => t.id))});
    }
    // Apple documents this filtered collection; do not invent a GET builds/{id}/betaGroups endpoint.
    const byBuild = await many(query('/v1/betaGroups', {'filter[app]': appId, 'filter[builds]': buildId,
      ...groupFields, limit: '200'}), 'betaGroups');
    for (const g of byBuild) {
      const known = groups.find(x => x.id === g.id);
      assert.ok(known, 'Build group outside the complete app-group list');
      assert.deepEqual(groupAttributes(g), groupAttributes({attributes: known}), 'Build-group flags disagree');
    }
    const buildGroupIds = sortIds(byBuild.map(g => g.id));
    sameIds(buildGroupIds, groups.filter(g => g.buildIds.includes(buildId)).map(g => g.id));
    const individuals = await many(query('/v1/builds/' + buildId + '/relationships/individualTesters',
      {limit: '200'}), 'betaTesters');
    const storeLink = await one('/v1/builds/' + buildId + '/relationships/appStoreVersion',
      'appStoreVersions', undefined, true);
    const versions = await many(query('/v1/apps/' + appId + '/appStoreVersions', {
      'filter[platform]': 'IOS', 'fields[appStoreVersions]': 'platform,versionString,appStoreState,releaseType',
      limit: '200'}), 'appStoreVersions');
    const appStoreVersions = [];
    for (const v of versions) {
      const va = field(v, 'attributes'); assert.equal(text(field(va, 'platform')), 'IOS', 'Non-iOS Store version');
      const linked = await one(query('/v1/appStoreVersions/' + v.id + '/build',
        {'fields[builds]': 'version'}), 'builds', undefined, true);
      if (linked) await checkBuildApp(linked.id);
      appStoreVersions.push({id: v.id, version: text(field(va, 'versionString')),
        state: text(field(va, 'appStoreState')), releaseType: text(field(va, 'releaseType')),
        buildId: linked === null ? null : linked.id});
    }
    sameIds(appStoreVersions.filter(v => v.buildId === buildId).map(v => v.id), storeLink ? [storeLink.id] : []);
    const testerIds = sortIds([...new Set(groups.flatMap(g => g.testerIds))]);
    const snapshot = {schemaVersion: 1, observedAt,
      coverage: {appGroups: true, groupBuilds: true, groupTesters: true, buildGroups: true,
        individualTesters: true, storeVersions: true, storeBuildLinks: true, notes: true},
      app: {id: appId, bundleId: OWNER_BUNDLE_ID},
      build: {id: buildId, appId, version: pre.attributes.version, build: ba.version, platform: pre.attributes.platform,
        processingState: text(field(ba, 'processingState')), expired: boolean(field(ba, 'expired')),
        usesNonExemptEncryption: nullableBoolean(field(ba, 'usesNonExemptEncryption')),
        internalBuildState: text(field(beta.attributes, 'internalBuildState')),
        externalBuildState: text(field(beta.attributes, 'externalBuildState'))},
      notes: notes.sort((a, b) => a.id.localeCompare(b.id)),
      buildGroupIds, individualTesterIds: sortIds(individuals.map(t => t.id)),
      storeVersionId: storeLink === null ? null : storeLink.id,
      groups: groups.sort((a, b) => a.id.localeCompare(b.id)),
      testers: testerIds.map(id => ({id, groupIds: sortIds(groups.filter(g => g.testerIds.includes(id)).map(g => g.id))})),
      appStoreVersions: appStoreVersions.sort((a, b) => a.id.localeCompare(b.id))};
    evidence.complete = true; evidence.completedAt = new Date().toISOString();
    return {snapshot, evidence};
  } catch (cause) {
    const error = new Error('Owner snapshot collection failed; inspect the incomplete read evidence.');
    error.code = cause?.code === 'ERR_ASSERTION' ? 'INVALID_READ_EVIDENCE' : 'READ_FAILED';
    evidence.completedAt = new Date().toISOString();
    // No partial snapshot can be mistaken for complete coverage.
    error.evidence = evidence;
    throw error;
  }
}
