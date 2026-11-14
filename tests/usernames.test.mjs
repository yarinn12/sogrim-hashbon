import test from "node:test";
import assert from "node:assert/strict";

import {
  formatUsername,
  normalizeUsername,
  profileUsername,
  usernameValidationMessage
} from "../src/domain/usernames.mjs";

test("usernames are normalized as stable lowercase account identifiers", () => {
  assert.equal(normalizeUsername(" @Yarin_12 "), "yarin_12");
  for (const input of ["YARIN_12", "@yarin_12", " @@Yarin_12 "]) {
    assert.equal(formatUsername(input), "yarin_12");
    assert.equal(normalizeUsername(input), "yarin_12");
  }
  assert.equal(formatUsername(""), "");
  assert.equal(formatUsername("invalid name"), "");
});

test("usernames reject ambiguous or invalid public identifiers", () => {
  assert.equal(normalizeUsername("12yarin"), "");
  assert.equal(normalizeUsername("ירין"), "");
  assert.equal(normalizeUsername("ab"), "");
  assert.equal(normalizeUsername("a".repeat(25)), "");
  assert.match(usernameValidationMessage(""), /שם משתמש/);
});

test("server fallback usernames stay private until the user chooses one", () => {
  assert.equal(
    profileUsername({
      username: "yarin_ab12cd34",
      username_customized: false
    }),
    ""
  );
  assert.equal(
    profileUsername({
      username: "yarin",
      username_customized: true
    }),
    "yarin"
  );
});
