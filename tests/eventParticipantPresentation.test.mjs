import { manualParticipantCopy, renderEventManualParticipantEditorView } from "../src/ui/eventManualParticipantEditor.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { renderEventParticipantRouteView } from "../src/ui/eventParticipantRoute.mjs";

const source = await readFile("src/app.mjs", "utf8");
const start = source.indexOf("function renderNewEventParticipantAction(");
const end = source.indexOf("function renderEventShareFriends(", start);
const escape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

function renderDraft(overrides = {}, busy = false) {
  const draft = { eventType: "standard", participantIds: ["owner", "guest"], participantView: "", guestName: "", name: "Draft", currency: "USD", ...overrides };
  const before = JSON.stringify(draft);
  let ownerChecks = 0;
  const context = vm.createContext({
    newEventDraft: draft, createEventBusy: busy, renderEventParticipantRouteView, manualParticipantCopy, renderEventManualParticipantEditorView,
    state: { currentParticipantId: "owner", participants: [
      { id: "owner", displayName: "Owner", kind: "user" },
      { id: "guest", displayName: "Guest <name>", kind: "guest" }
    ] },
    ensureNewEventDraft() {}, ensureCurrentParticipantInNewEventDraft() { ownerChecks += 1; },
    escapeHtml: escape, escapeAttribute: escape,
    iconSvg: name => `<svg data-icon="${escape(name)}"></svg>`,
    renderAvatar: id => `<span class="avatar" data-avatar="${escape(id)}"></span>`,
    renderParticipantUsername: () => "", participantSearchIdentity: (_p, name) => name,
    participantConnectionStatus: p => ({ connected: p.kind === "user" }),
    renderParticipantConnectionBadge: () => '<small class="participant-connection-badge">Offline</small>',
    newEventParticipantSelectionLabel: ids => `${ids.length} selected`,
    renderAppBackButton: () => "", renderNotice: () => '<div role="status">existing notice</div>',
    renderEventCreationProgress: step => `<nav data-stage="${step}"></nav>`,
    eventTypeConfig: () => ({ createLabel: "פתח אירוע" }),
    renderParticipantChecks: ids => `<fieldset data-ids="${ids.join(",")}"></fieldset>`
  });
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
  const html = context.renderNewEventParticipants();
  assert.equal(JSON.stringify(draft), before, "presentation must not mutate the draft");
  assert.equal(ownerChecks, 1, "retain owner-inclusion orchestration");
  return html;
}

test("participant route view escapes supplied content and preserves trusted source icons", () => {
  const html = renderEventParticipantRouteView({ action: 'action" onclick="bad', title: '<script>bad</script>', hint: '<img src=x>',
    className: 'route" bad="1', ariaLabel: 'name" bad="1', view: '<view>',
    iconMarkup: '<svg data-icon="users"></svg>', chevronMarkup: '<svg data-icon="chevron-left"></svg>' });
  assert.match(html, /data-action="action&quot; onclick=&quot;bad"/);
  assert.match(html, /<strong>&lt;script&gt;bad&lt;\/script&gt;<\/strong>/);
  assert.match(html, /<small>&lt;img src=x&gt;<\/small>/);
  assert.match(html, /aria-label="name&quot; bad=&quot;1"/);
  assert.match(html, /data-participant-view="&lt;view&gt;"/);
  assert.doesNotMatch(html, /<script|<img|" onclick="/);
  assert.match(html, /data-icon="users"/);
  assert.match(html, /data-icon="chevron-left"/);
});

test("participant route view retains disabled, selected and optional-attribute semantics", () => {
  const active = renderEventParticipantRouteView({ action: "set-view", title: "Friends", view: "friends", pressed: true, disabled: true });
  assert.match(active, /is-active/);
  assert.match(active, /\sdisabled\s*>/);
  assert.match(active, /data-participant-view="friends"/);
  assert.match(active, /new-event-participant-route-state/);
  const plain = renderEventParticipantRouteView({ action: "set-view", title: "Manual" });
  assert.doesNotMatch(plain, /\sdisabled|aria-label=|data-participant-view=|new-event-participant-route-state|<small>/);
});

test("actual participants adapter retains selected identities and all original actions with contextual explanations", () => {
  const html = renderDraft();
  const routes = [...html.matchAll(/<button\b[\s\S]*?<\/button>/g)].map(m => m[0]).filter(x => x.includes("new-event-participant-route-action"));
  assert.equal(routes.length, 3);
  assert.match(routes[0], /data-action="create-event-and-open-invite"/);
  assert.match(routes[0], /שתף בקישור או QR/);
  assert.match(routes[0], /האירוע ייווצר ואז ייפתח השיתוף/);
  assert.match(routes[0], /aria-label="שתף בקישור או QR/);
  assert.match(routes[1], /data-action="set-new-event-participant-view"[\s\S]*data-participant-view="friends"/);
  assert.match(routes[1], /משתתפים שכבר שמורים אצלך/);
  assert.match(routes[2], /data-participant-view="manual"/);
  assert.match(routes[2], /ללא חשבון וללא גישה לאירוע/);
  assert.match(html, /data-participant-id="owner"/);
  assert.match(html, /data-participant-id="guest"/);
  assert.match(html, /Guest &lt;name&gt;/);
  assert.match(html, /new-event-selected-participant-self/);
  assert.match(html, /data-new-event-participant-count/);
  assert.match(html, /data-stage="participants"/);
  assert.match(html, /role="status">existing notice/);
  assert.match(html, /data-action="create-event"\s*>פתח אירוע/);
  assert.match(html, /data-action="cancel-new-event-participants">חזרה<\/button>/);
});

test("actual participants adapter preserves busy creation and invitation guards", () => {
  const html = renderDraft({}, true);
  const share = [...html.matchAll(/<button\b[\s\S]*?<\/button>/g)].map(m => m[0]).find(x => x.includes('data-action="create-event-and-open-invite"'));
  assert.match(share, /\sdisabled\s*>/);
  assert.match(share, /מכין הזמנה…/);
  assert.match(html, /data-action="create-event" disabled>שומר…/);
});

test("existing friend and manual subviews retain their controls, draft values and save action", () => {
  const friends = renderDraft({ participantView: "friends" });
  assert.match(friends, /data-new-event-participant-subview="friends"/);
  assert.match(friends, /data-ids="owner,guest"/);
  assert.match(friends, /data-action="close-new-event-participant-view"/);
  assert.doesNotMatch(friends, /data-action="create-event"|new-event-participant-actions/);
  const manual = renderDraft({ participantView: "manual", guestName: '<Draft>' });
  assert.match(manual, /data-new-event-participant-subview="manual"/);
  assert.match(manual, /data-action="new-event-guest-name"[\s\S]*value="&lt;Draft&gt;"/);
  assert.match(manual, /data-action="new-event-add-guest"/);
  assert.match(manual, /data-action="close-new-event-participant-view"/);
  assert.match(manual, /data-participant-id="guest"/);
});

test("participant route presentation is included in the offline creation cache", async () => {
  const worker = await readFile("sw.js", "utf8");
  const from = worker.indexOf("const CACHE_FILES = [");
  assert.match(worker.slice(from, worker.indexOf("];", from)), /"\/src\/ui\/eventParticipantRoute\.mjs"/);
});


test("manual name view omits the redundant side count while keeping selected identities and main count", () => {
  const manual = renderDraft({ participantView: "manual", participantIds: ["owner"] });
  assert.doesNotMatch(manual, /data-new-event-participant-count/,
    "The visible owner row already communicates who is selected in the manual form");
  assert.match(manual, /data-participant-id="owner"/);
  assert.match(manual, /אתה · יוצר האירוע/);
  assert.match(manual, /data-action="new-event-add-guest"/);
  assert.match(manual, /data-action="close-new-event-participant-view"/);
  assert.match(renderDraft(), /data-new-event-participant-count/,
    "The separate main participants overview retains its existing count");
});


test("manual participant view uses the approved one-line explanation and an explicit labeled add action", () => {
  const html = renderDraft({ participantView: "manual", guestName: '<Draft>' });
  assert.match(html, /הוספת משתתף לפי שם/);
  const explanation = "מוסיפים אדם שלא משתמש באפליקציה, ומנהלים את ההוצאות בשמו.";
  assert.equal(html.split(explanation).length - 1, 1, "Use exactly one explanation");
  assert.match(html, /<label[^>]*for="manual-participant-name"[^>]*>שם המשתתף<\/label>/);
  assert.match(html, /<input[^>]*id="manual-participant-name"[^>]*value="&lt;Draft&gt;"/);
  assert.match(html, /data-action="new-event-add-guest">הוסף משתתף<\/button>/);
  assert.doesNotMatch(html, /manual-participant-explanation|הוספת שם לא שולחת|תמיד אפשר לערוך אחר כך/);
  assert.doesNotMatch(html, /data-new-event-participant-count/);
});


test("manual editor escapes a draft name without changing existing action and input semantics", () => {
  const value = '\" autofocus onfocus=\"bad <img> & \'name';
  const html = renderEventManualParticipantEditorView({ value });
  assert.match(html, /value="&quot; autofocus onfocus=&quot;bad &lt;img&gt; &amp; &#039;name"/);
  assert.doesNotMatch(html, /<img>|value="" autofocus/);
  assert.match(html, /name="guestName"/);
  assert.match(html, /enterkeyhint="done"/);
  assert.match(html, /for="manual-participant-name"/);
  assert.match(html, /id="manual-participant-name"/);
  assert.match(renderEventManualParticipantEditorView(), /value=""/);
});

test("manual participant presentation is available in the offline creation cache", async () => {
  const worker = await readFile("sw.js", "utf8");
  const from = worker.indexOf("const CACHE_FILES = [");
  assert.match(worker.slice(from, worker.indexOf("];", from)), /"\/src\/ui\/eventManualParticipantEditor\.mjs"/);
});
