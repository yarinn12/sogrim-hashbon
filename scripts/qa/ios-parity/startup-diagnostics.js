// Observations only: no readiness value, fetch, polling timer or DOM mutation.
(() => {
  const stages = new Set(['script-injected', 'dom-content-loaded', 'window-loaded',
    'synthetic-service-start', 'synthetic-service-ready', 'synthetic-fetch-start',
    'synthetic-fetch-response', 'synthetic-fetch-local', 'synthetic-fetch-blocked',
    'journey-script-start', 'journey-live-defined', 'journey-start', 'home-wait-start',
    'home-wait-ready', 'home-wait-timeout', 'home-wait-error',
    'bridge-wait-start', 'bridge-wait-ready', 'app-info-start',
    'app-info-ready', 'capture-start', 'fonts-wait-start', 'fonts-ready',
    'raf-wait-start', 'raf-ready', 'capture-post', 'capture-ack', 'readiness-committed',
    'journey-error', 'startup-milestone', 'local-resource', 'resource-summary',
    'native-styles-ready', 'native-style-load', 'native-style-error']);
  const phases = new Set(['starting', 'home', 'restored', 'expenses', 'summary', 'transfers',
    'notes', 'note-opened', 'profile', 'keyboard-ready', 'keyboard-amount', 'keyboard-name',
    'saved', 'resumed', 'error']);
  const endpoints = new Set(['config', 'health', 'admin', 'metrics', 'auth-user',
    'workspace', 'referral', 'snapshots', 'profiles', 'profile-write', 'other-synthetic',
    'local-asset', 'blocked-external']);
  const milestones = new Set(['app-module-ready', 'first-screen-rendered', 'auth-ready', 'splash-dismissed']);
  const localAssets = new Map([
    ['/assets/native-style-loader.mjs', 'style-loader'],
    ['/assets/native-prelude.mjs', 'prelude'],
    ['/assets/native-auth.mjs', 'auth'],
    ['/assets/native-core.mjs', 'core'],
    ['/assets/native-account.mjs', 'account'],
    ['/assets/native-experience.mjs', 'experience'],
    ['/assets/native-layers.css', 'layers-css'],
    ['/assets/fonts/local.css', 'font-css'],
    ['/assets/fonts/rubik-hebrew-v31.woff2', 'rubik-font'],
    ['/styles.css', 'base-css'],
    ['/src/vendor/framer-motion-dom.js', 'motion-vendor']
  ]);
  let count = 0;
  let resourceEntries = 0;
  let localMatched = 0;
  let legacyMissed = 0;
  function classifyLocalResource(name) {
    try {
      const page = new URL(location.href);
      const url = new URL(name, page);
      // Custom Capacitor schemes can have an opaque URL.origin even when
      // protocol and host identify the same bundled resource. Never log URLs.
      if (page.protocol !== 'capacitor:' || page.hostname !== 'localhost' || page.port ||
          url.protocol !== page.protocol || url.hostname !== page.hostname || url.port ||
          url.username || url.password) return null;
      const resourceClass = localAssets.get(url.pathname);
      if (!resourceClass) return null;
      return { resourceClass, legacyOriginMatched: url.origin === location.origin };
    } catch { return null; }
  }
  function mark(stage, fields = {}) {
    if (!stages.has(stage) || count >= 128) return false;
    const item = { stage, sequence: ++count, epochMs: Date.now(), monotonicMs: performance.now(),
      timeOriginMs: performance.timeOrigin,
      readyState: document.readyState };
    if (phases.has(fields.phase)) item.phase = fields.phase;
    if (endpoints.has(fields.endpoint)) item.endpoint = fields.endpoint;
    if (milestones.has(fields.milestone)) item.milestone = fields.milestone;
    if ([...localAssets.values()].includes(fields.resourceClass)) item.resourceClass = fields.resourceClass;
    if (typeof fields.legacyOriginMatched === 'boolean') item.legacyOriginMatched = fields.legacyOriginMatched;
    if (['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'HEAD', 'OPTIONS'].includes(fields.method)) item.method = fields.method;
    if (['script', 'link', 'css', 'fetch', 'other'].includes(fields.initiator)) item.initiator = fields.initiator;
    const homeStrings = {
      urlScheme: ['capacitor', 'https', 'http', 'file', 'other'],
      appScreen: ['home', 'boot', 'other', 'none'],
      homeDisplay: ['absent', 'none', 'block', 'flex', 'grid', 'contents', 'inline', 'inline-block', 'other'],
      homeVisibility: ['absent', 'visible', 'hidden', 'collapse', 'other'],
      fontStatus: ['loading', 'loaded', 'unavailable'],
      nativeStyleMedia: ['absent', 'print', 'all', 'none', 'other']
    };
    for (const [key, allowed] of Object.entries(homeStrings)) {
      if (allowed.includes(fields[key])) item[key] = fields[key];
    }
    for (const key of ['rootNativeStylesPending', 'rootSplashActive', 'rootAuthPending',
      'rootUpdateChecking', 'appBoot', 'homeVisible', 'nativeStyleSheetPresent']) {
      if (typeof fields[key] === 'boolean') item[key] = fields[key];
    }
    for (const key of ['index', 'request', 'status', 'startMs', 'durationMs', 'responseEndMs',
      'transferSize', 'resourceEntries', 'localMatched', 'legacyMissed',
      'deadlineEpochMs', 'timeoutMs', 'probeCount', 'homeCount', 'homeWidth', 'homeHeight',
      'authReadyMs', 'appModuleReadyMs', 'firstScreenRenderedMs', 'splashDismissedMs']) {
      if (Number.isFinite(fields[key]) && fields[key] >= 0) item[key] = fields[key];
    }
    for (const key of ['homeLeft', 'homeTop']) {
      if (Number.isFinite(fields[key]) && Math.abs(fields[key]) <= 10000) item[key] = fields[key];
    }
    try { globalThis.webkit?.messageHandlers?.iosParity?.postMessage({ kind: 'startup-diagnostic', startup: item }); }
    catch { /* A diagnostic must not break the original journey. */ }
    return true;
  }
  globalThis.__iosParityStartup = Object.freeze({ mark });
  mark('script-injected');
  function summarizeResources() {
    mark('resource-summary', { resourceEntries, localMatched, legacyMissed });
  }
  addEventListener('DOMContentLoaded', () => {
    mark('dom-content-loaded');
    summarizeResources();
  }, { once: true });
  addEventListener('load', () => {
    mark('window-loaded');
    summarizeResources();
  }, { once: true });
  // Capture the existing resource event before the product load listener runs.
  // No extra frame requests, network calls or readiness writes.
  for (const type of ['load', 'error']) document.addEventListener(type, event => {
    const sheet = event.target;
    if (sheet?.tagName === 'LINK' && sheet.dataset?.nativeLayers === 'true') {
      mark(`native-style-${type}`, { nativeStyleMedia: sheet.media || 'all' });
    }
  }, true);
  document.addEventListener('sogrim:native-styles-ready', () => mark('native-styles-ready'), { once: true });
  // Existing product performance marks identify bootstrap/render boundaries.
  // Resource observations use timings only, with no URL, headers or payload.
  try {
    const seenResources = new Set();
    function record(entry) {
      if (entry.entryType === 'mark' && milestones.has(entry.name.slice('sogrim:start:'.length))
          && entry.name.startsWith('sogrim:start:')) {
        mark('startup-milestone', { milestone: entry.name.slice('sogrim:start:'.length), startMs: entry.startTime });
      } else if (entry.entryType === 'resource') {
        // Existing entries can precede this script. De-duplicate the initial
        // snapshot against later observer delivery without sending names.
        const key = `${entry.name}\0${entry.startTime}\0${entry.responseEnd}`;
        if (seenResources.has(key)) return;
        seenResources.add(key);
        resourceEntries++;
        const local = classifyLocalResource(entry.name);
        if (!local) return;
        localMatched++;
        if (!local.legacyOriginMatched) legacyMissed++;
        mark('local-resource', { ...local, initiator: entry.initiatorType,
          startMs: entry.startTime, durationMs: entry.duration,
          responseEndMs: entry.responseEnd, transferSize: entry.transferSize });
      }
    }
    const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) record(entry); });
    observer.observe({ entryTypes: ['mark', 'resource'] });
    for (const entry of performance.getEntriesByType?.('resource') || []) record(entry);
  } catch { /* Optional public PerformanceObserver support. */ }
})();
