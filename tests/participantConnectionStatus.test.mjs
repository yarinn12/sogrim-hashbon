import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { participantHasConnectedAccount } from "../src/domain/participantIdentity.mjs";

const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const start = app.indexOf("function participantConnectionStatus(participant)");
const end = app.indexOf("function renderParticipantConnectionBadge", start);

test("the account owner is not shown as an offline name when metadata is missing", () => {
  const accountId = "account-123e4567-e89b-42d3-a456-426614174000";
  const context = vm.createContext({
    state: { currentParticipantId: accountId },
    localProfile: { participantId: accountId },
    participantHasConnectedAccount,
    isEventParticipantInactive: () => false
  });
  vm.runInContext(app.slice(start, end), context);

  const account = { id: accountId, displayName: "Owner", kind: "user" };
  assert.equal(context.participantConnectionStatus(account).connected, true);
  assert.equal(context.participantConnectionStatus(account).label, "אתה");
  assert.equal(context.participantConnectionStatus({ ...account, accountDeleted: true }).connected, false);
  assert.equal(context.participantConnectionStatus({ id: "manual-owner", displayName: "Owner", kind: "guest" }).connected, false);
});
