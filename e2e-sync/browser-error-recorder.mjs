// WebKit also sends native CORS diagnostics through Playwright's pageerror.
// Keep these separate from actual error/unhandledrejection events. A diagnostic
// is expected only for an exact URL deliberately failed by this client's fixture.
export async function recordBrowserErrors(context, {client, errors, diagnostics, failedUrls}) {
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
    (expectedNativeDiagnostic ? diagnostics : errors).push(detail);
  }));
}
