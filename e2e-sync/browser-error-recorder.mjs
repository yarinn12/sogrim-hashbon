import {isWebKitReloadDiagnostic} from '../e2e/helpers/reloadDiagnostics.mjs';

// WebKit also sends native CORS diagnostics through Playwright's pageerror.
// Keep these separate from actual error/unhandledrejection events. A diagnostic
// must belong to this client's deliberate outage or old-document reload window.
export async function recordBrowserErrors(context, {client, errors, diagnostics, failedUrls,
  origin, isReloading = () => false}) {
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
    const expectedNativeDiagnostic=[...failedUrls].some(url=>{
      const nativeText=`Fetch API cannot load ${url} due to access control checks.`;
      // Playwright splits this native diagnostic at the first colon as though
      // it were "ErrorName: message", consuming the first URL slash as well.
      const colon=nativeText.indexOf(':');
      return error.name===nativeText.slice(0,colon)&&error.message===nativeText.slice(colon+2);
    });
    const expectedReloadDiagnostic=isWebKitReloadDiagnostic(error,{
      browserName:context.browser().browserType().name(), reloading:isReloading(page), origin
    });
    (expectedNativeDiagnostic || expectedReloadDiagnostic ? diagnostics : errors).push(detail);
  }));
}
