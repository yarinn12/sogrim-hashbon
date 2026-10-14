// Observations only: no readiness value, fetch, polling timer or DOM mutation.
(() => {
  const stages = new Set(['script-injected', 'dom-content-loaded', 'window-loaded',
    'synthetic-service-start', 'synthetic-service-ready', 'synthetic-fetch-start',
    'synthetic-fetch-response', 'synthetic-fetch-local', 'synthetic-fetch-blocked',
    'journey-script-start', 'journey-live-defined', 'journey-start', 'home-wait-start',
    'home-wait-ready', 'bridge-wait-start', 'bridge-wait-ready', 'app-info-start',
    'app-info-ready', 'capture-start', 'fonts-wait-start', 'fonts-ready',
    'raf-wait-start', 'raf-ready', 'capture-post', 'capture-ack', 'readiness-committed',
    'journey-error', 'startup-milestone', 'local-resource']);
  const phases = new Set(['starting', 'home', 'restored', 'expenses', 'summary', 'transfers',
    'notes', 'note-opened', 'profile', 'keyboard-ready', 'keyboard-amount', 'keyboard-name',
    'saved', 'resumed', 'error']);
  const endpoints = new Set(['config', 'health', 'admin', 'metrics', 'auth-user',
    'workspace', 'referral', 'snapshots', 'profiles', 'profile-write', 'other-synthetic',
    'local-asset', 'blocked-external']);
  const milestones = new Set(['app-module-ready', 'first-screen-rendered', 'auth-ready', 'splash-dismissed']);
  let count = 0;
  function mark(stage, fields = {}) {
    if (!stages.has(stage) || count >= 128) return false;
    const item = { stage, sequence: ++count, epochMs: Date.now(), monotonicMs: performance.now(),
      readyState: document.readyState };
    if (phases.has(fields.phase)) item.phase = fields.phase;
    if (endpoints.has(fields.endpoint)) item.endpoint = fields.endpoint;
    if (milestones.has(fields.milestone)) item.milestone = fields.milestone;
    if (['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'HEAD', 'OPTIONS'].includes(fields.method)) item.method = fields.method;
    if (['script', 'link', 'css', 'fetch', 'other'].includes(fields.initiator)) item.initiator = fields.initiator;
    for (const key of ['index', 'request', 'status', 'startMs', 'durationMs', 'responseEndMs', 'transferSize']) {
      if (Number.isFinite(fields[key]) && fields[key] >= 0) item[key] = fields[key];
    }
    try { globalThis.webkit?.messageHandlers?.iosParity?.postMessage({ kind: 'startup-diagnostic', startup: item }); }
    catch { /* A diagnostic must not break the original journey. */ }
    return true;
  }
  globalThis.__iosParityStartup = Object.freeze({ mark });
  mark('script-injected');
  addEventListener('DOMContentLoaded', () => mark('dom-content-loaded'), { once: true });
  addEventListener('load', () => mark('window-loaded'), { once: true });
  // Existing product performance marks identify bootstrap/render boundaries.
  // Resource observations use timings only, with no URL, headers or payload.
  try {
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'mark' && milestones.has(entry.name.slice('sogrim:start:'.length))
            && entry.name.startsWith('sogrim:start:')) {
          mark('startup-milestone', { milestone: entry.name.slice('sogrim:start:'.length), startMs: entry.startTime });
        } else if (entry.entryType === 'resource') {
          const url = new URL(entry.name, location.href);
          if (url.origin === location.origin && /\.(?:m?js|css|woff2?)$/.test(url.pathname)) {
            mark('local-resource', { initiator: entry.initiatorType, startMs: entry.startTime,
              durationMs: entry.duration, responseEndMs: entry.responseEnd, transferSize: entry.transferSize });
          }
        }
      }
    });
    observer.observe({ entryTypes: ['mark', 'resource'] });
  } catch { /* Optional public PerformanceObserver support. */ }
})();
