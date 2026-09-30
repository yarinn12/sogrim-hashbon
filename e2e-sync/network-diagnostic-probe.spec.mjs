import {test,expect,webkit} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {recordBrowserErrors} from './browser-error-recorder.mjs';

const source=readFileSync(new URL('../src/data/fetchTimeout.mjs',import.meta.url),'utf8');
for(const action of ['reload','offline']) test(`diagnostic handled fetch during ${action}`,async({},testInfo)=>{
  const browser=await webkit.launch();
  const errors=[],diagnostics=[],failedUrls=new Set(), timeline=[];
  const context=await browser.newContext();
  const record=(event,data={})=>timeline.push({at:performance.now(),event,...data});
  await context.tracing.start({snapshots:true,screenshots:true,sources:true});
  await recordBrowserErrors(context,{client:1,errors,diagnostics,failedUrls});
  await context.exposeBinding('caughtFetch',(_,detail)=>record('caught',detail));
  context.on('page',page=>{
    page.on('pageerror',e=>record('pageerror',{name:e.name,message:e.message}));
    page.on('framenavigated',frame=>record('framenavigated',{url:frame.url()}));
  });
  const origin='https://network-probe.example.test';
  const backend='https://two-client-fixture.supabase.co';
  let release,arrive;
  const held=new Promise(r=>release=r),arrival=new Promise(r=>arrive=r);
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    record('request',{url:url.href});
    if(url.origin===origin) return route.fulfill(url.pathname==='/fetchTimeout.mjs'
      ? {contentType:'text/javascript',body:source}
      : {contentType:'text/html',body:'<!doctype html><title>Handled request transition</title>'});
    arrive();await held;
    await route.fulfill({headers:{'access-control-allow-origin':'*'},json:[{updated_at:'2026-09-30T00:00:00Z'}]}).catch(e=>record('route-after-reload',{message:e.message}));
  });
  const page=await context.newPage();
  try {
    await page.goto(origin);
    await page.evaluate(async backend=>{
      const {fetchWithTimeout}=await import('/fetchTimeout.mjs');
      void fetchWithTimeout(fetch,backend+'/rest/v1/app_snapshots?id=eq.probe&select=updated_at',{},12000)
        .then(()=>window.caughtFetch({success:true}),e=>window.caughtFetch({name:e.name,message:e.message}));
    },backend);
    await arrival;record('transition-start',{action});
    if(action==='reload') await page.reload();
    else {await context.setOffline(true);await context.setOffline(false);}
    record('transition-end',{action});release();
    await page.waitForTimeout(300);
    console.log('PROBE',JSON.stringify({action,errors,diagnostics,timeline}));
    await testInfo.attach('probe-timeline',{body:JSON.stringify({action,errors,diagnostics,timeline},null,2),contentType:'application/json'});
  } finally {
    release();await context.tracing.stop({path:testInfo.outputPath('browser-trace.zip')});await browser.close();
  }
});

test('diagnostic handled fetch overlapping repeated document replacement',async({},testInfo)=>{
  const browser=await webkit.launch(),context=await browser.newContext();
  const errors=[],diagnostics=[],timeline=[];
  const origin='https://network-probe.example.test',backend='https://two-client-fixture.supabase.co';
  const record=(event,data={})=>timeline.push({at:performance.now(),event,...data});
  await recordBrowserErrors(context,{client:1,errors,diagnostics,failedUrls:new Set()});
  await context.exposeBinding('probeCaught',(_,data)=>record('caught',data));
  context.on('page',page=>{
    page.on('pageerror',error=>record('pageerror',{name:error.name,message:error.message}));
    page.on('framenavigated',()=>record('document-committed'));
  });
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    record('request',{url:url.href});
    if(url.origin===origin)return route.fulfill(url.pathname==='/fetchTimeout.mjs'
      ?{contentType:'text/javascript',body:source}
      :{contentType:'text/html',body:'<!doctype html><title>Overlapping poll</title>'});
    return route.fulfill({headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,x-space-key'},json:[{updated_at:'2026-09-30T00:00:00Z'}]});
  });
  const page=await context.newPage();
  try {
    await page.goto(origin);
    for(let i=0;i<15;i++){
      await page.evaluate(async backend=>{
        const {fetchWithTimeout}=await import('/fetchTimeout.mjs');
        const poll=()=>{
          for(const id of ['shared','personal'])void fetchWithTimeout(fetch,backend+'/rest/v1/app_snapshots?id=eq.'+id+'&select=updated_at',
            {headers:{authorization:'Bearer synthetic-probe',apikey:'synthetic-probe','x-space-key':'synthetic-probe'}},12000,r=>r.json())
            .catch(e=>window.probeCaught({name:e.name,message:e.message}));
        };
        poll();setInterval(poll,2);
      },backend);
      record('reload-start',{iteration:i});await page.reload();record('reload-end',{iteration:i});
    }
    await page.waitForTimeout(100);
    const nearby=timeline.filter((e,i)=>e.event==='pageerror').map(error=>timeline.filter(e=>Math.abs(e.at-error.at)<40));
    console.log('OVERLAP_PROBE',JSON.stringify({errors,diagnostics,nearby}));
    await testInfo.attach('overlap-timeline',{body:JSON.stringify({errors,diagnostics,timeline},null,2),contentType:'application/json'});
  } finally {await browser.close();}
});
