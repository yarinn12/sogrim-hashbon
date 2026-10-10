(() => {
  const errors = [];
  const trustedClicks = [], trustedInputs = [];
  addEventListener('click', event => {
    const action = event.target.closest?.('[data-action]')?.dataset.action;
    if (event.isTrusted && action) trustedClicks.push({ action, x: event.clientX, y: event.clientY });
  });
  addEventListener('input', event => {
    if (event.isTrusted && event.target.dataset?.action) {
      trustedInputs.push({ action: event.target.dataset.action, value: event.target.value });
    }
  });
  addEventListener('error', event => errors.push(event.message));
  addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
  const EVENT = 'ios-native-event';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function until(predicate, name, timeout = 30000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = predicate();
      if (value) return value;
      await sleep(100);
    }
    throw new Error(`iOS QA timed out: ${name}`);
  }
  function visible(element) {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }
  function first(selector) { return [...document.querySelectorAll(selector)].find(visible); }
  function point(selector) {
    const element = first(selector);
    if (!element || element.disabled) return null;
    const box = element.getBoundingClientRect();
    const x = box.left + box.width / 2, y = box.top + box.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null;
    const hit = document.elementFromPoint(x, y);
    return hit && (element === hit || element.contains(hit)) ? { x, y } : null;
  }
  let phase = 'starting';
  let openedNote = null;
  function controlGeometry(selector) {
    const element = first(selector);
    if (!element) return null;
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { top: box.top, bottom: box.bottom, left: box.left, right: box.right,
      centerHit: hit?.outerHTML?.slice(0, 500), focused: document.activeElement === element,
      modalScrollTop: element.closest('.expense-modal')?.scrollTop,
      rootClasses: document.documentElement.className };
  }
  globalThis.__iosParityLive = () => ({
    phase, errors, screen: document.querySelector('#app')?.dataset.screen,
    amount: first('[data-action="expense-total"]')?.value || '',
    name: first('[data-action="expense-name"]')?.value || '',
    amountPoint: point('[data-action="expense-total"]'),
    namePoint: point('[data-action="expense-name"]'),
    amountGeometry: controlGeometry('[data-action="expense-total"]'),
    nameGeometry: controlGeometry('[data-action="expense-name"]'),
    nextPoint: point('[data-action="expense-step-next"]'),
    savePoint: point('[data-action="save-expense"]'),
    viewport: { width: innerWidth, height: innerHeight, visualHeight: visualViewport?.height },
    documentScroll: { x: scrollX, y: scrollY },
    restored: Boolean(localStorage.getItem('qa-ios-parity-complete'))
  });
  async function click(selector) {
    const element = await until(() => first(selector), selector);
    element.click();
    await sleep(150);
  }
  function measure(selector) {
    const element = first(selector);
    if (!element) throw new Error(`Required typography target is missing: ${selector}`);
    const style = getComputedStyle(element), bounds = element.getBoundingClientRect();
    const tabBounds = element.closest('.event-workspace-tab')?.getBoundingClientRect();
    let horizontalGlyphOverflow = false, clippedByAncestor = false;
    const words = [], walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const word of node.textContent.matchAll(/\S+/gu)) {
        const range = document.createRange();
        range.setStart(node, word.index); range.setEnd(node, word.index + word[0].length);
        const rects = [...range.getClientRects()].filter(rect => rect.width && rect.height);
        horizontalGlyphOverflow ||= rects.some(rect => rect.left < bounds.left - 1 || rect.right > bounds.right + 1);
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const parentStyle = getComputedStyle(parent);
          if (!['hidden', 'clip', 'auto', 'scroll'].includes(parentStyle.overflowX)) continue;
          const parentBox = parent.getBoundingClientRect();
          clippedByAncestor ||= rects.some(rect => rect.left < parentBox.left + parent.clientLeft - 1
            || rect.right > parentBox.left + parent.clientLeft + parent.clientWidth + 1);
        }
        words.push({ text: word[0], rows: new Set(rects.map(rect => Math.round(rect.top))).size,
          outsideTab: Boolean(tabBounds && rects.some(rect => rect.left < tabBounds.left - 1
            || rect.right > tabBounds.right + 1 || rect.top < tabBounds.top - 1 || rect.bottom > tabBounds.bottom + 1)) });
      }
    }
    return { text: element.value || element.textContent.trim(), fontSize: parseFloat(style.fontSize),
      width: bounds.width, height: bounds.height, words, fontFamily: style.fontFamily,
      scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, horizontalGlyphOverflow,
      clippedByAncestor, isTextControl: ['INPUT', 'TEXTAREA'].includes(element.tagName),
      textOverflow: style.textOverflow, overflowX: style.overflowX,
      bounds: { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right } };
  }
  let captureIndex = 0;
  const pending = new Map();
  globalThis.__iosParityCaptureAck = index => { pending.get(index)?.(); pending.delete(index); };
  async function capture(name, selectors) {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const metrics = Object.fromEntries(Object.entries(selectors).map(([key, selector]) => [key, measure(selector)]));
    phase = name;
    const index = ++captureIndex;
    const completed = new Promise(resolve => pending.set(index, resolve));
    webkit.messageHandlers.iosParity.postMessage({ index, phase, metrics,
      nativeShell: Capacitor.isNativePlatform(), platform: Capacitor.getPlatform(),
      appUrl: location.href,
      rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
      viewport: { width: innerWidth, height: innerHeight, visualHeight: visualViewport?.height,
        visualTop: visualViewport?.offsetTop || 0 },
      documentWidth: document.documentElement.scrollWidth, errors: [...errors],
      nativeAppInfo: globalThis.__iosParityNativeAppInfo,
      openedNote,
      trustedClicks: [...trustedClicks], trustedInputs: [...trustedInputs],
      documentScroll: { x: scrollX, y: scrollY },
      saved: JSON.parse(localStorage.getItem('qa-native-server-row') || 'null'),
      writes: JSON.parse(localStorage.getItem('qa-native-writes') || '[]'),
      pendingOutbox: Object.keys(localStorage).filter(key => key.startsWith('settle-friends-pending-sync:'))
    });
    await Promise.race([completed, sleep(10000).then(() => { throw new Error('Native screenshot acknowledgement missing'); })]);
  }
  globalThis.__iosParityCaptureCurrent = name => capture(name, { heading: '.event-overview-header h1' });
  async function run() {
    await until(() => first('[data-screen-kind="home"]'), 'home');
    await until(() => globalThis.Capacitor?.isNativePlatform?.(), 'actual Capacitor bridge');
    globalThis.__iosParityNativeAppInfo = await Capacitor.Plugins.App.getInfo();
    if (localStorage.getItem('qa-ios-parity-complete')) {
      await click(`[data-action="open-event"][data-event-id="${EVENT}"]`);
      const row = JSON.parse(localStorage.getItem('qa-native-server-row'));
      const savedExpense = row.state.events[0].expenses.find(expense => expense.name === 'QA iOS' && expense.total === 12000);
      const local = JSON.parse(localStorage.getItem('settle-friends-state:ios-native-qa-space'));
      if (!savedExpense || !local?.events[0].expenses.some(expense => expense.id === savedExpense.id && expense.total === 12000)) {
        throw new Error('The acknowledged synthetic expense was lost after native relaunch');
      }
      const expenseSelector = `.expense-row[data-expense-id="${savedExpense.id}"] strong`;
      const rendered = await until(() => first(expenseSelector), 'restored expense rendered in the native UI');
      if (!rendered.textContent.includes('QA iOS')) throw new Error('The restored expense name differs in the UI');
      rendered.scrollIntoView({ block: 'center' });
      await capture('restored', { heading: '.event-overview-header h1', expense: expenseSelector });
      return;
    }
    await capture('home', { brand: '.product-brand-copy strong', description: '.product-home-screen .top .brand .muted' });
    await click(`[data-action="open-event"][data-event-id="${EVENT}"]`);
    await capture('expenses', { heading: '.event-overview-header h1',
      tab: '.event-workspace-tab:nth-child(1) strong',
      tab2: '.event-workspace-tab:nth-child(2) strong', tab3: '.event-workspace-tab:nth-child(3) strong' });
    await click(`[data-action="settle"][data-event-id="${EVENT}"]`);
    await capture('summary', { description: '.settlement-hero-title-row .muted', status: '.settlement-hero .status-chip', helper: '.settlement-stage-heading > div > small' });
    // The summary is intentionally hidden; the visible transfer card is the
    // production control that expands its explanation.
    await click('.transfer-row:has(.transfer-explanation)');
    await until(() => first('.transfer-explanation[open] .transfer-debt-summary'), 'expanded transfer explanation');
    await capture('transfers', { longName: '.transfer-participant:has([data-participant-id="ios-native-guest"]) strong',
      amount: '.transfer-amount > .amount', badge: '.personal-transfer-badge',
      debt: '.transfer-debt-summary', equation: '.transfer-equation-item > span' });
    await click('[data-action="open-event-notes"]');
    await capture('notes', { title: '.event-note-title-line strong', preview: '.event-note-preview' });
    await click('[data-action="open-event-note"]');
    openedNote = { title: first('[data-action="event-note-title"]')?.value,
      body: first('[data-action="event-note-body"]')?.value };
    const expectedNote = JSON.parse(localStorage.getItem('qa-native-server-row')).state.events[0].notes[0];
    if (openedNote.title !== expectedNote.title || openedNote.body !== expectedNote.body) {
      throw new Error('Opening the shortened note preview lost its full title or body');
    }
    await capture('note-opened', { body: '[data-action="event-note-body"]' });
    await click('[data-action="close-event-dialog"]');
    await click('[data-action="edit-profile"]');
    await capture('profile', { name: '.profile-identity-copy strong' });
    await click('[data-action="home"][data-nav-destination="home"]');
    await click(`[data-action="open-event"][data-event-id="${EVENT}"]`);
    await click('[data-action="show-expense-form"]');
    await until(() => first('[data-action="expense-total"]'), 'expense amount field');
    await capture('keyboard-ready', { amount: '[data-action="expense-total"]' });
    await until(() => first('[data-action="expense-total"]')?.value === '120', 'real native amount typing', 90000);
    await capture('keyboard-amount', { amount: '[data-action="expense-total"]', next: '[data-action="expense-step-next"]' });
    await until(() => first('[data-action="expense-name"]')?.value === 'QA iOS', 'real native name typing', 90000);
    await capture('keyboard-name', { name: '[data-action="expense-name"]', next: '[data-action="expense-step-next"]' });
    await until(() => {
      const row = JSON.parse(localStorage.getItem('qa-native-server-row'));
      return row?.state.events[0].expenses.some(expense => expense.name === 'QA iOS' && expense.total === 12000);
    }, 'final synthetic server acknowledgement', 90000);
    await until(() => !Object.keys(localStorage).some(key => key.startsWith('settle-friends-pending-sync:')), 'outbox acknowledgement');
    localStorage.setItem('qa-ios-parity-complete', '1');
    await capture('saved', { heading: '.event-overview-header h1' });
  }
  run().catch(error => {
    errors.push(String(error.stack || error)); phase = 'error';
    webkit.messageHandlers.iosParity.postMessage({ index: ++captureIndex, phase, errors });
  });
})();
