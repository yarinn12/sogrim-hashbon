// QA-only, bounded observation of real DOM input. Never reads text, values or IDs.
(() => {
  const kinds = ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend',
    'touchcancel', 'mousedown', 'mouseup', 'click'];
  const actions = new Set(['expense-total', 'expense-step-next', 'expense-name', 'save-expense']);
  const tags = new Set(['button', 'input', 'span', 'div', 'label', 'section', 'svg', 'path', 'none']);
  const limit = 48;
  const events = [];
  let armed = false;
  let phase = 'starting';
  let dropped = 0;
  let bridgeErrors = 0;

  function describe(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    const action = element?.closest?.('[data-action]')?.getAttribute('data-action');
    const tag = element?.tagName?.toLowerCase() || 'none';
    return { tag: tags.has(tag) ? tag : 'other',
      action: actions.has(action) ? action : 'other' };
  }

  function record(event) {
    if (!armed) return;
    if (events.length >= limit) { dropped += 1; return; }
    const source = event.changedTouches?.[0] || event;
    const x = Number.isFinite(source.clientX) ? Math.round(source.clientX * 10) / 10 : null;
    const y = Number.isFinite(source.clientY) ? Math.round(source.clientY * 10) / 10 : null;
    const hit = x === null || y === null ? null : document.elementFromPoint(x, y);
    const item = { sequence: events.length + 1, type: event.type,
      trusted: event.isTrusted, epochMs: Math.round(performance.timeOrigin + performance.now()),
      x, y, pointerType: ['touch', 'mouse', 'pen'].includes(event.pointerType) ? event.pointerType : 'other',
      phase, target: describe(event.target), hit: describe(hit) };
    events.push(item);
    try {
      globalThis.webkit?.messageHandlers?.iosParity?.postMessage({ kind: 'input-event', inputEvent: item });
    } catch {
      bridgeErrors += 1;
    }
  }

  for (const kind of kinds) document.addEventListener(kind, record, { capture: true, passive: true });
  globalThis.__iosParityInputTrace = {
    arm() { armed = true; },
    setPhase(value) { phase = value; },
    snapshot() { return { count: events.length, dropped, bridgeErrors, recent: events.slice(-12) }; }
  };
})();
