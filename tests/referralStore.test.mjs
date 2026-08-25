import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReferralInviteUrl,
  claimReferral,
  loadReferralProgramStatus,
  qualifyReferral,
  referralCodeFromUrl,
  withoutReferralAttribution
} from "../src/data/referralStore.mjs";

const userId = "11111111-1111-4111-8111-111111111111";
const referralCode = "0123456789abcdefabcd";

function accountConfig() {
  return {
    publicUrl: "https://sogrim-hesbon-app.vercel.app/",
    storage: {
      mode: "supabase",
      url: "https://demo.supabase.co",
      anonKey: "anon-key",
      account: {
        userId,
        accessToken: "private-user-token"
      }
    }
  };
}

test("referral links reuse the private friend code without exposing identity", () => {
  const link = buildReferralInviteUrl(
    "https://sogrim-hesbon-app.vercel.app/",
    referralCode
  );
  const url = new URL(link);

  assert.equal(url.pathname, `/r/${referralCode}`);
  assert.equal(referralCodeFromUrl(link), referralCode);
  assert.ok(!link.includes("@"));

  const cleaned = new URL(withoutReferralAttribution(link));
  assert.equal(cleaned.searchParams.has("ref"), false);
  assert.equal(cleaned.searchParams.get("friend"), referralCode);
  assert.equal(cleaned.pathname, "/");
});

test("referral claims and qualification use authenticated RPC calls", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ status: "pending" });
  };

  await claimReferral(accountConfig(), referralCode, fetchImpl);
  await qualifyReferral(accountConfig(), "event-123", fetchImpl);

  assert.match(calls[0].url, /\/rpc\/claim_referral$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_referral_code: referralCode
  });
  assert.match(calls[1].url, /\/rpc\/qualify_referral$/);
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    p_event_id: "event-123"
  });
  for (const call of calls) {
    assert.equal(call.options.headers.authorization, "Bearer private-user-token");
    assert.equal(call.options.headers.apikey, "anon-key");
  }
});

test("referral status normalizes cloud entitlement values", async () => {
  const fetchImpl = async () =>
    jsonResponse({
      referral_code: referralCode,
      reward_days: 30,
      annual_reward_limit: 12,
      rewarded_referrals: 2,
      pending_referrals: 1,
      rejected_referrals: 0,
      days_earned: 60,
      lifetime_rewarded_referrals: 5,
      lifetime_days_earned: 150,
      ad_free_until: "2099-12-31T00:00:00.000Z",
      ad_free_active: true,
      subscription_active: true,
      active_entitlement_sources: ["subscription"]
    });

  const status = await loadReferralProgramStatus(accountConfig(), fetchImpl);

  assert.equal(status.referralCode, referralCode);
  assert.equal(status.rewardedReferrals, 2);
  assert.equal(status.pendingReferrals, 1);
  assert.equal(status.daysEarned, 60);
  assert.equal(status.lifetimeRewardedReferrals, 5);
  assert.equal(status.lifetimeDaysEarned, 150);
  assert.equal(status.adFreeActive, true);
  assert.equal(status.subscriptionActive, true);
  assert.deepEqual(status.activeEntitlementSources, ["subscription"]);
});

test("referral status preserves an expired-session response for one safe retry", async () => {
  await assert.rejects(
    loadReferralProgramStatus(
      accountConfig(),
      async () => jsonResponse({ code: "PGRST301", message: "JWT expired" }, false, 401)
    ),
    (error) => {
      assert.equal(error.status, 401);
      assert.equal(error.code, "PGRST301");
      return true;
    }
  );
});

function jsonResponse(payload, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    async json() {
      return payload;
    }
  };
}
