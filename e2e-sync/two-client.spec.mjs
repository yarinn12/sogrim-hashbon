import {test, expect, chromium, webkit, devices} from '@playwright/test';
import {recordBrowserErrors} from './browser-error-recorder.mjs';

// Two separate browser engines, cookies, storage, identities and caches.
// All remote traffic is intercepted. The fake backend implements CAS and
// identity-scoped reads, NOT real PostgreSQL triggers, RLS or push delivery.
const origin = 'https://two-client-fixture.supabase.co';
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const eventId = 'two-client-event', sharedId = 'two-client-canonical';
const key = 'isolated-test-space-key-abcdefghijklmnopqrstuvwxyz';
const headers = {'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, prefer, x-space-key',
  'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS'};

async function fixture(testInfo, {withExpense = false, withAccountLink = false, withInterruptedLink = false, withCompetingLinks = false, joiningClient = null} = {}) {
  const browsers = [];
  const contexts = [], pages = [], errors = [], networkDiagnostics = [], unexpectedWrites = [], writes = [], requests = [], linkLogs = [];
  const blocked = new Set();
  const workspaceFailures = new Map();
  const membershipReadHolds = new Map();
  const accountLinkWriteHolds = new Map();
  const inviteFailures = new Set(), inviteHolds = new Map(), inviteRequests = [];
  let barrier = null, conflicts = 0, rejectedSiblingWrites = 0;
  let clock = Date.now() - 60_000;
  const stamp = () => new Date(clock = Math.max(Date.now(), clock + 1)).toISOString();
  const version = new Date(clock).toISOString();
  const participants = ids.map((id, i) => ({id: `account-${id}`, displayName: i ? 'בודק אייפון' : 'בודק אנדרואיד',
    kind: 'user', accountLinked: true, avatarPreset: 'avatar-1', profileUpdatedAt: version}));
  const event = {id: eventId, name: 'בדיקה מבודדת בשני מכשירים', eventType: 'standard', currency: 'ILS',
    participantIds: participants.map(p => p.id), adminIds: [participants[0].id],
    createdByParticipantId: participants[0].id, createdAt: version, updatedAt: version,
    statusUpdatedAt: version, settingsUpdatedAt: version, adminsCanEditOnly: false,
    locked: false, roundSettlementTransfers: false, directSettlementTransfers: false,
    notes: [], deletedNotes: [], expenses: [], transfers: [], activityLog: []};
  if (withExpense) event.expenses.push({id:'seed-expense',name:'הוצאה לבדיקת הגדרות',total:12000,
    payers:[{participantId:participants[0].id,amount:12000}], sharedByParticipantIds:participants.map(p=>p.id),
    createdByParticipantId:participants[0].id,updatedAt:version,kind:'shared'});
  if (withAccountLink) {
    const guest = {id:'guest-existing-person',displayName:'אורח לפני חיבור',kind:'guest'};
    participants.push(guest); event.participantIds.push(guest.id);
    event.expenses.push({id:'guest-expense',name:'הוצאה של האורח',total:9000,
      payers:[{participantId:guest.id,amount:9000}],sharedByParticipantIds:[participants[0].id,guest.id],
      createdByParticipantId:guest.id,updatedAt:version,kind:'shared'});
  }
  if (withCompetingLinks) event.adminIds = ids.map(id => `account-${id}`);
  if (joiningClient !== null) {
    event.participantIds = participants.filter((_, i) => i !== joiningClient).map(p => p.id);
    event.adminIds = [...event.participantIds];
    event.createdByParticipantId = event.adminIds[0];
  }
  const canonical = {id: sharedId, snapshot_kind: 'shared_event', updated_at: version,
    state: {currentParticipantId: '', participants, groups: [], events: [structuredClone(event)], deletedParticipants: []}};
  const personal = ids.map((id, i) => ({id: `two-client-workspace-${i}`, updated_at: version,
    state: {currentParticipantId: `account-${id}`, participants: structuredClone(participants),
      groups: [], friendContacts: [], deletedEvents: [], deletedParticipants: [],
      events: [{...structuredClone(event), sharedSpaceId: sharedId, sharedSpaceKey: key}]}}));
  if (joiningClient !== null) personal[joiningClient].state.events = [];
  const sibling = withAccountLink && !withCompetingLinks ? {id:'unrelated-pending-space',snapshot_kind:'shared_event',updated_at:version,
    state:{currentParticipantId:'',participants:structuredClone(participants),groups:[],deletedParticipants:[],events:[{
      ...structuredClone(event),id:'unrelated-pending-event',name:'אירוע אחר שלא הסתנכרן',expenses:[],notes:[],transfers:[]}]}} : null;
  if (sibling) {
    const changed = {...structuredClone(sibling.state.events[0]),sharedSpaceId:sibling.id,sharedSpaceKey:key};
    changed.notes=[{id:'keep-pending-note',title:'שינוי ישן שנשאר בתור',body:'לא למחוק',createdAt:stamp(),updatedAt:stamp(),
      createdByParticipantId:participants[0].id,updatedByParticipantId:participants[0].id}];
    personal[0].state.events.push(changed);
  }
  const baseURL = testInfo.project.use.baseURL;
  const close = async () => {
    barrier?.release();
    for(const hold of membershipReadHolds.values()) hold.release();
    for(const hold of accountLinkWriteHolds.values()) hold.release();
    for(const hold of inviteHolds.values()) hold.release();
    // Playwright Test already traces these contexts through the shared config.
    await Promise.all(browsers.map(browser => browser.close()));
    if(networkDiagnostics.length) console.log(JSON.stringify({kind:'expected-fixture-network-diagnostics',diagnostics:networkDiagnostics}));
  };
  try {
  for (let i = 0; i < 2; i++) {
    browsers.push(await (i ? webkit : chromium).launch());
    const context = await browsers[i].newContext({...devices[i ? 'iPhone 13' : 'Pixel 5'],
      baseURL, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', reducedMotion: 'reduce', serviceWorkers: 'block'});
    contexts.push(context);
    const failedUrls=new Set();
    // WebKit's context-level offline switch can reject a request before route()
    // runs. Record only this client's deliberately disconnected requests so its
    // native network diagnostic is handled by the existing exact-URL guard.
    // Real error/unhandledrejection events remain unconditional test failures.
    const rememberOfflineRequest=request=>{
      if(blocked.has(i) && new URL(request.url()).origin===origin)failedUrls.add(request.url());
    };
    context.on('request',rememberOfflineRequest);
    context.on('requestfailed',rememberOfflineRequest);
    await recordBrowserErrors(context,{client:i,errors,diagnostics:networkDiagnostics,failedUrls});
    const user = {id: ids[i], email: `qa-${i}@example.test`, app_metadata: {provider: 'google'},
      user_metadata: {full_name: participants[i].displayName, username: `two_client_${i}`,
        account_space_id: personal[i].id, account_space_key: key}};
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      const reply = (json, status = 200) => route.fulfill({headers, json, status});
      if (url.origin === new URL(baseURL).origin) {
        if (url.pathname === '/api/config') return reply({publicUrl: baseURL, launch: {cloudStorageReady: true,authEmailDeliveryReady:true},
          storage: {mode: 'supabase', url: origin, anonKey: 'fixture-anon', table: 'app_snapshots'}});
        if (joiningClient !== null && url.pathname === '/api/event-invites/redeem') {
          const body=request.postDataJSON();
          if(request.headers().authorization !== `Bearer fixture-token-${i}`) return reply({code:'EVENT_INVITE_AUTH_REQUIRED'},401);
          if(body.eventId !== eventId || body.token !== 'a'.repeat(64)) return reply({code:'EVENT_INVITE_REVOKED'},410);
          inviteRequests.push({client:i,body});
          const hold=inviteHolds.get(i);
          if(hold){hold.arrived=true;await hold.ready;inviteHolds.delete(i);}
          if(inviteFailures.has(i))return reply({code:'EVENT_MEMBERSHIP_INDEX_PENDING',retryable:true},503);
          // Model the SQL transaction, verified independently in databaseIntegrity:
          // canonical membership and personal discovery commit before the response.
          const event=canonical.state.events[0], participantId=`account-${ids[i]}`;
          if(!event.participantIds.includes(participantId)) {
            event.participantIds.push(participantId);
            event.membershipUpdatedAt=stamp();
            event.membershipUpdatedAtByParticipant={...event.membershipUpdatedAtByParticipant,[participantId]:event.membershipUpdatedAt};
            canonical.updated_at=stamp();
          }
          if(!personal[i].state.events.some(item=>item.id===eventId)) {
            personal[i].state.events.push({...structuredClone(event),sharedSpaceId:sharedId,sharedSpaceKey:key});
            personal[i].updated_at=stamp();
          }
          return reply({eventId,spaceId:sharedId,spaceKey:key,kind:'open',atomic:true});
        }
        if (url.pathname.startsWith('/api/notifications/') || url.pathname === '/api/product-metrics') return reply({ok: true});
        if (url.pathname.startsWith('/api/') && !['/api/health'].includes(url.pathname)) {
          if (request.method() !== 'GET') unexpectedWrites.push({client: i, path: url.pathname});
          return reply({ok: true});
        }
        return route.continue();
      }
      if (url.origin !== origin) return route.abort('blockedbyclient');
      if (blocked.has(i)) {
        failedUrls.add(request.url());
        return route.abort('internetdisconnected');
      }
      failedUrls.delete(request.url());
      if (request.method() === 'OPTIONS') return route.fulfill({status: 204, headers});
      requests.push({client: i, method: request.method(), path: url.pathname, at: performance.now()});
      if(joiningClient !== null && url.pathname === '/auth/v1/settings')return reply({external:{email:true,google:false,apple:false}});
      if(joiningClient !== null && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
        const body=request.postDataJSON();
        if(body.email !== user.email || body.password !== 'Synthetic-password-123!')return reply({message:'Invalid login credentials'},400);
        return reply({access_token:`fixture-token-${i}`,refresh_token:`fixture-refresh-${i}`,expires_in:3600,user});
      }
      if (request.headers().authorization !== `Bearer fixture-token-${i}`) return reply({message: 'Authentication required'}, 401);
      if (url.pathname === '/auth/v1/user') return reply(user);
      if (url.pathname.endsWith('/ensure_account_workspace')) return reply({status: 'existing', workspaceId: personal[i].id});
      if (url.pathname.endsWith('/join_shared_event')) return reply(canonical.state.events[0].participantIds.includes(`account-${ids[i]}`));
      // These auxiliary RPCs are outside the sync journey but are invoked at
      // startup/expense save. Explicit inert fixtures, not a blanket write allowlist.
      if (url.pathname.endsWith('/get_referral_program_status')) return reply({status: 'unavailable'});
      if (url.pathname.endsWith('/qualify_referral')) return reply({status: 'unavailable'});
      // Opening an invitation exercises the slower authenticated bootstrap,
      // which verifies the existing username in addition to normal sync RPCs.
      if (joiningClient !== null && url.pathname.endsWith('/set_friend_username')) {
        const body=request.postDataJSON();
        if(body.p_username !== `two_client_${i}`) {unexpectedWrites.push({client:i,path:url.pathname,body});return reply({},400);}
        return reply({user_id:ids[i],username:`two_client_${i}`});
      }
      if (url.pathname.endsWith('/user_profiles')) {
        return reply(ids.map((id, index) => ({user_id: id, display_name: participants[index].displayName,
          username: `two_client_${index}`, username_customized: false, avatar_preset: 'avatar-1',
          avatar_image: null, avatar_image_updated_at: null, updated_at: version}))
          .filter(p => !url.searchParams.get('user_id')?.startsWith('eq.') || url.searchParams.get('user_id') === `eq.${p.user_id}`));
      }
      if (url.pathname.endsWith('/update_shared_event_snapshot')) {
        const body = request.postDataJSON();
        const linkHold = accountLinkWriteHolds.get(i);
        if (linkHold && body.p_snapshot_id === sharedId && body.p_state.events[0].participantAccountLinks?.length) {
          linkHold.arrived = true;
          await linkHold.ready;
          accountLinkWriteHolds.delete(i);
        }
        if (sibling && body.p_snapshot_id === sibling.id) {
          rejectedSiblingWrites++;
          return reply({code:'42501',message:'Synthetic unrelated event rejects its pending edit'},403);
        }
        if (barrier) {
          const current = barrier;
          if (++current.arrivals === 2) { barrier = null; current.release(); }
          await current.ready;
        }
        if (body.p_snapshot_id !== sharedId) return reply({message: 'Unexpected snapshot'}, 403);
        if (body.p_expected_updated_at !== canonical.updated_at) { conflicts++; return reply({status: 'conflict'}); }
        canonical.state = structuredClone(body.p_state); canonical.updated_at = stamp();
        writes.push({client: i, at: performance.now(), version: canonical.updated_at, event: structuredClone(canonical.state.events[0])});
        return reply({status: 'updated', updatedAt: canonical.updated_at});
      }
      if (url.pathname.endsWith('/app_snapshots')) {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '');
        if (request.method() === 'GET') {
          const readable=canonical.state.events[0].participantIds.includes(`account-${ids[i]}`);
          const rows = url.searchParams.has('snapshot_kind') ? [...(readable?[canonical]:[]),...(sibling && i===0 ? [sibling] : [])]
            : id === sharedId ? (readable?[canonical]:[]) : sibling && id === sibling.id && i===0 ? [sibling]
            : id === personal[i].id ? [personal[i]] : [];
          const fields = (url.searchParams.get('select') || 'id,state,updated_at').split(',');
          const responseRows = rows.map(row => Object.fromEntries(fields.map(field => [field, structuredClone(row[field])])));
          const hold = url.searchParams.has('snapshot_kind') && membershipReadHolds.get(i);
          if(hold && !hold.arrived) {
            hold.arrived = true;
            await hold.ready;
            membershipReadHolds.delete(i);
          }
          return reply(responseRows);
        }
        const body = request.postDataJSON();
        if (id && id !== personal[i].id) return reply({message: 'Wrong workspace'}, 403);
        if (workspaceFailures.has(i)) return reply({message:'Synthetic personal workspace receipt failure'},workspaceFailures.get(i));
        const expected = url.searchParams.get('updated_at')?.replace(/^eq\./, '');
        if (expected && expected !== personal[i].updated_at) return reply([]);
        personal[i].state = structuredClone(body.state); personal[i].updated_at = body.updated_at || stamp();
        return reply([{updated_at: personal[i].updated_at}]);
      }
      if (request.method() === 'GET') return reply([]);
      unexpectedWrites.push({client: i, path: url.pathname});
      return reply({message: 'Unimplemented write'}, 501);
    });
    await context.addInitScript(({user, initial, spaceId, key, i, seedPending, seedLink, appOrigin}) => {
      if(location.origin !== appOrigin) return;
      if (localStorage.getItem('two-client-seeded')) return;
      localStorage.setItem('two-client-seeded', '1');
      localStorage.setItem('settle-friends-account-session', JSON.stringify({access_token: `fixture-token-${i}`,
        refresh_token: `fixture-refresh-${i}`, expires_at: Math.floor(Date.now()/1000)+3600, user}));
      localStorage.setItem('settle-friends-cloud-space', spaceId);
      localStorage.setItem(`settle-friends-cloud-key:${spaceId}`, key);
      localStorage.setItem(`settle-friends-state:${spaceId}`, JSON.stringify(initial));
      if(seedPending) localStorage.setItem(`settle-friends-pending-sync:${spaceId}`,JSON.stringify(initial));
      if(seedLink) localStorage.setItem('settle-friends-pending-account-links',JSON.stringify([seedLink]));
      localStorage.setItem(`settle-friends-current-participant:account:${user.id}`, `account-${user.id}`);
      localStorage.setItem(`settle-friends-local-profile:account:${user.id}`, JSON.stringify({participantId: `account-${user.id}`,
        displayName: user.user_metadata.full_name, username: user.user_metadata.username, avatarPreset: 'avatar-1',
        authProvider: 'google', authSubject: user.id, email: user.email}));
      sessionStorage.setItem('settle-friends-skip-next-splash', '1');
    }, {user, initial: personal[i].state, spaceId: personal[i].id, key, i,appOrigin:new URL(baseURL).origin,seedPending:Boolean(sibling)&&i===0,
      seedLink:withInterruptedLink&&i===0?{ownerUserId:ids[0],eventId,sourceParticipantId:'guest-existing-person',
        targetParticipantId:`account-${ids[1]}`,linkedAt:'2026-08-01T00:00:00.000Z'}:null});
    const page = await context.newPage(); pages.push(page);
    if(withAccountLink) page.on('console',message=>{
      if(/account-link|sync\]|save failed/i.test(message.text())) linkLogs.push({client:i,type:message.type(),message:message.text().slice(0,600)});
    });
    await page.goto('/');
    await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
    if(i===joiningClient) {
      await expect(page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`)).toHaveCount(0);
      continue;
    }
    await expect(page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first()).toBeVisible();
    await page.screenshot({path: testInfo.outputPath(`startup-${i}.png`)});
    await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
    await expect(page.locator('[data-action="open-event-notes"]')).toBeVisible();
  }
  return {pages, contexts, canonical, personal, writes, requests, errors, unexpectedWrites, linkLogs, inviteRequests,
    failInvites(i, fail) {if(fail)inviteFailures.add(i);else inviteFailures.delete(i);},
    holdNextInvite(i) {let release;const ready=new Promise(resolve=>{release=resolve;});
      const hold={arrived:false,ready,release};inviteHolds.set(i,hold);return hold;},
    get conflicts() { return conflicts; },
    get rejectedSiblingWrites() { return rejectedSiblingWrites; },
    holdNextAccountLinkWrite(i) {
      let release; const ready = new Promise(resolve=>{release=resolve;});
      const hold = {arrived:false,ready,release}; accountLinkWriteHolds.set(i,hold); return hold;
    },
    holdNextMembershipRead(i) {
      let release; const ready = new Promise(resolve=>{release=resolve;});
      const hold = {arrived:false,ready,release}; membershipReadHolds.set(i,hold); return hold;
    },
    collideNextWrites() {
      let release; const ready = new Promise(resolve => { release = resolve; });
      barrier = {arrivals:0, release, ready};
    },
    async offline(i, value) { if(value) blocked.add(i); else blocked.delete(i); await contexts[i].setOffline(value); },
    cloudUnavailable(i, value) { if (value) blocked.add(i); else blocked.delete(i); },
    failWorkspace(i, status) { if (status) workspaceFailures.set(i,status); else workspaceFailures.delete(i); },
    close };
  } catch (error) {
    await close();
    throw error;
  }
}

async function newNote(page, title, body) {
  await page.locator('[data-action="new-event-note"]').click();
  await page.locator('[data-action="event-note-title"]').fill(title);
  await page.locator('[data-action="event-note-body"]').fill(body);
}
const saveNote = page => page.locator('[data-action="save-event-note"]').click();
const noteCard = (page, id) => page.locator(`.event-note-open[data-note-id="${id}"]`);

async function newExpense(page, name, amount) {
  await page.locator(`[data-action="show-expense-form"][data-event-id="${eventId}"]`).first().click();
  await page.locator('[data-action="expense-total"]').fill(amount);
  await page.locator('[data-action="expense-step-next"]').click();
  await page.locator('[data-action="expense-name"]').fill(name);
  for (let step = 0; step < 3; step++) await page.locator('[data-action="expense-step-next"]').click();
  await page.locator('[data-action="save-expense"]').click();
  await expect(page.locator('.expense-row').filter({hasText:name})).toHaveCount(1);
}

async function storedEvent(page, spaceId) {
  return page.evaluate(({spaceId,eventId}) => JSON.parse(localStorage.getItem(`settle-friends-state:${spaceId}`))?.events?.find(event => event.id === eventId), {spaceId,eventId});
}

for(const joiningClient of [0,1]) {
  test(`a new member joins from ${joiningClient?'iPhone':'Android'}, writes offline and remains visible after restart`,async({},testInfo)=>{
    const f=await fixture(testInfo,{joiningClient}),joiner=f.pages[joiningClient],host=f.pages[1-joiningClient];
    try {
      await joiner.waitForLoadState('networkidle');
      await joiner.goto(`/i/${eventId}/t/${'a'.repeat(64)}`);
      await expect(joiner.locator('[data-action="open-event-notes"]')).toBeVisible();
      expect(f.errors,'join navigation must not raise application errors').toEqual([]);
      expect(f.canonical.state.events[0].participantIds.filter(id=>id===`account-${ids[joiningClient]}`)).toHaveLength(1);
      // This case disconnects after the join finishes; interrupted membership
      // reads and late commits have separate recovery scenarios below.
      await expect.poll(()=>joiner.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-pending-event-joins')||'[]').length)).toBe(0);
      await joiner.waitForLoadState('networkidle');
      await f.offline(joiningClient,true);
      await newExpense(joiner,'הוצאה אחרי הצטרפות ללא חיבור','17');
      expect(f.errors,'offline expense must not raise application errors').toEqual([]);
      await f.offline(joiningClient,false);
      await expect(host.locator('.expense-row')).toContainText('הוצאה אחרי הצטרפות ללא חיבור');
      await expect.poll(()=>f.personal[joiningClient].state.events[0]?.expenses.length).toBe(1);
      await joiner.waitForLoadState('networkidle');
      expect(f.errors,'reconnection must not raise application errors').toEqual([]);
      await joiner.reload();
      // A cleaned invitation retains its event destination across reload.
      await expect(joiner.locator('.expense-row')).toContainText('הוצאה אחרי הצטרפות ללא חיבור');
      await joiner.waitForLoadState('networkidle');
      expect(f.errors,'reload must not raise application errors').toEqual([]);
      await joiner.goto('/');
      await expect(joiner.locator('[data-screen-kind="home"]')).toBeVisible();
      await joiner.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
      await expect(joiner.locator('.expense-row')).toContainText('הוצאה אחרי הצטרפות ללא חיבור');
      await expect.poll(()=>joiner.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-pending-event-joins')||'[]').length)).toBe(0);
      expect(f.canonical.state.events[0].expenses).toHaveLength(1);
      expect(f.errors).toEqual([]);expect(f.unexpectedWrites).toEqual([]);
    } finally {await f.close();}
  });
}

for(const joiningClient of [0,1]) {
  test(`a signed-out invite opens login and completes membership on ${joiningClient?'iPhone':'Android'}`,async({},testInfo)=>{
    const f=await fixture(testInfo,{joiningClient}),joiner=f.pages[joiningClient];
    try {
      await joiner.evaluate(()=>localStorage.removeItem('settle-friends-account-session'));
      await joiner.goto(`/i/${eventId}/t/${'a'.repeat(64)}`);
      const gate=joiner.locator('#public-account-auth-gate');
      await expect(gate).toBeVisible();
      expect(f.inviteRequests).toHaveLength(0);
      expect(f.canonical.state.events[0].participantIds).not.toContain(`account-${ids[joiningClient]}`);
      await gate.locator('input[name="email"]').fill(`qa-${joiningClient}@example.test`);
      await gate.locator('input[name="password"]').fill('Synthetic-password-123!');
      await gate.locator('button[type="submit"]').click();
      await expect(gate).toHaveCount(0);
      await expect(joiner.locator('[data-action="open-event-notes"]')).toBeVisible();
      expect(f.canonical.state.events[0].participantIds.filter(id=>id===`account-${ids[joiningClient]}`)).toHaveLength(1);
      await expect.poll(()=>joiner.evaluate(()=>localStorage.getItem('sogrim-pending-invite-handoff-v1'))).toBe(null);
      expect(f.personal[joiningClient].state.events).toHaveLength(1);
      expect(f.errors).toEqual([]);expect(f.unexpectedWrites).toEqual([]);
    } finally {await f.close();}
  });
}

test('an invitation survives a temporary membership-index failure during iPhone account login and joins automatically',async({},testInfo)=>{
  const f=await fixture(testInfo,{joiningClient:1}),joiner=f.pages[1];
  try {
    f.failInvites(1,true);
    await joiner.goto(`/i/${eventId}/t/${'a'.repeat(64)}`);
    await expect(joiner.locator('#app .screen')).toBeVisible();
    // Observe the completed login branch, not the handoff stored before login.
    // Otherwise an early assertion can pass before the old code deletes it.
    await expect(joiner.locator('html')).not.toHaveClass(/account-auth-pending|account-auth-locked/);
    await expect.poll(()=>f.inviteRequests.length).toBeGreaterThan(0);
    await expect.poll(()=>joiner.evaluate(()=>Boolean(localStorage.getItem('sogrim-pending-invite-handoff-v1')))).toBe(true);
    expect(f.canonical.state.events[0].participantIds).not.toContain(`account-${ids[1]}`);
    f.failInvites(1,false);
    await joiner.evaluate(()=>window.dispatchEvent(new Event('online')));
    await expect.poll(()=>f.canonical.state.events[0].participantIds).toContain(`account-${ids[1]}`);
    await expect.poll(()=>joiner.evaluate(()=>localStorage.getItem('sogrim-pending-invite-handoff-v1'))).toBe(null);
    await expect(joiner.locator(`[data-action="open-event"][data-event-id="${eventId}"], [data-action="open-event-notes"]`).first()).toBeVisible();
    await joiner.goto('/');
    await expect(joiner.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first()).toBeVisible();
    expect(f.personal[1].state.events.filter(event=>event.id===eventId)).toHaveLength(1);
    expect(f.errors).toEqual([]);expect(f.unexpectedWrites).toEqual([]);
  } finally {await f.close();}
});

test('cancelling a manual join leaves home visible when the committed server response arrives later',async({},testInfo)=>{
  const f=await fixture(testInfo,{joiningClient:1}),joiner=f.pages[1];
  try {
    const hold=f.holdNextInvite(1);
    // The current home exposes link entry through external invitations. Exercise
    // the retained manual handler with a synthetic launch control, then use its
    // real form, submit and cancel controls (no application functions replaced).
    await joiner.evaluate(()=>{
      const launch=document.createElement('button');launch.dataset.action='join-event-screen';
      launch.textContent='QA manual join entry';document.querySelector('#app').append(launch);
    });
    await joiner.locator('[data-action="join-event-screen"]').click();
    await joiner.locator('[data-action="join-event-link"]').fill(`${testInfo.project.use.baseURL}/i/${eventId}/t/${'a'.repeat(64)}`);
    await joiner.locator('[data-action="join-existing-event"]').click();
    await expect.poll(()=>hold.arrived).toBe(true);
    await joiner.locator('[data-action="cancel-join-event"]').click();
    hold.release();
    await expect.poll(()=>f.canonical.state.events[0].participantIds).toContain(`account-${ids[1]}`);
    await expect.poll(()=>joiner.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-pending-event-joins')||'[]').length)).toBe(0);
    await expect(joiner.locator('[data-screen-kind="home"]')).toBeVisible();
    await expect(joiner.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first()).toBeVisible();
    expect(f.errors).toEqual([]);expect(f.unexpectedWrites).toEqual([]);
  } finally {await f.close();}
});

test('a user can save an expense while interrupted-join recovery has an older membership read in flight',async ({},testInfo)=>{
  const f=await fixture(testInfo),[a,b]=f.pages;
  try {
    await a.waitForLoadState('networkidle');
    const held=f.holdNextMembershipRead(0);
    await a.evaluate(({owner,eventId})=>{
      localStorage.setItem('settle-friends-pending-event-joins',JSON.stringify([{ownerUserId:owner,eventId,queuedAt:new Date().toISOString()}]));
      document.dispatchEvent(new Event('settle-friends:pending-join'));
    },{owner:ids[0],eventId});
    await expect.poll(()=>held.arrived).toBe(true);
    await newExpense(a,'הוצאה בזמן התאוששות הצטרפות','12.34');
    held.release();
    await expect(b.locator('.expense-row')).toContainText('הוצאה בזמן התאוששות הצטרפות');
    await expect.poll(()=>a.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-pending-event-joins')||'[]').length),{timeout:15000}).toBe(0);
    for(let i=0;i<2;i++) {
      await expect.poll(()=>storedEvent(f.pages[i],f.personal[i].id).then(event=>event.expenses.map(expense=>expense.total))).toEqual([1234]);
    }
    expect(f.canonical.state.events[0].expenses).toHaveLength(1);
    expect(f.errors).toEqual([]);expect(f.unexpectedWrites).toEqual([]);
  } finally {await f.close();}
});

for (const reconnectOrder of [[0, 1], [1, 0]]) {
  test(`both offline devices preserve expenses and notes when reconnecting ${reconnectOrder.join('-')}`, async ({},testInfo) => {
    const f = await fixture(testInfo);
    try {
      for (let i=0; i<2; i++) await f.offline(i,true);
      for (let i=0; i<2; i++) {
        await newExpense(f.pages[i], `הוצאה אופליין ${i}`, i ? '20.03' : '10.01');
        await f.pages[i].locator('[data-action="open-event-notes"]').click();
        await newNote(f.pages[i], `פתק אופליין ${i}`, `נשמר במכשיר ${i}`);
        await saveNote(f.pages[i]);
      }
      expect(f.canonical.state.events[0].expenses).toHaveLength(0);
      for (const i of reconnectOrder) {
        await f.offline(i,false);
        await expect.poll(() => f.pages[i].evaluate(spaceId => localStorage.getItem(`settle-friends-pending-sync:${spaceId}`),f.personal[i].id)).toBeNull();
      }
      await expect.poll(() => f.canonical.state.events[0].expenses.length).toBe(2);
      const canonical = f.canonical.state.events[0];
      expect(canonical.expenses.map(expense=>expense.total).sort((a,b)=>a-b)).toEqual([1001,2003]);
      expect(new Set(canonical.expenses.map(expense=>expense.id)).size).toBe(2);
      expect(canonical.notes).toHaveLength(2);
      for (let i=0; i<2; i++) {
        await expect.poll(async () => (await storedEvent(f.pages[i],f.personal[i].id))?.expenses.map(expense=>expense.id).sort()).toEqual(canonical.expenses.map(expense=>expense.id).sort());
        for(let j=0;j<2;j++) await expect(f.pages[i].getByText(`פתק אופליין ${j}`,{exact:true})).toBeVisible();
        await f.pages[i].waitForLoadState('networkidle'); await f.pages[i].reload();
        await expect(f.pages[i].locator('[data-screen-kind="home"]')).toBeVisible();
        expect((await storedEvent(f.pages[i],f.personal[i].id)).expenses.reduce((sum,expense)=>sum+expense.total,0)).toBe(3004);
      }
      expect(f.errors).toEqual([]); expect(f.unexpectedWrites).toEqual([]);
    } finally { await f.close(); }
  });
}

test('an offline edit cannot resurrect a note deleted by the other device', async ({},testInfo) => {
  const f = await fixture(testInfo), [a,b] = f.pages;
  try {
    for(const page of f.pages) await page.locator('[data-action="open-event-notes"]').click();
    await newNote(a,'פתק לפני מחיקה','תוכן משותף'); await saveNote(a);
    await expect(b.getByText('פתק לפני מחיקה',{exact:true})).toBeVisible();
    const id=f.canonical.state.events[0].notes[0].id;
    await f.offline(1,true); await noteCard(b,id).click();
    await b.locator('[data-action="event-note-body"]').fill('עריכה במכשיר מנותק');
    await noteCard(a,id).click(); await a.locator('[data-action="request-delete-event-note"]').click();
    await a.locator('[data-action="confirm-important-action"]').click();
    await expect.poll(()=>f.canonical.state.events[0].deletedNotes.some(note=>note.id===id)).toBe(true);
    await saveNote(b); await f.offline(1,false);
    for(const page of f.pages) await expect(noteCard(page,id)).toHaveCount(0);
    await expect.poll(()=>b.evaluate(spaceId=>localStorage.getItem(`settle-friends-pending-sync:${spaceId}`),f.personal[1].id)).toBeNull();
    expect(f.canonical.state.events[0].notes.some(note=>note.id===id)).toBe(false);
    expect(f.canonical.state.events[0].deletedNotes.filter(note=>note.id===id)).toHaveLength(1);
    expect(f.errors).toEqual([]); expect(f.unexpectedWrites).toEqual([]);
  } finally { await f.close(); }
});

test('offline payment confirmation survives peer reopening and preserves the same transfer with undo', async ({},testInfo) => {
  const f=await fixture(testInfo,{withExpense:true}),[a,b]=f.pages;
  const paymentAction = (page, action) => page.locator(`.settlement-transfer-board [data-action="${action}"]`);
  try {
    for(const page of f.pages) await page.locator(`[data-action="settle"][data-event-id="${eventId}"]`).first().click();
    await a.locator('[data-action="close-event"]').first().click();
    await a.locator('[data-action="confirm-close-event"]').click();
    await expect(paymentAction(b,'mark-paid')).toHaveCount(1);
    const original=structuredClone(f.canonical.state.events[0].transfers[0]);
    expect(original.amount).toBe(6000);
    await f.offline(1,true); await paymentAction(b,'mark-paid').click();
    await expect(paymentAction(b,'mark-pending')).toHaveCount(1);
    await a.locator('[data-action="open-event-notes"]').click();
    await expect(a.getByRole('button',{name:'האירוע סגור',exact:true})).toBeDisabled();
    await a.locator(`[data-action="settle"][data-event-id="${eventId}"]`).first().click();
    await a.locator('[data-action="reopen-event"]').first().click();
    await a.locator('[data-action="confirm-important-action"]').click();
    await a.locator('[data-action="open-event-notes"]').click();
    await newNote(a,'פתק בזמן תשלום אופליין','הסכום נשמר'); await saveNote(a);
    await f.offline(1,false);
    await expect.poll(()=>f.canonical.state.events[0].transfers.find(t=>t.id===original.id)?.status).toBe('paid');
    expect(f.canonical.state.events[0].transfers.filter(t=>t.id===original.id)).toHaveLength(1);
    expect(f.canonical.state.events[0].transfers.find(t=>t.id===original.id).amount).toBe(6000);
    await expect.poll(()=>storedEvent(b,f.personal[1].id).then(event=>event.notes.some(n=>n.title==='פתק בזמן תשלום אופליין'))).toBe(true);
    await a.locator(`[data-action="settle"][data-event-id="${eventId}"]`).first().click();
    await expect(paymentAction(a,'mark-pending')).toHaveCount(1);
    await paymentAction(a,'mark-pending').click();
    await expect.poll(()=>f.canonical.state.events[0].transfers.find(t=>t.id===original.id)?.status).toBe('pending');
    await a.locator('[data-action="close-event"]').first().click();
    await a.locator('[data-action="confirm-close-event"]').click();
    await expect(paymentAction(b,'mark-paid')).toHaveCount(1);
    expect(f.canonical.state.events[0].transfers.find(t=>t.id===original.id).amount).toBe(6000);
    expect(f.errors).toEqual([]); expect(f.unexpectedWrites).toEqual([]);
  } finally { await f.close(); }
});

test('an interrupted link recovers at a new time and is confirmed on both devices',async ({},testInfo)=>{
  const f=await fixture(testInfo,{withAccountLink:true,withInterruptedLink:true});
  const [a,b]=f.pages,guest='guest-existing-person',target=`account-${ids[1]}`;
  try {
    await expect.poll(()=>a.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-pending-account-links')||'[]').length)).toBe(0);
    await expect.poll(()=>f.canonical.state.events[0].participantIds.includes(guest)).toBe(false);
    expect(f.canonical.state.events[0].expenses[0].payers).toEqual([{participantId:target,amount:9000}]);
    const proof=f.canonical.state.events[0].participantAccountLinks.find(link=>link.sourceParticipantId===guest);
    expect(proof.linkedAt).not.toBe('2026-08-01T00:00:00.000Z');
    for(const page of [a,b]) {
      await page.locator(`[data-action="open-event-participants"][data-event-id="${eventId}"]`).click();
      await expect(page.getByText('אורח לפני חיבור',{exact:true})).toHaveCount(0);
      await expect(page.getByText('בודק אייפון',{exact:true})).toBeVisible();
    }
    await a.reload();
    await expect(a.locator('[data-screen-kind="home"]')).toBeVisible();
    expect(await a.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-pending-account-links')||'[]'))).toEqual([]);
    const oldIntent=await a.evaluate(spaceId=>JSON.parse(localStorage.getItem(`settle-friends-pending-sync:${spaceId}`)),f.personal[0].id);
    expect(oldIntent.events.find(e=>e.id==='unrelated-pending-event').notes[0].body).toBe('לא למחוק');
    expect(f.canonical.state.events[0].participantAccountLinks.filter(link=>link.sourceParticipantId===guest)).toEqual([proof]);
    expect(f.errors).toEqual([]);expect(f.unexpectedWrites).toEqual([]);
  } finally {await f.close();}
});

for (const author of [0,1]) {
  test(`a confirmed note survives a personal receipt failure without a false group warning on ${author?'iPhone':'Android'}`, async ({},testInfo)=>{
    const f=await fixture(testInfo), a=f.pages[author], b=f.pages[1-author];
    const title=`פתק שאושר בשרת ${author}`;
    try {
      for(const page of f.pages) await page.locator('[data-action="open-event-notes"]').click();
      f.failWorkspace(author,403);
      await newNote(a,title,'העותק המשותף נשמר גם כשהעותק האישי מתעכב');
      await saveNote(a);
      await expect(b.getByText(title,{exact:true})).toBeVisible({timeout:10000});
      await expect.poll(()=>a.evaluate(spaceId=>{
        const pending=JSON.parse(localStorage.getItem(`settle-friends-pending-sync:${spaceId}`)||'null');
        return {pending:!!pending,eventIds:pending?.__pendingSync?.selection?.eventIds};
      },f.personal[author].id)).toEqual({pending:true,eventIds:[]});
      await expect(a.locator('[data-inline-sync-status]:visible')).toHaveCount(0);
      const noteId=f.canonical.state.events[0].notes.find(n=>n.title===title).id;
      const writesBeforeRestart=f.writes.filter(w=>w.client===author).length;
      // Restart while the personal receipt is still rejected. The account-level
      // warning remains truthful, but this confirmed group must stay unmarked.
      // This scenario restarts a completed failed delivery, not a transport
      // mid-request. WebKit reports CORS errors for intercepted cross-origin
      // fetches aborted by reload, even in an isolated page with caught fetches.
      // Keep strict page-error assertions; settle the current pass first.
      await a.waitForLoadState('networkidle');
      await a.reload();
      await expect(a.locator('[data-screen-kind="home"]')).toBeVisible();
      await expect(a.locator('[data-inline-sync-status]:visible')).toHaveCount(1);
      await a.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
      await a.locator('[data-action="open-event-notes"]').click();
      await expect(noteCard(a,noteId)).toBeVisible();
      await expect(a.locator('[data-inline-sync-status]:visible')).toHaveCount(0);
      await a.screenshot({path:testInfo.outputPath('confirmed-group-personal-receipt-pending.png')});
      f.failWorkspace(author,0);
      await a.waitForLoadState('networkidle');
      await a.reload();
      await expect.poll(()=>a.evaluate(spaceId=>localStorage.getItem(`settle-friends-pending-sync:${spaceId}`),f.personal[author].id)).toBe(null);
      expect(f.writes.filter(w=>w.client===author)).toHaveLength(writesBeforeRestart);
      expect(f.personal[author].state.events.find(e=>e.id===eventId).notes.filter(n=>n.id===noteId)).toHaveLength(1);
      await expect(noteCard(b,noteId)).toBeVisible();
      expect(f.errors).toEqual([]);expect(f.unexpectedWrites).toEqual([]);
    } finally {await f.close();}
  });
}

test('an account link reaches the other device while an unrelated event remains pending', async ({},testInfo)=>{
  const f=await fixture(testInfo,{withAccountLink:true}),[a,b]=f.pages;
  const guest='guest-existing-person',target=`account-${ids[1]}`;
  try {
    for(const page of f.pages) await page.locator(`[data-action="open-event-participants"][data-event-id="${eventId}"]`).click();
    // The recipient keeps an old event while writing offline. Reconnect must
    // retain that work and the link receipt, including after a process restart.
    await f.offline(1,true);
    await b.getByRole('button',{name:'חזרה לאירוע',exact:true}).click();
    await newExpense(b,'הוצאה שנכתבה לפני האיחוד','12.34');
    await b.locator('[data-action="open-event-notes"]').click();
    await newNote(b,'פתק שנכתב לפני האיחוד','הטיוטה הישנה נשמרת אחרי חיבור החשבון');
    await saveNote(b);
    await b.locator(`[data-action="open-event-participants"][data-event-id="${eventId}"]`).click();
    await a.locator(`[data-action="open-event-participant-profile"][data-participant-id="${guest}"]`).click();
    await a.locator('[data-action="open-event-participant-link"]').click();
    await a.locator(`[data-action="link-offline-participant-account"][data-source-participant-id="${guest}"][data-target-participant-id="${target}"]`).click();
    const confirmation=a.locator('.important-action-dialog[role="alertdialog"]');
    await expect(confirmation).toBeVisible();
    const started=performance.now();await confirmation.locator('[data-action="confirm-important-action"]').click();
    await expect.poll(()=>f.canonical.state.events[0].participantIds.includes(guest),{timeout:12000}).toBe(false);
    await f.offline(1,false);
    await expect.poll(()=>b.evaluate(({spaceId,eventId,guest,target})=>{
      const event=JSON.parse(localStorage.getItem(`settle-friends-state:${spaceId}`))?.events?.find(e=>e.id===eventId);
      return {guestActive:event?.participantIds.includes(guest),targetActive:event?.participantIds.includes(target),
        payer:event?.expenses?.find(e=>e.id==='guest-expense')?.payers?.[0]?.participantId,total:event?.expenses?.find(e=>e.id==='guest-expense')?.total};
    },{spaceId:f.personal[1].id,eventId,guest,target}),{timeout:10000}).toEqual({guestActive:false,targetActive:true,payer:target,total:9000});
    await expect(b.locator(`[data-action="open-event-participant-profile"][data-participant-id="${guest}"]`)).toHaveCount(0);
    await expect.poll(()=>a.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-pending-account-links')||'[]').length)).toBe(0);
    const pending=await a.evaluate(spaceId=>JSON.parse(localStorage.getItem(`settle-friends-pending-sync:${spaceId}`)||'null'),f.personal[0].id);
    expect(pending?.events.find(e=>e.id==='unrelated-pending-event')?.notes.some(n=>n.id==='keep-pending-note')).toBe(true);
    expect(f.rejectedSiblingWrites).toBeGreaterThan(0);
    expect(f.canonical.state.events[0].participantAccountLinks).toEqual(expect.arrayContaining([expect.objectContaining({sourceParticipantId:guest,targetParticipantId:target})]));
    await expect.poll(()=>f.canonical.state.events[0].notes.some(note=>note.title==='פתק שנכתב לפני האיחוד')).toBe(true);
    await expect.poll(()=>f.canonical.state.events[0].expenses.find(expense=>expense.name==='הוצאה שנכתבה לפני האיחוד')?.total).toBe(1234);
    for(const expense of f.canonical.state.events[0].expenses) {
      expect(expense.sharedByParticipantIds).not.toContain(guest);
      expect(expense.payers.some(payer=>payer.participantId===guest)).toBe(false);
    }
    expect(f.canonical.state.events[0].expenses.reduce((sum,expense)=>sum+expense.total,0)).toBe(10234);
    await expect.poll(()=>b.evaluate(spaceId=>localStorage.getItem(`settle-friends-pending-sync:${spaceId}`),f.personal[1].id)).toBeNull();
    await b.waitForLoadState('networkidle');await b.reload();
    await b.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
    await b.locator(`[data-action="open-event-participants"][data-event-id="${eventId}"]`).click();
    await expect(b.locator(`[data-action="open-event-participant-profile"][data-participant-id="${guest}"]`)).toHaveCount(0);
    expect(f.canonical.state.events[0].participantAccountLinks).toEqual(expect.arrayContaining([expect.objectContaining({sourceParticipantId:guest,targetParticipantId:target})]));
    expect(f.errors).toEqual([]);expect(f.unexpectedWrites).toEqual([]);
    for(let i=0;i<2;i++)await f.pages[i].screenshot({path:testInfo.outputPath(`link-final-${i}.png`)});
    console.log(JSON.stringify({kind:'two-browser-account-link-with-pending-sibling',deliveredMs:Math.round(performance.now()-started),rejectedSiblingWrites:f.rejectedSiblingWrites,unrelatedIntentRetained:true}));
  }catch(error){
      console.log(JSON.stringify({linkLogs:f.linkLogs,errors:f.errors,writeCount:f.writes.length,rejectedSiblingWrites:f.rejectedSiblingWrites,
        visibleOwnerText:await a.locator('body').innerText().catch(()=>''),}));
      await a.screenshot({path:testInfo.outputPath('link-failure.png')}).catch(()=>{});
      throw error;
  }finally{
    await f.close();
  }
});

test('two administrators cannot relink the same guest to different accounts during a write race', async ({}, testInfo) => {
  const f = await fixture(testInfo, {withAccountLink:true, withCompetingLinks:true});
  const [a,b] = f.pages, guest = 'guest-existing-person', winner = `account-${ids[1]}`;
  const winnerHold = f.holdNextAccountLinkWrite(0);
  const hold = f.holdNextAccountLinkWrite(1);
  const confirmLink = async (page,target) => {
    await page.locator(`[data-action="open-event-participants"][data-event-id="${eventId}"]`).click();
    await page.locator(`[data-action="open-event-participant-profile"][data-participant-id="${guest}"]`).click();
    await page.locator('[data-action="open-event-participant-link"]').click();
    await page.locator(`[data-action="link-offline-participant-account"][data-target-participant-id="${target}"]`).click();
    await page.locator('.important-action-dialog [data-action="confirm-important-action"]').click();
  };
  try {
    await confirmLink(a, winner);
    await expect.poll(()=>winnerHold.arrived).toBe(true);
    // Prepare the losing decision later, so its expense clock is newer even
    // though the other administrator's link wins the canonical write.
    await confirmLink(b, `account-${ids[0]}`);
    await expect.poll(()=>hold.arrived).toBe(true);
    winnerHold.release();
    await expect.poll(()=>f.canonical.state.events[0].participantAccountLinks?.[0]?.targetParticipantId).toBe(winner);
    hold.release();
    await expect.poll(()=>f.conflicts).toBeGreaterThan(0);
    await expect.poll(()=>b.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-pending-account-links')||'[]').length)).toBe(0);
    await expect.poll(()=>b.evaluate(spaceId=>localStorage.getItem(`settle-friends-pending-sync:${spaceId}`),f.personal[1].id)).toBeNull();
    for (const write of f.writes.filter(write=>write.event.participantAccountLinks?.length)) {
      expect(write.event.participantAccountLinks[0].targetParticipantId).toBe(winner);
      expect(write.event.expenses.find(expense=>expense.id==='guest-expense').payers[0].participantId).toBe(winner);
    }
    // Reload the rejected device and verify the accepted decision is what the
    // participant sees, with no rejected identity or durable retry left behind.
    await b.reload();
    await b.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
    await b.locator(`[data-action="open-event-participants"][data-event-id="${eventId}"]`).click();
    await expect(b.locator(`[data-action="open-event-participant-profile"][data-participant-id="${guest}"]`)).toHaveCount(0);
    await expect.poll(()=>b.evaluate(({spaceId,eventId})=>{
      const event=JSON.parse(localStorage.getItem(`settle-friends-state:${spaceId}`)).events.find(event=>event.id===eventId);
      return {target:event.participantAccountLinks?.[0]?.targetParticipantId,payer:event.expenses[0].payers[0].participantId,total:event.expenses[0].total};
    },{spaceId:f.personal[1].id,eventId})).toEqual({target:winner,payer:winner,total:9000});
    expect(f.errors).toEqual([]); expect(f.unexpectedWrites).toEqual([]);
  } catch (error) {
    console.log(JSON.stringify({linkLogs:f.linkLogs,errors:f.errors,conflicts:f.conflicts,
      canonicalLink:f.canonical.state.events[0].participantAccountLinks,
      canonicalPayers:f.canonical.state.events[0].expenses.map(expense=>expense.payers)}));
    throw error;
  } finally { winnerHold.release(); hold.release(); await f.close(); }
});

test('Android-profile Chromium and iPhone-profile WebKit note UIs deliver create, peer edit, offline recovery and delete', async ({}, testInfo) => {
  const f = await fixture(testInfo), [a, b] = f.pages, timings = [];
  const measure = (name, start) => timings.push({name, milliseconds: Math.round(performance.now()-start)});
  try {
    for (const page of f.pages) await page.locator('[data-action="open-event-notes"]').click();
    await newNote(a, 'פתק מאנדרואיד', 'גרסה ראשונה');
    let started = performance.now(); await saveNote(a);
    await expect(b.getByText('פתק מאנדרואיד', {exact: true})).toBeVisible({timeout: 5000});
    measure('android-save-to-iphone-note', started);
    const id = f.canonical.state.events[0].notes.find(note => note.title==='פתק מאנדרואיד').id;
    await noteCard(b, id).click();
    await b.locator('[data-action="event-note-body"]').fill('עריכה מהאייפון');
    started = performance.now(); await saveNote(b);
    await expect(noteCard(a, id)).toContainText('עריכה מהאייפון', {timeout: 5000});
    measure('iphone-edit-to-android-note', started);
    await f.offline(1, true);
    await newNote(b, 'פתק ללא רשת', 'טיוטה באייפון'); await saveNote(b);
    await expect(b.locator('.event-note-modal')).toHaveCount(0);
    await expect(b.locator('[data-inline-sync-status]:visible')).toHaveCount(0);
    expect(await b.evaluate(() => Object.keys(localStorage).some(key => key.includes('pending-sync') && localStorage.getItem(key).includes('טיוטה באייפון')))).toBe(true);
    expect(f.canonical.state.events[0].notes.some(note => note.title==='פתק ללא רשת')).toBe(false);
    started = performance.now(); await f.offline(1, false);
    await expect(a.getByText('פתק ללא רשת', {exact: true})).toBeVisible({timeout: 8000});
    measure('reconnect-iphone-offline-note-to-android', started);
    await expect.poll(() => b.evaluate(spaceId => localStorage.getItem(`settle-friends-pending-sync:${spaceId}`), f.personal[1].id)).toBeNull();
    expect(f.canonical.state.events[0].notes.filter(note => note.title==='פתק ללא רשת')).toHaveLength(1);
    await noteCard(a, id).click();
    await a.locator('[data-action="request-delete-event-note"]').click();
    started = performance.now(); await a.locator('[data-action="confirm-important-action"]').click();
    await expect(noteCard(b, id)).toHaveCount(0, {timeout: 5000});
    measure('android-note-delete-to-iphone', started);
    expect(f.canonical.state.events[0].deletedNotes.filter(note => note.id===id)).toHaveLength(1);
    expect(f.errors).toEqual([]); expect(f.unexpectedWrites).toEqual([]);
    for (let i=0; i<2; i++) await f.pages[i].screenshot({path: testInfo.outputPath(`notes-final-${i}.png`)});
  } finally {
    console.log(JSON.stringify({kind: 'two-browser-ui-synthetic-backend', timings,
      canonicalWrites: f.writes.length, unexpectedWrites: f.unexpectedWrites, errors: f.errors}));
    await f.close();
  }
});

test('concurrent note field edits converge after an actual compare-and-swap conflict', async ({}, testInfo) => {
  const f=await fixture(testInfo), [a,b]=f.pages;
  try {
    for(const page of f.pages) await page.locator('[data-action="open-event-notes"]').click();
    await newNote(a,'כותרת מקורית','תוכן מקורי'); await saveNote(a);
    await expect(b.getByText('כותרת מקורית',{exact:true})).toBeVisible();
    const id=f.canonical.state.events[0].notes[0].id;
    for(let i=0;i<2;i++) await expect.poll(()=>f.pages[i].evaluate(spaceId=>localStorage.getItem(`settle-friends-pending-sync:${spaceId}`),f.personal[i].id)).toBeNull();
    await noteCard(a,id).click(); await noteCard(b,id).click();
    await a.locator('[data-action="event-note-title"]').fill('כותרת מאנדרואיד');
    await b.locator('[data-action="event-note-body"]').fill('תוכן מהאייפון');
    f.collideNextWrites();
    const started=performance.now(); await Promise.all([saveNote(a),saveNote(b)]);
    for(const page of f.pages) {
      await expect(page.locator('.event-note-modal')).toHaveCount(0);
      await expect(noteCard(page,id)).toContainText('כותרת מאנדרואיד');
      await expect(noteCard(page,id)).toContainText('תוכן מהאייפון');
    }
    expect(f.conflicts).toBeGreaterThan(0);
    expect(f.canonical.state.events[0].notes).toHaveLength(1);
    expect(f.errors).toEqual([]); expect(f.unexpectedWrites).toEqual([]);
    console.log(JSON.stringify({kind:'two-browser-concurrent-note-fields',convergedMs:Math.round(performance.now()-started),conflicts:f.conflicts,notes:1}));
  } finally {await f.close();}
});

test('settings changed by the owner reach the other account', async ({}, testInfo) => {
  const f=await fixture(testInfo,{withExpense:true}), [a,b]=f.pages, timings=[];
  const receive=async(field,value,started)=>{
    await expect.poll(()=>b.evaluate(({spaceId,field})=>JSON.parse(localStorage.getItem(`settle-friends-state:${spaceId}`))?.events?.[0]?.[field],
      {spaceId:f.personal[1].id,field}),{timeout:5000}).toBe(value);
    expect(f.canonical.state.events[0][field]).toBe(value);
    timings.push({field,milliseconds:Math.round(performance.now()-started)});
  };
  try {
    await a.locator('[data-action="open-event-settings"]').first().click();
    for(const [section,selector,field,value] of [
      ['management','[data-action="set-event-management-mode"][data-management-mode="centralized"]','adminsCanEditOnly',true],
      ['repayment','[data-action="set-event-repayment-mode"][data-repayment-mode="direct"]','directSettlementTransfers',true],
      ['rounding','[data-action="set-event-rounding-mode"][data-rounding-mode="rounded"]','roundSettlementTransfers',true]
    ]) {
      await a.locator(`[data-settings-section="${section}"]`).click();
      const started=performance.now(); await a.locator(selector).click();
      await receive(field,value,started);
      await a.locator('[data-action="event-settings-back"]').click();
    }
    await a.locator('[data-settings-section="currency"]').click();
    await a.locator('[data-choice-select-action="event-currency"]').click();
    await a.locator('.app-choice-option[data-choice-value="USD"]').click();
    const started=performance.now();
    await a.locator('[data-action="confirm-important-action"]').click();
    await receive('currency','USD',started);
    await expect(b.locator('.expense-row')).toContainText('$');
    expect(f.canonical.state.events[0].expenses[0].total).toBe(12000);
    expect(f.errors).toEqual([]); expect(f.unexpectedWrites).toEqual([]);
    console.log(JSON.stringify({kind:'two-browser-settings-sync',timings,expenseAmountPreserved:true}));
  } finally {await f.close();}
});

test('Android expense UI reaches iPhone and event closure reaches the member', async ({}, testInfo) => {
  const f = await fixture(testInfo), [a,b] = f.pages, timings=[];
  try {
    await a.locator(`[data-action="show-expense-form"][data-event-id="${eventId}"]`).first().click();
    await a.locator('[data-action="expense-total"]').fill('120');
    await a.locator('[data-action="expense-step-next"]').click();
    await a.locator('[data-action="expense-name"]').fill('ארוחה בשני מכשירים');
    for (let i=0; i<3; i++) await a.locator('[data-action="expense-step-next"]').click();
    let started = performance.now(); await a.locator('[data-action="save-expense"]').click();
    await expect(b.locator('.expense-row')).toContainText('ארוחה בשני מכשירים', {timeout: 5000});
    timings.push({name:'android-expense-save-to-iphone', milliseconds:Math.round(performance.now()-started)});
    expect(f.canonical.state.events[0].expenses).toHaveLength(1);
    expect(f.canonical.state.events[0].expenses[0].total).toBe(12000);
    await a.locator(`[data-action="settle"][data-event-id="${eventId}"]`).first().click();
    await a.locator('[data-action="close-event"]').first().click();
    started=performance.now(); await a.locator('[data-action="confirm-close-event"]').click();
    await expect.poll(() => b.evaluate(spaceId => JSON.parse(localStorage.getItem(`settle-friends-state:${spaceId}`))?.events?.[0]?.locked,
      f.personal[1].id), {timeout:5000}).toBe(true);
    timings.push({name:'android-close-event-to-iphone-state', milliseconds:Math.round(performance.now()-started)});
    expect(f.canonical.state.events[0].locked).toBe(true);
    expect(f.errors).toEqual([]); expect(f.unexpectedWrites).toEqual([]);
    for(let i=0;i<2;i++) await f.pages[i].screenshot({path:testInfo.outputPath(`expense-final-${i}.png`)});
  } finally {
    console.log(JSON.stringify({kind:'two-browser-ui-synthetic-backend', timings, errors:f.errors, unexpectedWrites:f.unexpectedWrites}));
    await f.close();
  }
});

test('a durable outbox survives page restart during a cloud outage and reaches the peer once', async ({}, testInfo) => {
  const f = await fixture(testInfo), [a, b] = f.pages;
  const pending = () => b.evaluate(spaceId =>
    localStorage.getItem(`settle-friends-pending-sync:${spaceId}`), f.personal[1].id);
  try {
    for (const page of f.pages) await page.locator('[data-action="open-event-notes"]').click();
    // Keep the local app shell reachable but fail all synthetic cloud requests.
    // This tests outbox durability, not service-worker/OS cold-start support.
    f.cloudUnavailable(1, true);
    await newNote(b, 'פתק לפני הפעלה מחדש', 'נשמר בזמן תקלה ברשת');
    await saveNote(b);
    await expect(b.locator('.event-note-modal')).toHaveCount(0);
    await expect.poll(pending).not.toBeNull();
    expect(f.canonical.state.events[0].notes).toHaveLength(0);
    await b.reload();
    await expect(b.locator('#app .screen')).toBeVisible();
    await expect.poll(pending).not.toBeNull();
    expect(f.canonical.state.events[0].notes).toHaveLength(0);
    const started = performance.now();
    f.cloudUnavailable(1, false);
    await b.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(a.getByText('פתק לפני הפעלה מחדש', {exact: true})).toBeVisible({timeout: 8000});
    await expect.poll(pending).toBeNull();
    expect(f.canonical.state.events[0].notes).toHaveLength(1);
    expect(f.canonical.state.events[0].notes[0].body).toBe('נשמר בזמן תקלה ברשת');
    expect(f.errors).toEqual([]);
    expect(f.unexpectedWrites).toEqual([]);
    console.log(JSON.stringify({kind:'two-browser-outbox-restart',recoveredMs:Math.round(performance.now()-started),notes:1}));
  } finally {
    await f.close();
  }
});
