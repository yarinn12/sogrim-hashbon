"""Inactive, offline intake-evidence verifier. No CLI, filesystem, transport or keys.

Real bindings must be reviewed and compiled into a new immutable source after intake.
This module does not integrate or unblock runOwnerReadOnlyAudit.
"""
import datetime as dt
import hashlib
import io
import json
import re
import stat
import zipfile
from types import MappingProxyType


def _freeze(value):
    if isinstance(value, dict):
        return MappingProxyType({k: _freeze(v) for k, v in value.items()})
    if isinstance(value, list):
        return tuple(_freeze(v) for v in value)
    return value


INPUT_FILES = (
    "source-commit.json", "source-metadata.json",
    "signing-tool-commit.json", "signing-run.json", "signing-jobs.json",
    "signing-artifact.json", "signing-artifact.zip",
    "intake-tool-commit.json", "intake-run.json", "intake-jobs.json",
    "intake-artifact.json", "intake-evidence.zip",
)
REQUIRED_MEMBERS = (
    "live-ci-before-download.json", "upload-origin.json", "source-before-upload.json",
    "original-artifact-before-upload.json", "intake-preflight.json",
    "intake-postflight.json", "testflight-completion.json",
)
REPO = "yarinn12/sogrim-hashbon"
API = "https://api.github.com/repos/" + REPO
METADATA = "docs/store-submission/app-store-metadata-he.json"
# BEGIN IMMUTABLE BINDINGS
PINS = _freeze({
    "appId": "6809952514", "bundleId": "com.sogrimhashbon.app",
    "platform": "IOS", "version": "4.58", "build": "194",
    "sourceSha": "PENDING", "sourceTree": "PENDING", "sourceBranch": "PENDING",
    "sourceInputsSha256": "PENDING", "buildId": "PENDING", "ipaSha256": "PENDING",
    "qaRun": "PENDING", "windowsRun": "PENDING", "fontRun": "PENDING", "authRun": "PENDING",
    "signingToolSha": "PENDING", "signingToolTree": "PENDING",
    "signingBranch": "PENDING", "signingWorkflowPath": "PENDING", "signingEvent": "PENDING",
    "signingRun": "PENDING", "signingRunNumber": "PENDING", "signingJob": "PENDING",
    "signingJobName": "PENDING", "signingRequiredSteps": "PENDING",
    "signingArtifact": "PENDING", "signingArtifactSize": "PENDING", "signingZipSha256": "PENDING",
    "intakeToolSha": "PENDING", "intakeToolTree": "PENDING",
    "intakeBranch": "PENDING", "intakeWorkflowPath": "PENDING", "intakeEvent": "PENDING",
    "intakeRun": "PENDING", "intakeRunNumber": "PENDING", "intakeJob": "PENDING",
    "intakeJobName": "PENDING", "intakeRequiredSteps": "PENDING",
    "intakeArtifact": "PENDING", "intakeArtifactSize": "PENDING", "intakeZipSha256": "PENDING",
    "inputSha256": "PENDING", "memberSha256": "PENDING",
})
# END IMMUTABLE BINDINGS


def _need(condition, message):
    if not condition:
        raise ValueError(message)


def _digest(data):
    return hashlib.sha256(data).hexdigest()


def _canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")


def _pattern(value, pattern, label):
    _need(isinstance(value, str) and re.fullmatch(pattern, value) is not None, label)
    return value


def _id(value):
    _need(type(value) is int and 0 < value <= 9007199254740991, "Invalid GitHub numeric ID")
    return str(value)


def _time(value):
    _need(isinstance(value, str) and re.fullmatch(
        r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)", value),
        "Expected explicit UTC timestamp")
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def require_bindings():
    # Runs before ANY access to caller-supplied files or clock.
    def complete(value):
        if isinstance(value, (dict, MappingProxyType)):
            for v in value.values():
                complete(v)
        elif isinstance(value, tuple):
            for v in value:
                complete(v)
        else:
            _need(value != "PENDING", "Intake evidence bindings remain PENDING")
    complete(PINS)
    for k in ("sourceSha", "sourceTree", "signingToolSha", "signingToolTree",
              "intakeToolSha", "intakeToolTree"):
        _pattern(PINS[k], r"[0-9a-f]{40}", "Commit/tree binding: " + k)
    for k in ("sourceInputsSha256", "ipaSha256", "signingZipSha256", "intakeZipSha256"):
        _pattern(PINS[k], r"[0-9a-f]{64}", "Digest binding: " + k)
    _pattern(PINS["buildId"], r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", "Build ID")
    for k in ("qaRun", "windowsRun", "fontRun", "authRun"):
        _pattern(PINS[k], r"[1-9][0-9]*", "CI run binding")
    _need(len({PINS[k] for k in ("qaRun", "windowsRun", "fontRun", "authRun")}) == 4,
          "Distinct CI run bindings required")
    _pattern(PINS["sourceBranch"], r"codex/[a-z0-9-]+", "Source branch binding")
    for prefix in ("signing", "intake"):
        for suffix in ("Run", "RunNumber", "Job", "Artifact", "ArtifactSize"):
            _pattern(PINS[prefix + suffix], r"[1-9][0-9]*", "Numeric origin binding")
        _pattern(PINS[prefix + "Branch"], r"codex/[a-z0-9-]+", "Tool branch binding")
        _pattern(PINS[prefix + "WorkflowPath"], r"\.github/workflows/[a-z0-9-]+\.yml",
                 "Workflow path binding")
        _need(PINS[prefix + "Event"] in ("push", "workflow_dispatch"), "Tool event binding")
        _need(isinstance(PINS[prefix + "JobName"], str) and PINS[prefix + "JobName"].strip(),
              "Job name binding")
        steps = PINS[prefix + "RequiredSteps"]
        _need(isinstance(steps, tuple) and steps and len(set(steps)) == len(steps)
              and all(isinstance(s, str) and s.strip() for s in steps), "Required step bindings")
    _need(PINS["signingRun"] != PINS["intakeRun"], "Separate signing and intake runs")
    for name, required in (("inputSha256", set(INPUT_FILES)), ("memberSha256", set(REQUIRED_MEMBERS))):
        hashes = PINS[name]
        _need(isinstance(hashes, MappingProxyType) and required <= set(hashes), "File bindings")
        if name == "inputSha256":
            _need(set(hashes) == required, "Exact original inputs required")
        _need(len(hashes) <= 64, "Too many file bindings")
        for path, digest in hashes.items():
            _pattern(path, r"[a-z0-9][a-z0-9.-]*\.(?:json|zip)", "Flat evidence path required")
            _pattern(digest, r"[0-9a-f]{64}", "Original byte digest required")
    _need(PINS["inputSha256"]["intake-evidence.zip"] == PINS["intakeZipSha256"], "ZIP pin mismatch")
    _need(PINS["inputSha256"]["signing-artifact.zip"] == PINS["signingZipSha256"], "ZIP pin mismatch")


def _json(data):
    def pairs(items):
        result = {}
        for k, v in items:
            _need(k not in result, "Duplicate JSON key")
            result[k] = v
        return result
    def invalid(_):
        raise ValueError("Non-finite JSON")
    result = json.loads(data.decode("utf-8"), object_pairs_hook=pairs, parse_constant=invalid)
    # Also rejects numeric overflow such as 1e999.
    _canonical(result)
    _need(isinstance(result, dict), "Expected JSON object")
    return result


def _members(data):
    _need(data[:4] == b"PK\x03\x04", "Expected an ordinary ZIP without preamble")
    with zipfile.ZipFile(io.BytesIO(data), "r") as archive:
        infos = archive.infolist()
        names = [i.filename for i in infos]
        _need(0 < len(infos) <= 64 and len(set(names)) == len(names), "Duplicate/empty/large ZIP")
        _need(set(names) == set(PINS["memberSha256"]), "ZIP member set differs from reviewed archive")
        _need(sum(i.file_size for i in infos) <= 64 * 1024 * 1024, "Expanded ZIP budget")
        members = {}
        for entry in infos:
            _pattern(entry.filename, r"[a-z0-9][a-z0-9.-]*\.json", "Unsafe/non-JSON ZIP member")
            mode = entry.external_attr >> 16
            _need(not entry.is_dir() and not stat.S_ISLNK(mode), "ZIP entry must be a regular file")
            _need(stat.S_IFMT(mode) in (0, stat.S_IFREG), "Special ZIP member")
            _need(not entry.flag_bits & 1 and entry.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED),
                  "Encrypted/unsupported evidence ZIP")
            _need(0 < entry.file_size <= 16 * 1024 * 1024, "ZIP member budget")
            # ZipFile.open validates local headers and overlap; full bounded read validates CRC.
            with archive.open(entry, "r") as stream:
                raw = stream.read(entry.file_size + 1)
                _need(len(raw) == entry.file_size and stream.read(1) == b"", "ZIP length mismatch")
            _need(_digest(raw) == PINS["memberSha256"][entry.filename], "ZIP member byte digest mismatch")
            members[entry.filename] = raw
    return members


def _commit(record, sha, tree):
    _need(record.get("sha") == sha and record.get("tree", {}).get("sha") == tree, "Git commit/tree")
    _need(record.get("url") == API + "/git/commits/" + sha, "Commit repository/URL")
    _need(record["tree"].get("url") == API + "/git/trees/" + tree, "Tree repository/URL")


def _github(records, files, prefix, now):
    run, envelope, artifact = (records[prefix + "-" + n + ".json"] for n in ("run", "jobs", "artifact"))
    run_id, job_id = PINS[prefix + "Run"], PINS[prefix + "Job"]
    tool = PINS[prefix + "ToolSha"]
    _need(_id(run["id"]) == run_id and run.get("url") == API + "/actions/runs/" + run_id, "Run ID/repo URL")
    _need(run.get("repository", {}).get("full_name") == REPO
          and run.get("head_repository", {}).get("full_name") == REPO, "Run repository/fork")
    for field, expected in (("head_sha", tool), ("head_branch", PINS[prefix + "Branch"]),
                            ("path", PINS[prefix + "WorkflowPath"]), ("event", PINS[prefix + "Event"]),
                            ("status", "completed"), ("conclusion", "success")):
        _need(run.get(field) == expected, "Run " + field)
    _need(type(run.get("run_attempt")) is int and run["run_attempt"] == 1, "Original attempt required")
    _need(_id(run["run_number"]) == PINS[prefix + "RunNumber"], "Run number")
    start, end = _time(run["created_at"]), _time(run["updated_at"])
    _need(start <= end <= now, "Run time/order")
    jobs = envelope.get("jobs")
    _need(isinstance(jobs, list) and jobs and type(envelope.get("total_count")) is int
          and envelope["total_count"] == len(jobs) <= 100, "Complete jobs capture required")
    _need(len({_id(j["id"]) for j in jobs}) == len(jobs), "Duplicate jobs")
    for job in jobs:
        _need(_id(job["run_id"]) == run_id and job.get("head_sha") == tool, "Job run/tool")
        _need(job.get("status") == "completed" and job.get("conclusion") == "success", "Unsuccessful job")
    selected = [j for j in jobs if _id(j["id"]) == job_id]
    _need(len(selected) == 1, "Exact job missing")
    job = selected[0]
    _need(job.get("url") == API + "/actions/jobs/" + job_id
          and job.get("run_url") == API + "/actions/runs/" + run_id, "Job URL/repository")
    _need(job.get("name") == PINS[prefix + "JobName"], "Job name")
    steps = job.get("steps")
    _need(isinstance(steps, list), "Original steps required")
    for name in PINS[prefix + "RequiredSteps"]:
        selected_steps = [s for s in steps if s.get("name") == name]
        _need(len(selected_steps) == 1 and selected_steps[0].get("status") == "completed"
              and selected_steps[0].get("conclusion") == "success", "Missing/unsuccessful required step")
    _need(_id(artifact["id"]) == PINS[prefix + "Artifact"], "Artifact ID")
    expected_name = ("sogrim-ios-4.58-194-encrypted" if prefix == "signing"
                     else "ios194-intake-evidence-" + run_id)
    _need(artifact.get("name") == expected_name, "Artifact name")
    _need(artifact.get("expired") is False and _time(artifact["expires_at"]) > now, "Expired artifact")
    _need(start <= _time(artifact["created_at"]) <= end, "Artifact creation/run time")
    _need(_id(artifact["workflow_run"]["id"]) == run_id
          and artifact["workflow_run"].get("head_sha") == tool, "Artifact run/tool")
    raw = files["signing-artifact.zip" if prefix == "signing" else "intake-evidence.zip"]
    _need(_id(artifact["size_in_bytes"]) == PINS[prefix + "ArtifactSize"] == str(len(raw)), "Artifact byte size")
    _need(artifact.get("digest") == "sha256:" + PINS[prefix + "ZipSha256"]
          and _digest(raw) == PINS[prefix + "ZipSha256"], "Artifact ZIP digest")
    return end


def _source(record, phase, metadata):
    for key, expected in (("sourceCommit", PINS["sourceSha"]), ("sourceTree", PINS["sourceTree"]),
                          ("phase", phase), ("version", PINS["version"]), ("build", PINS["build"]),
                          ("workflowCommit", PINS["intakeToolSha"]), ("buildRunId", PINS["intakeRun"]),
                          ("buildRunAttempt", "1"), ("appleUploadPerformed", False)):
        _need(type(record.get(key)) is type(expected) and record[key] == expected, "Source receipt " + key)
    inputs = record.get("sourceInputs")
    _need(isinstance(inputs, dict) and len(inputs) > 500, "Full source fingerprint required")
    for path, digest in inputs.items():
        _need(isinstance(path, str) and path and not path.startswith("/") and "\\" not in path
              and all(p not in ("", ".", "..") for p in path.split("/")), "Unsafe source fingerprint path")
        _pattern(digest, r"[0-9a-f]{64}", "Source fingerprint digest")
    _need(_digest(_canonical(inputs)) == PINS["sourceInputsSha256"], "Source input map binding")
    _need(inputs.get(METADATA) == _digest(metadata), "Metadata source fingerprint")
    for key, path in (("packageSha256", "package.json"), ("packageLockSha256", "package-lock.json")):
        _need(record.get(key) == inputs.get(path) and path in inputs, "Package source fingerprint")
    rows = record.get("ci")
    expected = {PINS["qaRun"], PINS["windowsRun"], PINS["fontRun"], PINS["authRun"]}
    _need(isinstance(rows, list) and len(rows) == 4 and {r.get("id") for r in rows} == expected, "Source CI references")
    for row in rows:
        _need(row.get("source") == PINS["sourceSha"] and row.get("attempt") == 1
              and row.get("conclusion") == "success", "Source CI receipt")
    return _time(record["checkedAt"])


def verify_successful_intake(files, *, now_utc):
    require_bindings()
    now = _time(now_utc)  # Trusted audit clock must be supplied by the future integration.
    _need(type(files) is dict and set(files) == set(INPUT_FILES), "Exact original inputs required")
    fingerprints, records = {}, {}
    for name in INPUT_FILES:
        raw = files[name]
        _need(type(raw) is bytes and 0 < len(raw) <= (256 * 1024 * 1024 if name.endswith(".zip") else 16 * 1024 * 1024),
              "Original bounded bytes required")
        fingerprints[name] = _digest(raw)
        _need(fingerprints[name] == PINS["inputSha256"][name], "Original input byte digest mismatch: " + name)
        if name.endswith(".json"):
            records[name] = _json(raw)
    for name, sha, tree in (("source-commit.json", PINS["sourceSha"], PINS["sourceTree"]),
                             ("signing-tool-commit.json", PINS["signingToolSha"], PINS["signingToolTree"]),
                             ("intake-tool-commit.json", PINS["intakeToolSha"], PINS["intakeToolTree"])):
        _commit(records[name], sha, tree)
    signed_end = _github(records, files, "signing", now)
    intake_end = _github(records, files, "intake", now)
    _need(signed_end <= _time(records["intake-run.json"]["created_at"]), "Intake precedes signing")
    members = _members(files["intake-evidence.zip"])
    proof = {name: _json(raw) for name, raw in members.items()}
    metadata = records["source-metadata.json"]
    _need(metadata.get("app", {}).get("bundleId") == PINS["bundleId"], "Metadata bundle")
    _need(metadata.get("version", {}).get("number") == PINS["version"]
          and metadata["version"].get("build") == PINS["build"], "Metadata version/build")
    notes = metadata["version"].get("releaseNotes")
    _need(isinstance(notes, str) and 0 < len(notes.strip()) <= 4000, "Source release notes")
    before = _source(proof["live-ci-before-download.json"], "ci-only", files["source-metadata.json"])
    source_at = _source(proof["source-before-upload.json"], "before-upload", files["source-metadata.json"])
    origin, original = proof["upload-origin.json"], proof["original-artifact-before-upload.json"]
    for r in (origin, original):
        for key, expected in (("sourceCommit", PINS["sourceSha"]), ("sourceTree", PINS["sourceTree"]),
                              ("ipaSha256", PINS["ipaSha256"]), ("appleUploadPerformed", False)):
            _need(type(r.get(key)) is type(expected) and r[key] == expected, "Original package " + key)
    for key, expected in (("scope", "PACKAGE_INTAKE_ONLY"), ("signingTools", PINS["signingToolSha"]),
                          ("signingRunId", PINS["signingRun"]), ("signingRunAttempt", "1"),
                          ("artifactId", PINS["signingArtifact"]), ("artifactDigest", "sha256:" + PINS["signingZipSha256"])):
        _need(origin.get(key) == expected, "Signing origin " + key)
    for r in (origin, proof["intake-postflight.json"]):
        for key in ("databaseAccepted", "publicReleaseAccepted", "distributionAllowed"):
            _need(r.get(key) is False, "Public/database acceptance must remain false")
    _need(original.get("originalSigningRunId") == PINS["signingRun"] and original.get("rebuilt") is False, "No rebuild/original run")
    for key in ("signatureReverified", "everyOriginalWebAssetMatches",
                "everyOriginalWebAssetMatchesCanonicalGitBuild", "originalSourceInputsMatchCurrentGit"):
        _need(original.get(key) is True, "Original macOS verification receipt")
    profile = original.get("profile", {})
    _need(profile.get("profileValidAtVerification") is True and profile.get("knownCertificateIncluded") is True
          and profile.get("debugEntitlement") is False and profile.get("appleSignIn") == ["Default"]
          and _time(profile["profileExpiresAt"]) > now, "Original profile receipt")
    pre, post, completion = (proof[n] for n in ("intake-preflight.json", "intake-postflight.json", "testflight-completion.json"))
    _need(pre.get("appId") == post.get("appId") == PINS["appId"] and pre.get("mode") == post.get("mode") == "GET_ONLY",
          "App/read-only snapshot binding")
    _need(pre.get("build", "MISSING") is None and post.get("scope") == "PACKAGE_INTAKE_ONLY", "Intake pre/post scope")
    _need(post.get("build") == {"id": PINS["buildId"], "build": PINS["build"], "version": PINS["version"],
                                "processingState": "VALID"}, "Exact postflight Build ID/VALID")
    for key, expected in (("appId", PINS["appId"]), ("buildId", PINS["buildId"]), ("version", PINS["version"]),
                          ("build", PINS["build"]), ("processingState", "VALID"), ("hebrewReleaseNotesVerified", True)):
        _need(type(completion.get(key)) is type(expected) and completion[key] == expected, "Completion binding")
    _need("appStoreVersions" in pre and isinstance(pre["appStoreVersions"], list)
          and pre["appStoreVersions"] == post.get("appStoreVersions"), "Store baseline changed")
    _need(post.get("assignedGroups") == [] and post.get("assignedIndividualTesters") == 0
          and type(post["assignedIndividualTesters"]) is int and "appStoreVersion" in post
          and post["appStoreVersion"] is None, "Intake must not assert distribution")
    for snapshot in (pre, post):
        _need(isinstance(snapshot.get("groups"), list), "Group capture missing")
        for group in snapshot["groups"]:
            _need(isinstance(group.get("builds"), list), "Group build list missing")
            _need(all(b.get("id") != PINS["buildId"] and b.get("build") != PINS["build"] for b in group["builds"]),
                  "Build was distributed during intake")
    _need(_time(records["intake-run.json"]["created_at"]) <= before <= source_at <= _time(completion["checkedAt"])
          <= _time(post["checkedAt"]) <= intake_end <= now, "Original intake chronology")
    receipt = {
        "schemaVersion": 1, "scope": "OFFLINE_SUCCESSFUL_INTAKE_EVIDENCE_PREPARATION_ONLY",
        "repository": REPO, "sourceInputsSha256": PINS["sourceInputsSha256"],
        "appId": PINS["appId"], "bundleId": PINS["bundleId"], "platform": PINS["platform"],
        "version": PINS["version"], "build": PINS["build"], "buildId": PINS["buildId"],
        "sourceSha": PINS["sourceSha"], "sourceTree": PINS["sourceTree"], "sourceBranch": PINS["sourceBranch"],
        "ipaSha256": PINS["ipaSha256"], "signingToolSha": PINS["signingToolSha"], "signingToolTree": PINS["signingToolTree"],
        "signingRun": PINS["signingRun"], "signingJob": PINS["signingJob"], "signingArtifact": PINS["signingArtifact"],
        "signingZipSha256": PINS["signingZipSha256"], "signingArtifactSize": PINS["signingArtifactSize"],
        "signingRunAttempt": 1, "signingWorkflowPath": PINS["signingWorkflowPath"],
        "intakeToolSha": PINS["intakeToolSha"], "intakeToolTree": PINS["intakeToolTree"],
        "intakeRun": PINS["intakeRun"], "intakeJob": PINS["intakeJob"], "intakeArtifact": PINS["intakeArtifact"],
        "intakeZipSha256": PINS["intakeZipSha256"], "intakeArtifactSize": PINS["intakeArtifactSize"],
        "intakeRunAttempt": 1, "intakeWorkflowPath": PINS["intakeWorkflowPath"],
        "originalInputSha256": fingerprints,
        "originalMemberSha256": {name: _digest(raw) for name, raw in members.items()},
        "postflightSha256": _digest(members["intake-postflight.json"]),
        "postflightCheckedAt": post["checkedAt"], "ownerAvailabilityAccepted": False,
        "databaseAccepted": False, "publicReleaseAccepted": False, "distributionAllowed": False,
    }
    raw = _canonical(receipt) + b"\n"
    return {"receiptBytes": raw, "receiptSha256": _digest(raw)}
