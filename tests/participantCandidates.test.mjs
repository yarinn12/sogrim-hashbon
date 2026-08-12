import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { participantCandidatesForParticipant } from "../src/domain/personalMemory.mjs";

const app = readFileSync("src/app.mjs", "utf8");

function baseState() {
  return {
    currentParticipantId: "me",
    participants: [
      { id: "me", displayName: "ירין", kind: "user" },
      { id: "dani", displayName: "דני", kind: "user" },
      { id: "avi", displayName: "אבי", kind: "guest" },
      { id: "stranger", displayName: "זר", kind: "user" }
    ],
    groups: [],
    events: []
  };
}

test("candidates include participants from events the user created", () => {
  const state = baseState();
  state.events = [
    {
      id: "e1",
      createdByParticipantId: "me",
      adminIds: ["me"],
      participantIds: ["me", "dani", "avi"]
    }
  ];

  const ids = participantCandidatesForParticipant(state, "me").map((p) => p.id);
  assert.deepEqual(ids.sort(), ["avi", "dani", "me"]);
});

test("candidates exclude people met only in events the user does not manage", () => {
  const state = baseState();
  state.events = [
    {
      id: "e1",
      createdByParticipantId: "me",
      adminIds: ["me"],
      participantIds: ["me", "dani"]
    },
    {
      id: "e2",
      createdByParticipantId: "someone-else",
      adminIds: ["someone-else"],
      participantIds: ["me", "stranger"]
    }
  ];

  const ids = participantCandidatesForParticipant(state, "me").map((p) => p.id);
  assert.ok(ids.includes("dani"), "keeps names from managed events");
  assert.ok(!ids.includes("stranger"), "does not leak names from joined events");
});

test("candidates include members of groups the user administers", () => {
  const state = baseState();
  state.groups = [{ id: "g1", adminIds: ["me"], memberIds: ["me", "avi"] }];

  const ids = participantCandidatesForParticipant(state, "me").map((p) => p.id);
  assert.ok(ids.includes("avi"));
});

test("candidates always include the current participant and never crash on empty state", () => {
  const ids = participantCandidatesForParticipant(baseState(), "me").map((p) => p.id);
  assert.deepEqual(ids, ["me"]);
  assert.deepEqual(participantCandidatesForParticipant(baseState(), ""), []);
});

test("event participant dialog filters candidates but keeps already selected names", () => {
  assert.match(
    app,
    /function participantCandidateFilter\(selectedIds, action = ""\)[\s\S]*?\.\.\.\(selectedIds \?\? \[\]\)[\s\S]*?allowedIds\.has\(participant\.id\)/
  );
  assert.match(
    app,
    /\[\.\.\.state\.participants\]\s*\n\s*\.filter\(participantCandidateFilter\(selectedIds, action\)\)/
  );
});

test("expense form stays scoped to event participants only", () => {
  assert.match(
    app,
    /renderParticipantChecks\(expenseDraft\.sharedByParticipantIds, "expense-shared", event\)/
  );
  assert.match(
    app,
    /: event\s*\n\s*\? selectableEventParticipants\(event, selectedIds\)/
  );
});

test("participant search appears only above the threshold and filters in the DOM", () => {
  assert.match(app, /const PARTICIPANT_SEARCH_THRESHOLD = 15;/);
  assert.match(
    app,
    /action === "event-participant" && participants\.length > PARTICIPANT_SEARCH_THRESHOLD/
  );
  assert.match(app, /data-action="participant-search"/);
  assert.match(app, /function filterParticipantChecks\(input\)/);
  assert.match(app, /data-participant-name="\$\{escapeAttribute\(displayName\.toLowerCase\(\)\)\}"/);
});

test("participant search never triggers a state re-render", () => {
  const handler = app.slice(app.indexOf("function handleInput(event)"));
  const searchBranch = handler.slice(0, handler.indexOf('if (action === "profile-name")'));
  assert.match(searchBranch, /filterParticipantChecks\(target\);\s*\n\s*return;/);
});

test("toggling a participant keeps the open dialog and any active search", () => {
  const toggle = app.slice(
    app.indexOf("function toggleEventParticipant(eventId, participantId, checked)"),
    app.indexOf("function toggleId(")
  );

  assert.match(
    toggle,
    /if \(syncEventParticipantDialog\(event\)\) return;\s*\n\s*render\(\);/,
    "a full re-render is skipped while the search field is live"
  );

  const sync = app.slice(
    app.indexOf("function syncEventParticipantDialog(event)"),
    app.indexOf("function toggleId(")
  );
  assert.match(sync, /eventDialog\?\.kind !== "participants"/);
  assert.match(sync, /eventDialog\.eventId !== event\.id/);
  assert.match(sync, /input\.checked = selectedIds\.has\(input\.dataset\.participantId\);/);
  assert.match(sync, /if \(search\) filterParticipantChecks\(search\);/);
  assert.doesNotMatch(sync, /\brender\(\)/, "the sync path never re-renders");
});

test("participant toggling still re-renders outside the participant dialog", () => {
  const toggle = app.slice(
    app.indexOf("function toggleEventParticipant(eventId, participantId, checked)"),
    app.indexOf("function syncEventParticipantDialog")
  );

  assert.match(toggle, /persistState\(\);/, "state is always persisted first");
  assert.match(
    toggle,
    /render\(\);\s*\n\s*if \(eventDialog\?\.kind === "participants-add"\)/,
    "the normal render path is preserved as a fallback"
  );
});
