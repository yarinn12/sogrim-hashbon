import { isWebKitReloadDiagnostic } from '../e2e/helpers/reloadDiagnostics.mjs';

// WebKit also sends native CORS diagnostics through Playwright's pageerror.
// Keep these separate from actual error/unhandledrejection events. A diagnostic
// is expected only for a deliberately failed fixture request, or an unissued
// snapshot fetch from the old document while that document is being replaced.
export async function recordBrowserErrors(context, {client, errors, diagnostics, browserName, origin}) {
  const recordedRequests = new WeakSet(), pendingDiagnostics = new Map();
  const activeRequests = new Map(), documentReloads = new Map();
  const failedSnapshotRequests = new Map(), unplannedFailures = new WeakSet();
  const snapshotUrl = value => {
    try {
      const url=new URL(value);
      return url.origin===origin && url.pathname==='/rest/v1/app_snapshots' ? url.href : null;
    } catch { return null; }
  };
  const removeFailedSnapshot = url => {
    const remaining=(failedSnapshotRequests.get(url) ?? 0)-1;
    if(remaining>0) failedSnapshotRequests.set(url,remaining);
    else failedSnapshotRequests.delete(url);
  };
  context.on('request', request => {
    const url=request.url();
    activeRequests.set(request,url);
    for(const reload of documentReloads.values()) reload.issuedUrls.add(url);
  });
  context.on('requestfinished', request => activeRequests.delete(request));
  context.on('requestfailed', request => {
    activeRequests.delete(request);
    if(recordedRequests.has(request)) return;
    const url=snapshotUrl(request.url());
    if(!url) return;
    unplannedFailures.add(request);
    failedSnapshotRequests.set(url,(failedSnapshotRequests.get(url) ?? 0)+1);
  });
  const withDocumentReload = async (page, reload) => {
    const state={issuedUrls:new Set(activeRequests.values())};
    documentReloads.set(page,state);
    try { return await reload(); }
    finally { documentReloads.delete(page); }
  };
  const recordExpectedFailure = request => {
    const url = request.url();
    if (recordedRequests.has(request)) return;
    recordedRequests.add(request);
    if(unplannedFailures.has(request)) {
      unplannedFailures.delete(request);
      removeFailedSnapshot(snapshotUrl(url));
    }
    pendingDiagnostics.set(url,(pendingDiagnostics.get(url) ?? 0)+1);
  };
  // A healthy retry can clear the fixture's URL marker before WebKit reports
  // the earlier abort. Preserve a receipt per request, never a URL whitelist.
  await context.exposeBinding('__syncQaRuntimeError', (_source, detail) => {
    errors.push({client, source:'runtime', ...detail});
  });
  await context.addInitScript(() => {
    const report = (kind, error) => {
      void window.__syncQaRuntimeError({kind, name:String(error?.name ?? ''),
        message:String(error?.message ?? error ?? ''), stack:String(error?.stack ?? '')});
    };
    window.addEventListener('error', event => report('error', event.error ?? event.message));
    window.addEventListener('unhandledrejection', event => report('unhandledrejection', event.reason));
  });
  context.on('page', page => page.on('pageerror', error => {
    const detail={client, source:'pageerror', name:error.name, message:error.message, stack:error.stack};
    const expectedUrl=[...pendingDiagnostics.keys()].find(url=>{
      const nativeText=`Fetch API cannot load ${url} due to access control checks.`;
      // Playwright splits this native diagnostic at the first colon as though
      // it were "ErrorName: message", consuming the first URL slash as well.
      const colon=nativeText.indexOf(':');
      return error.name===nativeText.slice(0,colon)&&error.message===nativeText.slice(colon+2);
    });
    const reload=documentReloads.get(page);
    const firstLine=String(error.stack ?? '').split('\n')[0];
    const prefix='Fetch API cannot load ', suffix=' due to access control checks.';
    const nativeUrl=firstLine.startsWith(prefix) && firstLine.endsWith(suffix)
      ? snapshotUrl(firstLine.slice(prefix.length,-suffix.length)) : null;
    const actualFailedRequest=nativeUrl && failedSnapshotRequests.has(nativeUrl);
    if(actualFailedRequest) removeFailedSnapshot(nativeUrl);
    if(expectedUrl && !actualFailedRequest) {
      const remaining=pendingDiagnostics.get(expectedUrl)-1;
      if(remaining)pendingDiagnostics.set(expectedUrl,remaining);
      else pendingDiagnostics.delete(expectedUrl);
    }
    let unissuedReloadUrl=null;
    if(!expectedUrl && !actualFailedRequest && reload && nativeUrl &&
      isWebKitReloadDiagnostic(error,{browserName,reloading:true,origin}) &&
      String(error.stack).includes('/src/data/fetchTimeout.mjs:') && !reload.issuedUrls.has(nativeUrl))
      unissuedReloadUrl=nativeUrl;
    if(actualFailedRequest) errors.push(detail);
    else if(unissuedReloadUrl) diagnostics.push({...detail,reason:'webkit-document-replacement'});
    else (expectedUrl ? diagnostics : errors).push(detail);
  }));
  return {recordExpectedFailure,withDocumentReload};
}
