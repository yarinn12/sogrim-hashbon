# Signed policy bootstrap — offline preparation, entry blocked

Base: dadddea7b34295bb94f9197136686c80c9688606. This patch adds two implementation modules, one normal-suite test file and this review. Existing files, AUDIT_PINS and runOwnerReadOnlyAudit are unchanged. There is no workflow, CLI, policy generator, real project key, push, Apple environment reader or Apple request.

## Executable wiring provided

signed-audit-policy.mjs implements the scoped authenticated GitHub client and ref → annotated tag → direct blob authentication. The client itself calls fetch with GET, redirect:error, existing GitHub token authentication and a30s AbortSignal. It checks status200, native response URL and redirected=false, consumes a bounded original response stream, and retains original bytes/timestamps without headers or tokens. A caller's JSON method/transport flags cannot replace these calls. No retry or redirect fallback exists.

runSignedAuditPreKey in audit-prekey-bootstrap.mjs:
1. Rejects PENDING public anchors before reading option getters, runtime or transport.
2. Reads only an explicit allowlist of GITHUB_* runtime fields; rejects repo/ref/workflow/event/run-number/attempt/job mismatch before transport.
3. Authenticates the Root-signed policy via actual GET ref/tag/blob reads.
4. Collects original GitHub controller/toolkit commit, current run and attempt1 jobs records with the same authenticated client.
5. Measures both clean Git checkouts and pinned original files, plus the original intake inputs, then actually calls verifyAuditExecution.
6. Executes the ORIGINAL bound intake-source-guard.mjs in a sanitized Node subprocess, checks its compiled source/tree/branch, and calls verifyCommit and verifyRuns. The authenticated client supplies guardFetch and preserves its actual GET request captures. The guard retains all four workflow paths, original attempt1 and all18 QA roles; no acceptance callback or copied weaker role list is used.
7. Executes the ORIGINAL bound verify_successful_intake.py in a sanitized Python subprocess with the12 original buffers and current UTC. Its computed receipt must be byte-identical to the Root-signed successful-intake receipt input.
8. Measures checkouts/inputs again and calls verifyAuditExecution again. Returns provenance and original captures with all public/database/distribution/Apple-key authorization flags false.

Node/Python subprocesses receive only PATH, SOURCE_SHA and Python no-write/no-user-site settings. The existing GitHub token enters Node via stdin, never argv or inherited environment; Python receives no token. Children have bounded output/time and cannot return a callback that claims acceptance. Failure blocks this separate audit and cannot rebuild or reupload the IPA.

The bound guard currently contains historical source constants and the Python verifier remains PENDING. They are intentionally NOT rebound here. Actual execution cannot pass until Root has bound, reviewed and read back the final toolkit after real intake.

## Exact generator/consumer wire format

Algorithm literal: ECDSA-P256-SHA256-P1363.
Public anchor field: publicSpkiBase64 = canonical base64 of SPKI DER.
Only asymmetricKeyType=ec/namedCurve=prime256v1 is accepted.
keyFingerprint = lowercase SHA256(SPKI DER).
Signature must be exactly64 bytes with Node dsaEncoding:'ieee-p1363'. No DER or algorithm negotiation.

Signed bytes are EXACTLY:
UTF8('SOGRIM_OWNER_AUDIT_POLICY_V1\0yarinn12/sogrim-hashbon\0' + tagName + '\0') || rawPolicyBytes

The signing private key is not generated or accepted by implementation code. Tests generate a synthetic in-memory key only. policySigningBytes is a pure shared encoder that the separate Root generator may reuse.

Policy blob P is UTF8(JSON.stringify(object)+'\n'), no BOM/indent/duplicates. Closed fields:
schemaVersion, repository, tag, scope, appId, platform, version, build, sourceRuns, executionPolicyBase64.
Fixed values: schemaVersion1, repository yarinn12/sogrim-hashbon, scope INDEPENDENT_POST_INTAKE_GET_ONLY, appId6809952514, platformIOS, version4.58, build194.
sourceRuns is a closed object of four distinct positive string IDs: qaRun/windowsRun/fontRun/authRun.
executionPolicyBase64 encodes the ORIGINAL canonical bytes of the existing audit-execution-context policy schema. This separates the signed outer tag/app/CI bindings from that unchanged schema. No audit runtime run/job ID appears in either policy.

Annotated-tag message is UTF8(JSON.stringify(object)+'\n') with EXACTLY:
schemaVersion, scope, repository, tag, algorithm, keyFingerprint, policySha256, policyBlobSha, controllerSha, toolkitSha, signatureBase64.
policySha256 hashes the complete raw outer blob P.
policyBlobSha = SHA1(UTF8('blob '+rawPolicyBytes.length+'\0') || rawPolicyBytes), not SHA1 of JSON alone.
controllerSha/toolkitSha must equal the authenticated inner policy values.
The signature covers raw P and domain/repo/tag. It is outside P and C; no self hash cycle is introduced.

Only annotated ref.object.type=tag and tag.object.type=blob are accepted. Tag name, object IDs, repository URLs, raw blob size/base64/Git SHA and SHA256 are checked. Ref mutation can yield failure or the same authorized signed policy; tagger metadata is not treated as author authentication. Root still owns one-use key handling, controller review, atomic branch+tag publication and readback. None is performed here.

## Required final toolkit and input layout

Controller namespace audit-controller; toolkit namespace audit-tools; original input namespace audit-inputs, all beneath the measured runner workspace. The controller must independently verify the initial toolkit imports against its precommitted reviewed bootstrap manifest before importing these modules. A helper cannot authenticate its own already-executed import retrospectively.

The signed toolkit file map must include all existing context-verifier required files PLUS:
scripts/qa/ios-signing/signed-audit-policy.mjs
scripts/qa/ios-signing/audit-prekey-bootstrap.mjs
scripts/qa/ios-signing/intake-source-guard.mjs

The signed input map must include the12 INPUT_FILES from verify_successful_intake.py plus successful-intake-receipt.json. source-metadata.json is already among the12; total minimum13 files. Actual bytes, sizes and hashes remain unknown/PENDING until real intake. No synthetic fixture is a real intake or signature receipt.

Filesystem measurements use realpath/lstat/open/fstat, regular-file and inode/size/time continuity checks, raw bytes and clean Git HEAD/tree/top-level/status before/after reading. Symlinks, dirty/untracked state, wrong roots and hashes fail closed. JSON/module files are bounded16MiB and ZIP inputs256MiB. This is a controlled clean-checkout measurement, not an OS-wide atomic filesystem snapshot. No concurrent edits are allowed during the audit.

## Tests actually run

45 new Node controls passed in memory, no skips/retries. The test is in tests/auditSignedPolicyBootstrap.test.mjs so it belongs to the normal suite after persistence. It covers signature/curve/encoding/domain/tampering, consistent-hash ref replacement without a new signature, repo/ref/URLs/nested tag, actual fetch options/body/redirect/error/no-retry, runtime attempt/workflow_sha, measured file hashes/symlink/dirty state and direct invocation of the existing context verifier.

The context pipeline tests replace filesystem imports ONLY in an isolated memory copy with a test filesystem adapter; production code has actual filesystem/Git measurements and no measurement callback. One subprocess control executes the actual shared CI guard and new authenticated client against explicitly synthetic API records; it accepts all18 roles and rejects missing cross-platform-shard-2. No network request occurs. Original code bindings are replaced with synthetic identities in that test copy only.

Identical OLD/FINAL signature rejection assertion: OLD1 fails and FINAL1 passes. OLD is a controlled memory copy omitting only cryptographic signature verification; it is not a historical production commit or a runtime mode.

Nearby existing tests executed FROM DISK in the Root worktree:250/250 Node controls for context/audit/owner and118/118 successful-intake Python controls passed. The new modules/test file have not been persisted or imported from saved files here. The complete real-filesystem → all-source CI → original-Python → pre-key pipeline has not run against a real intake; that is impossible with current PENDING bindings. Normal npm test with the new files remains required at Root after applying the isolated patch; no claim of a fully green private/product suite is made.

## Explicit remaining collector boundary

This patch ends at pre-key evidence. It DOES NOT load Apple credentials or invoke collector/client. Existing runOwnerReadOnlyAudit still calls requireAuditBindings with auditRun/auditJob PENDING and unconditionally blocks missing integration. Do not invent those IDs or fill them before the run starts.

The new context contains actual numeric auditRun/auditJob derived from original GitHub API, alongside controller/toolkit/source/input provenance. Future scoped collection must consume the direct successful return of the reviewed pre-key call in the same invocation, not a JSON passed=true marker or approval callback; it must bind snapshot/evidence/provenance to those measured IDs while preserving immutable input/source proofs. Reusing the old private collectAuditTemplate unchanged cannot work because of its static AUDIT_PINS check. That final dynamic-runtime collection/output adaptation remains a separate explicit integration task.

No public entry is enabled, even if the cryptographic/transport tests pass. No live gate result, physical-device acceptance, Production/database acceptance, TestFlight availability or upload is asserted.


## Root saved-file verification

Root applied the original 56,810-byte patch (SHA256 a1041e21d011f4ffaf917b231aad8554b96d1e4cefb51e9d198147657d1af85c) in an isolated worktree. Both production modules match its canonical Git bytes. Saved-file execution first exposed a CRLF-sensitive mutation needle in the test; only that test fixture was corrected and it now exercises the same signature rejection against both LF and CRLF source. 45/45 new controls, 296/296 combined adjacent Node controls and 118/118 Python controls passed from disk. An independent identical-case replay fails OLD with Missing expected rejection and passes FINAL, with zero skips. OLD omits only signature verification in a controlled memory copy.

The complete private normal suite ran 3,785 tests: 3,783 passed and the two preexisting iosLoginProviders/iosSubmissionPreparation assertions failed, matching the recorded dadd/c91 baseline; zero skipped/cancelled. This is not a fully green private-suite claim. The public application source is unchanged and its separate normal suite passed 3,972/3,972. No architecture checker exists in this older private base. Full real-filesystem/CI/Python pre-key joining and scoped collection remain separately held integration work, with all actual anchors PENDING and the original entry blocked. No key/API/push/activation occurred.
