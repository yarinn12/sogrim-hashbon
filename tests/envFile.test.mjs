import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeEnvFileValues,
  parseEnvFile,
  resolvePrivateOperatorEnvPath
} from "../src/server/envFile.mjs";

test("parseEnvFile reads simple values, quoted values, and comments", () => {
  const values = parseEnvFile(`
    # beta settings
    APP_PUBLIC_URL=https://settle.example.com
    APP_SPACE_ID="thursday friends"
    export ESCAPED_JSON="line\\nwith \\"quotes\\""
    EMPTY=
  `);

  assert.deepEqual(values, {
    APP_PUBLIC_URL: "https://settle.example.com",
    APP_SPACE_ID: "thursday friends",
    ESCAPED_JSON: 'line\nwith "quotes"',
    EMPTY: ""
  });
});

test("private operator env override fails closed inside the workspace", () => {
  assert.throws(
    () => resolvePrivateOperatorEnvPath({
      SOGRIM_PRIVATE_ENV_FILE: "./operator.env"
    }),
    /outside the project workspace/
  );
  assert.throws(
    () => resolvePrivateOperatorEnvPath({
      LOCALAPPDATA: process.cwd()
    }),
    /outside the project workspace/
  );
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
