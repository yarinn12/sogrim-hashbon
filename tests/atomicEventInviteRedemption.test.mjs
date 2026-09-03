import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  "supabase/migrations/20260903174500_atomic_event_invite_redemption.sql",
  "utf8"
);
const schema = await readFile("supabase/schema.sql", "utf8");
const server = await readFile("src/server/eventInvites.mjs", "utf8");
const deploy = await readFile(
  "scripts/apply-atomic-event-invite-redemption.mjs",
  "utf8"
);
const productionProbe = await readFile(
  "scripts/verify-event-invite-entry-production.mjs",
  "utf8"
);
const atomicLiveProbe = await readFile(
  "scripts/verify-atomic-event-invite-live.mjs",
  "utf8"
);

function latestFunction(source, name) {
  const escaped = name.replaceAll(".", "\\.");
  const matches = [...source.matchAll(
    new RegExp(`create or replace function ${escaped}\\([^]*?\\n\\$\\$;`, "g")
  )];
  assert.ok(matches.length, `${name} was not found`);
  return matches.at(-1)[0];
}

test("invite redemption commits canonical membership and personal discovery atomically", () => {
  for (const source of [migration, schema]) {
    const redemption = latestFunction(
      source,
      "public.redeem_event_invite_membership"
    );
    assert.match(
      redemption,
      /from public\.event_invite_tokens as record[\s\S]*?for update/
    );
    assert.match(
      redemption,
      /from private\.shared_snapshot_members as member[\s\S]*?for update/
    );
    assert.match(
      redemption,
      /from public\.app_snapshots as record[\s\S]*?for update/
    );
    assert.match(redemption, /'\{participantIds\}'/);
    assert.match(redemption, /'\{membershipUpdatedAtByParticipant\}'/);
    assert.match(
      redemption,
      /set_config\([\s\S]*?'request\.jwt\.claim\.sub'[\s\S]*?p_user_id::text/
    );
    assert.match(
      redemption,
      /update public\.app_snapshots[\s\S]*?state = next_shared_state/
    );
    assert.match(
      redemption,
      /select public\.index_shared_event_for_member\(snapshot\.id, p_user_id\)/
    );
    assert.match(redemption, /'canonicalParticipantReady', true/);
    assert.match(redemption, /'workspaceIndexed', true/);
  }

  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.match(
    migration,
    /revoke all on function public\.redeem_event_invite_membership\(uuid, text, uuid\)[\s\S]*?from public, anon, authenticated/
  );
  assert.match(
    migration,
    /grant execute on function public\.redeem_event_invite_membership\(uuid, text, uuid\)[\s\S]*?to service_role/
  );
});

test("atomic invite rollout is explicit and verifies the live function", () => {
  assert.match(deploy, /process\.argv\.includes\("--apply"\)/);
  assert.match(deploy, /if \(apply\) await sql\.unsafe\(migration\)/);
  assert.match(deploy, /await sql\.unsafe\(verification\)/);
  assert.doesNotMatch(deploy, /apply-supabase-schema/);
});

test("the production probe stops the client after the atomic server commit", () => {
  assert.match(productionProbe, /pending_join_until is null/);
  assert.match(productionProbe, /participant_active/);
  assert.match(productionProbe, /workspace_has_event/);
  assert.match(productionProbe, /canonicalParticipantReady !== true/);
  assert.match(productionProbe, /workspaceIndexed !== true/);
  assert.match(productionProbe, /verified rollback/);
});

test("live QA verifies all join surfaces before any client continuation", () => {
  assert.match(atomicLiveProbe, /stoppedAfterProductionRedeem: true/);
  assert.match(atomicLiveProbe, /pending_join_until is null/);
  assert.match(atomicLiveProbe, /canonical_participant_committed/);
  assert.match(atomicLiveProbe, /personal_event_committed/);
  assert.match(atomicLiveProbe, /Atomic invite QA cleanup failed/);
});

test("the invite API trusts only a fully committed atomic redemption", () => {
  assert.match(
    server,
    /membershipActivation\.canonicalParticipantReady === true[\s\S]*?membershipActivation\.workspaceIndexed === true/
  );
  assert.match(
    server,
    /canonicalParticipantReady && !atomicRedemptionCommitted/
  );
  assert.match(server, /indexPending: !canonicalParticipantReady/);
  assert.match(server, /atomic: atomicRedemptionCommitted/);
  assert.match(
    server,
    /membershipResponse\.json\(\)\.catch\(\(\) => null\)/
  );
});
