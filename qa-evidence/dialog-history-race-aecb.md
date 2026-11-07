# Delayed dialog history: regression evidence

Source baseline: `36d21e23f5a483262c18ea44334db164256370c3` (`aecb3fe` application candidate). Tests use synthetic local state and actual browser `popstate` events. A test fixture holds only the app's first requested `history.back()` or `history.go(-N)`, then releases a real traversal; it does not call `handleBrowserHistoryBack` directly.

## Cause and change

`closeDialogWithHistory()` closed the UI synchronously but browser history moved asynchronously. A later `popstate` could restore an old note editor or route over newer navigation. A single in-flight rewind marker also got overwritten if the user opened and closed another editor before the first Back settled. Multi-step expense saves could leave closed editor entries in the Back chain.

The fix remembers app routes pushed while a dialog rewind is pending. When the old base entry becomes active, it replays those routes from that entry, cutting the closed dialog entries out of the browser's Back chain. It refreshes the remembered route when a draft changes. Repeated closes keep the earliest pending base and discard routes that were themselves closed; an intermediate `popstate` from an already closed editor is corrected without reopening the editor. A normal rewind with no newer navigation still restores its base route.

## Red/green scenarios

- Before this fix, the original late note-editor `popstate` restored `event-notes` over a newer event screen in desktop Firefox. After the fix the event remains visible, the saved note remains in local storage, and the next user Back returns home.
- With the first forward-traversal implementation, a new navigation during recovery made Back skip the immediately previous screen; a typed event name remained visible but the actual `history.state.view.newEventDraft.name` was empty. The replay implementation preserves both the visible input and the history payload after navigation and Back.
- Before replay, the actual multi-step expense-save rewind with newer profile navigation restored an obsolete route. After replay the profile remains active, two user Back actions return to event then home without reopening the expense editor. The saved expense is present in local storage and after page reload.
- Before overlapping-close handling, two consecutive closes of the same note editor caused the second real `popstate` to reopen the first closed editor. After the fix neither editor reopens, including when profile navigation occurs before the first held Back is released; a later user Back returns to notes.
- A rewind without newer navigation still returns to notes and keeps the note modal closed.

The local Playwright server's `GET /api/state` is a seed fixture, not the app's local storage write acknowledgement: a new locally saved expense does not appear in that endpoint in this configuration. The browser test therefore asserts the final local storage value and verifies it again after reload. It does not claim cloud acknowledgement or physical-device behavior.

## Final runs

- Focused red runs used desktop Firefox with retries disabled. The stale route, stale draft payload, multi-step rewind, and overlapping close each failed on their corresponding pre-fix implementation; all six focused cases pass on the final code.
- Full affected cross-platform file: **48 passed**, four desktop/compact browser profiles, `--retries=0`.
- Full affected mobile file: **60 passed**, Android, iPhone, iPad, large-text iPhone, and 200% reflow profiles, `--retries=0`.
- `npm test`: **3,398 passed**, **0 failed**, **0 skipped**; includes syntax, unit, and database integration tests. The isolated `confirmedActionLifecycle` VM fixture now declares the handler's new coordination state.

These are local synthetic browser and database tests. They do not prove latency or delivery on live accounts, physical devices, or the deployed service.

The independent Chromium reviewer retained a separate two-close RED on Git blob `50fe5d72e18d7a874c8a0a66d04560c10ff9dd6c`, then confirmed GREEN on final product blob `c066c041c6f098c943306bf97909aad99b6d3d62`. The final source remained identical during the review; neither close, the first deferred Back, nor Profile-to-Notes Back reopened an editor.

After integration with the Native/font QA changes at root commit `77d6bda1f976b58608734112a5b3b8c0e6aa864c`, a controlled baseline used the published AECB `src/app.mjs` while keeping all six permanent tests unchanged. Five cases failed for missing newer routes/input or a reopened closed note editor; the ordinary rewind without newer navigation passed. Restoring the exact original working-copy bytes made all six pass in Firefox in 17.8 seconds, with retries disabled. The source SHA-256 before and after restoration was `a8cd4925a90ca54a0a44185225c6e0191ed6c79a8c5708da4c50e86cb26d44c5`; the baseline source SHA-256 was `968e3bfb39700782e34f5352795af7c0c2ca6fd180d1577bf8085b198d26d45c`. Logs, original failure traces and the receipt are retained under the root output directory `history-controls-77d6bda`. These are browser/local-storage proofs, not Native or cloud acceptance.

The combined root candidate passed 3,403/3,403 normal unit/integration tests with zero failures, cancellations or skips, including the five Android font-fault controls. Its iOS QA DOM measurements and journey preflight then passed all 24 cases across the four desktop/compact browser profiles. The original two Firefox journey failures are retained separately; no retry, assertion, deadline or acceptance tolerance was relaxed.
