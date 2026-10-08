import {test, expect, webkit} from '@playwright/test';
import {recordBrowserErrors} from './browser-error-recorder.mjs';

const pageUrl = 'https://transport-monitor.example.test/';
const failedUrl = 'https://network-fixture.example.test/rejected';
const snapshotUrl = 'https://network-fixture.example.test/rest/v1/app_snapshots?id=eq.personal&select=updated_at';

async function probe(run) {
  const browser = await webkit.launch();
  try {
    const context = await browser.newContext();
    const errors=[], diagnostics=[], failedUrls=new Set();
    const recorder=await recordBrowserErrors(context,{client:1,errors,diagnostics,
      browserName:'webkit',origin:'https://network-fixture.example.test'});
    await context.route('**/*', route => {
      if(failedUrls.has(route.request().url()))recorder.recordExpectedFailure(route.request());
      return route.request().url() === pageUrl
      ? route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated error monitor</title>'})
      : route.fulfill({headers:{'access-control-allow-origin':'https://wrong-origin.example.test'},json:{ok:true}});
    });
    const page=await context.newPage();
    await page.goto(pageUrl);
    await run({page,errors,diagnostics,failedUrls,recorder});
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

test('a real CORS-failing snapshot request remains an error during a tracked reload',async()=>{
  await probe(async({page,errors,diagnostics,recorder})=>{
    await recorder.withDocumentReload(page,async()=>{
      const caught=await page.evaluate(async url=>{try {await fetch(url);return false;} catch {return true;}},snapshotUrl);
      expect(caught).toBe(true);
      await expect.poll(()=>errors.length).toBeGreaterThan(0);
      await page.reload();
    });
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
