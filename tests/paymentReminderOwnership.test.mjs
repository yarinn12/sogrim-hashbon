import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
function extract(name) {
  const start = new RegExp(`(?:async )?function ${name}\\(`).exec(source)?.index;
  assert.notEqual(start, undefined);
  const next = /\n(?:async )?function /.exec(source.slice(start + 1));
  return source.slice(start, next ? start + 1 + next.index : undefined);
}
function harness() {
  const sends = [], renders = [];
  const context = vm.createContext({
    state: { currentParticipantId: "account-a" }, session: { user: { id: "a" } }, generation: 0,
    window: { localStorage: {} }, loadStoredAccountSession: () => context.session,
    versionedReadCacheSessionGeneration: () => context.generation,
    paymentReminderBusyId: "", paymentReminderRequest: null, notice: "",
    getEvent: id => ({ id, transfers: [{ id: "transfer", fromParticipantId: "account-debtor" }] }),
    paymentReminderEligibility: () => ({ allowed: true }), participantName: () => "Debtor",
    render: () => renders.push(true),
    sendPaymentReminderWithAccountRecovery: () => new Promise((resolve, reject) => sends.push({ resolve, reject }))
  });
  vm.runInContext(extract("captureFriendAccountContext"), context);
  vm.runInContext(extract("sendTransferReminder"), context);
  return { context, sends, renders, run: () => context.sendTransferReminder("event", "transfer"),
    switchAccount(id) {
      context.generation++;
      context.session = { user: { id } };
      context.state.currentParticipantId = `account-${id}`;
      context.notice = "New session notice";
    }
  };
}

for (const outcome of ["success", "failure"]) {
  test(`late reminder ${outcome} cannot alter the new session after signing back into the same account`, async () => {
    const h = harness(); const request = h.run();
    h.switchAccount("b"); h.switchAccount("a");
    const rendersBefore = h.renders.length;
    if (outcome === "success") h.sends[0].resolve({ ok: true, reason: "in-app-only" });
    else h.sends[0].reject(new Error("Old request failure"));
    await request;
    assert.equal(h.context.notice, "New session notice");
    assert.equal(h.renders.length, rendersBefore);
  });
}

test("the new account can send while an old reminder is pending, and the old completion cannot unlock it", async () => {
  const h = harness(); const first = h.run(); h.switchAccount("b"); const second = h.run();
  const sendCount = h.sends.length;
  h.sends[0].resolve({ ok: true, reason: "in-app-only" }); await first;
  const busyAfterOld = h.context.paymentReminderBusyId;
  h.sends[1]?.resolve({ ok: true, reason: "in-app-only" }); await second;
  assert.equal(sendCount, 2);
  assert.equal(busyAfterOld, "transfer");
  assert.equal(h.context.paymentReminderBusyId, "");
  assert.match(h.context.notice, /Debtor/);
});

test("same-session double tapping still sends once and releases the control", async () => {
  const h = harness(); const first = h.run(); const second = h.run();
  assert.equal(h.sends.length, 1);
  h.sends[0].resolve({ ok: true, reason: "in-app-only" }); await Promise.all([first, second]);
  assert.equal(h.context.paymentReminderBusyId, "");
  assert.match(h.context.notice, /Debtor/);
});
