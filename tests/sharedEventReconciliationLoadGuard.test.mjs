import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationSql = fs.readFileSync(
  new URL(
    "../supabase/migrations/20260831143000_reduce_shared_event_reconciliation_load.sql",
    import.meta.url,
  ),
  "utf8",
);
const schemaSql = fs.readFileSync(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8",
);
const verificationSql = fs.readFileSync(
  new URL(
    "../supabase/verification/verify_20260831143000_reduce_shared_event_reconciliation_load.sql",
    import.meta.url,
  ),
  "utf8",
);
const schemaInstaller = fs.readFileSync(
  new URL("../scripts/apply-supabase-schema.mjs", import.meta.url),
  "utf8",
);
const focusedInstaller = fs.readFileSync(
  new URL("../scripts/apply-shared-reconciliation-load-guard.mjs", import.meta.url),
  "utf8",
);

const expectedGuards = [
  /tg_op\s*=\s*'UPDATE'/,
  /old\.state\s*->\s*'participants'\s+is not distinct from\s+new\.state\s*->\s*'participants'/,
  /old\.state\s*#>\s*'\{events,0,participantIds\}'\s+is not distinct from/,
  /old\.state\s*#>\s*'\{events,0,inactiveParticipantIds\}'\s+is not distinct from/,
  /old\.state\s*#>\s*'\{events,0,participantAccountLinks\}'\s+is not distinct from/,
];

test("shared-event member reconciliation ignores content-only writes", () => {
  for (const source of [migrationSql, schemaSql]) {
    for (const guard of expectedGuards) {
      assert.match(source, guard);
    }
    assert.match(
      source,
      /revoke all on function private\.reconcile_shared_snapshot_member_workspaces\(\)\s+from public, anon, authenticated/,
    );
  }
});

test("load guard ships with a database verification probe", () => {
  assert.match(
    verificationSql,
    /pg_get_functiondef\([\s\S]*reconcile_shared_snapshot_member_workspaces/,
  );
  assert.match(verificationSql, /lower\(function_definition\)/);
  for (const field of [
    "participants",
    "participantids",
    "inactiveparticipantids",
    "participantaccountlinks",
  ]) {
    assert.match(verificationSql, new RegExp(`'${field}'`));
  }
  assert.match(
    verificationSql,
    /has_function_privilege\([\s\S]*'authenticated'[\s\S]*'execute'/,
  );
  assert.match(
    schemaInstaller,
    /shared_reconciliation_load_guard_ready/,
  );
  assert.match(
    schemaInstaller,
    /!result\?\.shared_reconciliation_load_guard_ready/,
  );
  assert.match(focusedInstaller, /process\.argv\.includes\("--apply"\)/);
  assert.match(focusedInstaller, /if \(apply\) await sql\.unsafe\(migration\)/);
});
