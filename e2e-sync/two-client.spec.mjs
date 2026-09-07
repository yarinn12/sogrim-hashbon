import {test, expect, chromium, webkit, devices} from '@playwright/test';

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

async function fixture(testInfo, {withExpense = false} = {}) {
  const browsers = [];
  const contexts = [], pages = [], errors = [], unexpectedWrites = [], writes = [], requests = [];
  const blocked = new Set();
  let barrier = null, conflicts = 0;
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
  const canonical = {id: sharedId, snapshot_kind: 'shared_event', updated_at: version,
    state: {currentParticipantId: '', participants, groups: [], events: [structuredClone(event)], deletedParticipants: []}};
  const personal = ids.map((id, i) => ({id: `two-client-workspace-${i}`, updated_at: version,
    state: {currentParticipantId: `account-${id}`, participants: structuredClone(participants),
      groups: [], friendContacts: [], deletedEvents: [], deletedParticipants: [],
      events: [{...structuredClone(event), sharedSpaceId: sharedId, sharedSpaceKey: key}]}}));
  const baseURL = testInfo.project.use.baseURL;
  const close = async () => {
    barrier?.release();
    // Playwright Test already traces these contexts through the shared config.
    await Promise.all(browsers.map(browser => browser.close()));
  };
  try {
  for (let i = 0; i < 2; i++) {
    browsers.push(await (i ? webkit : chromium).launch());
    const context = await browsers[i].newContext({...devices[i ? 'iPhone 13' : 'Pixel 5'],
      baseURL, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', reducedMotion: 'reduce', serviceWorkers: 'block'});
    contexts.push(context);
    const user = {id: ids[i], email: `qa-${i}@example.test`, app_metadata: {provider: 'google'},
      user_metadata: {full_name: participants[i].displayName, username: `two_client_${i}`,
        account_space_id: personal[i].id, account_space_key: key}};
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      const reply = (json, status = 200) => route.fulfill({headers, json, status});
      if (url.origin === new URL(baseURL).origin) {
        if (url.pathname === '/api/config') return reply({publicUrl: baseURL, launch: {cloudStorageReady: true},
          storage: {mode: 'supabase', url: origin, anonKey: 'fixture-anon', table: 'app_snapshots'}});
        if (url.pathname.startsWith('/api/notifications/') || url.pathname === '/api/product-metrics') return reply({ok: true});
        if (url.pathname.startsWith('/api/') && !['/api/health'].includes(url.pathname)) {
          if (request.method() !== 'GET') unexpectedWrites.push({client: i, path: url.pathname});
          return reply({ok: true});
        }
        return route.continue();
      }
      if (url.origin !== origin) return route.abort('blockedbyclient');
      if (blocked.has(i)) return route.abort('internetdisconnected');
      if (request.method() === 'OPTIONS') return route.fulfill({status: 204, headers});
      requests.push({client: i, method: request.method(), path: url.pathname, at: performance.now()});
      if (request.headers().authorization !== `Bearer fixture-token-${i}`) return reply({message: 'Authentication required'}, 401);
      if (url.pathname === '/auth/v1/user') return reply(user);
      if (url.pathname.endsWith('/ensure_account_workspace')) return reply({status: 'existing', workspaceId: personal[i].id});
      if (url.pathname.endsWith('/join_shared_event')) return reply(true);
      // These auxiliary RPCs are outside the sync journey but are invoked at
      // startup/expense save. Explicit inert fixtures, not a blanket write allowlist.
      if (url.pathname.endsWith('/get_referral_program_status')) return reply({status: 'unavailable'});
      if (url.pathname.endsWith('/qualify_referral')) return reply({status: 'unavailable'});
      if (url.pathname.endsWith('/user_profiles')) {
        return reply(ids.map((id, index) => ({user_id: id, display_name: participants[index].displayName,
          username: `two_client_${index}`, username_customized: false, avatar_preset: 'avatar-1',
          avatar_image: null, avatar_image_updated_at: null, updated_at: version}))
          .filter(p => !url.searchParams.get('user_id')?.startsWith('eq.') || url.searchParams.get('user_id') === `eq.${p.user_id}`));
      }
      if (url.pathname.endsWith('/update_shared_event_snapshot')) {
        const body = request.postDataJSON();
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
          const rows = url.searchParams.has('snapshot_kind') || id === sharedId ? [canonical]
            : id === personal[i].id ? [personal[i]] : [];
          const fields = (url.searchParams.get('select') || 'id,state,updated_at').split(',');
          return reply(rows.map(row => Object.fromEntries(fields.map(field => [field, structuredClone(row[field])]))));
        }
        const body = request.postDataJSON();
        if (id && id !== personal[i].id) return reply({message: 'Wrong workspace'}, 403);
        const expected = url.searchParams.get('updated_at')?.replace(/^eq\./, '');
        if (expected && expected !== personal[i].updated_at) return reply([]);
        personal[i].state = structuredClone(body.state); personal[i].updated_at = body.updated_at || stamp();
        return reply([{updated_at: personal[i].updated_at}]);
      }
      if (request.method() === 'GET') return reply([]);
      unexpectedWrites.push({client: i, path: url.pathname});
      return reply({message: 'Unimplemented write'}, 501);
    });
    await context.addInitScript(({user, initial, spaceId, key, i}) => {
      if (localStorage.getItem('two-client-seeded')) return;
      localStorage.setItem('two-client-seeded', '1');
      localStorage.setItem('settle-friends-account-session', JSON.stringify({access_token: `fixture-token-${i}`,
        refresh_token: `fixture-refresh-${i}`, expires_at: Math.floor(Date.now()/1000)+3600, user}));
      localStorage.setItem('settle-friends-cloud-space', spaceId);
      localStorage.setItem(`settle-friends-cloud-key:${spaceId}`, key);
      localStorage.setItem(`settle-friends-state:${spaceId}`, JSON.stringify(initial));
      localStorage.setItem(`settle-friends-current-participant:account:${user.id}`, `account-${user.id}`);
      localStorage.setItem(`settle-friends-local-profile:account:${user.id}`, JSON.stringify({participantId: `account-${user.id}`,
        displayName: user.user_metadata.full_name, username: user.user_metadata.username, avatarPreset: 'avatar-1',
        authProvider: 'google', authSubject: user.id, email: user.email}));
      sessionStorage.setItem('settle-friends-skip-next-splash', '1');
    }, {user, initial: personal[i].state, spaceId: personal[i].id, key, i});
    const page = await context.newPage(); pages.push(page);
    page.on('pageerror', error => errors.push({client: i, message: error.message}));
    await page.goto('/');
    await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
    await expect(page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first()).toBeVisible();
    await page.screenshot({path: testInfo.outputPath(`startup-${i}.png`)});
    await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
    await expect(page.locator('[data-action="open-event-notes"]')).toBeVisible();
  }
  return {pages, contexts, canonical, personal, writes, requests, errors, unexpectedWrites,
    get conflicts() { return conflicts; },
    collideNextWrites() {
      let release; const ready = new Promise(resolve => { release = resolve; });
      barrier = {arrivals:0, release, ready};
    },
    async offline(i, value) { if(value) blocked.add(i); else blocked.delete(i); await contexts[i].setOffline(value); },
    cloudUnavailable(i, value) { if (value) blocked.add(i); else blocked.delete(i); },
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
    await expect(b.locator('[data-inline-sync-status]:visible').first()).toContainText('נשמר במכשיר · יסתנכרן כשהחיבור יחזור');
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
