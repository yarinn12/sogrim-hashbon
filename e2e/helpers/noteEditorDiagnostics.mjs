// Opt-in diagnostics for synthetic local tests only. The app module served by
// Playwright is instrumented in memory; no debug globals enter production.
export async function installNoteEditorDiagnostics(page) {
  await page.route("**/src/app.mjs*", async route => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({ response, body: `${source}\nwindow.__qaNoteEditorState = () => ({
      screen: screen?.name, eventId: screen?.eventId,
      dialog: eventDialog ? { kind: eventDialog.kind, eventId: eventDialog.eventId,
        noteId: eventDialog.noteId, titleLength: eventDialog.titleDraft?.length,
        bodyLength: eventDialog.bodyDraft?.length, saving: eventDialog.saving,
        error: eventDialog.error } : null
    });\n` });
  });
  await page.addInitScript(() => {
    const log = [];
    window.__qaNoteEditorLog = log;
    const sample = (kind, event) => {
      const body = document.querySelector('[data-action="event-note-body"]');
      const target = event?.target;
      const historyEntry = history.state;
      log.push({ at: Math.round(performance.now()), kind,
        state: window.__qaNoteEditorState?.(),
        bodyLength: body?.value?.length,
        action: target?.dataset?.action,
        targetTag: target?.tagName, targetClass: target?.className,
        targetLength: target?.value?.length,
        targetConnected: target?.isConnected,
        activeAction: document.activeElement?.dataset?.action,
        historyDepth: historyEntry?.depth,
        historyScreen: historyEntry?.view?.screen?.name,
        historyDialog: historyEntry?.view?.eventDialog ? {
          kind: historyEntry.view.eventDialog.kind, eventId: historyEntry.view.eventDialog.eventId,
          noteId: historyEntry.view.eventDialog.noteId,
          bodyLength: historyEntry.view.eventDialog.bodyDraft?.length
        } : null });
      if (log.length > 700) log.shift();
    };
    for (const kind of ["input", "change", "focusin", "click"]) {
      document.addEventListener(kind, event => sample(`${kind}:capture`, event), true);
      document.addEventListener(kind, event => sample(`${kind}:bubble`, event));
    }
    window.addEventListener("popstate", event => {
      sample("popstate:before", event);
      queueMicrotask(() => sample("popstate:after", event));
    }, true);
    for (const name of ["pushState", "replaceState", "back", "go"]) {
      const original = history[name];
      history[name] = function(...args) {
        sample(`history:${name}:before`);
        const result = original.apply(this, args);
        sample(`history:${name}:after`);
        return result;
      };
    }
    window.__qaNoteEditorSample = sample;
    const focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function(...args) {
      sample("focus:call", { target: this });
      log[log.length - 1].caller = new Error().stack;
      return focus.apply(this, args);
    };
  });
}

export async function attachNoteEditorDiagnostics(page, testInfo) {
  const log = await page.evaluate(() => {
    window.__qaNoteEditorSample?.("test:end");
    return window.__qaNoteEditorLog ?? [];
  }).catch(() => []);
  await testInfo.attach("note-editor-timing", { contentType: "application/json", body: JSON.stringify(log, null, 2) });
}

// Reproduce a late dialog animation frame after the user has already
// focused a field. Browser keyboard input must still reach that field.
export async function installDelayedDialogFrameFixture(page, action = "new-event-note") {
  await page.addInitScript(({ action }) => {
    const requestFrame = window.requestAnimationFrame.bind(window);
    let holding = false;
    const frames = new Map();
    let nextFrameId = -1;
    const cancelFrame = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => {
      if (!holding) return requestFrame(callback);
      const id = nextFrameId--;
      frames.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = id => frames.has(id) ? frames.delete(id) : cancelFrame(id);
    document.addEventListener("click", event => {
      if (window.__qaDelayNextNoteDialog && event.target.closest(`[data-action="${action}"]`)) {
        window.__qaDelayNextNoteDialog = false;
        holding = true;
      }
    }, true);
    window.__qaFlushDialogFrames = () => {
      holding = false;
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(performance.now());
      return pending.length;
    };
  }, { action });
}
