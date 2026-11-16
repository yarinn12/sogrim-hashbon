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
function reloadNativeDiagnostic(requestUrl = snapshotUrl) {
  const error=nativeDiagnostic(requestUrl);
  return {...error,stack:`${error.stack}\n    at unknown (http://127.0.0.1:4183/src/data/fetchTimeout.mjs:40:23)`};
}
async function probe(options = {}) {
  const context = new EventEmitter(), page = new EventEmitter();
  const errors = [], diagnostics = [], failedUrls = new Set();
  context.exposeBinding = async (_name, binding) => {context.reportRuntime = binding;};
  context.addInitScript = async () => {};
  // failedUrls drives this probe's intentional failure plan. The former
  // recorder used that mutable marker directly; retain it for baseline replay.
  const recorder=await recordBrowserErrors(context,{client:1,errors,diagnostics,failedUrls,...options});
  const recordRequest=request=>{
    if(failedUrls.has(request.url()))recorder?.recordExpectedFailure?.(request);
  };
  context.on('request',recordRequest);
  context.on('requestfailed',recordRequest);
  context.emit('page',page);
  return {context,page,errors,diagnostics,failedUrls,recorder};
}

const snapshotUrl = 'https://network-fixture.example.test/rest/v1/app_snapshots?id=eq.personal&select=updated_at';
const inboxUrl = 'https://network-fixture.example.test/rest/v1/notification_inbox?recipient_user_id=eq.synthetic';
const reloadContext = {browserName:'webkit',origin:'https://network-fixture.example.test',inboxRecipientUserId:'synthetic'};

test('an unissued WebKit inbox diagnostic during explicit document replacement is retained separately',async()=>{
  const f=await probe(reloadContext);
  await f.recorder.withDocumentReload(f.page,async()=>{
    f.page.emit('pageerror',reloadNativeDiagnostic(inboxUrl));
  });
  assert.deepEqual(f.errors,[]);
  assert.equal(f.diagnostics.length,1);
  assert.equal(f.diagnostics[0].reason,'webkit-document-replacement');
});

test('an issued inbox request with a real transport failure still fails during reload',async()=>{
  const f=await probe(reloadContext), request={url:()=>inboxUrl};
  await f.recorder.withDocumentReload(f.page,async()=>{
    f.context.emit('request',request);
    f.context.emit('requestfailed',request);
    f.page.emit('pageerror',reloadNativeDiagnostic(inboxUrl));
  });
  assert.equal(f.errors.length,1);
  assert.deepEqual(f.diagnostics,[]);
});

test('an inbox diagnostic outside document replacement still fails',async()=>{
  const f=await probe(reloadContext);
  f.page.emit('pageerror',reloadNativeDiagnostic(inboxUrl));
  assert.equal(f.errors.length,1);
  assert.deepEqual(f.diagnostics,[]);
});

test('an inbox diagnostic for another account still fails during reload',async()=>{
  const f=await probe(reloadContext);
  await f.recorder.withDocumentReload(f.page,async()=>{
    f.page.emit('pageerror',reloadNativeDiagnostic(inboxUrl.replace('eq.synthetic','eq.other')));
  });
  assert.equal(f.errors.length,1);
  assert.deepEqual(f.diagnostics,[]);
});

test('an issued inbox request still fails during reload without a failed event',async()=>{
  const f=await probe(reloadContext), request={url:()=>inboxUrl};
  await f.recorder.withDocumentReload(f.page,async()=>{
    f.context.emit('request',request);
    f.page.emit('pageerror',reloadNativeDiagnostic(inboxUrl));
  });
  assert.equal(f.errors.length,1);
  assert.deepEqual(f.diagnostics,[]);
});

test('an unissued WebKit snapshot diagnostic during explicit document replacement is retained separately',async()=>{
  const f=await probe(reloadContext);
  await f.recorder.withDocumentReload(f.page,async()=>{
    f.page.emit('pageerror',reloadNativeDiagnostic());
  });
  assert.deepEqual(f.errors,[]);
  assert.equal(f.diagnostics.length,1);
  assert.equal(f.diagnostics[0].reason,'webkit-document-replacement');
});

test('a matching snapshot diagnostic outside document replacement still fails',async()=>{
  const f=await probe(reloadContext);
  f.page.emit('pageerror',reloadNativeDiagnostic());
  assert.equal(f.errors.length,1);
  assert.deepEqual(f.diagnostics,[]);
});

test('an issued snapshot request with a real transport failure still fails during reload',async()=>{
  const f=await probe(reloadContext), request={url:()=>snapshotUrl};
  await f.recorder.withDocumentReload(f.page,async()=>{
    f.context.emit('request',request);
    f.context.emit('requestfailed',request);
    f.page.emit('pageerror',reloadNativeDiagnostic());
  });
  assert.equal(f.errors.length,1);
  assert.deepEqual(f.diagnostics,[]);
});

test('a real snapshot failure before reload remains an error when its native diagnostic arrives late',async()=>{
  const f=await probe(reloadContext), request={url:()=>snapshotUrl};
  f.context.emit('request',request);
  f.context.emit('requestfailed',request);
  await f.recorder.withDocumentReload(f.page,async()=>{
    f.page.emit('pageerror',reloadNativeDiagnostic());
  });
  assert.equal(f.errors.length,1);
  assert.deepEqual(f.diagnostics,[]);
});

test('a deliberately blocked request keeps its exact diagnostic receipt when requestfailed arrives first',async()=>{
  const f=await probe(reloadContext), request={url:()=>snapshotUrl};
  f.failedUrls.add(snapshotUrl);
  f.context.emit('requestfailed',request);
  await f.recorder.withDocumentReload(f.page,async()=>{
    f.page.emit('pageerror',reloadNativeDiagnostic());
  });
  assert.deepEqual(f.errors,[]);
  assert.equal(f.diagnostics.length,1);
});

test('a real failure takes priority over a separate planned failure for the same URL',async()=>{
  const f=await probe(reloadContext), actual={url:()=>snapshotUrl}, planned={url:()=>snapshotUrl};
  f.context.emit('request',actual);
  f.context.emit('requestfailed',actual);
  f.failedUrls.add(snapshotUrl);
  f.context.emit('request',planned);
  await f.recorder.withDocumentReload(f.page,async()=>{
    f.page.emit('pageerror',reloadNativeDiagnostic());
  });
  assert.equal(f.errors.length,1);
  assert.deepEqual(f.diagnostics,[]);
  f.page.emit('pageerror',reloadNativeDiagnostic());
  assert.equal(f.diagnostics.length,1);
});

test('ordinary runtime errors and unrelated access failures still fail during reload',async()=>{
  const f=await probe(reloadContext);
  await f.recorder.withDocumentReload(f.page,async()=>{
    f.page.emit('pageerror',new TypeError('Unable to save'));
    f.page.emit('pageerror',nativeDiagnostic(snapshotUrl));
    f.page.emit('pageerror',reloadNativeDiagnostic('https://unplanned.example.test/rest/v1/app_snapshots'));
    f.page.emit('pageerror',reloadNativeDiagnostic('https://network-fixture.example.test/rest/v1/user_profiles'));
    f.context.reportRuntime(null,{kind:'unhandledrejection',name:'TypeError',message:'Load failed'});
  });
  assert.equal(f.errors.length,5);
  assert.deepEqual(f.diagnostics,[]);
});

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
