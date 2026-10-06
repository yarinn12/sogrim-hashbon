import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {recordBrowserErrors} from '../e2e-sync/browser-error-recorder.mjs';

const url = 'https://network-fixture.example.test/rejected';
function nativeDiagnostic(requestUrl = url) {
  const text = `Fetch API cannot load ${requestUrl} due to access control checks.`;
  const colon = text.indexOf(':');
  return {name:text.slice(0,colon),message:text.slice(colon+2),stack:text};
}
async function probe() {
  const context = new EventEmitter(), page = new EventEmitter();
  const errors = [], diagnostics = [], failedUrls = new Set();
  context.exposeBinding = async (_name, binding) => {context.reportRuntime = binding;};
  context.addInitScript = async () => {};
  // failedUrls drives this probe's intentional failure plan. The former
  // recorder used that mutable marker directly; retain it for baseline replay.
  const recorder=await recordBrowserErrors(context,{client:1,errors,diagnostics,failedUrls});
  const recordRequest=request=>{
    if(failedUrls.has(request.url()))recorder?.recordExpectedFailure?.(request);
  };
  context.on('request',recordRequest);
  context.on('requestfailed',recordRequest);
  context.emit('page',page);
  return {context,page,errors,diagnostics,failedUrls};
}

test('a disconnected request retains its delayed native diagnostic after a healthy retry clears the URL marker',async()=>{
  const f = await probe(), request = {url:()=>url};
  f.failedUrls.add(url);
  f.context.emit('request',request);
  f.context.emit('requestfailed',request);
  // The two-client fixture clears its disconnection marker on a healthy retry.
  // WebKit can deliver the earlier request's pageerror only after that retry.
  f.failedUrls.delete(url);
  f.context.emit('request',{url:()=>url});
  f.page.emit('pageerror',nativeDiagnostic());
  assert.deepEqual(f.errors,[]);
  assert.equal(f.diagnostics.length,1);
});

test('one intentional request permits one diagnostic despite duplicate request events',async()=>{
  const f = await probe(), request = {url:()=>url};
  f.failedUrls.add(url);
  f.context.emit('request',request);
  f.context.emit('requestfailed',request);
  f.page.emit('pageerror',nativeDiagnostic());
  f.page.emit('pageerror',nativeDiagnostic());
  assert.equal(f.diagnostics.length,1);
  assert.equal(f.errors.length,1,'a later unplanned failure must still fail the guard');
});

test('a URL marker without an issued intentional request cannot hide a native error',async()=>{
  const f = await probe();
  f.failedUrls.add(url);
  f.page.emit('pageerror',nativeDiagnostic());
  assert.deepEqual(f.diagnostics,[]);
  assert.equal(f.errors.length,1);
});

test('separate intentionally disconnected requests each retain one receipt',async()=>{
  const f = await probe();
  f.failedUrls.add(url);
  f.context.emit('request',{url:()=>url});
  f.context.emit('request',{url:()=>url});
  f.failedUrls.delete(url);
  f.page.emit('pageerror',nativeDiagnostic());
  f.page.emit('pageerror',nativeDiagnostic());
  f.page.emit('pageerror',nativeDiagnostic());
  assert.equal(f.diagnostics.length,2);
  assert.equal(f.errors.length,1);
});

test('intentional transport failures never hide runtime errors or another URL',async()=>{
  const f = await probe();
  f.failedUrls.add(url);
  f.context.emit('request',{url:()=>url});
  f.page.emit('pageerror',nativeDiagnostic('https://unplanned.example.test/'));
  f.context.reportRuntime(null,{kind:'unhandledrejection',name:'TypeError',message:'Load failed'});
  f.context.reportRuntime(null,{kind:'error',name:'Error',message:'application fault'});
  assert.deepEqual(f.diagnostics,[]);
  assert.equal(f.errors.length,3);
});
