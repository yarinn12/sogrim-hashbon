import test from "node:test";
import assert from "node:assert/strict";
import {renderEventNotesView, renderEventNoteRowView} from "../src/ui/eventNotesPresentation.mjs";

function render(overrides = {}) {
  const model = {eventId: "event-one", canEdit: true, locked: false, hasNotes: true, ...overrides};
  const initial = structuredClone(model);
  const calls = [];
  const callbacks = Object.fromEntries(["Header", "Notice", "WorkspaceNav", "Sections", "Dialog"].map(name => ["render" + name, () => {
    calls.push(name);
    return `<fixture-${name}></fixture-${name}>`;
  }]));
  const html = renderEventNotesView(model, callbacks);
  assert.deepEqual(model, initial);
  return {html, calls};
}

test("notes view retains original header, notice, tabs, supplied sorted sections and dialog in approved order", () => {
  const {html, calls} = render();
  assert.deepEqual(calls, ["Header", "Notice", "WorkspaceNav", "Sections", "Dialog"]);
  assert(html.indexOf("fixture-Header") < html.indexOf("fixture-WorkspaceNav"));
  assert(html.indexOf("fixture-WorkspaceNav") < html.indexOf('data-action="new-event-note"'));
  assert(html.indexOf('data-action="new-event-note"') < html.indexOf("fixture-Sections"));
  assert(html.indexOf("fixture-Sections") < html.indexOf("fixture-Dialog"));
  assert.match(html, /data-inline-sync-status[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
  assert.doesNotMatch(html, /event-notes-intro|כל מה שחשוב לאירוע/);
});

test("notes view escapes event identifiers in screen, action and sync status", () => {
  const {html} = render({eventId: 'id"><script>'});
  assert.equal((html.match(/id&quot;&gt;&lt;script&gt;/g) || []).length, 3);
  assert.doesNotMatch(html, /<script>/);
});

test("notes view renders exactly one clear explanation and disables creation for locked or restricted contexts", () => {
  for (const locked of [true, false]) {
    const {html} = render({canEdit: false, locked});
    assert.match(html, /data-action="new-event-note"[^>]*disabled/);
    assert(html.includes(locked ? "האירוע סגור. הפתקים זמינים לקריאה." : "הפתקים זמינים לקריאה בלבד."));
    assert(!html.includes("מידע משותף לכל משתתפי האירוע."));
  }
  assert.doesNotMatch(render().html, /data-action="new-event-note"[^>]*disabled/);
});

test("empty notes show a useful empty state without invoking sorted section rendering", () => {
  const {html, calls} = render({hasNotes: false});
  assert(!calls.includes("Sections"));
  assert.match(html, /עוד אין פתקים באירוע/);
  assert.match(html, /כתובות, פרטי הזמנה ומידע לקבוצה/);
  assert.equal((html.match(/data-action="new-event-note"/g) || []).length, 1);
});

function row(overrides = {}) {
  const model = {eventId: "event-one", noteId: "note-one", title: "פרטי הלינה", body: "הכתובת של מקום הלינה", pinned: true, updatedBy: "נועם לוי", updatedLabel: "28.10", ...overrides};
  const initial = structuredClone(model);
  const html = renderEventNoteRowView(model);
  assert.deepEqual(model, initial);
  return html;
}

test("note row has one open target with note identity, meaningful name and update metadata", () => {
  const html = row();
  assert.equal((html.match(/data-action="open-event-note"/g) || []).length, 1);
  assert.equal((html.match(/<button\b/g) || []).length, 1);
  assert.match(html, /event-note-row is-pinned/);
  assert.match(html, /data-event-id="event-one" data-note-id="note-one"/);
  assert.match(html, /aria-label="פתיחת הפתק פרטי הלינה"/);
  assert.match(html, /עודכן על ידי נועם לוי · 28.10/);
  assert.doesNotMatch(html, /avatar-stack|data-action="open-participant"/);
});

test("note row escapes untrusted note content, identities and attribution", () => {
  const html = row({eventId: 'event" onfocus="bad', noteId: 'note" onclick="bad', title: '<script>&"', body: '<img src=x onerror="bad">', updatedBy: "<author>", updatedLabel: "<date>"});
  assert.doesNotMatch(html, /<script>|<img|<author>|<date>|data-event-id="event" onfocus=/);
  assert.match(html, /&lt;script&gt;&amp;&quot;/);
  assert.match(html, /&lt;img src=x onerror=&quot;bad&quot;&gt;/);
  assert.match(html, /&lt;author&gt; · &lt;date&gt;/);
});

test("note excerpts preserve whole Unicode codepoints and do not mutate the full note body", () => {
  const body = "🙂".repeat(89) + "🦊Z";
  const html = row({body});
  const preview = html.match(/class="event-note-preview">([^<]*)<\/span>/)?.[1];
  assert.equal(preview, "🙂".repeat(89) + "🦊…");
  assert.equal(Array.from(body).length, 91);
  assert.equal(row({body: "x".repeat(90)}).includes("…"), false);
});

test("whitespace-only body has no empty preview and unpinned notes have no pinned class", () => {
  const html = row({body: " \n\t ", pinned: false});
  assert.doesNotMatch(html, /event-note-preview|is-pinned/);
  assert.match(html, /event-note-meta/);
});
