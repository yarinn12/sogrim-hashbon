(() => {
  // Injected into a QA-only WKWebView before the pinned app's own scripts run.
  // The Python preparer replaces these tokens in the copied simulator bundle.
  const sourceSha = __TYPOGRAPHY_SOURCE_SHA__;
  const state = __TYPOGRAPHY_SEEDED_STATE__;
  const owner = state.currentParticipantId;
  const eventId = state.events[0].id;
  if (!localStorage.getItem("typography-probe-seeded")) {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
    localStorage.setItem("settle-friends-local-profile", JSON.stringify({
      participantId: owner, displayName: "ירין יצחק", avatarPreset: "avatar-1"
    }));
    localStorage.setItem("settle-friends-current-participant", owner);
    localStorage.setItem("typography-probe-seeded", "1");
  }
  sessionStorage.setItem("settle-friends-skip-next-splash", "1");

  const phase = new URL(location.href).searchParams.get("typography_probe") || "normal";
  const report = (name, fields) => new Promise((resolve, reject) => {
    if (!window.webkit?.messageHandlers?.typography) {
      reject(new Error("Native typography message handler unavailable"));
      return;
    }
    const timer = setTimeout(() => reject(new Error(`Native snapshot timed out: ${name}`)), 15000);
    window.__typographyProbeContinue = () => {
      clearTimeout(timer);
      window.__typographyProbeContinue = null;
      resolve();
    };
    window.webkit.messageHandlers.typography.postMessage({
      phase: name, sourceSha, nativeShell: false, url: location.href, ...fields
    });
  });
  const visible = element => Boolean(element && element.getClientRects().length &&
    getComputedStyle(element).visibility !== "hidden");
  const waitFor = (selector, timeoutMs = 20000) => new Promise((resolve, reject) => {
    const started = performance.now();
    const tick = () => {
      const element = [...document.querySelectorAll(selector)].find(visible);
      if (element) return resolve(element);
      if (performance.now() - started >= timeoutMs) {
        return reject(new Error(`Timed out waiting for ${selector} in ${phase}`));
      }
      setTimeout(tick, 80);
    };
    tick();
  });
  const settle = async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  };
  const click = async selector => { (await waitFor(selector)).click(); };
  const linesOf = element => {
    const lines = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    while (walker.nextNode()) {
      const node = walker.currentNode;
      for (const match of node.textContent.matchAll(/\S+/g)) {
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const rect = range.getClientRects()[0];
        if (!rect || !rect.width || !rect.height) continue;
        let line = lines.find(item => Math.abs(item.top - rect.top) <= 6);
        if (!line) { line = { top: rect.top, words: [] }; lines.push(line); }
        line.words.push(match[0]);
      }
    }
    lines.sort((a, b) => a.top - b.top);
    return lines.map(line => line.words.join(" "));
  };
  const measure = selector => {
    const element = document.querySelector(selector);
    if (!visible(element)) throw new Error(`Measurement target unavailable: ${selector}`);
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return { selector, text: element.textContent.trim(), width: rect.width,
      height: rect.height, fontFamily: style.fontFamily, fontWeight: style.fontWeight,
      fontSize: style.fontSize, lineHeight: style.lineHeight,
      whiteSpace: style.whiteSpace, textWrap: style.textWrap,
      wordLines: linesOf(element), scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth };
  };
  const context = () => ({
    rootFontSize: getComputedStyle(document.documentElement).fontSize,
    bodyFontSize: getComputedStyle(document.body).fontSize,
    viewport: { width: innerWidth, height: innerHeight, scale: devicePixelRatio },
    loadedFaces: [...document.fonts].filter(face => face.status === "loaded")
      .map(face => ({ family: face.family, weight: face.weight })),
    fontResources: performance.getEntriesByType("resource")
      .filter(entry => /\/assets\/fonts\//.test(entry.name))
      .map(entry => ({ name: new URL(entry.name).pathname, durationMs: Math.round(entry.duration) }))
  });
  const weightControl = async () => {
    const value = "סוגרים חשבון 2026";
    const canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = 100;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const samples = [];
    for (const weight of [400, 500, 700, 900]) {
      await document.fonts.load(`${weight} 48px Rubik`, value);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${weight} 48px Rubik`;
      ctx.fillStyle = "black";
      ctx.fillText(value, 8, 65);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let inkPixels = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 32) inkPixels++;
      samples.push({ weight, width: ctx.measureText(value).width, inkPixels });
    }
    return samples;
  };
  const next = mode => {
    const url = new URL("/", location.href);
    url.searchParams.set("dynamic-type-preview", "32");
    url.searchParams.set("typography_probe", mode);
    location.assign(url.href);
  };

  async function run() {
    await waitFor('[data-screen-kind="home"]');
    await settle();
    if (phase === "normal") {
      const control = await weightControl();
      await report("home", { ...context(), rootDefault: true, weightControl: control,
        home: measure(".product-home-screen .top .brand .muted") });
      await click(`[data-action="open-event"][data-event-id="${eventId}"]`);
      await waitFor('[data-screen-kind="event"]');
      await click(`[data-action="settle"][data-event-id="${eventId}"]`);
      await waitFor('[data-event-view="summary"]');
      await settle();
      await report("summary", { ...context(),
        description: measure(".settlement-hero .muted"),
        transferHelper: measure(".settlement-stage-heading > div > small") });
      next("share");
      return;
    }
    if (phase === "share") {
      await click(`[data-action="open-event"][data-event-id="${eventId}"]`);
      await waitFor('[data-screen-kind="event"]');
      await click(`[data-action="open-event-participants"][data-event-id="${eventId}"]`);
      await click('[data-action="open-event-participant-add"]');
      await click('[data-action="open-event-share"]');
      await waitFor('.event-share-modal');
      await settle();
      await report("share", { ...context(),
        shareButton: measure(".event-share-modal button.primary-button.whatsapp-button") });
      next("repayment");
      return;
    }
    if (phase === "repayment") {
      await click('[data-action="new-event"]');
      await click('[data-action="new-event-type"][data-event-type="standard"]');
      const name = await waitFor('[data-action="new-event-name"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(name, "בדיקת טיפוגרפיה");
      name.dispatchEvent(new Event("input", { bubbles: true }));
      await click('[data-action="open-new-event-settlement"]');
      await waitFor('[data-event-creation-step="settlement"]');
      await click('.new-event-inline-picker summary');
      await click('.new-event-inline-picker-menu button[data-choice-value="direct"]');
      const picker = await waitFor('.new-event-inline-picker details');
      if (!picker.open) await click('.new-event-inline-picker summary');
      await settle();
      await report("repayment", { ...context(),
        selectedValue: measure('.new-event-inline-picker summary > span:first-child'),
        directOption: measure('.new-event-inline-picker-menu button[data-choice-value="direct"] > span:first-child') });
      return;
    }
    throw new Error(`Unknown probe phase: ${phase}`);
  }
  window.addEventListener("load", () => run().catch(async error => {
    try { await report("error", { message: String(error?.stack || error) }); }
    catch { /* The workflow timeout will preserve server and simulator logs. */ }
  }), { once: true });
})();
