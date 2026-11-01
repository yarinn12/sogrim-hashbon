import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {renderEventNotesView, renderEventNoteRowView} from "../src/ui/eventNotesPresentation.mjs";

// Read normalized source so adapter checks behave identically on Windows and Linux.
const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8").replaceAll("\r\n", "\n");
const presentation = readFileSync(new URL("../src/ui/eventNotesPresentation.mjs", import.meta.url), "utf8");
function fn(name, next) {
  const start = app.indexOf("function " + name + "("), end = app.indexOf("\nfunction " + next + "(", start);
  assert(start >= 0 && end > start);
  return app.slice(start, end);
}

function renderNotes({notes = [], canEdit = true, locked = false, dialogEventId = null} = {}) {
  const event = {id: "event-one", notes: Object.freeze(notes), locked};
  const before = structuredClone(event), sections = [], visits = [], headerCalls = [], navCalls = [];
  const participants = Object.freeze(["participant-one"]);
  const html = runInNewContext(fn("renderEventNotes", "renderEventNotesSection") + "\nrenderEventNotes(event)", {
    event, eventDialog: dialogEventId ? {eventId: dialogEventId} : null,
    renderEventNotesView, escapeAttribute: value => String(value),
    rememberRecentEvent: id => visits.push(id),
    canCurrentParticipantEdit: value => {assert.equal(value, event); return canEdit;},
    activeEventParticipants: value => {assert.equal(value, event); return participants;},
    renderEventHeader: (value, people) => {headerCalls.push([value, people]); return "<original-header></original-header>";},
    renderNotice: () => "<original-notice></original-notice>",
    renderEventWorkspaceNav: (value, active) => {navCalls.push([value, active]); return "<original-tabs></original-tabs>";},
    renderEventNotesSection: (value, values, label, pinned) => {
      assert.equal(value, event); sections.push({ids: Array.from(values, note => note.id), label, pinned});
      return "<sorted-section>" + Array.from(values, note => note.id).join(",") + "</sorted-section>";
    },
    renderEventDialog: value => {assert.equal(value, event); return "<scoped-dialog></scoped-dialog>";}
  });
  assert.deepEqual(event, before);
  assert.deepEqual(visits, [event.id]);
  assert.deepEqual(headerCalls, [[event, participants]]);
  assert.deepEqual(navCalls, [[event, "notes"]]);
  return {html, sections};
}

test("shared notes keep synchronized workspace actions and their dedicated save/delete boundaries", () => {
  const clickHandler = app.match(/async function handleClick\(event\) \{([\s\S]*?)\n\}\n\nfunction closeOpenTransientMenus/)?.[1] ?? "";
  const deleteHandler = app.match(/async function deleteCurrentEvent\(\) \{([\s\S]*?)\n\}\n\nfunction [A-Za-z]/)?.[1] ?? "";
  assert.match(app, /screen\.name === "event-notes"/);
  assert.match(app, /renderEventNotesView/);
  assert.match(app, /renderEventNoteRowView/);
  assert.match(presentation, /data-action="new-event-note"/);
  assert.match(presentation, /data-action="open-event-note"/);
  assert.match(app, /forceSharedEventIds: \[eventId\]/);
  for (const action of ["open-event-notes", "new-event-note", "save-event-note"]) assert(clickHandler.includes('action === "' + action + '"'));
  assert.doesNotMatch(deleteHandler, /event-note/);
});

test("notes adapter preserves pin-first ordering, descending update time and stable note-ID ties without mutating notes", () => {
  const {html, sections} = renderNotes({notes: [
    {id: "ordinary-old", pinned: false, updatedAt: "2026-10-01T00:00:00Z"},
    {id: "pin-b", pinned: true, updatedAt: "2026-10-02T00:00:00Z"},
    {id: "ordinary-new", pinned: false, updatedAt: "2026-10-03T00:00:00Z"},
    {id: "pin-a", pinned: true, updatedAt: "2026-10-02T00:00:00Z"}
  ]});
  assert.deepEqual(sections, [
    {ids: ["pin-a", "pin-b"], label: "מוצמד", pinned: true},
    {ids: ["ordinary-new", "ordinary-old"], label: "", pinned: false}
  ]);
  assert(html.indexOf("original-header") < html.indexOf("original-tabs"));
  assert(html.indexOf("original-tabs") < html.indexOf('data-action="new-event-note"'));
  assert.doesNotMatch(html, /event-notes-intro|avatar-stack/);
});

test("notes adapter retains creation restrictions, useful empty state and event-scoped dialog visibility", () => {
  for (const locked of [true, false]) {
    const {html, sections} = renderNotes({canEdit: false, locked, dialogEventId: "other-event"});
    assert.match(html, /data-action="new-event-note"[^>]*disabled/);
    assert(html.includes(locked ? "האירוע סגור. הפתקים זמינים לקריאה." : "הפתקים זמינים לקריאה בלבד."));
    assert.match(html, /עוד אין פתקים באירוע/);
    assert.doesNotMatch(html, /scoped-dialog/);
    assert.deepEqual(sections, []);
  }
  assert.match(renderNotes({dialogEventId: "event-one"}).html, /scoped-dialog/);
});

test("note row adapter keeps original participant/date derivation and fallback title", () => {
  const event = {id: "event-one"}, note = {id: "note-one", title: " ", body: " original body ", pinned: true, updatedByParticipantId: "participant-one", updatedAt: "2026-10-28T00:00:00Z"};
  const before = structuredClone(note), attribution = [];
  const html = runInNewContext(fn("renderEventNoteRow", "formatEventNoteUpdatedAt") + "\nrenderEventNoteRow(event, note)", {
    event, note, renderEventNoteRowView,
    participantName: (id, value) => {attribution.push([id, value]); return "נועם לוי";},
    formatEventNoteUpdatedAt: value => {assert.equal(value, note.updatedAt); return "עודכן 28.10";}
  });
  assert.deepEqual(attribution, [["participant-one", event]]);
  assert.deepEqual(note, before);
  assert.match(html, /פתק ללא כותרת/);
  assert.match(html, /עודכן על ידי נועם לוי · 28.10/);
  assert.equal((html.match(/data-action="open-event-note"/g) || []).length, 1);
});
