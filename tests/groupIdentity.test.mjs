import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  findMatchingActiveGroup,
  groupsHaveSameDefinition,
  normalizeGroupName
} from "../src/domain/groupIdentity.mjs";

test("group names compare without casing or repeated whitespace", () => {
  assert.equal(normalizeGroupName("  חברים   מהעבודה "), "חברים מהעבודה");
  assert.equal(normalizeGroupName("TEAM"), "team");
});

test("group definitions compare member sets without relying on order", () => {
  assert.equal(
    groupsHaveSameDefinition(
      { name: "חברים", memberIds: ["yarin", "maor", "yarin"] },
      { name: " חברים ", memberIds: ["maor", "yarin"] }
    ),
    true
  );
  assert.equal(
    groupsHaveSameDefinition(
      { name: "חברים", memberIds: ["yarin", "maor"] },
      { name: "חברים", memberIds: ["yarin", "dani"] }
    ),
    false
  );
});

test("matching group lookup ignores archived and excluded records", () => {
  const groups = [
    { id: "archived", name: "חברים", memberIds: ["yarin"], archived: true },
    { id: "active", name: "חברים", memberIds: ["yarin"], archived: false }
  ];

  assert.equal(
    findMatchingActiveGroup(groups, { name: "חברים", memberIds: ["yarin"] })?.id,
    "active"
  );
  assert.equal(
    findMatchingActiveGroup(
      groups,
      { name: "חברים", memberIds: ["yarin"] },
      { excludeId: "active" }
    ),
    undefined
  );
});

test("offline cache includes the group identity module", async () => {
  const worker = await readFile("sw.js", "utf8");
  assert.match(worker, /\/src\/domain\/groupIdentity\.mjs/);
});
