import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const repair = await readFile(
  "scripts/repair-stranded-invite-joins.mjs",
  "utf8"
);

test("expired invite joins are repaired only after a guarded dry run", () => {
  assert.match(repair, /const apply = process\.argv\.includes\("--apply"\)/);
  assert.match(repair, /member\.pending_join_until <= pg_catalog\.clock_timestamp\(\)/);
  assert.match(repair, /invite\.kind = 'open'/);
  assert.match(repair, /invite\.last_redeemed_at is not null/);
  assert.match(repair, /invite\.revoked_at is null/);
  assert.match(repair, /for update of shared, member, workspace/);
  assert.match(repair, /Refusing to repair \$\{stranded\.length\} joins/);
  assert.match(repair, /writeBackup\(repairs\)/);
  assert.match(repair, /state = \$\{transaction\.json\(repair\.previousSharedState\)\}/);
  assert.match(repair, /index_shared_event_for_member/);
});

test("stranded invite repair preserves financial state", () => {
  assert.match(repair, /ensureNamedParticipant\(/);
  assert.match(repair, /buildSharedEventState\(/);
  assert.match(repair, /isDeepStrictEqual\(previousEvent\.expenses/);
  assert.match(repair, /isDeepStrictEqual\(previousEvent\.transfers/);
  assert.match(repair, /validateSharedStateFinancials\(/);
});
