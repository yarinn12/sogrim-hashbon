import assert from "node:assert/strict";

export function assertQaAccount(user, account, runId) {
  assert.equal(user.id, account.id);
  assert.equal(user.email, account.email);
  assert.equal(user.email, `qa-hourly-${account.role}-${runId}@example.test`);
  assert.equal(user.user_metadata?.account_space_id, account.workspace.id);
  assert.equal(account.workspace.id, `space-hourly-${account.role}-${runId}`);
}

export function assertQaSnapshot(row, fixture) {
  assert.ok(fixture.spaceIds.includes(row.id), "Snapshot not in the exact QA manifest");
  const account = fixture.accounts.find(item => item.workspace.id === row.id);
  if (account) {
    assert.equal(row.owner_user_id, account.id, "Personal snapshot owner changed");
    return;
  }
  assert.equal(row.id, fixture.sharedId);
  assert.equal(row.snapshot_kind, "shared_event");
  assert.ok(!row.owner_user_id || fixture.accounts.some(item => item.id === row.owner_user_id));
  assert.equal(row.state?.events?.length, 1);
  const event = row.state.events[0];
  assert.equal(event.id, fixture.eventId);
  assert.equal(event.name, fixture.eventName);
  assert.equal(event.createdByParticipantId, `account-${fixture.accounts[0].id}`);
  const allowed = new Set(fixture.accounts.map(item => `account-${item.id}`));
  assert.ok(event.participantIds.every(id => allowed.has(id)), "Non-QA participant: refuse cleanup");
}

export function summarizeMeasurements(measurements) {
  const values = measurements.filter(x => x.kind === "sync").map(x => x.ms).sort((a, b) => a - b);
  const percentile = p => values[Math.max(0, Math.ceil(values.length * p) - 1)] ?? null;
  return { samples: values.length, p50Ms: percentile(.5), p95Ms: percentile(.95), maxMs: values.at(-1) ?? null };
}
