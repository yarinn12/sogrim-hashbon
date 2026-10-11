import {test,expect} from '@playwright/test';
import {createServer,request as proxyRequest} from 'node:http';
test.use({serviceWorkers:'allow'});
const owner='offline-shell-owner',peer='offline-shell-guest',eventId='offline-shell-event';
const state={currentParticipantId:owner,participants:[{id:owner,displayName:'בודק אופליין',kind:'user'},
  {id:peer,displayName:'אורח בדיקה',kind:'guest'}],groups:[],friendContacts:[],deletedEvents:[],deletedParticipants:[],
  events:[{id:eventId,name:'בדיקת פתיחה ללא רשת',eventType:'outing',currency:'ILS',participantIds:[owner,peer],
    adminIds:[owner],createdByParticipantId:owner,createdAt:'2026-09-01T00:00:00.000Z',updatedAt:'2026-09-01T00:00:00.000Z',
    expenses:[],transfers:[],notes:[],deletedNotes:[],activityLog:[]}]};

async function assertWorkspaceNavigationRecoversAfterLateGeometry(page) {
  const initialViewport = page.viewportSize();
  await page.setViewportSize({ width: 734, height: 343 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const geometry = await page.evaluate(async () => {
    const screen = document.querySelector('.screen[data-screen-kind="event"]');
    const nav = screen?.querySelector('.event-workspace-nav');
    const route = document.querySelector('.product-route-controls');
    if (!screen || !nav || !route) return { missing: true };
    const routeBottom = route.getBoundingClientRect().bottom;
    const navHeight = nav.getBoundingClientRect().height;
    nav.style.setProperty('transition', 'none', 'important');
    const moveTo = targetTop => {
      nav.style.removeProperty('transform');
      const untransformedTop = nav.getBoundingClientRect().top;
      nav.style.setProperty('transform', `translateY(${targetTop - untransformedTop}px)`, 'important');
    };
    const frames = () => new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const state = () => ({
      navTop: nav.getBoundingClientRect().top,
      navHeight: nav.getBoundingClientRect().height,
      routeBottom: route.getBoundingClientRect().bottom,
      fullyOccluded: nav.hasAttribute('data-route-fully-occluded'),
      visibility: getComputedStyle(nav).visibility,
      clip: parseFloat(getComputedStyle(nav).getPropertyValue('--event-nav-route-occlusion')) || 0
    });

    moveTo(routeBottom - navHeight - 12);
    window.dispatchEvent(new Event('scroll'));
    await frames();
    const covered = state();

    // The scheduler reads the covered position in its first frame. Layout
    // moves the navigation below the route controls later in that frame,
    // with no second scroll event or DOM child replacement.
    window.dispatchEvent(new Event('scroll'));
    await new Promise(resolve => requestAnimationFrame(() => {
      moveTo(routeBottom + 135);
      resolve();
    }));
    await frames();
    const clear = state();

    nav.style.setProperty('display', 'none', 'important');
    window.dispatchEvent(new Event('scroll'));
    await frames();
    const zeroHeight = state();
    nav.style.removeProperty('display');
    window.dispatchEvent(new Event('scroll'));
    await frames();
    return { covered, clear, zeroHeight, restored: state() };
  });
  expect(geometry.missing).not.toBe(true);
  expect(geometry.covered.navTop + geometry.covered.navHeight)
    .toBeLessThan(geometry.covered.routeBottom);
  expect(geometry.covered.fullyOccluded).toBe(true);
  expect(geometry.covered.visibility).toBe('hidden');
  expect(geometry.clear.navTop).toBeGreaterThan(geometry.clear.routeBottom + 20);
  expect(geometry.clear.fullyOccluded).toBe(false);
  expect(geometry.clear.visibility).toBe('visible');
  expect(geometry.clear.clip).toBe(0);
  expect(geometry.zeroHeight.navHeight).toBe(0);
  expect(geometry.zeroHeight.fullyOccluded).toBe(false);
  expect(geometry.restored.fullyOccluded).toBe(false);
  expect(geometry.restored.visibility).toBe('visible');
  await page.evaluate(() => {
    const nav = document.querySelector('.screen[data-screen-kind="event"] .event-workspace-nav');
    nav.style.removeProperty('transform');
    nav.style.removeProperty('transition');
    window.scrollTo(0, 0);
    window.dispatchEvent(new Event('scroll'));
  });
  await page.setViewportSize(initialViewport);
}

test('a fresh PWA preserves editable data through disconnected-client or origin-outage reloads',async({page,context,request,browserName},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await request.post('/api/reset');await request.put('/api/state',{data:state});
  await context.addInitScript(({state,owner})=>{
    if(localStorage.getItem('offline-shell-seeded'))return;
    localStorage.setItem('offline-shell-seeded','1');
    localStorage.setItem('settle-friends-state',JSON.stringify(state));
    localStorage.setItem('settle-friends-current-participant',owner);
    localStorage.setItem('settle-friends-local-profile',JSON.stringify({participantId:owner,displayName:'בודק אופליין'}));
    sessionStorage.setItem('settle-friends-skip-next-splash','1');
  },{state,owner});
  const openEvent=()=>page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
  // Windows WebKit's offline emulation rejects navigation before its worker.
  // Exercise an actual origin outage there; Chromium also disconnects the client.
  let originUnavailable=false;
  const server=createServer((incoming,response)=>{
    if(originUnavailable){response.writeHead(503,{'content-type':'text/plain','connection':'close'});response.end('Synthetic origin outage');return;}
    const target=new URL(incoming.url,testInfo.project.use.baseURL);
    const forwarded=proxyRequest(target,{method:incoming.method,headers:incoming.headers},upstream=>{
      response.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(response);
    });
    forwarded.on('error',()=>{response.writeHead(503);response.end();});
    incoming.pipe(forwarded);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const setUnavailable=async(value)=>{originUnavailable=value;if(browserName==='chromium')await context.setOffline(value);};
  const close=async()=>{await context.setOffline(false);await page.goto('about:blank').catch(()=>{});server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
  try {
  await page.goto(origin);
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
    await setUnavailable(true);
    const started=performance.now();
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
    const offlineReloadMs=Math.round(performance.now()-started);
    await openEvent();
    await page.locator('[data-action="show-expense-form"]').first().click();
    await page.locator('[data-action="expense-total"]').fill('12.34');
    await page.locator('[data-action="expense-step-next"]').click();
    await page.locator('[data-action="expense-name"]').fill('הוצאה לאחר פתיחה אופליין');
    for(let step=0;step<3;step++)await page.locator('[data-action="expense-step-next"]').click();
    await page.locator('[data-action="save-expense"]').click();
    await expect(page.locator('.expense-row').filter({hasText:'הוצאה לאחר פתיחה אופליין'})).toHaveCount(1);
    await assertWorkspaceNavigationRecoversAfterLateGeometry(page);
    await page.locator('[data-action="open-event-notes"]').click();
    await page.locator('[data-action="new-event-note"]').click();
    await page.locator('[data-action="event-note-title"]').fill('פתק לאחר פתיחה אופליין');
    await page.locator('[data-action="event-note-body"]').fill('הטקסט נשמר גם אחרי רענון');
    await page.locator('[data-action="save-event-note"]').click();
    await expect(page.locator('.event-note-open').filter({hasText:'פתק לאחר פתיחה אופליין'})).toHaveCount(1);
    for(const reconnect of [false,true]){
      if(reconnect)await setUnavailable(false);
      await page.reload({waitUntil:'domcontentloaded'});
      await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
      await openEvent();
      await expect(page.locator('.expense-row').filter({hasText:'הוצאה לאחר פתיחה אופליין'})).toHaveCount(1);
      await page.locator('[data-action="open-event-notes"]').click();
      await expect(page.locator('.event-note-open').filter({hasText:'פתק לאחר פתיחה אופליין'})).toHaveCount(1);
      const stored=await page.evaluate(eventId=>JSON.parse(localStorage.getItem('settle-friends-state')).events.find(e=>e.id===eventId),eventId);
      expect(stored.expenses).toHaveLength(1);expect(stored.expenses[0].total).toBe(1234);
      expect(stored.notes).toHaveLength(1);expect(stored.notes[0].body).toBe('הטקסט נשמר גם אחרי רענון');
    }
    expect(errors).toEqual([]);
    console.log(JSON.stringify({profile:testInfo.project.name,networkFailure:browserName==='chromium'?'disconnected-client':'origin-503',offlineReloadMs,serviceWorkerControlled:true,expenses:1,expenseMinorUnits:1234,notes:1,errors}));
  }finally{await close();}
});
