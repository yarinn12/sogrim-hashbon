"""Synthetic offline controls; no real run, artifact, Build ID, key or transport.

The memory loader only replaces the immutable binding block in an isolated module.
The shipping source retains PENDING and exposes no runtime binding override.
"""
import copy
import io
import json
import types
import unittest
import zipfile

# SOURCE_TEXT is injected by the stdin runner; saved-file execution reads only this module.
if "SOURCE_TEXT" not in globals():
    import pathlib
    SOURCE_TEXT = pathlib.Path(__file__).with_name("verify_successful_intake.py").read_text(encoding="utf-8")


def jbytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8") + b"\n"


def zip_bytes(members, compression=zipfile.ZIP_DEFLATED):
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w") as archive:
        for name, raw in members.items():
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = compression
            info.create_system = 3
            info.external_attr = (0o100600 << 16)
            archive.writestr(info, raw)
    return result.getvalue()


def load_verifier(pins=None, old=False):
    source = SOURCE_TEXT
    if pins is not None:
        first = source.index("# BEGIN IMMUTABLE BINDINGS")
        last = source.index("# END IMMUTABLE BINDINGS") + len("# END IMMUTABLE BINDINGS")
        source = source[:first] + "PINS = _freeze(" + repr(pins) + ")\n" + source[last:]
    if old:
        needle = '            _need(_digest(raw) == PINS["memberSha256"][entry.filename], "ZIP member byte digest mismatch")'
        if source.count(needle) != 1:
            raise RuntimeError("OLD control mutation no longer applies exactly once")
        source = source.replace(needle, "            pass  # OLD control: ZIP digest without member-byte binding")
    module = types.ModuleType("synthetic_intake_verifier")
    exec(compile(source, "<isolated-intake-verifier>", "exec"), module.__dict__)
    return module


BASE = load_verifier()
H = BASE._digest
NOW = "2026-10-15T10:30:00Z"
CI_KEYS = ("qaRun", "windowsRun", "fontRun", "authRun")


def fixture(compression=zipfile.ZIP_DEFLATED):
    pins = {k: v for k, v in BASE.PINS.items()}
    for key, value in {
        "sourceSha": "a"*40, "sourceTree": "d"*40, "sourceBranch": "codex/synthetic-source",
        "signingToolSha": "b"*40, "signingToolTree": "e"*40,
        "intakeToolSha": "c"*40, "intakeToolTree": "f"*40,
        "buildId": "00000000-0000-4000-8000-000000000194",
        "ipaSha256": H(b"synthetic IPA digest only; this is not an IPA"),
        "signingBranch": "codex/synthetic-signing", "intakeBranch": "codex/synthetic-intake",
        "signingWorkflowPath": ".github/workflows/synthetic-signing.yml",
        "intakeWorkflowPath": ".github/workflows/synthetic-intake.yml",
        "signingEvent": "push", "intakeEvent": "workflow_dispatch",
        "signingRun": "101", "signingRunNumber": "1", "signingJob": "201", "signingArtifact": "301",
        "intakeRun": "102", "intakeRunNumber": "1", "intakeJob": "202", "intakeArtifact": "302",
        "signingJobName": "synthetic-sign", "intakeJobName": "synthetic-intake",
        "signingRequiredSteps": ["synthetic signature verification"],
        "intakeRequiredSteps": ["synthetic upload", "synthetic postflight"],
        **dict(zip(CI_KEYS, ("401", "402", "403", "404"))),
    }.items():
        pins[key] = value
    metadata = {"app": {"bundleId": pins["bundleId"]}, "version": {
        "number": "4.58", "build": "194", "releaseNotes": "בדיקה סינתטית בלבד"}}
    metadata_bytes = jbytes(metadata)
    inputs = {"src/synthetic-%03d.mjs" % n: H(("synthetic-%d" % n).encode()) for n in range(501)}
    inputs.update({BASE.METADATA: H(metadata_bytes), "package.json": H(b"synthetic package"),
                   "package-lock.json": H(b"synthetic lock")})
    pins["sourceInputsSha256"] = H(BASE._canonical(inputs))
    def snapshot(phase, time):
        return {"sourceCommit": pins["sourceSha"], "sourceTree": pins["sourceTree"],
                "phase": phase, "version": "4.58", "build": "194",
                "workflowCommit": pins["intakeToolSha"], "buildRunId": pins["intakeRun"],
                "buildRunAttempt": "1", "appleUploadPerformed": False,
                "sourceInputs": inputs, "packageSha256": inputs["package.json"],
                "packageLockSha256": inputs["package-lock.json"], "checkedAt": time,
                "ci": [{"id": pins[k], "source": pins["sourceSha"], "attempt": 1,
                        "conclusion": "success"} for k in CI_KEYS]}
    common = {"sourceCommit": pins["sourceSha"], "sourceTree": pins["sourceTree"],
              "ipaSha256": pins["ipaSha256"], "appleUploadPerformed": False}
    pre = {"appId": pins["appId"], "mode": "GET_ONLY", "build": None, "groups": [],
           "appStoreVersions": [{"id": "synthetic-store", "version": "4.55", "state": "READY_FOR_SALE"}],
           "checkedAt": "2026-10-15T10:13:00Z"}
    post = {**copy.deepcopy(pre), "scope": "PACKAGE_INTAKE_ONLY",
            "build": {"id": pins["buildId"], "build": "194", "version": "4.58", "processingState": "VALID"},
            "assignedGroups": [], "assignedIndividualTesters": 0, "appStoreVersion": None,
            "databaseAccepted": False, "publicReleaseAccepted": False, "distributionAllowed": False,
            "checkedAt": "2026-10-15T10:18:00Z"}
    objects = {
        "live-ci-before-download.json": snapshot("ci-only", "2026-10-15T10:11:00Z"),
        "source-before-upload.json": snapshot("before-upload", "2026-10-15T10:14:00Z"),
        "upload-origin.json": {**common, "scope": "PACKAGE_INTAKE_ONLY", "signingTools": pins["signingToolSha"],
                              "signingRunId": pins["signingRun"], "signingRunAttempt": "1",
                              "artifactId": pins["signingArtifact"], "artifactDigest": "PENDING",
                              "databaseAccepted": False, "publicReleaseAccepted": False, "distributionAllowed": False},
        "original-artifact-before-upload.json": {**common, "originalSigningRunId": pins["signingRun"],
            "rebuilt": False, "signatureReverified": True, "everyOriginalWebAssetMatches": True,
            "everyOriginalWebAssetMatchesCanonicalGitBuild": True, "originalSourceInputsMatchCurrentGit": True,
            "profile": {"profileValidAtVerification": True, "knownCertificateIncluded": True,
                        "debugEntitlement": False, "appleSignIn": ["Default"],
                        "profileExpiresAt": "2027-09-08T00:00:00+00:00"}},
        "intake-preflight.json": pre, "intake-postflight.json": post,
        "testflight-completion.json": {"appId": pins["appId"], "buildId": pins["buildId"],
            "version": "4.58", "build": "194", "processingState": "VALID",
            "hebrewReleaseNotesVerified": True, "checkedAt": "2026-10-15T10:17:00Z"},
    }
    files = {"source-metadata.json": metadata_bytes,
             "signing-artifact.zip": b"synthetic encrypted original archive bytes; not a real ZIP or IPA"}
    pins["signingZipSha256"] = H(files["signing-artifact.zip"])
    pins["signingArtifactSize"] = str(len(files["signing-artifact.zip"]))
    objects["upload-origin.json"]["artifactDigest"] = "sha256:" + pins["signingZipSha256"]
    for label, sha, tree in (("source", pins["sourceSha"], pins["sourceTree"]),
                              ("signing-tool", pins["signingToolSha"], pins["signingToolTree"]),
                              ("intake-tool", pins["intakeToolSha"], pins["intakeToolTree"])):
        files[label + "-commit.json"] = jbytes({"sha": sha, "url": BASE.API + "/git/commits/" + sha,
                                                "tree": {"sha": tree, "url": BASE.API + "/git/trees/" + tree}})
    for prefix, times in (("signing", ("10:00:00", "10:05:00", "10:04:00")),
                           ("intake", ("10:10:00", "10:20:00", "10:19:00"))):
        run = int(pins[prefix + "Run"])
        run_url = BASE.API + "/actions/runs/" + str(run)
        files[prefix + "-run.json"] = jbytes({
            "id": run, "url": run_url, "repository": {"full_name": BASE.REPO},
            "head_repository": {"full_name": BASE.REPO}, "head_sha": pins[prefix + "ToolSha"],
            "head_branch": pins[prefix + "Branch"], "path": pins[prefix + "WorkflowPath"],
            "event": pins[prefix + "Event"], "status": "completed", "conclusion": "success",
            "run_attempt": 1, "run_number": 1, "created_at": "2026-10-15T"+times[0]+"Z",
            "updated_at": "2026-10-15T"+times[1]+"Z"})
        files[prefix + "-jobs.json"] = jbytes({"total_count": 1, "jobs": [{
            "id": int(pins[prefix + "Job"]), "url": BASE.API + "/actions/jobs/" + pins[prefix + "Job"],
            "run_id": run, "run_url": run_url, "head_sha": pins[prefix + "ToolSha"],
            "name": pins[prefix + "JobName"], "status": "completed", "conclusion": "success",
            "steps": [{"name": s, "status": "completed", "conclusion": "success"}
                      for s in pins[prefix + "RequiredSteps"]]}]})
        files[prefix + "-artifact.json"] = jbytes({
            "id": int(pins[prefix + "Artifact"]),
            "name": "sogrim-ios-4.58-194-encrypted" if prefix == "signing" else "ios194-intake-evidence-" + str(run),
            "expired": False, "expires_at": "2026-10-22T00:00:00Z",
            "created_at": "2026-10-15T"+times[2]+"Z",
            "workflow_run": {"id": run, "head_sha": pins[prefix + "ToolSha"]},
            "size_in_bytes": len(files["signing-artifact.zip"]) if prefix == "signing" else 1,
            "digest": "sha256:" + pins["signingZipSha256"] if prefix == "signing" else "PENDING"})
    members = {name: jbytes(value) for name, value in objects.items()}
    refresh_zip(files, pins, members, compression=compression)
    return files, pins, members


def refresh_inputs(files, pins):
    pins["inputSha256"] = {name: H(raw) for name, raw in files.items()}


def refresh_zip(files, pins, members, *, compression=zipfile.ZIP_DEFLATED, bind_members=True):
    files["intake-evidence.zip"] = zip_bytes(members, compression)
    pins["intakeZipSha256"] = H(files["intake-evidence.zip"])
    pins["intakeArtifactSize"] = str(len(files["intake-evidence.zip"]))
    artifact = json.loads(files["intake-artifact.json"])
    artifact["size_in_bytes"] = len(files["intake-evidence.zip"])
    artifact["digest"] = "sha256:" + pins["intakeZipSha256"]
    files["intake-artifact.json"] = jbytes(artifact)
    if bind_members:
        pins["memberSha256"] = {name: H(raw) for name, raw in members.items()}
    refresh_inputs(files, pins)


def edit_json(files, pins, name, edit):
    value = json.loads(files[name])
    edit(value)
    files[name] = jbytes(value)
    refresh_inputs(files, pins)


def edit_member(files, pins, members, name, edit):
    value = json.loads(members[name])
    edit(value)
    members[name] = jbytes(value)
    refresh_zip(files, pins, members)


class IntakeEvidenceControls(unittest.TestCase):
    def test_pending_before_reading_files_or_clock(self):
        class Trap(dict):
            def __iter__(self):
                raise AssertionError("Must not inspect caller")
        with self.assertRaisesRegex(ValueError, "PENDING"):
            BASE.verify_successful_intake(Trap(), now_utc=object())

    def test_happy_path_is_deterministic_and_retains_original_bytes(self):
        files, pins, _ = fixture()
        module = load_verifier(pins)
        first = module.verify_successful_intake(files, now_utc=NOW)
        self.assertEqual(first, module.verify_successful_intake(files, now_utc=NOW))
        result = json.loads(first["receiptBytes"])
        self.assertEqual(result["originalInputSha256"], pins["inputSha256"])
        self.assertEqual(result["originalMemberSha256"], pins["memberSha256"])
        self.assertEqual(result["postflightCheckedAt"], "2026-10-15T10:18:00Z")
        for k in ("ownerAvailabilityAccepted", "databaseAccepted", "publicReleaseAccepted", "distributionAllowed"):
            self.assertIs(result[k], False)

    def test_stored_zip_uses_the_same_membership_contract(self):
        files, pins, _ = fixture(zipfile.ZIP_STORED)
        load_verifier(pins).verify_successful_intake(files, now_utc=NOW)

    def test_original_zip_member_bytes_are_required_even_if_json_is_identical(self):
        files, pins, members = fixture()
        members["intake-postflight.json"] += b" \n"
        # Bind outer bytes/API metadata as if independently reviewed, retaining the ORIGINAL member pins.
        refresh_zip(files, pins, members, bind_members=False)
        with self.assertRaisesRegex(ValueError, "member byte digest"):
            load_verifier(pins).verify_successful_intake(files, now_utc=NOW)

    def test_old_projection_accepts_the_member_byte_substitution(self):
        files, pins, members = fixture()
        members["intake-postflight.json"] += b" \n"
        refresh_zip(files, pins, members, bind_members=False)
        load_verifier(pins, old=True).verify_successful_intake(files, now_utc=NOW)

    def test_completion_boolean_alone_is_not_evidence(self):
        files, pins, _ = fixture()
        with self.assertRaises(ValueError):
            load_verifier(pins).verify_successful_intake(
                {"testflight-completion.json": jbytes({"success": True})}, now_utc=NOW)

    def test_required_zip_member_cannot_be_omitted_after_rebinding(self):
        files, pins, members = fixture()
        del members["source-before-upload.json"]
        refresh_zip(files, pins, members)
        with self.assertRaises(ValueError):
            load_verifier(pins).verify_successful_intake(files, now_utc=NOW)

    def test_source_map_matches_before_and_after_download(self):
        files, pins, members = fixture()
        def corrupt(x):
            x["sourceInputs"]["src/synthetic-000.mjs"] = "0"*64
        edit_member(files, pins, members, "source-before-upload.json", corrupt)
        with self.assertRaises(ValueError):
            load_verifier(pins).verify_successful_intake(files, now_utc=NOW)

    def test_expired_clock_is_not_renewed_by_verifier(self):
        files, pins, _ = fixture()
        with self.assertRaises(ValueError):
            load_verifier(pins).verify_successful_intake(files, now_utc="2026-10-22T00:00:00Z")

    def test_bad_crc_is_rejected_even_when_outer_digest_is_rebound(self):
        files, pins, members = fixture(zipfile.ZIP_STORED)
        archive = bytearray(files["intake-evidence.zip"])
        index = archive.index(members["intake-postflight.json"])
        archive[index] ^= 1
        files["intake-evidence.zip"] = bytes(archive)
        pins["intakeZipSha256"] = H(files["intake-evidence.zip"])
        edit_json(files, pins, "intake-artifact.json",
                  lambda x: x.update(digest="sha256:"+pins["intakeZipSha256"]))
        with self.assertRaises(zipfile.BadZipFile):
            load_verifier(pins).verify_successful_intake(files, now_utc=NOW)

    def test_duplicate_zip_member_is_rejected(self):
        files, pins, members = fixture()
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w") as archive:
            for name, raw in members.items():
                archive.writestr(name, raw)
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                archive.writestr("intake-postflight.json", members["intake-postflight.json"])
        files["intake-evidence.zip"] = out.getvalue()
        pins["intakeZipSha256"] = H(out.getvalue())
        pins["intakeArtifactSize"] = str(len(out.getvalue()))
        edit_json(files, pins, "intake-artifact.json", lambda x: x.update(
            digest="sha256:"+pins["intakeZipSha256"], size_in_bytes=len(out.getvalue())))
        with self.assertRaises(ValueError):
            load_verifier(pins).verify_successful_intake(files, now_utc=NOW)

    def test_duplicate_json_keys_are_rejected_after_byte_rebinding(self):
        files, pins, members = fixture()
        members["testflight-completion.json"] = members["testflight-completion.json"].replace(
            b'{"appId":', b'{"appId":"wrong","appId":', 1)
        refresh_zip(files, pins, members)
        with self.assertRaisesRegex(ValueError, "Duplicate JSON"):
            load_verifier(pins).verify_successful_intake(files, now_utc=NOW)


def add_rejection(label, mutate):
    def test(self):
        files, pins, members = fixture()
        mutate(files, pins, members)
        with self.assertRaises((ValueError, KeyError, zipfile.BadZipFile, UnicodeError, TypeError)):
            load_verifier(pins).verify_successful_intake(files, now_utc=NOW)
    setattr(IntakeEvidenceControls, "test_reject_" + label, test)


for prefix in ("signing", "intake"):
    for field, bad in (("head_sha", "0"*40), ("head_branch", "codex/wrong"), ("path", ".github/workflows/wrong.yml"),
                       ("event", "pull_request"), ("status", "in_progress"), ("conclusion", "failure"),
                       ("run_attempt", 2), ("run_number", 2), ("id", 999),
                       ("url", "https://api.github.com/repos/foreign/project/actions/runs/102")):
        add_rejection(prefix+"_run_"+field, lambda f,p,m,prefix=prefix,field=field,bad=bad:
                      edit_json(f,p,prefix+"-run.json",lambda x:x.update({field:bad})))
    add_rejection(prefix+"_fork", lambda f,p,m,prefix=prefix:
                  edit_json(f,p,prefix+"-run.json",lambda x:x["head_repository"].update(full_name="foreign/fork")))
    for field, bad in (("id",999), ("run_id",999), ("head_sha","0"*40), ("name","wrong"),
                       ("conclusion","failure"), ("status","queued"), ("run_url","https://foreign.invalid")):
        add_rejection(prefix+"_job_"+field, lambda f,p,m,prefix=prefix,field=field,bad=bad:
                      edit_json(f,p,prefix+"-jobs.json",lambda x:x["jobs"][0].update({field:bad})))
    add_rejection(prefix+"_missing_jobs_page", lambda f,p,m,prefix=prefix:
                  edit_json(f,p,prefix+"-jobs.json",lambda x:x.update(total_count=2)))
    add_rejection(prefix+"_required_step", lambda f,p,m,prefix=prefix:
                  edit_json(f,p,prefix+"-jobs.json",lambda x:x["jobs"][0]["steps"][0].update(conclusion="skipped")))
    for field, bad in (("id",999), ("name","wrong"), ("expired",True), ("expires_at",NOW),
                       ("size_in_bytes",1), ("digest","sha256:"+"0"*64)):
        add_rejection(prefix+"_artifact_"+field, lambda f,p,m,prefix=prefix,field=field,bad=bad:
                      edit_json(f,p,prefix+"-artifact.json",lambda x:x.update({field:bad})))
    add_rejection(prefix+"_artifact_foreign_run", lambda f,p,m,prefix=prefix:
                  edit_json(f,p,prefix+"-artifact.json",lambda x:x["workflow_run"].update(id=999)))
    add_rejection(prefix+"_artifact_foreign_tool", lambda f,p,m,prefix=prefix:
                  edit_json(f,p,prefix+"-artifact.json",lambda x:x["workflow_run"].update(head_sha="0"*40)))
    add_rejection(prefix+"_tool_tree", lambda f,p,m,prefix=prefix:
                  edit_json(f,p,prefix+"-tool-commit.json",lambda x:x["tree"].update(sha="0"*40)))
for member, field, bad in (
    ("source-before-upload.json","sourceCommit","0"*40),
    ("source-before-upload.json","sourceTree","0"*40),
    ("source-before-upload.json","workflowCommit","0"*40),
    ("source-before-upload.json","buildRunId","999"),
    ("source-before-upload.json","buildRunAttempt","2"),
    ("source-before-upload.json","phase","ci-only"),
    ("upload-origin.json","ipaSha256","0"*64),
    ("upload-origin.json","signingTools","0"*40),
    ("upload-origin.json","signingRunId","999"),
    ("upload-origin.json","artifactId","999"),
    ("upload-origin.json","artifactDigest","sha256:"+"0"*64),
    ("original-artifact-before-upload.json","ipaSha256","0"*64),
    ("original-artifact-before-upload.json","rebuilt",True),
    ("original-artifact-before-upload.json","signatureReverified",False),
    ("original-artifact-before-upload.json","everyOriginalWebAssetMatchesCanonicalGitBuild",False),
    ("intake-postflight.json","appId","999"),
    ("intake-postflight.json","assignedGroups",["synthetic-forbidden-group"]),
    ("intake-postflight.json","assignedIndividualTesters",1),
    ("intake-postflight.json","appStoreVersion","synthetic-forbidden-store"),
    ("testflight-completion.json","processingState","PROCESSING"),
    ("testflight-completion.json","buildId","00000000-0000-4000-8000-000000000193"),
    ("testflight-completion.json","hebrewReleaseNotesVerified",False),
):
    add_rejection(member.replace(".json","").replace("-","_")+"_"+field,
                  lambda f,p,m,member=member,field=field,bad=bad:
                  edit_member(f,p,m,member,lambda x:x.update({field:bad})))
for member in ("upload-origin.json", "intake-postflight.json"):
    for field in ("databaseAccepted","publicReleaseAccepted","distributionAllowed"):
        add_rejection(member.replace(".json","").replace("-","_")+"_"+field,
                      lambda f,p,m,member=member,field=field:
                      edit_member(f,p,m,member,lambda x:x.update({field:True})))
for field, bad in (("id","00000000-0000-4000-8000-000000000193"),("build","193"),
                   ("version","4.57"),("processingState","PROCESSING")):
    add_rejection("postflight_build_"+field, lambda f,p,m,field=field,bad=bad:
                  edit_member(f,p,m,"intake-postflight.json",lambda x:x["build"].update({field:bad})))
add_rejection("source_commit_tree", lambda f,p,m:
              edit_json(f,p,"source-commit.json",lambda x:x["tree"].update(sha="0"*40)))
add_rejection("metadata_bundle", lambda f,p,m:
              edit_json(f,p,"source-metadata.json",lambda x:x["app"].update(bundleId="foreign.app")))
add_rejection("original_input_bytes", lambda f,p,m:f.update({"intake-run.json":f["intake-run.json"]+b" "}))
add_rejection("unsafe_member_path", lambda f,p,m:
              (m.update({"../unexpected.json":b"{}"}),refresh_zip(f,p,m)))
add_rejection("extra_unbound_member", lambda f,p,m:
              (m.update({"unexpected.json":b"{}"}),refresh_zip(f,p,m,bind_members=False)))
add_rejection("store_baseline_changed", lambda f,p,m:
              edit_member(f,p,m,"intake-postflight.json",lambda x:x.update(appStoreVersions=[])))
add_rejection("receipt_chronology", lambda f,p,m:
              edit_member(f,p,m,"intake-postflight.json",lambda x:x.update(checkedAt="2026-10-15T10:01:00Z")))

def replace_zip(files, pins, raw):
    files["intake-evidence.zip"] = raw
    pins["intakeZipSha256"] = H(raw)
    pins["intakeArtifactSize"] = str(len(raw))
    edit_json(files, pins, "intake-artifact.json", lambda x: x.update(
        digest="sha256:"+pins["intakeZipSha256"], size_in_bytes=len(raw)))


def specialized_member(files, pins, members, *, mode=0o120777, compression=zipfile.ZIP_STORED):
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as archive:
        for name, raw in members.items():
            info = zipfile.ZipInfo(name)
            info.create_system = 3
            info.external_attr = (mode << 16) if name == "intake-postflight.json" else (0o100600 << 16)
            info.compress_type = compression if name == "intake-postflight.json" else zipfile.ZIP_STORED
            archive.writestr(info, raw)
    replace_zip(files, pins, out.getvalue())


add_rejection("zip_symlink", lambda f,p,m:specialized_member(f,p,m))
add_rejection("zip_special_device", lambda f,p,m:specialized_member(f,p,m,mode=0o020600))
add_rejection("zip_unsupported_compression", lambda f,p,m:specialized_member(f,p,m,mode=0o100600,compression=zipfile.ZIP_BZIP2))
add_rejection("future_run", lambda f,p,m:
              edit_json(f,p,"intake-run.json",lambda x:x.update(updated_at="2026-10-15T10:31:00Z")))
add_rejection("artifact_from_before_run", lambda f,p,m:
              edit_json(f,p,"intake-artifact.json",lambda x:x.update(created_at="2026-10-15T09:00:00Z")))
add_rejection("profile_expired", lambda f,p,m:
              edit_member(f,p,m,"original-artifact-before-upload.json",
                          lambda x:x["profile"].update(profileExpiresAt=NOW)))
add_rejection("missing_explicit_store_null", lambda f,p,m:
              edit_member(f,p,m,"intake-postflight.json",lambda x:x.pop("appStoreVersion")))
add_rejection("boolean_instead_of_zero_testers", lambda f,p,m:
              edit_member(f,p,m,"intake-postflight.json",lambda x:x.update(assignedIndividualTesters=False)))
add_rejection("original_member_boolean_public_acceptance", lambda f,p,m:
              edit_member(f,p,m,"upload-origin.json",lambda x:x.update(databaseAccepted=0)))
