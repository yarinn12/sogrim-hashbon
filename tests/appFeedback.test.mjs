import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  appFeedbackAvailable,
  normalizeFeedbackCategory,
  normalizeFeedbackContext,
  normalizeFeedbackMessage,
  submitAppFeedback
} from "../src/data/appFeedback.mjs";

const config = {
  storage: {
    url: "https://example.supabase.co",
    anonKey: "anon-key",
    account: {
      userId: "11111111-1111-4111-8111-111111111111",
      accessToken: "access-token"
    }
  }
};

test("feedback requires a connected account and validates user input", () => {
  assert.equal(appFeedbackAvailable(config), true);
  assert.equal(appFeedbackAvailable({}), false);
  assert.equal(normalizeFeedbackCategory(" BUG "), "bug");
  assert.throws(() => normalizeFeedbackCategory("other"));
  assert.equal(
    normalizeFeedbackMessage("  מסך הסיכום   לא היה ברור לי  "),
    "מסך הסיכום לא היה ברור לי"
  );
  assert.throws(() => normalizeFeedbackMessage("קצר"));
});

test("feedback context keeps only bounded non-sensitive diagnostics", () => {
  assert.deepEqual(
    normalizeFeedbackContext({
      appVersion: "3.15",
      buildNumber: "38",
      platform: "android",
      locale: "he-IL",
      screen: "profile",
      viewport: "412x915",
      email: "private@example.com",
      eventName: "private event"
    }),
    {
      appVersion: "3.15",
      buildNumber: "38",
      platform: "android",
      locale: "he-IL",
      screen: "profile",
      viewport: "412x915"
    }
  );
});

test("feedback is inserted as the signed-in user without a read response", async () => {
  let request;
  const result = await submitAppFeedback(
    config,
    {
      category: "clarity",
      message: "לא היה ברור לי איך חוזרים למסך הקודם",
      context: {
        appVersion: "3.15",
        platform: "android",
        email: "must-not-be-sent@example.com"
      }
    },
    async (url, options) => {
      request = { url, options };
      return new Response(null, { status: 201 });
    }
  );

  assert.equal(result, true);
  assert.equal(
    request.url,
    "https://example.supabase.co/rest/v1/rpc/submit_app_feedback"
  );
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.prefer, "return=minimal");
  assert.equal(request.options.headers.authorization, "Bearer access-token");
  const body = JSON.parse(request.options.body);
  assert.equal(body.user_id, undefined);
  assert.equal(body.p_category, "clarity");
  assert.equal(body.p_context.email, undefined);
});

test("feedback storage is write-only and account scoped", async () => {
  const [schema, applySchema, accountLayer, bridge, serviceWorker, privacy] =
    await Promise.all([
      readFile("supabase/schema.sql", "utf8"),
      readFile("scripts/apply-supabase-schema.mjs", "utf8"),
      readFile("src/publicAccountAuthLayer.mjs", "utf8"),
      readFile("src/publicNativeBridgeLayer.mjs", "utf8"),
      readFile("sw.js", "utf8"),
      readFile("privacy.html", "utf8")
    ]);

  assert.match(schema, /create table if not exists public\.app_feedback/);
  assert.match(schema, /alter table public\.app_feedback force row level security/);
  assert.match(schema, /create or replace function public\.submit_app_feedback/);
  assert.match(schema, /revoke insert on table public\.app_feedback from authenticated/);
  assert.match(
    schema,
    /grant execute on function public\.submit_app_feedback\(text, text, jsonb\)[\s\S]+to authenticated, service_role/
  );
  assert.doesNotMatch(
    schema,
    /grant select[^;]+public\.app_feedback[^;]+authenticated/
  );
  assert.match(schema, /Too many feedback submissions/);
  assert.match(applySchema, /app_feedback_client_access_ready/);
  assert.match(accountLayer, /data-account-action="feedback-open"/);
  assert.match(accountLayer, /data-account-feedback-form/);
  assert.match(accountLayer, /data-account-feedback-form novalidate/);
  assert.match(accountLayer, /message\.length < 10/);
  assert.match(accountLayer, /לפחות 10 תווים/);
  assert.match(accountLayer, /handleAccountFeedbackNativeBack/);
  assert.match(accountLayer, /ACCOUNT_FEEDBACK_HISTORY_KEY/);
  assert.match(accountLayer, /min-height: 100dvh/);
  assert.match(bridge, /appPlugin\?\.getInfo/);
  assert.match(serviceWorker, /appFeedback\.mjs/);
  assert.match(privacy, /משוב ונתוני אבחון/);
});
