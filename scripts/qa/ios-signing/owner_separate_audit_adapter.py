"""Inactive offline bridge from original successful intake + independent audit ZIP.

No CLI, filesystem, environment, credentials, transport or owner action. The future
reviewed caller must authenticate these original buffers and bind BOTH verifiers.
The existing blocked audit entry and workflow are deliberately unchanged.
"""
import io
import re
import stat
import zipfile
from types import MappingProxyType
from urllib.parse import urlsplit, parse_qsl, urlencode
import verify_successful_intake as intake

H, J, C, T, need = intake._digest, intake._json, intake._canonical, intake._time, intake._need
API, REPO = intake.API, intake.REPO
EXTRA_INPUTS = (
    "successful-intake-receipt.json", "audit-tool-commit.json", "audit-controller-commit.json",
    "audit-run.json", "audit-jobs.json", "audit-artifact.json", "audit-evidence.zip",
)
INPUT_FILES = intake.INPUT_FILES + EXTRA_INPUTS
REQUIRED_AUDIT_MEMBERS = (
    "owner-snapshot.json", "owner-snapshot-evidence.json", "audit-execution-context.json",
    "audit-controller-commit.json", "audit-tool-commit.json",
    "audit-context-run.json", "audit-context-jobs.json",
)
# BEGIN IMMUTABLE BINDINGS
PINS = intake._freeze({
    "ownerGroupId": "4646e3de-7401-4e70-ac32-9a00072e1376",
    "ownerTesterId": "5d2040f0-3af9-4d98-a188-fd6eeb5547db",
    "successfulReceiptSha256": "PENDING", "notesSha256": "PENDING",
    "repositoryId": "PENDING", "repositoryOwnerId": "PENDING",
    "auditToolSha": "PENDING", "auditToolTree": "PENDING",
    "auditControllerSha": "PENDING", "auditControllerTree": "PENDING",
    "auditBranch": "PENDING", "auditWorkflowPath": "PENDING", "auditEvent": "PENDING",
    "auditRun": "PENDING", "auditRunNumber": "PENDING", "auditJob": "PENDING",
    "auditJobKey": "PENDING", "auditJobName": "PENDING", "auditRequiredSteps": "PENDING",
    "auditArtifact": "PENDING", "auditArtifactName": "PENDING", "auditArtifactSize": "PENDING",
    "auditZipSha256": "PENDING", "auditPolicySha256": "PENDING",
    "baselineBuildIds": "PENDING", "baselineBuildIdsSha256": "PENDING", "previousBuildId": "PENDING",
    "inputSha256": "PENDING", "auditMemberSha256": "PENDING", "auditInputSha256": "PENDING",
})
# END IMMUTABLE BINDINGS


def _ids(values):
    need(type(values) in (list, tuple), "Complete ID list required")
    for value in values:
        intake._pattern(value, r"[A-Za-z0-9-]{1,128}", "Resource ID")
    need(len(set(values)) == len(values), "Duplicate resource ID")
    return sorted(values)


def _same_ids(a, b):
    need(_ids(a) == _ids(b), "Relationship/full-set mismatch")


def _guid(value):
    return intake._pattern(value, r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", "Build GUID")


def require_bindings():
    def complete(value):
        if isinstance(value, MappingProxyType):
            for item in value.values(): complete(item)
        elif type(value) is tuple:
            for item in value: complete(item)
        else: need(value != "PENDING", "Separate audit adapter bindings remain PENDING")
    complete(PINS)  # Before touching caller files or the supplied clock.
    intake.require_bindings()
    for k in ("auditToolSha", "auditToolTree", "auditControllerSha", "auditControllerTree"):
        intake._pattern(PINS[k], r"[a-f0-9]{40}", "Audit commit/tree pin")
    for k in ("successfulReceiptSha256", "notesSha256", "auditZipSha256", "auditPolicySha256", "baselineBuildIdsSha256"):
        intake._pattern(PINS[k], r"[a-f0-9]{64}", "Audit digest pin")
    for k in ("repositoryId", "repositoryOwnerId", "auditRun", "auditRunNumber", "auditJob", "auditArtifact", "auditArtifactSize"):
        intake._pattern(PINS[k], r"[1-9][0-9]*", "Audit numeric origin pin")
    need(PINS["auditRunNumber"] == "1", "Reviewed audit execution model requires run-number1")
    for k in ("auditRun", "auditJob", "auditArtifact"):
        suffix = k.removeprefix("audit")
        need(PINS[k] not in (intake.PINS["intake" + suffix], intake.PINS["signing" + suffix]), "Independent audit origin required")
    intake._pattern(PINS["auditBranch"], r"codex/[a-z0-9-]+", "Audit branch")
    intake._pattern(PINS["auditWorkflowPath"], r"\.github/workflows/[a-z0-9-]+\.yml", "Audit workflow")
    intake._pattern(PINS["auditJobKey"], r"[A-Za-z_][A-Za-z0-9_-]*", "Audit job key, not numeric ID")
    need(PINS["auditEvent"] in ("push", "workflow_dispatch"), "Audit event")
    for k in ("auditJobName", "auditArtifactName"):
        need(type(PINS[k]) is str and PINS[k].strip(), "Audit name pin")
    steps = PINS["auditRequiredSteps"]
    need(type(steps) is tuple and steps and len(set(steps)) == len(steps)
         and all(type(s) is str and s.strip() for s in steps), "Audit required steps")
    baseline = _ids(PINS["baselineBuildIds"])
    for value in baseline: _guid(value)
    need(intake.PINS["buildId"] not in baseline, "Target is not an existing baseline")
    need(H(C(baseline)) == PINS["baselineBuildIdsSha256"], "Pinned full baseline digest")
    need(PINS["previousBuildId"] in baseline if baseline else PINS["previousBuildId"] is None,
         "Explicit empty/null or member of nonempty baseline required")
    for key, required in (("inputSha256", set(INPUT_FILES)), ("auditMemberSha256", set(REQUIRED_AUDIT_MEMBERS))):
        mapping = PINS[key]
        need(isinstance(mapping, MappingProxyType) and required <= set(mapping) and len(mapping) <= 64, "Exact evidence bindings")
        if key == "inputSha256": need(set(mapping) == required, "Exact original inputs")
        for name, digest in mapping.items():
            intake._pattern(name, r"[a-z0-9][a-z0-9.-]*\.(?:json|zip)", "Flat evidence name")
            intake._pattern(digest, r"[a-f0-9]{64}", "Original evidence hash")
    audit_inputs = PINS["auditInputSha256"]
    need(isinstance(audit_inputs, MappingProxyType) and {"successful-intake-receipt.json", "source-metadata.json"} <= set(audit_inputs)
         <= set(intake.INPUT_FILES) | {"successful-intake-receipt.json"}, "Reviewed pre-audit inputs only")
    for name, digest in audit_inputs.items():
        need(digest == PINS["inputSha256"][name], "Audit input byte pin")
    need(PINS["inputSha256"]["successful-intake-receipt.json"] == PINS["successfulReceiptSha256"], "Original successful receipt pin")
    need(PINS["inputSha256"]["audit-evidence.zip"] == PINS["auditZipSha256"], "Audit ZIP pin")
    for name in intake.INPUT_FILES:
        need(PINS["inputSha256"][name] == intake.PINS["inputSha256"][name], "Successful verifier original input pin")


def _members(data, hashes):
    need(data[:4] == b"PK\x03\x04", "Ordinary evidence ZIP required")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        infos = archive.infolist()
        need(0 < len(infos) <= 64 and len({i.filename for i in infos}) == len(infos), "Duplicate/empty/large audit ZIP")
        need({i.filename for i in infos} == set(hashes), "Exact reviewed audit ZIP members")
        need(sum(i.file_size for i in infos) <= 64 * 1024 * 1024, "Expanded audit ZIP budget")
        result = {}
        for entry in infos:
            intake._pattern(entry.filename, r"[a-z0-9][a-z0-9.-]*\.json", "Flat JSON audit member")
            mode = entry.external_attr >> 16
            need(not entry.is_dir() and stat.S_IFMT(mode) in (0, stat.S_IFREG), "Regular audit ZIP member")
            need(not entry.flag_bits & 1 and entry.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), "Unsupported/encrypted audit ZIP")
            need(0 < entry.file_size <= 16 * 1024 * 1024, "Audit member budget")
            with archive.open(entry) as stream:
                raw = stream.read(entry.file_size + 1)
                need(len(raw) == entry.file_size and stream.read(1) == b"", "Audit member length")
            need(H(raw) == hashes[entry.filename], "Original audit member byte digest")
            result[entry.filename] = raw
    return result


def _audit_origin(records, files, now, intake_end):
    for label in ("tool", "controller"):
        title = "audit" + ("Tool" if label == "tool" else "Controller")
        intake._commit(records["audit-" + label + "-commit.json"], PINS[title + "Sha"], PINS[title + "Tree"])
    run, env, artifact = (records["audit-" + n + ".json"] for n in ("run", "jobs", "artifact"))
    rid, jid = PINS["auditRun"], PINS["auditJob"]
    need(intake._id(run["id"]) == rid and run.get("url") == API + "/actions/runs/" + rid, "Audit run ID/repository")
    for repo in (run.get("repository", {}), run.get("head_repository", {})):
        need(repo.get("full_name") == REPO and intake._id(repo["id"]) == PINS["repositoryId"]
             and intake._id(repo["owner"]["id"]) == PINS["repositoryOwnerId"], "Audit repository/fork identity")
    for key, expected in (("head_sha", PINS["auditControllerSha"]), ("head_branch", PINS["auditBranch"]),
                          ("path", PINS["auditWorkflowPath"]), ("event", PINS["auditEvent"]),
                          ("status", "completed"), ("conclusion", "success")):
        need(run.get(key) == expected, "Audit run " + key)
    need(type(run.get("run_attempt")) is int and run["run_attempt"] == 1
         and intake._id(run["run_number"]) == PINS["auditRunNumber"], "Original audit attempt/run number")
    start, end = T(run["created_at"]), T(run["updated_at"])
    need(intake_end <= start <= end <= now, "Audit run must follow successful intake")
    jobs = env.get("jobs")
    need(type(jobs) is list and jobs and type(env.get("total_count")) is int and env["total_count"] == len(jobs) <= 100, "Complete audit jobs capture")
    need(len({intake._id(j["id"]) for j in jobs}) == len(jobs), "Duplicate audit jobs")
    for j in jobs:
        need(intake._id(j["run_id"]) == rid and j.get("head_sha") == PINS["auditControllerSha"]
             and type(j.get("run_attempt")) is int and j["run_attempt"] == 1
             and j.get("status") == "completed" and j.get("conclusion") == "success", "Audit job origin/success")
    selected = [j for j in jobs if intake._id(j["id"]) == jid]
    need(len(selected) == 1 and sum(j.get("name") == PINS["auditJobName"] for j in jobs) == 1, "Unique audit numeric job/name")
    job = selected[0]
    need(job.get("name") == PINS["auditJobName"] and job.get("url") == API + "/actions/jobs/" + jid
         and job.get("run_url") == API + "/actions/runs/" + rid, "Audit job name/URLs")
    steps = job.get("steps"); need(type(steps) is list, "Audit steps")
    for name in PINS["auditRequiredSteps"]:
        matches = [s for s in steps if s.get("name") == name]
        need(len(matches) == 1 and matches[0].get("status") == "completed"
             and matches[0].get("conclusion") == "success", "Required independent audit step")
    raw = files["audit-evidence.zip"]
    need(intake._id(artifact["id"]) == PINS["auditArtifact"] and artifact.get("name") == PINS["auditArtifactName"], "Audit artifact identity")
    need(artifact.get("expired") is False and T(artifact["expires_at"]) > now, "Audit artifact expiry")
    need(intake._id(artifact["workflow_run"]["id"]) == rid and artifact["workflow_run"].get("head_sha") == PINS["auditControllerSha"], "Audit artifact run/controller")
    need(intake._id(artifact["size_in_bytes"]) == str(len(raw)) == PINS["auditArtifactSize"]
         and artifact.get("digest") == "sha256:" + PINS["auditZipSha256"] and H(raw) == PINS["auditZipSha256"], "Audit artifact original ZIP bytes")
    need(start <= T(job["started_at"]) <= T(artifact["created_at"]) <= T(job["completed_at"]) <= end, "Audit job/artifact chronology")
    return job, artifact, start, end


def _context(proof, members, files, successful, final_job, start):
    context = proof["audit-execution-context.json"]
    expected = {"schemaVersion": 1, "scope": "AUDIT_EXECUTION_CONTEXT_PREPARATION_ONLY",
                "auditMode": "INDEPENDENT_POST_INTAKE_GET_ONLY", "reviewedPolicySha256": PINS["auditPolicySha256"],
                "sourceSha": successful["sourceSha"], "sourceTree": successful["sourceTree"],
                "auditToolSha": PINS["auditToolSha"], "auditToolTree": PINS["auditToolTree"],
                "controllerSha": PINS["auditControllerSha"], "controllerTree": PINS["auditControllerTree"],
                "auditRun": PINS["auditRun"], "auditJob": PINS["auditJob"], "auditJobKey": PINS["auditJobKey"],
                "auditJobName": PINS["auditJobName"], "runAttempt": 1, "runNumber": 1,
                "workflowPath": PINS["auditWorkflowPath"], "event": PINS["auditEvent"],
                "transportAttestation": "NOT_PROVIDED_BY_PURE_VERIFIER",
                "appleKeysAuthorized": False, "ownerAvailabilityAccepted": False,
                "databaseAccepted": False, "publicReleaseAccepted": False, "distributionAllowed": False}
    need(set(context) == set(expected) | {"checkedAt", "apiSha256", "inputSha256"}, "Exact audit context receipt")
    for k, v in expected.items(): need(type(context[k]) is type(v) and context[k] == v, "Audit context " + k)
    need(context["inputSha256"] == dict(PINS["auditInputSha256"]), "Audit input/receipt bindings")
    for name, digest in context["inputSha256"].items(): need(H(files[name]) == digest, "Original pre-audit input")
    api_files = {"controllerCommit": "audit-controller-commit.json", "toolkitCommit": "audit-tool-commit.json",
                 "run": "audit-context-run.json", "jobs": "audit-context-jobs.json"}
    need(context["apiSha256"] == {k: H(members[v]) for k, v in api_files.items()}, "Original context API byte hashes")
    for name in ("audit-controller-commit.json", "audit-tool-commit.json"):
        need(members[name] == files[name], "Original immutable audit commit bytes")
    run, env = proof["audit-context-run.json"], proof["audit-context-jobs.json"]
    rid, jid = PINS["auditRun"], PINS["auditJob"]
    need(intake._id(run["id"]) == rid and run.get("url") == API + "/actions/runs/" + rid
         and run.get("jobs_url") == API + "/actions/runs/" + rid + "/jobs", "Context run identity")
    for r in (run.get("repository", {}), run.get("head_repository", {})):
        need(r.get("full_name") == REPO and intake._id(r["id"]) == PINS["repositoryId"]
             and intake._id(r["owner"]["id"]) == PINS["repositoryOwnerId"], "Context repository/fork")
    for k, v in {"head_sha": PINS["auditControllerSha"], "head_branch": PINS["auditBranch"],
                 "path": PINS["auditWorkflowPath"], "event": PINS["auditEvent"], "status": "in_progress", "conclusion": None}.items():
        need(run.get(k, "MISSING") == v, "Original running context " + k)
    need(type(run.get("run_attempt")) is int and run["run_attempt"] == 1
         and type(run.get("run_number")) is int and run["run_number"] == 1, "Context original attempt/run number")
    checked = T(context["checkedAt"])
    need(T(run["created_at"]) == start and start <= T(run["updated_at"]) <= checked
         and T(final_job["started_at"]) <= checked, "Context run chronology")
    jobs = env.get("jobs")
    need(type(jobs) is list and jobs and type(env.get("total_count")) is int and env["total_count"] == len(jobs) <= 100, "Complete running-context jobs")
    need(len({intake._id(j["id"]) for j in jobs}) == len(jobs), "Duplicate running-context jobs")
    for job in jobs:
        need(intake._id(job["run_id"]) == rid and job.get("head_sha") == PINS["auditControllerSha"]
             and type(job.get("run_attempt")) is int and job["run_attempt"] == 1, "Running-context job source")
        need(job.get("status") in ("queued", "in_progress", "completed")
             and job.get("conclusion", "MISSING") == ("success" if job["status"] == "completed" else None), "Running-context job state")
    selected = [j for j in jobs if intake._id(j["id"]) == jid]
    need(len(selected) == 1 and sum(j.get("name") == PINS["auditJobName"] for j in jobs) == 1, "Unique running-context job")
    job = selected[0]
    need(job.get("name") == PINS["auditJobName"] and job.get("status") == "in_progress" and job.get("conclusion", "MISSING") is None
         and job.get("url") == API + "/actions/jobs/" + jid and job.get("run_url") == API + "/actions/runs/" + rid
         and T(job["started_at"]) == T(final_job["started_at"]), "Same original running/completed audit job")
    return checked


def _stable_groups(groups):
    need(type(groups) is list, "Original groups required")
    _ids([g["id"] for g in groups])
    result = []
    for group in groups:
        _ids([b["id"] for b in group["builds"]])
        need(all(type(b.get("build")) is str for b in group["builds"]), "Original group build identity")
        result.append({**group, "builds": sorted(group["builds"], key=lambda b: b["id"])})
    return sorted(result, key=lambda g: g["id"])


def _snapshot(snapshot, pre, post, metadata):
    s, p = snapshot, intake.PINS
    need(s.get("schemaVersion") == 1 and type(s.get("schemaVersion")) is int, "Audit snapshot schema")
    need(s.get("coverage") == {k: True for k in ("appGroups", "groupBuilds", "groupTesters", "buildGroups", "individualTesters", "storeVersions", "storeBuildLinks", "notes")}
         and all(type(v) is bool for v in s["coverage"].values()), "Complete snapshot coverage contract")
    need(s.get("app") == {"id": p["appId"], "bundleId": p["bundleId"]}, "Audit app/bundle")
    expected = {"id": p["buildId"], "appId": p["appId"], "version": p["version"], "build": p["build"],
                "platform": "IOS", "processingState": "VALID", "expired": False, "usesNonExemptEncryption": False,
                "internalBuildState": "READY_FOR_BETA_TESTING"}
    b = s.get("build", {})
    need(set(b) == set(expected) | {"externalBuildState"}, "Exact measured audit build")
    for k, v in expected.items(): need(type(b[k]) is type(v) and b[k] == v, "Audit build " + k)
    need(b["externalBuildState"] in ("READY_FOR_BETA_SUBMISSION", "NOT_APPLICABLE"), "No external review/testing")
    need(s.get("buildGroupIds") == [] and s.get("individualTesterIds") == []
         and "storeVersionId" in s and s["storeVersionId"] is None, "No target distribution in audit")
    notes = s.get("notes"); need(type(notes) is list, "Audit notes")
    _ids([n["id"] for n in notes])
    need(all(type(n.get("locale")) is str and type(n.get("whatsNew")) is str for n in notes)
         and len({n["locale"] for n in notes}) == len(notes), "Unique original note locales")
    he = [n for n in notes if n["locale"] == "he"]
    js_space = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
    expected_notes = metadata["version"]["releaseNotes"].strip(js_space)
    need(len(he) == 1 and he[0]["whatsNew"] == expected_notes and H(expected_notes.encode()) == PINS["notesSha256"], "Original Hebrew/source notes")
    need(C(_stable_groups(pre["groups"])) == C(_stable_groups(post["groups"])), "Existing group/build access changed during intake")
    groups = s.get("groups"); need(type(groups) is list and groups, "Existing audit groups")
    _same_ids([g["id"] for g in groups], [g["id"] for g in post["groups"]])
    for g in groups:
        need(g.get("appId") == p["appId"] and type(g.get("name")) is str
             and type(g.get("isInternalGroup")) is bool, "Measured group identity")
        _ids(g["buildIds"]); _ids(g["testerIds"])
        need(p["buildId"] not in g["buildIds"], "Target already assigned to a group")
        manual, public = g.get("hasAccessToAllBuilds", "MISSING"), g.get("publicLinkEnabled", "MISSING")
        if g["isInternalGroup"]:
            need(manual is False and (public is False or public is None), "Manual internal group only")
        else:
            need((manual is False or manual is None) and public is False, "No automatic/public external access")
        original = next(old for old in post["groups"] if old["id"] == g["id"])
        for key in ("name", "isInternalGroup", "hasAccessToAllBuilds", "publicLinkEnabled"):
            need(key in original and type(original[key]) is type(g[key]) and original[key] == g[key], "Group changed after intake")
        _same_ids(g["buildIds"], [b["id"] for b in original["builds"]])
    owner = next((g for g in groups if g["id"] == PINS["ownerGroupId"]), None)
    need(owner is not None and owner["isInternalGroup"] is True, "Existing owner internal group")
    _same_ids(owner["testerIds"], [PINS["ownerTesterId"]])
    _same_ids(owner["buildIds"], PINS["baselineBuildIds"])
    need(H(C(sorted(owner["buildIds"]))) == PINS["baselineBuildIdsSha256"], "Audited entire owner baseline digest")
    testers = s.get("testers"); need(type(testers) is list, "Measured testers")
    _same_ids([t["id"] for t in testers], sorted({i for g in groups for i in g["testerIds"]}))
    for tester in testers: _same_ids(tester["groupIds"], [g["id"] for g in groups if tester["id"] in g["testerIds"]])
    stores = s.get("appStoreVersions"); need(type(stores) is list and stores, "Existing Store versions")
    _same_ids([v["id"] for v in stores], [v["id"] for v in post["appStoreVersions"]])
    for v in stores:
        old = next(x for x in post["appStoreVersions"] if x["id"] == v["id"])
        need(all(type(v.get(k)) is str for k in ("version", "state", "releaseType")), "Measured Store attributes")
        for k in ("id", "version", "state", "releaseType"):
            if k in old: need(v.get(k) == old[k], "Store changed after intake")
        need("buildId" in v and (v["buildId"] is None or type(v["buildId"]) is str), "Measured Store build relationship")
        if v["buildId"] is not None: _ids([v["buildId"]])
        need(v["buildId"] != p["buildId"], "No reverse target Store association")
    return expected_notes


def _path_key(path):
    need(type(path) is str and path.startswith("/v1/") and not re.search(r"[\s\\#]", path), "Scoped original GET path")
    u = urlsplit(path); pairs = parse_qsl(u.query, keep_blank_values=True)
    need(not u.scheme and not u.netloc and not u.fragment and len({k for k, _ in pairs}) == len(pairs)
         and all(k != "cursor" for k, _ in pairs), "Unredacted/ambiguous GET path")
    return u.path + ("?" + urlencode(sorted(pairs)) if pairs else "")


def _collector(e, s):
    need(type(e.get("schemaVersion")) is int and e["schemaVersion"] == 1 and e.get("mode") == "INJECTED_API_GET_ONLY" and e.get("complete") is True
         and e.get("appId") == intake.PINS["appId"] and e.get("buildId") == intake.PINS["buildId"], "Complete GET-only collector")
    need(e.get("transportAttestation") == "NOT_PROVIDED_BY_THIS_COLLECTOR"
         and "no global tester request" in e.get("derivations", {}).get("testerGroupIds", ""), "Original collector scope/attestation")
    need(e.get("startedAt") == s["observedAt"] and T(e["startedAt"]) <= T(e["completedAt"]), "Original collector timestamps")
    requests = e.get("requests")
    need(type(requests) is list and 0 < len(requests) <= 2000, "Bounded original GET records")
    by_hash = {}
    for r in requests:
        need(r.get("method") == "GET" and r.get("completed") is True, "No collector mutation")
        intake._pattern(r.get("requestSha256"), r"[a-f0-9]{64}", "Request hash")
        need(r["requestSha256"] not in by_hash, "Duplicate recorded GET")
        if r.get("cursorSha256", "MISSING") is not None:
            intake._pattern(r["cursorSha256"], r"[a-f0-9]{64}", "Redacted cursor hash")
        _path_key(r["path"]); by_hash[r["requestSha256"]] = r
    bid, app = intake.PINS["buildId"], intake.PINS["appId"]
    expected = {}
    def q(path, values): return path + "?" + urlencode(values)
    def add(path, kind, ids): expected[_path_key(path)] = (kind, _ids(ids))
    add(q("/v1/builds/" + bid + "/betaBuildLocalizations", {"fields[betaBuildLocalizations]": "locale,whatsNew", "limit": "200"}), "betaBuildLocalizations", [n["id"] for n in s["notes"]])
    gf = {"fields[betaGroups]": "name,isInternalGroup,hasAccessToAllBuilds,publicLinkEnabled", "limit": "200"}
    add(q("/v1/apps/" + app + "/betaGroups", gf), "betaGroups", [g["id"] for g in s["groups"]])
    for g in s["groups"]:
        add(q("/v1/betaGroups/" + g["id"] + "/relationships/builds", {"limit": "200"}), "builds", g["buildIds"])
        add(q("/v1/betaGroups/" + g["id"] + "/relationships/betaTesters", {"limit": "200"}), "betaTesters", g["testerIds"])
    add(q("/v1/betaGroups", {"filter[app]": app, "filter[builds]": bid, **gf}), "betaGroups", [])
    add(q("/v1/builds/" + bid + "/relationships/individualTesters", {"limit": "200"}), "betaTesters", [])
    add(q("/v1/apps/" + app + "/appStoreVersions", {"filter[platform]": "IOS", "fields[appStoreVersions]": "platform,versionString,appStoreState,releaseType", "limit": "200"}), "appStoreVersions", [v["id"] for v in s["appStoreVersions"]])
    collections = e.get("collections")
    need(type(collections) is list and len(collections) == len(expected), "Complete scoped collection set")
    seen, all_pages, all_rows = set(), set(), 0
    for c in collections:
        key = _path_key(c["initialPath"])
        need(key in expected and key not in seen, "Unplanned/duplicate collection")
        seen.add(key); kind, ids = expected[key]
        need(c.get("type") == kind and c.get("complete") is True and type(c.get("total")) is int
             and c["total"] == len(ids) <= 4000 and c.get("idsSha256") == H(C(ids)), "Collection type/count/full IDs")
        pages = c.get("pages"); need(type(pages) is list and 0 < len(pages) <= 20, "Complete terminal pagination")
        count = 0
        for i, page in enumerate(pages):
            need(type(page.get("count")) is int and 0 <= page["count"] <= 200, "Page count")
            count += page["count"]
            intake._pattern(page.get("idsSha256"), r"[a-f0-9]{64}", "Original page IDs digest")
            req = page["request"]; observed = by_hash.get(req.get("requestSha256"))
            need(observed is not None and req == {k: observed[k] for k in ("path", "requestSha256", "cursorSha256")}
                 and _path_key(req["path"]) == key and req["requestSha256"] not in all_pages, "Page linked to unique original GET")
            all_pages.add(req["requestSha256"])
            if i + 1 == len(pages): need("nextRequest" in page and page["nextRequest"] is None, "Terminal page")
            else: need(page["count"] > 0 and page.get("nextRequest") == pages[i + 1]["request"], "Pagination chain")
        need(count == c["total"], "Page total mismatch"); all_rows += count
    need(all_rows <= 20000, "Collector global row budget")
    reads = [q("/v1/apps/" + app, {"fields[apps]": "bundleId"}),
             q("/v1/builds/" + bid, {"fields[builds]": "version,processingState,expired,usesNonExemptEncryption"}),
             q("/v1/builds/" + bid + "/preReleaseVersion", {"fields[preReleaseVersions]": "version,platform"}),
             q("/v1/builds/" + bid + "/buildBetaDetail", {"fields[buildBetaDetails]": "internalBuildState,externalBuildState"}),
             "/v1/builds/" + bid + "/relationships/appStoreVersion"]
    for g in s["groups"]:
        reads += ["/v1/betaGroups/" + g["id"] + "/relationships/app", q("/v1/betaGroups/" + g["id"], {"fields[betaGroups]": gf["fields[betaGroups]"]})]
    builds = {bid} | {b for g in s["groups"] for b in g["buildIds"]} | {v["buildId"] for v in s["appStoreVersions"] if v["buildId"] is not None}
    reads += [q("/v1/builds/" + b + "/app", {"fields[apps]": "bundleId"}) for b in builds]
    reads += [q("/v1/appStoreVersions/" + v["id"] + "/build", {"fields[builds]": "version"}) for v in s["appStoreVersions"]]
    observed = {_path_key(r["path"]) for r in requests}; required = {_path_key(r) for r in reads}
    need(required <= observed <= required | set(expected), "Missing or unplanned/account-wide audit GET")


def adapt_separate_audit_to_owner_receipt(files, *, now_utc):
    require_bindings()
    now = T(now_utc)
    need(type(files) is dict and set(files) == set(INPUT_FILES), "Exact separate-audit original inputs required")
    records, hashes = {}, {}
    for name in INPUT_FILES:
        raw = files[name]
        need(type(raw) is bytes and 0 < len(raw) <= (256 * 1024 * 1024 if name.endswith(".zip") else 16 * 1024 * 1024), "Original bounded input bytes")
        hashes[name] = H(raw)
        need(hashes[name] == PINS["inputSha256"][name], "Original separate-audit input byte digest: " + name)
        if name.endswith(".json"): records[name] = J(raw)
    verified = intake.verify_successful_intake({n: files[n] for n in intake.INPUT_FILES}, now_utc=now_utc)
    raw_success = files["successful-intake-receipt.json"]
    need(verified["receiptBytes"] == raw_success and verified["receiptSha256"] == PINS["successfulReceiptSha256"], "Original successful-intake receipt bytes")
    successful = records["successful-intake-receipt.json"]
    for prefix in ("signing", "intake"):
        for repo in (records[prefix + "-run.json"].get("repository", {}), records[prefix + "-run.json"].get("head_repository", {})):
            need(repo.get("full_name") == REPO and intake._id(repo["id"]) == PINS["repositoryId"]
                 and intake._id(repo["owner"]["id"]) == PINS["repositoryOwnerId"], "Same signing/intake/audit repository identity")
    intake_end = T(records["intake-run.json"]["updated_at"])
    job, artifact, start, end = _audit_origin(records, files, now, intake_end)
    members = _members(files["audit-evidence.zip"], PINS["auditMemberSha256"])
    proof = {name: J(raw) for name, raw in members.items()}
    context_at = _context(proof, members, files, successful, job, start)
    original = intake._members(files["intake-evidence.zip"])
    pre, post = (J(original[n]) for n in ("intake-preflight.json", "intake-postflight.json"))
    snapshot, evidence = proof["owner-snapshot.json"], proof["owner-snapshot-evidence.json"]
    notes = _snapshot(snapshot, pre, post, records["source-metadata.json"])
    _collector(evidence, snapshot)
    need(start <= T(job["started_at"]) <= context_at <= T(snapshot["observedAt"]) == T(evidence["startedAt"])
         <= T(evidence["completedAt"]) <= T(artifact["created_at"]) <= T(job["completed_at"]) <= end <= now,
         "Independent audit original capture chronology")
    r = {"schemaVersion": 1, "scope": "PACKAGE_INTAKE_ONLY", "appId": successful["appId"],
         "bundleId": successful["bundleId"], "version": successful["version"], "build": successful["build"],
         "buildId": successful["buildId"], "sourceSha": successful["sourceSha"], "sourceTree": successful["sourceTree"],
         "signingToolSha": successful["signingToolSha"], "signedRunId": successful["signingRun"],
         "signedJobId": successful["signingJob"], "signedArtifactId": successful["signingArtifact"],
         "signedArtifactSize": successful["signingArtifactSize"], "signedZipSha256": successful["signingZipSha256"],
         "ipaSha256": successful["ipaSha256"], "intakeToolSha": successful["intakeToolSha"],
         "intakeRunId": successful["intakeRun"], "intakeJobId": successful["intakeJob"],
         "intakeArtifactId": successful["intakeArtifact"], "intakeZipSha256": successful["intakeZipSha256"],
         "notesSha256": H(notes.encode()), "hebrewReleaseNotesVerified": True,
         "baselineBuildIds": list(sorted(PINS["baselineBuildIds"])), "baselineBuildIdsSha256": PINS["baselineBuildIdsSha256"],
         "previousBuildId": PINS["previousBuildId"], "snapshot": snapshot,
         "successfulIntakeReceiptSha256": H(raw_success), "auditOrigin": {
             k: PINS[k] for k in ("auditToolSha", "auditToolTree", "auditControllerSha", "auditControllerTree",
                                  "auditRun", "auditJob", "auditArtifact", "auditZipSha256", "auditPolicySha256")},
         "auditInputSha256": dict(PINS["auditInputSha256"]),
         "originalAuditMemberSha256": {n: H(raw) for n, raw in members.items()},
         "ownerAvailabilityAccepted": False, "databaseAccepted": False, "publicReleaseAccepted": False, "distributionAllowed": False}
    raw = C(r) + b"\n"
    return {"receiptBytes": raw, "receiptSha256": H(raw), "baselineBuildIds": r["baselineBuildIds"],
            "baselineBuildIdsSha256": r["baselineBuildIdsSha256"], "previousBuildId": r["previousBuildId"],
            "originalInputSha256": hashes, "scope": "DERIVED_SEPARATE_AUDIT_OWNER_RECEIPT_PREPARATION_ONLY",
            "ownerAvailabilityAccepted": False, "databaseAccepted": False, "publicReleaseAccepted": False, "distributionAllowed": False}
