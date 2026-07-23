import test from "node:test";
import assert from "node:assert/strict";

import { mergeEnvFileValues, parseEnvFile } from "../src/server/envFile.mjs";

test("parseEnvFile reads simple values, quoted values, and comments", () => {
  const values = parseEnvFile(`
    # beta settings
    APP_PUBLIC_URL=https://settle.example.com
    APP_SPACE_ID="thursday friends"
    EMPTY=
  `);

  assert.deepEqual(values, {
    APP_PUBLIC_URL: "https://settle.example.com",
    APP_SPACE_ID: "thursday friends",
    EMPTY: ""
  });
});

test("mergeEnvFileValues keeps existing environment values", () => {
  const env = { APP_PUBLIC_URL: "https://already.example.com" };

  mergeEnvFileValues(env, {
    APP_PUBLIC_URL: "https://from-file.example.com",
    APP_SPACE_ID: "friends-beta"
  });

  assert.deepEqual(env, {
    APP_PUBLIC_URL: "https://already.example.com",
    APP_SPACE_ID: "friends-beta"
  });
});
