import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppHandler } from "../server.mjs";
import { parseStateBackup } from "../src/domain/stateBackup.mjs";
import { validateSharedStatePayload } from "../src/server/stateValidation.mjs";

function fixture() {
  return {currentParticipantId: "owner", participants: [{id: "owner", displayName: "Test Owner"}], groups: [],
    events: [{id: "event", name: "Regression", participantIds: ["owner"], adminIds: ["owner"],
      expenses: [], transfers: [], notes: [], deletedNotes: []}]};
}

async function localServer(t) {
  const directory = await mkdtemp(join(tmpdir(), "settle-audit-persistence-"));
  const server = createServer(createAppHandler({root: process.cwd(), env: {},
    stateFile: join(directory, "state.json"), serverErrorLogger: () => {}}));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, {recursive: true, force: true});
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    put: state => fetch(`${origin}/api/state`, {method: "PUT", headers: {"content-type": "application/json", origin}, body: JSON.stringify(state)}),
    get: () => fetch(`${origin}/api/state`)
  };
}

test("acknowledged concurrent HTTP state saves always leave one complete snapshot", async t => {
  const api = await localServer(t);
  const corruptions = [];
  for (let round = 0; round < 30; round++) {
    const states = ["L".repeat(750000), "S".repeat(1000)].map(padding => ({...fixture(), round, padding}));
    const writes = await Promise.all(states.map(state => api.put(state)));
    assert.deepEqual(writes.map(response => response.status), [200, 200]);
    await Promise.all(writes.map(response => response.arrayBuffer()));
    const read = await api.get();
    const text = await read.text();
    let actual;
    try {actual = JSON.parse(text);} catch {corruptions.push({round, reason: "invalid JSON"}); continue;}
    if (read.status !== 200 || !states.some(state => JSON.stringify(state) === JSON.stringify(actual))) {
      corruptions.push({round, status: read.status, reason: "acknowledged snapshot was not preserved intact"});
    }
  }
  assert.deepEqual(corruptions, [], "Both writes must not acknowledge success and leave corrupt or mixed data");
});

for (const field of ["expenses", "transfers", "notes", "deletedNotes"]) {
  test(`backup and server reject non-array event ${field}`, () => {
    for (const value of [{}, "not-an-array", 7, true, null]) {
      const state = fixture();
      state.events[0][field] = value;
      assert.throws(() => parseStateBackup(JSON.stringify(state)), /invalid data/, `backup accepted ${field}: ${JSON.stringify(value)}`);
      const validation = validateSharedStatePayload(state);
      assert.equal(validation.ok, false, `server accepted ${field}: ${JSON.stringify(value)}`);
      assert.ok(validation.errors.some(error => error.includes(`${field} must be an array`)));
    }
  });
}

test("backup validates note contents as well as identifiers", () => {
  const state = fixture();
  state.events[0].notes = [{id: "note", title: 123, body: "body", createdByParticipantId: "owner",
    updatedByParticipantId: "owner", createdAt: "2026-09-09T00:00:00Z", updatedAt: "2026-09-09T00:00:00Z"}];
  assert.throws(() => parseStateBackup(JSON.stringify(state)), /title must be a string/);
});

test("HTTP rejects malformed expenses before replacing the previous snapshot", async t => {
  const api = await localServer(t);
  const original = fixture();
  const saved = await api.put(original);
  assert.equal(saved.status, 200);
  await saved.arrayBuffer();
  const malformed = structuredClone(original);
  malformed.events[0].expenses = {};
  const rejected = await api.put(malformed);
  assert.equal(rejected.status, 400);
  await rejected.arrayBuffer();
  const loaded = await api.get();
  assert.equal(loaded.status, 200);
  assert.deepEqual(await loaded.json(), original);
});

test("legacy backups with omitted optional event collections remain supported", () => {
  const state = fixture();
  for (const field of ["expenses", "transfers", "notes", "deletedNotes"]) delete state.events[0][field];
  assert.equal(parseStateBackup(JSON.stringify(state)).events[0].id, "event");
  assert.equal(validateSharedStatePayload(state).ok, true);
});
