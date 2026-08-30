import { webkit, devices } from "@playwright/test";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const eventName = process.argv.find((value) => value.startsWith("--event-name="))
  ?.slice("--event-name=".length)
  .trim();
const printLink = process.argv.includes("--print-link");
if (!eventName) throw new Error("--event-name is required");

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Database URL is required");
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

let inviteUrl = "";
let backendRedeemVerified = false;
try {
  const [row] = await sql`
    select
      shared.id as space_id,
      shared.state -> 'events' -> 0 ->> 'id' as event_id,
      personal_event.event ->> 'openInviteToken' as token,
      invite.id as invite_id
    from public.app_snapshots as shared
    join public.event_invite_tokens as invite
      on invite.space_id = shared.id
      and invite.event_id = shared.state -> 'events' -> 0 ->> 'id'
      and invite.kind = 'open'
      and invite.revoked_at is null
    join public.app_snapshots as personal
      on personal.snapshot_kind = 'workspace'
    cross join lateral jsonb_array_elements(coalesce(personal.state -> 'events', '[]'::jsonb))
      as personal_event(event)
    where shared.snapshot_kind = 'shared_event'
      and shared.state -> 'events' -> 0 ->> 'name' = ${eventName}
      and personal_event.event ->> 'id' = shared.state -> 'events' -> 0 ->> 'id'
      and invite.token_hash = encode(
        extensions.digest(personal_event.event ->> 'openInviteToken', 'sha256'),
        'hex'
      )
    order by shared.updated_at desc
    limit 1
  `;
  if (!row?.space_id || !row?.event_id || !row?.token || !row?.invite_id) {
    throw new Error("No active matching invite found");
  }
  inviteUrl = `https://sogrim-hesbon-app.vercel.app/i/${encodeURIComponent(row.event_id)}/t/${encodeURIComponent(row.token)}`;

  const [candidate] = await sql`
    select users.id
    from auth.users as users
    where not exists (
      select 1
      from private.shared_snapshot_members as member
      where member.snapshot_id = ${row.space_id}
        and member.user_id = users.id
    )
    order by users.created_at desc
    limit 1
  `;
  if (!candidate?.id) throw new Error("No isolated account is available for verification");

  const rollbackMarker = new Error("verified rollback");
  try {
    await sql.begin(async (transaction) => {
      const redemption = await transaction`
        select public.redeem_event_invite_membership(
          ${row.invite_id}::uuid,
          encode(extensions.digest(${row.token}, 'sha256'), 'hex'),
          ${candidate.id}::uuid
        )
      `;
      const [verification] = await transaction`
        select
          exists (
            select 1
            from private.shared_snapshot_members as member
            where member.snapshot_id = ${row.space_id}
              and member.user_id = ${candidate.id}::uuid
              and member.status = 'active'
          ) as membership_active,
          exists (
            select 1
            from public.app_snapshots as snapshot
            where snapshot.id = ${row.space_id}
              and snapshot.state -> 'events' -> 0 -> 'participantIds'
                ? ('account-' || ${candidate.id}::text)
          ) as participant_active
      `;
      if (!verification?.membership_active) {
        console.log(JSON.stringify({
          diagnostic: "invite-redemption-incomplete",
          redemption,
          verification
        }));
        throw new Error("Invite redemption did not activate membership");
      }
      backendRedeemVerified = true;
      throw rollbackMarker;
    });
  } catch (error) {
    if (error !== rollbackMarker) throw error;
  }
} finally {
  await sql.end({ timeout: 5 });
}

const browser = await webkit.launch({ headless: true });
try {
  const context = await browser.newContext({ ...devices["iPhone 15"] });
  await context.addInitScript(() => {
    Object.defineProperty(globalThis, "__SOGRIM_AUTOMATED_QA__", {
      value: true,
      configurable: false,
      writable: false
    });
    const browserFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input ?? "");
      if (new URL(requestUrl, globalThis.location.href).pathname === "/api/product-metrics") {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, qaSuppressed: true }), {
          status: 202,
          headers: { "content-type": "application/json" }
        }));
      }
      return browserFetch(input, init);
    };
  });
  await context.route("**/api/product-metrics", (route) =>
    route.fulfill({ status: 202, json: { ok: true, qaSuppressed: true } })
  );
  const page = await context.newPage();
  await page.goto(inviteUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.locator("#public-account-auth-gate").waitFor({ timeout: 20_000 });
  const text = await page.locator("#public-account-auth-gate").innerText();
  if (!text.includes("קיבלת הזמנה")) {
    console.log(JSON.stringify({
      diagnostic: "event-context-missing",
      gateText: text.slice(0, 500),
      currentUrl: page.url()
    }));
    throw new Error("The invite entry did not preserve the invitation context");
  }
  const currentUrl = page.url();
  if (!currentUrl.includes("/i/") || !currentUrl.includes("/t/")) {
    throw new Error("The invite URL was lost before authentication");
  }
  console.log(JSON.stringify({
    ok: true,
    backendRedeemVerified,
    eventContextVisible: true,
    invitePreservedThroughLoginGate: true,
    ...(printLink ? { inviteUrl } : {})
  }));
  await context.close();
} finally {
  await browser.close();
}
