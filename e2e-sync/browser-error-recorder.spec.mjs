import {test, expect, webkit} from '@playwright/test';
import {recordBrowserErrors} from './browser-error-recorder.mjs';
import {readFileSync} from 'node:fs';

const pageUrl = 'https://transport-monitor.example.test/';
const failedUrl = 'https://network-fixture.example.test/rejected';
const reloadOrigin = 'https://reload-fixture.example.test';
const reloadUrl = `${reloadOrigin}/rest/v1/app_snapshots`;

async function probe(run) {
  const browser = await webkit.launch();
  try {
    const context = await browser.newContext();
    const errors=[], diagnostics=[], failedUrls=new Set(), reloadingPages=new WeakSet();
    await recordBrowserErrors(context,{client:1,errors,diagnostics,failedUrls,
      origin:reloadOrigin,isReloading:page=>reloadingPages.has(page)});
    await context.route('**/*', route => route.request().url() === pageUrl
      ? route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated error monitor</title>'})
      : route.fulfill({headers:{'access-control-allow-origin':'https://wrong-origin.example.test'},json:{ok:true}}));
    const page=await context.newPage();
    await page.goto(pageUrl);
    await run({page,context,errors,diagnostics,failedUrls,reloadingPages});
  } finally {await browser.close();}
}

test('caught fixture network failures are diagnostics while real unhandled failures remain errors',async()=>{
  await probe(async({page,errors,diagnostics,failedUrls})=>{
    failedUrls.add(failedUrl);
    const caught=await page.evaluate(async url=>{
      try {await fetch(url); return false;} catch {return true;}
    },failedUrl);
    expect(caught).toBe(true);
    // Allow the browser's error event to arrive before checking its classification.
    await expect.poll(()=>errors.length+diagnostics.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    await page.evaluate(url=>{void fetch(url);},failedUrl);
    await expect.poll(()=>errors.some(error=>error.kind==='unhandledrejection')).toBe(true);
    expect(errors.some(error=>error.name==='TypeError')).toBe(true);
  });
});

test('an unplanned CORS failure still fails the sync error guard',async()=>{
  await probe(async({page,errors,diagnostics})=>{
    await page.evaluate(async url=>{try {await fetch(url);} catch {}},failedUrl);
    await expect.poll(()=>errors.length).toBeGreaterThan(0);
    expect(diagnostics).toEqual([]);
  });
});

test('a thrown application error cannot be classified as expected network noise',async()=>{
  await probe(async({page,errors,failedUrls})=>{
    failedUrls.add(failedUrl);
    await page.evaluate(()=>{setTimeout(()=>{throw new Error('synthetic application fault');},0);});
    await expect.poll(()=>errors.some(error=>error.kind==='error'&&error.message==='synthetic application fault')).toBe(true);
  });
});

test('reload diagnostics stop at commit and cannot exempt another page or backend',async()=>{
  await probe(async({page,context,errors,diagnostics,reloadingPages})=>{
    const caughtFetch=(target,url)=>target.evaluate(async url=>{try {await fetch(url);} catch {}},url);
    reloadingPages.add(page);
    await caughtFetch(page,reloadUrl);
    await expect.poll(()=>diagnostics.length).toBe(1);
    expect(errors).toEqual([]);
    await caughtFetch(page,failedUrl);
    await expect.poll(()=>errors.length).toBe(1);
    const other=await context.newPage();
    await other.goto(pageUrl);
    await caughtFetch(other,reloadUrl);
    await expect.poll(()=>errors.length).toBe(2);
    reloadingPages.delete(page);
    await caughtFetch(page,reloadUrl);
    await expect.poll(()=>errors.length).toBe(3);
    expect(diagnostics).toHaveLength(1);
  });
});

test('real rejections and exceptions still fail during the reload diagnostic window',async()=>{
  await probe(async({page,errors,diagnostics,reloadingPages})=>{
    reloadingPages.add(page);
    await page.evaluate(url=>{void fetch(url);},reloadUrl);
    await expect.poll(()=>errors.some(error=>error.kind==='unhandledrejection')).toBe(true);
    await expect.poll(()=>diagnostics.length).toBe(1);
    await page.evaluate(()=>{setTimeout(()=>{throw new Error('fault during reload');},0);});
    await expect.poll(()=>errors.some(error=>error.kind==='error'&&error.message==='fault during reload')).toBe(true);
  });
});

test('caught version polls canceled during document replacement remain diagnostics',async({},testInfo)=>{
  const browser=await webkit.launch();
  const context=await browser.newContext();
  const errors=[],diagnostics=[],reloadingPages=new WeakSet(),caught=[];
  const backend='https://reload-fixture.example.test';
  const source=readFileSync(new URL('../src/data/fetchTimeout.mjs',import.meta.url),'utf8');
  await recordBrowserErrors(context,{client:1,errors,diagnostics,failedUrls:new Set(),
    origin:backend,isReloading:page=>reloadingPages.has(page)});
  await context.exposeBinding('reportCaughtVersionPoll',(_,detail)=>caught.push(detail));
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===new URL(pageUrl).origin)return route.fulfill(url.pathname==='/fetchTimeout.mjs'
      ?{contentType:'text/javascript',body:source}
      :{contentType:'text/html',body:'<!doctype html><title>Version poll reload</title>'});
    return route.fulfill({headers:{'access-control-allow-origin':'*',
      'access-control-allow-headers':'authorization,apikey,x-space-key'},json:[{updated_at:'2026-09-30T00:00:00Z'}]});
  });
  const page=await context.newPage();
  try {
    await page.goto(pageUrl);
    for(let i=0;i<3;i++){
      await page.evaluate(async backend=>{
        const {fetchWithTimeout}=await import('/fetchTimeout.mjs');
        const poll=()=>{
          for(const id of ['shared','personal'])void fetchWithTimeout(fetch,
            `${backend}/rest/v1/app_snapshots?id=eq.${id}&select=updated_at`,
            {headers:{authorization:'Bearer synthetic-probe',apikey:'synthetic-probe','x-space-key':'synthetic-probe'}},
            12000,response=>response.json())
            .catch(error=>window.reportCaughtVersionPoll({name:error.name,message:error.message}));
        };
        poll();setInterval(poll,2);
      },backend);
      reloadingPages.add(page);
      try {await page.reload({waitUntil:'commit'});}
      finally {reloadingPages.delete(page);}
      await page.waitForLoadState('load');
    }
    await testInfo.attach('handled-reload-network-results',{contentType:'application/json',
      body:JSON.stringify({caught,diagnostics,errors},null,2)});
    expect(caught.length,'old-document request rejection must reach its catch').toBeGreaterThan(0);
    expect(errors).toEqual([]);
  } finally {await browser.close();}
});
