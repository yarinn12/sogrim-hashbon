"""Synthetic offline artifacts only. No real IDs, transport, credentials or actions.

The memory loaders replace immutable bindings/imports only for tests. Production
modules expose no binding override or OLD mode, and retain PENDING.
"""
import copy
import io
import json
import pathlib
import re
import subprocess
import types
import unittest
import zipfile
from urllib.parse import urlencode, urlsplit, parse_qsl
import test_successful_intake as original

HERE = pathlib.Path(__file__).resolve().parent
SOURCE = (HERE / "owner_separate_audit_adapter.py").read_text(encoding="utf-8")
H, C, jbytes, zip_bytes = original.H, original.BASE._canonical, original.jbytes, original.zip_bytes
NOW = "2026-10-15T10:30:00Z"
B = "11111111-1111-4111-8111-111111111111"
D = "22222222-2222-4222-8222-222222222222"
X = "33333333-3333-4333-8333-333333333333"
XT = "44444444-4444-4444-8444-444444444444"
XB = "55555555-5555-4555-8555-555555555555"
G = "4646e3de-7401-4e70-ac32-9a00072e1376"
OWNER = "5d2040f0-3af9-4d98-a188-fd6eeb5547db"


def load_adapter(pins=None, intake_pins=None):
    source = SOURCE
    if pins is not None:
        first = source.index("# BEGIN IMMUTABLE BINDINGS")
        end = source.index("# END IMMUTABLE BINDINGS") + len("# END IMMUTABLE BINDINGS")
        source = source[:first] + "PINS = intake._freeze(" + repr(pins) + ")\n" + source[end:]
    need = "import verify_successful_intake as intake"
    if source.count(need) != 1: raise AssertionError("Expected one immutable verifier import")
    source = source.replace(need, "intake = TEST_INTAKE_VERIFIER")
    module = types.ModuleType("synthetic_separate_audit_adapter")
    module.TEST_INTAKE_VERIFIER = original.load_verifier(intake_pins)
    exec(compile(source, "<isolated-separate-audit-adapter>", "exec"), module.__dict__)
    return module


def collector(snapshot):
    e = {"schemaVersion": 1, "mode": "INJECTED_API_GET_ONLY", "appId": snapshot["app"]["id"],
         "buildId": snapshot["build"]["id"], "startedAt": snapshot["observedAt"], "completedAt": "2026-10-15T10:23:00Z",
         "complete": True, "transportAttestation": "NOT_PROVIDED_BY_THIS_COLLECTOR", "requests": [], "collections": [],
         "derivations": {"testerGroupIds": "Union of every app group; no global tester request"}}
    def request(path, cursor=None):
        original_path = path + ("&cursor=" + cursor if cursor else "")
        record = {"method": "GET", "path": path, "requestSha256": H(C(original_path)),
                  "cursorSha256": H(C(cursor)) if cursor else None, "completed": True}
        e["requests"].append(record)
        return {k: record[k] for k in ("path", "requestSha256", "cursorSha256")}
    def q(path, values): return path + "?" + urlencode(values)
    def add(path, kind, ids):
        req = request(path)
        e["collections"].append({"initialPath": path, "type": kind, "total": len(ids), "complete": True,
            "idsSha256": H(C(sorted(ids))), "pages": [{"request": req, "count": len(ids), "idsSha256": H(C(ids)), "nextRequest": None}]})
    app, bid = snapshot["app"]["id"], snapshot["build"]["id"]
    add(q("/v1/builds/" + bid + "/betaBuildLocalizations", {"fields[betaBuildLocalizations]": "locale,whatsNew", "limit": "200"}), "betaBuildLocalizations", [n["id"] for n in snapshot["notes"]])
    gf = {"fields[betaGroups]": "name,isInternalGroup,hasAccessToAllBuilds,publicLinkEnabled", "limit": "200"}
    add(q("/v1/apps/" + app + "/betaGroups", gf), "betaGroups", [g["id"] for g in snapshot["groups"]])
    for g in snapshot["groups"]:
        add(q("/v1/betaGroups/" + g["id"] + "/relationships/builds", {"limit": "200"}), "builds", g["buildIds"])
        add(q("/v1/betaGroups/" + g["id"] + "/relationships/betaTesters", {"limit": "200"}), "betaTesters", g["testerIds"])
    add(q("/v1/betaGroups", {"filter[app]": app, "filter[builds]": bid, **gf}), "betaGroups", [])
    add(q("/v1/builds/" + bid + "/relationships/individualTesters", {"limit": "200"}), "betaTesters", [])
    add(q("/v1/apps/" + app + "/appStoreVersions", {"filter[platform]": "IOS", "fields[appStoreVersions]": "platform,versionString,appStoreState,releaseType", "limit": "200"}), "appStoreVersions", [v["id"] for v in snapshot["appStoreVersions"]])
    reads = [q("/v1/apps/" + app, {"fields[apps]": "bundleId"}),
             q("/v1/builds/" + bid, {"fields[builds]": "version,processingState,expired,usesNonExemptEncryption"}),
             q("/v1/builds/" + bid + "/preReleaseVersion", {"fields[preReleaseVersions]": "version,platform"}),
             q("/v1/builds/" + bid + "/buildBetaDetail", {"fields[buildBetaDetails]": "internalBuildState,externalBuildState"}),
             "/v1/builds/" + bid + "/relationships/appStoreVersion"]
    for g in snapshot["groups"]:
        reads += ["/v1/betaGroups/" + g["id"] + "/relationships/app", q("/v1/betaGroups/" + g["id"], {"fields[betaGroups]": gf["fields[betaGroups]"]})]
    builds = {bid} | {b for g in snapshot["groups"] for b in g["buildIds"]} | {v["buildId"] for v in snapshot["appStoreVersions"] if v["buildId"] is not None}
    reads += [q("/v1/builds/" + b + "/app", {"fields[apps]": "bundleId"}) for b in sorted(builds)]
    reads += [q("/v1/appStoreVersions/" + v["id"] + "/build", {"fields[builds]": "version"}) for v in snapshot["appStoreVersions"]]
    for path in reads: request(path)
    return e


def refresh_audit(f, bind_members=True, context_hashes=True):
    if context_hashes:
        ctx = json.loads(f["members"]["audit-execution-context.json"])
        ctx["apiSha256"] = {k: H(f["members"][n]) for k, n in {
            "controllerCommit": "audit-controller-commit.json", "toolkitCommit": "audit-tool-commit.json",
            "run": "audit-context-run.json", "jobs": "audit-context-jobs.json"}.items()}
        f["members"]["audit-execution-context.json"] = jbytes(ctx)
    f["files"]["audit-evidence.zip"] = zip_bytes(f["members"], f.get("compression", zipfile.ZIP_DEFLATED))
    p = f["pins"]; p["auditZipSha256"] = H(f["files"]["audit-evidence.zip"]); p["auditArtifactSize"] = str(len(f["files"]["audit-evidence.zip"]))
    a = json.loads(f["files"]["audit-artifact.json"]); a["digest"] = "sha256:" + p["auditZipSha256"]; a["size_in_bytes"] = int(p["auditArtifactSize"])
    f["files"]["audit-artifact.json"] = jbytes(a)
    if bind_members: p["auditMemberSha256"] = {n: H(b) for n, b in f["members"].items()}
    p["inputSha256"] = {n: H(b) for n, b in f["files"].items()}


def fixture(baseline=(B, D), compression=zipfile.ZIP_DEFLATED):
    files, ip, intake_members = original.fixture()
    ip["signingJobName"] = "build-export-verify-private"
    for prefix in ("signing", "intake"):
        r = json.loads(files[prefix + "-run.json"])
        for repo in (r["repository"], r["head_repository"]): repo.update({"id": 9001, "owner": {"id": 9002}})
        files[prefix + "-run.json"] = jbytes(r)
    jobs = json.loads(files["signing-jobs.json"]); jobs["jobs"][0]["name"] = ip["signingJobName"]; files["signing-jobs.json"] = jbytes(jobs)
    group_reports = [{"id": G, "name": "Synthetic owner", "isInternalGroup": True, "hasAccessToAllBuilds": False,
                      "publicLinkEnabled": False, "builds": [{"id": b, "build": str(180 + n)} for n, b in enumerate(baseline)]},
                     {"id": X, "name": "Synthetic external", "isInternalGroup": False, "hasAccessToAllBuilds": None,
                      "publicLinkEnabled": False, "builds": [{"id": XB, "build": "177"}]}]
    for name in ("intake-preflight.json", "intake-postflight.json"):
        r = json.loads(intake_members[name]); r["groups"] = copy.deepcopy(group_reports); r["appStoreVersions"][0]["releaseType"] = "MANUAL"; intake_members[name] = jbytes(r)
    original.refresh_zip(files, ip, intake_members)
    successful = original.load_verifier(ip).verify_successful_intake(files, now_utc=NOW)
    files["successful-intake-receipt.json"] = successful["receiptBytes"]
    p = {"ownerGroupId": G, "ownerTesterId": OWNER, "repositoryId": "9001", "repositoryOwnerId": "9002",
         "successfulReceiptSha256": successful["receiptSha256"], "notesSha256": H(json.loads(files["source-metadata.json"])["version"]["releaseNotes"].encode()),
         "auditToolSha": "1" * 40, "auditToolTree": "2" * 40, "auditControllerSha": "3" * 40, "auditControllerTree": "4" * 40,
         "auditBranch": "codex/synthetic-independent-audit", "auditWorkflowPath": ".github/workflows/synthetic-independent-audit.yml", "auditEvent": "workflow_dispatch",
         "auditRun": "103", "auditRunNumber": "1", "auditJob": "203", "auditJobKey": "owner_audit", "auditJobName": "Synthetic independent audit",
         "auditRequiredSteps": ["Verify original successful intake", "Verify audit context", "Collect owner snapshot"],
         "auditArtifact": "303", "auditArtifactName": "synthetic-owner-audit-103", "auditPolicySha256": "5" * 64,
         "baselineBuildIds": list(baseline), "baselineBuildIdsSha256": H(C(sorted(baseline))), "previousBuildId": baseline[0] if baseline else None}
    p["auditInputSha256"] = {n: H(files[n]) for n in ("successful-intake-receipt.json", "source-metadata.json")}
    for kind in ("tool", "controller"):
        name = "audit" + kind.title(); sha, tree = p[name + "Sha"], p[name + "Tree"]
        files["audit-" + kind + "-commit.json"] = jbytes({"sha": sha, "url": original.BASE.API + "/git/commits/" + sha, "tree": {"sha": tree, "url": original.BASE.API + "/git/trees/" + tree}})
    api = original.BASE.API; repo = {"full_name": original.BASE.REPO, "id": 9001, "owner": {"id": 9002}}
    run = {"id": 103, "url": api + "/actions/runs/103", "repository": repo, "head_repository": copy.deepcopy(repo),
           "head_sha": p["auditControllerSha"], "head_branch": p["auditBranch"], "path": p["auditWorkflowPath"], "event": p["auditEvent"],
           "status": "completed", "conclusion": "success", "run_attempt": 1, "run_number": 1,
           "created_at": "2026-10-15T10:21:00Z", "updated_at": "2026-10-15T10:25:00Z", "jobs_url": api + "/actions/runs/103/jobs"}
    job = {"id": 203, "run_id": 103, "run_attempt": 1, "head_sha": p["auditControllerSha"], "name": p["auditJobName"],
           "url": api + "/actions/jobs/203", "run_url": run["url"], "status": "completed", "conclusion": "success",
           "started_at": "2026-10-15T10:21:05Z", "completed_at": "2026-10-15T10:24:30Z",
           "steps": [{"name": n, "status": "completed", "conclusion": "success"} for n in p["auditRequiredSteps"]]}
    files["audit-run.json"] = jbytes(run); files["audit-jobs.json"] = jbytes({"total_count": 1, "jobs": [job]})
    files["audit-artifact.json"] = jbytes({"id": 303, "name": p["auditArtifactName"], "workflow_run": {"id": 103, "head_sha": p["auditControllerSha"]},
        "expired": False, "expires_at": "2026-10-22T00:00:00Z", "created_at": "2026-10-15T10:24:00Z", "size_in_bytes": 1, "digest": "PENDING"})
    running = {**run, "status": "in_progress", "conclusion": None, "updated_at": "2026-10-15T10:21:10Z"}
    live_job = {**job, "status": "in_progress", "conclusion": None, "completed_at": None}
    snapshot = {"schemaVersion": 1, "observedAt": "2026-10-15T10:22:00Z", "coverage": {k: True for k in ("appGroups", "groupBuilds", "groupTesters", "buildGroups", "individualTesters", "storeVersions", "storeBuildLinks", "notes")},
        "app": {"id": ip["appId"], "bundleId": ip["bundleId"]}, "build": {"id": ip["buildId"], "appId": ip["appId"], "version": "4.58", "build": "194", "platform": "IOS", "processingState": "VALID", "expired": False, "usesNonExemptEncryption": False, "internalBuildState": "READY_FOR_BETA_TESTING", "externalBuildState": "READY_FOR_BETA_SUBMISSION"},
        "notes": [{"id": "synthetic-note-he", "locale": "he", "whatsNew": json.loads(files["source-metadata.json"])["version"]["releaseNotes"]}],
        "buildGroupIds": [], "individualTesterIds": [], "storeVersionId": None,
        "groups": [{k: v for k, v in g.items() if k != "builds"} | {"appId": ip["appId"], "buildIds": [b["id"] for b in g["builds"]], "testerIds": [OWNER if g["id"] == G else XT]} for g in group_reports],
        "testers": [{"id": OWNER, "groupIds": [G]}, {"id": XT, "groupIds": [X]}],
        "appStoreVersions": [{"id": "synthetic-store", "version": "4.55", "state": "READY_FOR_SALE", "releaseType": "MANUAL", "buildId": B}]}
    context = {"schemaVersion": 1, "scope": "AUDIT_EXECUTION_CONTEXT_PREPARATION_ONLY", "auditMode": "INDEPENDENT_POST_INTAKE_GET_ONLY", "reviewedPolicySha256": p["auditPolicySha256"],
        "sourceSha": ip["sourceSha"], "sourceTree": ip["sourceTree"], "auditToolSha": p["auditToolSha"], "auditToolTree": p["auditToolTree"], "controllerSha": p["auditControllerSha"], "controllerTree": p["auditControllerTree"],
        "auditRun": p["auditRun"], "auditJob": p["auditJob"], "auditJobKey": p["auditJobKey"], "auditJobName": p["auditJobName"], "runAttempt": 1, "runNumber": 1,
        "workflowPath": p["auditWorkflowPath"], "event": p["auditEvent"], "checkedAt": "2026-10-15T10:21:20Z", "inputSha256": p["auditInputSha256"], "apiSha256": {},
        "appleKeysAuthorized": False, "ownerAvailabilityAccepted": False, "databaseAccepted": False, "publicReleaseAccepted": False, "distributionAllowed": False, "transportAttestation": "NOT_PROVIDED_BY_PURE_VERIFIER"}
    members = {"owner-snapshot.json": jbytes(snapshot), "owner-snapshot-evidence.json": jbytes(collector(snapshot)), "audit-execution-context.json": jbytes(context),
               "audit-controller-commit.json": files["audit-controller-commit.json"], "audit-tool-commit.json": files["audit-tool-commit.json"], "audit-context-run.json": jbytes(running), "audit-context-jobs.json": jbytes({"total_count": 1, "jobs": [live_job]})}
    f = {"files": files, "pins": p, "intakePins": ip, "members": members, "intakeMembers": intake_members, "compression": compression}
    refresh_audit(f)
    return f


def adapt(f):
    return load_adapter(f["pins"], f["intakePins"]).adapt_separate_audit_to_owner_receipt(f["files"], now_utc=NOW)


def edit_input(f, name, edit):
    value = json.loads(f["files"][name]); edit(value); f["files"][name] = jbytes(value)
    f["pins"]["inputSha256"] = {n: H(b) for n, b in f["files"].items()}
    if name in original.BASE.INPUT_FILES: f["intakePins"]["inputSha256"][name] = H(f["files"][name])


def edit_member(f, name, edit, bind=True):
    value = json.loads(f["members"][name]); edit(value); f["members"][name] = jbytes(value); refresh_audit(f, bind_members=bind)


class SeparateAuditControls(unittest.TestCase):
    def test_pending_before_any_input_or_clock_is_consumed(self):
        class Trap(dict):
            def __iter__(self): raise AssertionError("Input consumed")
        with self.assertRaisesRegex(ValueError, "PENDING"):
            load_adapter().adapt_separate_audit_to_owner_receipt(Trap(), now_utc=object())

    def test_successful_intake_and_later_separate_audit_are_accepted(self):
        f = fixture(); out = adapt(f); r = json.loads(out["receiptBytes"])
        self.assertEqual(out, adapt(f)); self.assertEqual(r["scope"], "PACKAGE_INTAKE_ONLY")
        self.assertEqual(r["baselineBuildIds"], [B, D]); self.assertEqual(r["previousBuildId"], B)
        self.assertEqual(r["baselineBuildIdsSha256"], H(C([B, D])))
        self.assertEqual(r["auditOrigin"]["auditRun"], "103"); self.assertEqual(r["intakeRunId"], "102")
        self.assertEqual(r["snapshot"]["observedAt"], "2026-10-15T10:22:00Z")
        self.assertNotEqual(r["auditOrigin"]["auditControllerSha"], r["auditOrigin"]["auditToolSha"])
        for k in ("ownerAvailabilityAccepted", "databaseAccepted", "publicReleaseAccepted", "distributionAllowed"):
            self.assertIs(r[k], False); self.assertIs(out[k], False)

    def test_empty_audited_baseline_is_exactly_nullable_and_preserved(self):
        f = fixture(()); out = adapt(f); r = json.loads(out["receiptBytes"])
        self.assertEqual(out["baselineBuildIds"], []); self.assertIsNone(out["previousBuildId"])
        self.assertEqual(out["baselineBuildIdsSha256"], H(b"[]")); self.assertEqual(r["baselineBuildIds"], [])

    def test_stored_original_audit_zip_is_supported(self):
        adapt(fixture(compression=zipfile.ZIP_STORED))

    def test_running_metadata_update_may_precede_job_start(self):
        f = fixture()
        edit_member(f, "audit-context-run.json", lambda r: r.update(updated_at=r["created_at"]))
        adapt(f)

    def test_bound_adapter_cannot_replace_unbound_successful_intake_verifier(self):
        f = fixture()
        with self.assertRaisesRegex(ValueError, "PENDING"):
            load_adapter(f["pins"]).adapt_separate_audit_to_owner_receipt(None, now_utc=object())

    def test_full_baseline_binding_mismatches_remain_closed(self):
        cases = [
            ((B, D), lambda p: p.update(previousBuildId=None)),
            ((), lambda p: p.update(previousBuildId=B)),
            ((B, D), lambda p: p.update(baselineBuildIdsSha256="0" * 64)),
            ((B, D), lambda p: p.update(baselineBuildIds=[B, B], baselineBuildIdsSha256=H(C([B, B])))),
            ((B, D), lambda p: p.update(baselineBuildIds=[], previousBuildId=None, baselineBuildIdsSha256=H(b"[]"))),
            ((B, D), lambda p: p.update(auditRun="102")),
        ]
        for baseline, change in cases:
            with self.subTest(baseline=baseline, change=change):
                f = fixture(baseline); change(f["pins"])
                with self.assertRaises(ValueError): adapt(f)

    def test_original_success_receipt_bytes_are_not_semantic_substitutes(self):
        f = fixture(); f["files"]["successful-intake-receipt.json"] += b" \n"
        f["pins"]["successfulReceiptSha256"] = H(f["files"]["successful-intake-receipt.json"])
        f["pins"]["auditInputSha256"]["successful-intake-receipt.json"] = f["pins"]["successfulReceiptSha256"]
        edit_member(f, "audit-execution-context.json", lambda c: c.update(inputSha256=f["pins"]["auditInputSha256"]))
        with self.assertRaisesRegex(ValueError, "Original successful-intake receipt bytes"): adapt(f)

    def test_original_audit_member_bytes_survive_rebound_outer_zip(self):
        f = fixture(); f["members"]["owner-snapshot.json"] += b" \n"; refresh_audit(f, bind_members=False)
        with self.assertRaisesRegex(ValueError, "Original audit member byte digest"): adapt(f)

    def test_intake_collector_step_is_not_required_or_invented(self):
        f = fixture()
        names = [s["name"] for s in json.loads(f["files"]["intake-jobs.json"])["jobs"][0]["steps"]]
        self.assertNotIn("Collect owner snapshot", names)
        self.assertIn("Collect owner snapshot", f["pins"]["auditRequiredSteps"])
        adapt(f)

    def test_intake_baseline_access_removal_is_rejected_after_full_digest_rebinding(self):
        f = fixture()
        post = json.loads(f["intakeMembers"]["intake-postflight.json"]); post["groups"][0]["builds"].pop()
        f["intakeMembers"]["intake-postflight.json"] = jbytes(post)
        subset = {n: f["files"][n] for n in original.BASE.INPUT_FILES}
        original.refresh_zip(subset, f["intakePins"], f["intakeMembers"])
        f["files"].update(subset)
        verified = original.load_verifier(f["intakePins"]).verify_successful_intake(subset, now_utc=NOW)
        f["files"]["successful-intake-receipt.json"] = verified["receiptBytes"]
        f["pins"]["successfulReceiptSha256"] = verified["receiptSha256"]
        f["pins"]["auditInputSha256"]["successful-intake-receipt.json"] = verified["receiptSha256"]
        edit_member(f, "audit-execution-context.json", lambda c: c.update(inputSha256=f["pins"]["auditInputSha256"]))
        with self.assertRaisesRegex(ValueError, "Existing group/build access changed during intake"): adapt(f)

    def test_original_two_page_collection_is_linked_and_terminal(self):
        f = fixture(); e = json.loads(f["members"]["owner-snapshot-evidence.json"])
        c = next(c for c in e["collections"] if c["type"] == "builds" and c["total"] == 2)
        first = c["pages"][0]; second_req = {"method": "GET", "path": first["request"]["path"],
            "requestSha256": H(C(first["request"]["path"] + "&cursor=synthetic-second")), "cursorSha256": H(C("synthetic-second")), "completed": True}
        e["requests"].append(second_req)
        second = {"request": {k: second_req[k] for k in ("path", "requestSha256", "cursorSha256")}, "count": 1, "idsSha256": H(C([D])), "nextRequest": None}
        first.update(count=1, idsSha256=H(C([B])), nextRequest=second["request"]); c["pages"].append(second)
        f["members"]["owner-snapshot-evidence.json"] = jbytes(e); refresh_audit(f); adapt(f)

    def test_complete_baseline_collection_order_does_not_change_the_frozen_set(self):
        f = fixture((D, B)); out = adapt(f)
        self.assertEqual(out["baselineBuildIds"], [B, D]); self.assertEqual(out["previousBuildId"], D)

    def test_original_zip_member_sets_and_regular_files_are_enforced(self):
        for mode in ("duplicate", "symlink", "unsupported", "unsafe", "missing", "extra"):
            with self.subTest(mode=mode):
                f = fixture(); buf = io.BytesIO()
                with zipfile.ZipFile(buf, "w") as archive:
                    for index, (name, raw) in enumerate(f["members"].items()):
                        if mode == "missing" and index == 0: continue
                        info = zipfile.ZipInfo("../escape.json" if mode == "unsafe" and index == 0 else name)
                        info.create_system = 3; info.external_attr = ((0o120777 if mode == "symlink" and index == 0 else 0o100600) << 16)
                        info.compress_type = zipfile.ZIP_BZIP2 if mode == "unsupported" and index == 0 else zipfile.ZIP_STORED
                        archive.writestr(info, raw)
                    if mode == "duplicate": archive.writestr(next(iter(f["members"])), b"{}")
                    if mode == "extra": archive.writestr("unreviewed.json", b"{}")
                replace_zip(f, buf.getvalue())
                with self.assertRaises(ValueError): adapt(f)

    def test_zip_crc_failure_is_not_hidden_by_outer_digest_rebinding(self):
        f = fixture(compression=zipfile.ZIP_STORED); raw = bytearray(f["files"]["audit-evidence.zip"])
        with zipfile.ZipFile(io.BytesIO(raw)) as z: info = z.infolist()[0]
        at = info.header_offset + 30 + len(info.filename.encode()) + len(info.extra); raw[at + 5] ^= 1
        replace_zip(f, bytes(raw))
        with self.assertRaises(zipfile.BadZipFile): adapt(f)

    def test_missing_or_extra_original_input_cannot_be_filled_from_a_receipt(self):
        for name in ("audit-evidence.zip", "intake-evidence.zip", "audit-jobs.json", "successful-intake-receipt.json"):
            with self.subTest(name=name):
                f = fixture(); del f["files"][name]
                with self.assertRaisesRegex(ValueError, "Exact separate-audit original inputs"): adapt(f)
        f = fixture(); f["files"]["unplanned.json"] = b"{}"
        with self.assertRaises(ValueError): adapt(f)

    def test_unbound_baseline_or_origin_pins_block_before_input_even_when_other_pins_are_bound(self):
        for pin in ("baselineBuildIds", "previousBuildId", "auditToolSha", "auditRun", "auditArtifact", "successfulReceiptSha256", "auditMemberSha256"):
            with self.subTest(pin=pin):
                f = fixture(); f["pins"][pin] = "PENDING"
                with self.assertRaisesRegex(ValueError, "PENDING"):
                    load_adapter(f["pins"], f["intakePins"]).adapt_separate_audit_to_owner_receipt(None, now_utc=object())

    def test_derived_bytes_interoperate_with_core_for_empty_and_nonempty_baselines(self):
        source = (HERE / "owner-availability-guard.mjs").read_text(encoding="utf-8")
        for baseline in ((), (B, D)):
            f = fixture(baseline); out = adapt(f); receipt = json.loads(out["receiptBytes"])
            js = r'''import assert from 'node:assert/strict';
const input=JSON.parse(Buffer.from(process.argv[1],'base64'));
const unbound=await import('data:text/javascript;base64,'+Buffer.from(input.source).toString('base64'));
const pins={...unbound.PINS,...Object.fromEntries(Object.keys(unbound.PINS).filter(k=>k in input.receipt).map(k=>[k,input.receipt[k]])),intakeReceiptSha256:input.hash};
const source=input.source.replace(/export const PINS = Object.freeze\(\{[\s\S]*?\n\}\);/,'export const PINS = Object.freeze('+JSON.stringify(pins)+');');
assert.notEqual(source,input.source);const core=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
Date.now=()=>Date.parse('2026-10-15T10:22:30Z');const bytes=Buffer.from(input.bytes,'base64'),before=input.receipt.snapshot,after=structuredClone(before);
const plan=core.planOwnerAvailability(bytes,before);assert.deepEqual(plan.request,{method:'POST',path:'/v1/betaGroups/'+pins.ownerGroupId+'/relationships/builds',body:{data:[{type:'builds',id:pins.buildId}]}});
assert.equal(core.requireAllowedMutation(plan.request,bytes,before),true);after.groups.find(g=>g.id===pins.ownerGroupId).buildIds.push(pins.buildId);after.buildGroupIds=[pins.ownerGroupId];after.build.internalBuildState='IN_BETA_TESTING';
assert.equal(core.verifyOwnerPostflight(bytes,before,after).ownerAvailabilityConfirmed,true);assert.equal(core.planOwnerAvailability(bytes,after).request,null);
for(const change of [s=>s.groups[0].testerIds.push('unexpected'),s=>s.groups[0].buildIds.push('unexpected'),s=>s.appStoreVersions[0].state='CHANGED',s=>s.storeVersionId='unexpected']){const s=structuredClone(after);change(s);assert.throws(()=>core.verifyOwnerPostflight(bytes,before,s));}
'''
            import base64
            data = {"source": source, "receipt": receipt, "hash": out["receiptSha256"], "bytes": base64.b64encode(out["receiptBytes"]).decode()}
            # Use stdin for the source/data to avoid Windows command-line length limits.
            script = js.replace("JSON.parse(Buffer.from(process.argv[1],'base64'))", "JSON.parse(await new Promise(resolve=>{let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>resolve(s));}))")
            result = subprocess.run(["node", "--input-type=module", "-e", script], input=jbytes(data), capture_output=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr.decode()[-2000:])

    def test_same_separate_audit_case_fails_legacy_collector_assumption_and_passes_final(self):
        f = fixture(); result = legacy_result(f)
        self.assertEqual(result.returncode, 1, result.stdout[-2000:])
        failure = json.loads(result.stdout)
        self.assertEqual((failure["actual"], failure["expected"]), (0, 1))
        self.assertIn("collector.length", failure["sourceLine"])
        adapt(f)


def replace_zip(f, raw):
    f["files"]["audit-evidence.zip"] = raw; p = f["pins"]
    p["auditZipSha256"] = H(raw); p["auditArtifactSize"] = str(len(raw))
    a = json.loads(f["files"]["audit-artifact.json"]); a.update(size_in_bytes=len(raw), digest="sha256:" + H(raw))
    f["files"]["audit-artifact.json"] = jbytes(a); p["inputSha256"] = {n: H(b) for n, b in f["files"].items()}


def legacy_result(f):
    import base64
    source = (HERE / "owner-intake-receipt-adapter.mjs").read_text(encoding="utf-8")
    ip, p = f["intakePins"], f["pins"]
    files = {n: raw for n, raw in f["files"].items() if n in ("signing-run.json", "signing-jobs.json", "signing-artifact.json", "intake-run.json", "intake-jobs.json", "intake-artifact.json", "signing-artifact.zip", "intake-evidence.zip")}
    files["app-store-metadata-he.json"] = f["files"]["source-metadata.json"]
    for name in ("upload-origin.json", "source-before-upload.json", "original-artifact-before-upload.json", "intake-preflight.json", "intake-postflight.json", "testflight-completion.json"):
        files[name] = f["intakeMembers"][name]
    for name in ("owner-snapshot.json", "owner-snapshot-evidence.json"): files[name] = f["members"][name]
    pins = {"appId": ip["appId"], "bundleId": ip["bundleId"], "version": "4.58", "build": "194", "ownerGroupId": G, "ownerTesterId": OWNER,
        "sourceSha": ip["sourceSha"], "sourceTree": ip["sourceTree"], "signingToolSha": ip["signingToolSha"], "intakeToolSha": ip["intakeToolSha"],
        "signedRunId": ip["signingRun"], "signedJobId": ip["signingJob"], "signedArtifactId": ip["signingArtifact"], "signedArtifactSize": ip["signingArtifactSize"],
        "signedZipSha256": ip["signingZipSha256"], "ipaSha256": ip["ipaSha256"], "intakeRunId": ip["intakeRun"], "intakeJobId": ip["intakeJob"], "intakeArtifactId": ip["intakeArtifact"], "intakeArtifactSize": ip["intakeArtifactSize"], "intakeZipSha256": ip["intakeZipSha256"],
        "notesSha256": p["notesSha256"], "buildId": ip["buildId"], "previousBuildId": p["previousBuildId"], "baselineBuildIds": p["baselineBuildIds"], "baselineBuildIdsSha256": p["baselineBuildIdsSha256"],
        "qaRunId": ip["qaRun"], "windowsRunId": ip["windowsRun"], "fontRunId": ip["fontRun"], "authRunId": ip["authRun"], "signingBranch": ip["signingBranch"], "signingWorkflowPath": ip["signingWorkflowPath"], "intakeBranch": ip["intakeBranch"], "intakeWorkflowPath": ip["intakeWorkflowPath"], "intakeEvent": ip["intakeEvent"], "intakeJobName": ip["intakeJobName"], "collectorStepName": "Collect owner snapshot", "fileSha256": {n: H(b) for n, b in files.items()}}
    data = {"source": source, "pins": pins, "files": {n: base64.b64encode(b).decode() for n, b in files.items()}}
    script = r'''const d=JSON.parse(await new Promise(resolve=>{let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>resolve(s));}));
const source=d.source.replace(/export const ADAPTER_PINS = Object.freeze\(\{[\s\S]*?\n\}\);/,'export const ADAPTER_PINS = Object.freeze('+JSON.stringify(d.pins)+');');
const old=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));const files=Object.fromEntries(Object.entries(d.files).map(([k,v])=>[k,Buffer.from(v,'base64')]));
try{old.adaptIntakeToOwnerReceipt(files);console.log(JSON.stringify({accepted:true}));}catch(e){const frame=(e.stack||'').split('\n').slice(1).map(x=>/:(\d+):(\d+)\)?$/.exec(x)).find(Boolean);console.log(JSON.stringify({accepted:false,name:e.name,message:e.message,actual:e.actual,expected:e.expected,sourceLine:frame?source.split('\n')[Number(frame[1])-1].trim():null}));process.exitCode=1;}
'''
    return subprocess.run(["node", "--input-type=module", "-e", script], input=jbytes(data), capture_output=True, timeout=30)


INPUT_CASES = [
    ("audit-run.json", "controller-head", lambda r: r.update(head_sha="9" * 40)),
    ("audit-run.json", "wrong-event", lambda r: r.update(event="pull_request")),
    ("audit-run.json", "wrong-workflow", lambda r: r.update(path=".github/workflows/other.yml")),
    ("audit-run.json", "wrong-branch", lambda r: r.update(head_branch="codex/other")),
    ("audit-run.json", "retry-attempt", lambda r: r.update(run_attempt=2)),
    ("audit-run.json", "bool-attempt", lambda r: r.update(run_attempt=True)),
    ("audit-run.json", "wrong-run-number", lambda r: r.update(run_number=2)),
    ("audit-run.json", "unsuccessful", lambda r: r.update(conclusion="failure")),
    ("audit-run.json", "fork", lambda r: r["head_repository"].update(full_name="other/repo")),
    ("audit-run.json", "repo-numeric", lambda r: r["repository"].update(id=9999)),
    ("audit-run.json", "owner-numeric", lambda r: r["repository"]["owner"].update(id=9999)),
    ("audit-run.json", "audit-before-intake", lambda r: r.update(created_at="2026-10-15T10:19:00Z")),
    ("audit-jobs.json", "incomplete-jobs", lambda r: r.update(total_count=2)),
    ("audit-jobs.json", "missing-job", lambda r: r.update(total_count=0, jobs=[])),
    ("audit-jobs.json", "duplicate-job", lambda r: (r["jobs"].append(copy.deepcopy(r["jobs"][0])), r.update(total_count=2))),
    ("audit-jobs.json", "wrong-job-run", lambda r: r["jobs"][0].update(run_id=102)),
    ("audit-jobs.json", "wrong-job-source", lambda r: r["jobs"][0].update(head_sha="9" * 40)),
    ("audit-jobs.json", "wrong-job-attempt", lambda r: r["jobs"][0].update(run_attempt=2)),
    ("audit-jobs.json", "skipped-job", lambda r: r["jobs"][0].update(conclusion="skipped")),
    ("audit-jobs.json", "job-key-is-not-ID", lambda r: r["jobs"][0].update(id="owner_audit")),
    ("audit-jobs.json", "collector-step-failed", lambda r: r["jobs"][0]["steps"][-1].update(conclusion="failure")),
    ("audit-jobs.json", "missing-step", lambda r: r["jobs"][0].update(steps=[])),
    ("audit-artifact.json", "expired", lambda r: r.update(expired=True)),
    ("audit-artifact.json", "expired-clock", lambda r: r.update(expires_at="2026-10-15T10:29:00Z")),
    ("audit-artifact.json", "wrong-run", lambda r: r["workflow_run"].update(id=102)),
    ("audit-artifact.json", "wrong-tool-as-controller", lambda r: r["workflow_run"].update(head_sha="1" * 40)),
    ("audit-artifact.json", "wrong-size", lambda r: r.update(size_in_bytes=1)),
    ("audit-artifact.json", "wrong-digest", lambda r: r.update(digest="sha256:" + "0" * 64)),
    ("audit-artifact.json", "wrong-name", lambda r: r.update(name="intake-artifact")),
    ("audit-tool-commit.json", "wrong-tool-tree", lambda r: r["tree"].update(sha="9" * 40)),
    ("audit-controller-commit.json", "wrong-controller-repo", lambda r: r.update(url="https://api.github.com/repos/other/repo/git/commits/" + r["sha"])),
    ("intake-run.json", "intake-event", lambda r: r.update(event="pull_request")),
    ("intake-run.json", "intake-retry", lambda r: r.update(run_attempt=2)),
    ("intake-run.json", "intake-tool", lambda r: r.update(head_sha="9" * 40)),
    ("signing-run.json", "signing-repo", lambda r: r["head_repository"].update(full_name="other/repo")),
    ("intake-tool-commit.json", "intake-tree", lambda r: r["tree"].update(sha="9" * 40)),
]
MEMBER_CASES = [
    ("audit-execution-context.json", "source-mismatch", lambda r: r.update(sourceSha="9" * 40)),
    ("audit-execution-context.json", "tree-mismatch", lambda r: r.update(sourceTree="9" * 40)),
    ("audit-execution-context.json", "wrong-tool", lambda r: r.update(auditToolSha="9" * 40)),
    ("audit-execution-context.json", "controller-not-tool", lambda r: r.update(controllerSha="1" * 40)),
    ("audit-execution-context.json", "wrong-policy", lambda r: r.update(reviewedPolicySha256="0" * 64)),
    ("audit-execution-context.json", "intake-is-not-audit", lambda r: r.update(auditRun="102")),
    ("audit-execution-context.json", "wrong-numeric-job", lambda r: r.update(auditJob="202")),
    ("audit-execution-context.json", "wrong-job-key", lambda r: r.update(auditJobKey="203")),
    ("audit-execution-context.json", "wrong-workflow", lambda r: r.update(workflowPath=".github/workflows/other.yml")),
    ("audit-execution-context.json", "wrong-event", lambda r: r.update(event="pull_request")),
    ("audit-execution-context.json", "wrong-scope", lambda r: r.update(scope="OWNER_AVAILABLE")),
    ("audit-execution-context.json", "owner-acceptance", lambda r: r.update(ownerAvailabilityAccepted=True)),
    ("audit-execution-context.json", "public-acceptance", lambda r: r.update(publicReleaseAccepted=True)),
    ("audit-execution-context.json", "distribution", lambda r: r.update(distributionAllowed=True)),
    ("audit-execution-context.json", "receipt-input-hash", lambda r: r["inputSha256"].update({"successful-intake-receipt.json": "0" * 64})),
    ("audit-execution-context.json", "context-after-collection", lambda r: r.update(checkedAt="2026-10-15T10:22:30Z")),
    ("audit-context-run.json", "context-completed-too-early", lambda r: r.update(status="completed", conclusion="success")),
    ("audit-context-run.json", "context-workflow", lambda r: r.update(path=".github/workflows/other.yml")),
    ("audit-context-run.json", "context-attempt", lambda r: r.update(run_attempt=2)),
    ("audit-context-jobs.json", "context-key-not-ID", lambda r: r["jobs"][0].update(id="owner_audit")),
    ("audit-context-jobs.json", "context-missing", lambda r: r.update(jobs=[], total_count=0)),
    ("owner-snapshot.json", "wrong-app", lambda r: r["app"].update(id="other")),
    ("owner-snapshot.json", "wrong-platform", lambda r: r["build"].update(platform="MAC_OS")),
    ("owner-snapshot.json", "not-valid", lambda r: r["build"].update(processingState="PROCESSING")),
    ("owner-snapshot.json", "already-distributed", lambda r: r.update(buildGroupIds=[G])),
    ("owner-snapshot.json", "individual-exposure", lambda r: r.update(individualTesterIds=[OWNER])),
    ("owner-snapshot.json", "store-exposure", lambda r: r.update(storeVersionId="synthetic-store")),
    ("owner-snapshot.json", "reverse-store-exposure", lambda r: r["appStoreVersions"][0].update(buildId=r["build"]["id"])),
    ("owner-snapshot.json", "store-state", lambda r: r["appStoreVersions"][0].update(state="CHANGED")),
    ("owner-snapshot.json", "extra-tester", lambda r: r["groups"][0]["testerIds"].append(XT)),
    ("owner-snapshot.json", "owner-group-removed", lambda r: r["groups"].pop(0)),
    ("owner-snapshot.json", "lost-existing-build", lambda r: r["groups"][0].update(buildIds=[B])),
    ("owner-snapshot.json", "extra-unpinned-build", lambda r: r["groups"][0]["buildIds"].append(XB)),
    ("owner-snapshot.json", "public-link", lambda r: r["groups"][1].update(publicLinkEnabled=True)),
    ("owner-snapshot.json", "auto-access", lambda r: r["groups"][0].update(hasAccessToAllBuilds=True)),
    ("owner-snapshot.json", "coverage-false", lambda r: r["coverage"].update(groupBuilds=False)),
    ("owner-snapshot.json", "notes-changed", lambda r: r["notes"][0].update(whatsNew="changed")),
    ("owner-snapshot-evidence.json", "collector-false", lambda r: r.update(complete=False)),
    ("owner-snapshot-evidence.json", "collector-post", lambda r: r["requests"][0].update(method="POST")),
    ("owner-snapshot-evidence.json", "collector-global", lambda r: r["requests"][0].update(path="/v1/betaTesters")),
    ("owner-snapshot-evidence.json", "missing-required-get", lambda r: r["requests"].pop()),
    ("owner-snapshot-evidence.json", "missing-collection", lambda r: r["collections"].pop()),
    ("owner-snapshot-evidence.json", "unproven-total", lambda r: r["collections"][0].pop("total")),
    ("owner-snapshot-evidence.json", "false-total", lambda r: r["collections"][0].update(total=999)),
    ("owner-snapshot-evidence.json", "page-not-terminal", lambda r: r["collections"][0]["pages"][0].update(nextRequest={})),
    ("owner-snapshot-evidence.json", "page-not-linked", lambda r: r["collections"][0]["pages"][0]["request"].update(requestSha256="0" * 64)),
    ("owner-snapshot-evidence.json", "collector-after-artifact", lambda r: r.update(completedAt="2026-10-15T10:26:00Z")),
]


def generated_input_case(name, edit):
    def test(self):
        f = fixture(); edit_input(f, name, edit)
        with self.assertRaises((ValueError, KeyError, TypeError)): adapt(f)
    return test


def generated_member_case(name, edit):
    def test(self):
        f = fixture(); edit_member(f, name, edit)
        with self.assertRaises((ValueError, KeyError, TypeError)): adapt(f)
    return test


for index, (name, label, edit) in enumerate(INPUT_CASES):
    setattr(SeparateAuditControls, "test_origin_%02d_%s" % (index, label.replace("-", "_")), generated_input_case(name, edit))
for index, (name, label, edit) in enumerate(MEMBER_CASES):
    setattr(SeparateAuditControls, "test_member_%02d_%s" % (index, label.replace("-", "_")), generated_member_case(name, edit))
