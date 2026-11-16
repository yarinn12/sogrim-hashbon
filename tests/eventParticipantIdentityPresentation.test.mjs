import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { participantAliasDraftUpdate,participantAliasDraftValue,participantAliasAcknowledgedDrafts,participantOfflineLabel, renderParticipantIdentityReviewView as review,
  renderParticipantIdentityPairView as pair, renderParticipantAliasEditorView as alias }
  from "../src/ui/eventParticipantIdentityPresentation.mjs";

const source = await readFile(process.env.PARTICIPANT_IDENTITY_TEST_APP || "src/app.mjs", "utf8");
function fn(name) {
  const start = source.indexOf("function " + name + "(");
  assert.ok(start >= 0, name);
  const end = source.indexOf("\nfunction ", start + 10);
  return source.slice(start, end < 0 ? undefined : end);
}
test("identity route uses the shared header with back instead of a close control", () => {
  const event = { id: "event", name: "האירוע" };
  const options = runInNewContext("(" + fn("renderEventParticipantIdentityDialog") + ")", {
    renderEventDialogShell: value => value, renderDuplicateParticipantReview: () => "body"
  })(event);
  assert.equal(options.routeMode, true);
  assert.equal(options.showClose, false);
  assert.equal(options.description, event.name);
  assert.match(options.modalClass, /event-participant-identity-screen/);
  assert.equal(options.backAction, "participant-identities-back");
});
test("alias identities use passive avatars instead of opening statistics during editing", () => {
  const participant = { id: "person", displayName: "דנה" }, calls = [];
  const html = runInNewContext("(" + fn("renderParticipantAliasEditor") + ")", {
    renderParticipantAliasEditorView: alias, eventDialog:null, participantAliasDraftValue,
    renderAvatar: (id, event, options) => { calls.push(options); return "avatar"; },
    renderParticipantUsername: () => "username", renderParticipantConnectionBadge: () => "identity",
    escapeHtml: String, escapeAttribute: String
  })({ id: "event", participantAliases: { person: "מהעבודה" } }, participant);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].suppressParticipantAction, true);
  assert.match(html, /value="מהעבודה"/);
});
test("shared identity caption is clear without changing connection or historical flags", () => {
  const status = runInNewContext("(" + fn("participantConnectionStatusForEvent") + ")", {
    state: { currentParticipantId: "self" }, localProfile: {}, participantOfflineLabel,
    participantHasConnectedAccount: p => p.accountLinked === true,
    isEventParticipantInactive: (event, id) => event.inactiveParticipantIds?.includes(id)
  });
  const guest = status({ id: "guest", displayName: "דנה" }, null);
  assert.equal(guest.label, participantOfflineLabel);
  assert.equal(guest.connected, false);
  assert.equal(guest.className, "is-offline");
  assert.equal(status({ id: "member", accountLinked: true }, null).label, "חבר באפליקציה");
  assert.equal(status({ id: "self", accountLinked: true }, null).label, "אתה");
  assert.equal(status({ id: "deleted", accountDeleted: true }, null).label, "משתמש שנמחק");
  assert.equal(status({ id: "member", accountLinked: true }, { inactiveParticipantIds: ["member"] }).connected, false);
});
test("the review announces one escaped message and offers a return after resolution", () => {
  const html = review({ message: "נשמר <script>", canManage: true, aliasEditorsHtml: "editors" });
  assert.equal((html.match(/role="status"/g) || []).length, 1);
  assert.match(html, /נשמר &lt;script&gt;/);
  assert.match(html, /<details class="participant-aliases">/);
  assert.match(html, /participant-identities-back/);
  assert.doesNotMatch(html, /הבדיקה הושלמה|בדיקה קצרה|<script>/);
});
test("an empty review has one status and does not invent an alias form", () => {
  const html = review();
  assert.match(html, /אין שמות שדורשים בדיקה/);
  assert.match(html, /participant-identities-back/);
  assert.doesNotMatch(html, /<details|save-participant-alias/);
});
test("readonly review hides alias editors and readonly pair hides all mutations", () => {
  assert.doesNotMatch(review({ canManage: false, aliasEditorsHtml: "EDITORS" }), /EDITORS|<details/);
  const html = pair({ canConnect: true });
  assert.match(html, /מנהל האירוע/);
  assert.doesNotMatch(html, /data-action=/);
});
test("two connected accounts cannot offer a merge, but may be marked separate", () => {
  const html = pair({ canManage: true, canConnect: false, eventId: "event", pairKey: "a~b" });
  assert.match(html, /שני חשבונות באותו שם/);
  assert.doesNotMatch(html, /connect-duplicate-participant"/);
  assert.match(html, /data-participant-pair="a~b"/);
});
test("linkable identities preserve exact event and participant action attributes", () => {
  const html = pair({ canManage: true, canConnect: true, eventId: "e", pairKey: "a~b", sourceId: "a", targetId: "b" });
  assert.match(html, /data-action="connect-duplicate-participant" data-event-id="e" data-source-participant-id="a" data-target-participant-id="b"/);
  assert.match(html, /keep-duplicate-participants/);
  assert.match(html, /defer-duplicate-participant/);
});
test("names, aliases and identifiers cannot inject markup or attributes", () => {
  const model = { eventId: 'e"<', participantId: "p'<", name: '<img src=x>', alias: '"/><script>x</script>' };
  const before = structuredClone(model); Object.freeze(model);
  const html = alias(model);
  assert.doesNotMatch(html, /<img|<script>/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /e&quot;&lt;/);
  assert.match(html, /p&#039;&lt;/);
  assert.deepEqual(model, before);
});
test("alias fields have distinct labels, original length limit and trusted identity slots", () => {
  const a = alias({ participantId: "a", avatarHtml: "AVATAR", usernameHtml: "USER", connectionHtml: "IDENTITY" });
  const b = alias({ participantId: "b" });
  assert.match(a, /for="identity-alias-a"/);
  assert.match(a, /id="identity-alias-a"/);
  assert.match(b, /id="identity-alias-b"/);
  assert.match(a, /maxlength="32"/);
  assert.match(a, /AVATAR/); assert.match(a, /USER/); assert.match(a, /IDENTITY/);
  assert.match(a, /data-action="participant-alias"/);
});

for (const canManage of [true, false]) test("review adapter retains permission and resolved identities, canManage=" + canManage, () => {
  const people = [{ id: "a", displayName: "דנה" }, { id: "b", displayName: "דנה" }];
  const state = { participants: people }, event = { id: "event", participantAliases: { b: "מהעבודה" } };
  const before = JSON.stringify({ state, event });
  const model = runInNewContext("(" + fn("renderDuplicateParticipantReview") + ")", {
    state, eventDialog: { kind: "participant-identities", resolvedPairIds: ["a", "b", "foreign"], message: "נשמר" },
    eventDuplicateParticipantGroups: () => [people], unresolvedDuplicateParticipantPairs: () => [],
    canCurrentParticipantManage: () => canManage,
    renderParticipantIdentityReviewView: value => value,
    renderDuplicateParticipantPair: () => { throw new Error("No unresolved pair"); },
    renderParticipantAliasEditor: (e, p) => p.id + ":" + (e.participantAliases[p.id] || "")
  })(event);
  assert.equal(model.canManage, canManage);
  assert.equal(model.hasUnresolvedPairs, false);
  assert.equal(model.message, "נשמר");
  assert.equal(model.aliasEditorsHtml, canManage ? "a:b:מהעבודה" : "");
  assert.equal(JSON.stringify({ state, event }), before);
});
test("pair adapter preserves scoped ids and obtains passive original identity output", () => {
  const left = { id: "guest", displayName: "דנה" }, right = { id: "member", displayName: "דנה" }, calls = [];
  const input = { left, right, key: "guest~member", mergeSourceId: "guest", mergeTargetId: "member" };
  const before = JSON.stringify(input);
  const model = runInNewContext("(" + fn("renderDuplicateParticipantPair") + ")", {
    renderParticipantIdentityPairView: value => value,
    renderAvatar: (id, event, options) => { calls.push([id, event.id, options.suppressParticipantAction]); return "avatar:" + id; },
    renderParticipantUsername: p => "username:" + p.id,
    renderParticipantConnectionBadge: (p, e) => "identity:" + p.id + ":" + e.id
  })({ id: "event" }, input, true);
  assert.equal(model.eventId, "event"); assert.equal(model.sourceId, "guest"); assert.equal(model.targetId, "member");
  assert.equal(model.canConnect, true); assert.equal(model.canManage, true);
  assert.deepEqual(calls, [["guest", "event", true], ["member", "event", true]]);
  assert.equal(model.people[1].usernameHtml, "username:member");
  assert.equal(JSON.stringify(input), before);
});
test("identity module is included in both offline inventories", async () => {
  const sw = await readFile("sw.js", "utf8");
  assert.equal((sw.match(/"\/src\/ui\/eventParticipantIdentityPresentation\.mjs"/g) || []).length, 2);
});
