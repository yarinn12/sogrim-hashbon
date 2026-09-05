import test from "node:test";
import assert from "node:assert/strict";
import {
  buildIncidentBody,
  buildIncidentSignature,
  classifyIncident,
  collectFailureBoundaries,
  markRecoveryCheck,
  readIncidentSignature
} from "../scripts/production-incident-state.mjs";

test("incident signatures ignore timings and source hashes but retain error classes", () => {
  const first = collectFailureBoundaries([
    {
      label: "availability",
      outcome: "failure",
      log: "FAILED  Supabase Auth (284ms) - HTTP 402"
    },
    {
      label: "failover",
      outcome: "failure",
      log: "FAILED  recovery matches the release source - remote " + "a".repeat(64) + ", local " + "b".repeat(64)
    }
  ]);
  const sameFailure = collectFailureBoundaries([
    {
      label: "availability",
      outcome: "failure",
      log: "FAILED  Supabase Auth (901ms) - HTTP 402"
    },
    {
      label: "failover",
      outcome: "failure",
      log: "FAILED  recovery matches the release source - remote " + "c".repeat(64) + ", local " + "d".repeat(64)
    }
  ]);
  const changedFailure = collectFailureBoundaries([
    {
      label: "availability",
      outcome: "failure",
      log: "FAILED  Supabase Auth (301ms) - HTTP 500"
    }
  ]);

  assert.equal(buildIncidentSignature(first), buildIncidentSignature(sameFailure));
  assert.notEqual(buildIncidentSignature(first), buildIncidentSignature(changedFailure));
});

test("an existing incident is adopted once, stays quiet, then alerts on a changed boundary", () => {
  const boundaries = ["availability: Supabase Auth [HTTP 402]"];
  const changed = ["availability: Supabase Auth [HTTP 500]"];
  const body = buildIncidentBody(boundaries, new Date("2026-09-05T00:00:00Z"));

  assert.equal(classifyIncident("legacy incident", boundaries), "adopted");
  assert.equal(classifyIncident(body, boundaries), "unchanged");
  assert.equal(classifyIncident(body, changed), "changed");
  assert.equal(readIncidentSignature(body), buildIncidentSignature(boundaries));
});

test("recovery requires two consecutive successful checks and failure bodies reset it", () => {
  const incidentBody = buildIncidentBody(
    ["availability: Supabase Auth [HTTP 402]"],
    new Date("2026-09-05T00:00:00Z")
  );
  const first = markRecoveryCheck(incidentBody, 2);
  const second = markRecoveryCheck(first.body, 2);
  const reset = markRecoveryCheck(incidentBody, 2);

  assert.equal(first.streak, 1);
  assert.equal(first.complete, false);
  assert.equal(second.streak, 2);
  assert.equal(second.complete, true);
  assert.equal(reset.streak, 1);
  assert.equal(reset.complete, false);
});
