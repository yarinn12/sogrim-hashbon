# Independent audit launcher and full-chain fixture — patch 2

Base: e12c28b611102b9c0f871ada73a5b7a48077ea56 (runtime also compatible with Root integration d9e116d084820faacb9a2b041b1359fc7adb29e7). Apply AFTER signed-bootstrap patch a1041e21d011f4ffaf917b231aad8554b96d1e4cefb51e9d198147657d1af85c. Existing runOwnerReadOnlyAudit/AUDIT_PINS remain unchanged and blocked.

## Actual entry flow

controller-owner-audit.mjs is an INACTIVE controller template, not a workflow. Its public anchors, initial toolkit SHA/tree and startup module hashes are PENDING. main() checks that configuration before environment/filesystem/imports. After future Root binding, it verifies the actual sibling audit-tools Git checkout and startup modules before importing owner-audit-launcher.mjs. No self C SHA, policy hash, private key or future audit run/job ID is stored in C.

runOwnerAuditLauncher calls the REAL runSignedAuditPreKey directly. There is no passed=true, pre-key receipt, snapshot, verifier or acceptance callback parameter. The only lazy credentialGetter is a credential source; it cannot assert gate success. The default getter reads the existing three APPSTORE_* fields only after:
- signed policy authentication, original GitHub context records, actual checkout/input measurements and verifyAuditExecution;
- original four-run/18-role shared CI guard in its sanitized Node child;
- original successful-intake verifier in its sanitized Python child, with byte-identical signed receipt;
- final checkout/input/context remeasurement;
- validated policy/context cross-links and fresh hashes of the original Apple client and collector modules.

The small bootstrap change only returns its authenticated inner policy, original policy bytes and measured toolkit root from that same invocation. Production POSIX path validation and all existing gates are unchanged.

The launcher then imports the EXISTING scripts/lib/app-store-release.mjs and collect-owner-snapshot.mjs from the measured/pinned toolkit, invokes the lazy getter once, creates the existing Apple client, and runs the existing collector. The scoped GET client is copied exactly from the previously reviewed private scope wrapper: fixed App/build, explicitly GET/redirect:error/no body, approved fields/queries, complete App-derived dynamic group/store/build grants, no globals or POST, no leaked fetch capability after failure. The existing client's one401 JWT renewal stays GET.

Collection binds to prekey.context.auditRun/auditJob, which the context verifier derived from actual GitHub API. No AUDIT_PINS future IDs are filled. Source/tree/build/IPA/intake/signing/controller/toolkit, signed outer-policy and authenticated inner-policy hashes, source CI and receipt hashes are retained. Original snapshot/evidence values, nulls, notes and timestamps are preserved. No owner decision or relationship mutation is implemented.

## Shared artifact contract

The CLI saves exactly the required seven producer members:
owner-snapshot.json
owner-snapshot-evidence.json
audit-execution-context.json
audit-controller-commit.json
audit-tool-commit.json
audit-context-run.json
audit-context-jobs.json

The four API records are copied as original Buffers from bootstrap.auditApiCaptures, never parsed/reformatted. The context is serialized once from the actual verifyAuditExecution result. Its unchanged apiSha256/inputSha256 schema matches owner_separate_audit_adapter.py.

Additional flat JSON proof members:
audit-provenance.json, audit-signature-proof.json, audit-source-ci-gate.json,
audit-successful-intake-gate.json, audit-policy-ref.json, audit-policy-tag.json,
audit-policy-blob.json, plus receipt.json written by the CLI.
The three policy API records also preserve original bytes. Every member must be pinned in the future complete ZIP map. No ZIP/artifact uploader/workflow is added here.

IMPORTANT: the adapter's auditPolicySha256 binds context.reviewedPolicySha256, i.e. signatureProof.executionPolicySha256 (INNER execution-policy bytes). The outer Root-signed blob hash is separately signatureProof.policySha256. Do not conflate them.

receipt.json lists hashes of preceding evidence files; it does not try to include its own hash or the future ZIP digest. Those are recorded externally after creation. Output is an exclusive new audit-output directory outside both clean checkouts. Files use wx and contain no credentials/JWTs. Failure cannot alter the earlier intake/upload or trigger rebuild/reupload.

## Tests and actual verification boundary

tests/iosOwnerAuditLauncher.test.mjs is in the normal test tree. It has5 read-only/unit/bridge controls plus3 full-chain cases.

Five controls PASSED here using a memory copy of the new code: real bootstrap failure never invokes credentialGetter/Apple transport; original Apple client and collector run against synthetic API records in a private post-gate unit; denied routes/POST/body never reach transport; controller PENDING precedes imports/runtime; original Python test fixture produces a valid bound synthetic verifier and exact original receipt. The private post-gate unit is explicitly NOT a claim that live gates passed.

The three full-chain tests are IMPLEMENTED and syntax checked, but have NOT executed here because this chat has read-only filesystem permissions. Root must run them before accepting this patch. No skip or memoryFs substitute exists in those cases.

Each full-chain fixture owns real temporary audit-controller and audit-tools Git repositories, actual clean Git/regular-file/open/read measurements, actual CLI invocation, actual original shared Node source guard/client child, and actual Python verifier child. Python fixtures come from test_successful_intake.py; bindings are changed only in copies written inside the owned test directory. The Root policy is signed with a synthetic in-memory P-256 key AFTER the actual C/T commits are known. Only the underlying GitHub/Apple transport and clock are synthetic. No passed gate or fabricated snapshot is injected.

Cases:
- success: all18 roles + original intake bytes → lazy credential read exactly once → actual client/collector → required files and numeric runtime IDs;
- missing cross-platform-shard-2: shared guard denies → zero credential reads/Apple requests/output;
- changed original input bytes: measurement denies → zero credential reads/Apple requests/output.

Windows: production captureRuntime/verifyAuditExecution remain POSIX-only for macOS CI. projectWindowsFixturePaths changes ONLY the test copy's native↔wire path representation (drive paths serialized /C:/...). It does not replace filesystem, Git, regular-file/open/read or subprocess operations. All replacements must match exactly once; LF normalization is explicit only in that test copy. The unchanged pure context verifier sees the projected paths. Windows execution is NOT proof of the production macOS path implementation. On POSIX no projection occurs.

Tests do not change global Git config. Per-test process environment sets core.autocrlf/commit.gpgSign; identity is supplied only to owned temporary Git commands. Recursive cleanup verifies resolved parent/prefix before deleting only the owned temp root. No Root worktree, real key, account, CI or service is modified.

## Exact Windows command for Root

From the isolated patched worktree, with its already-authorized technical filesystem permissions:
$env:SOGRIM_TEST_PYTHON='C:\Users\A\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
& 'C:\Users\A\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/iosOwnerAuditLauncher.test.mjs

Then run the normal npm test entry and retain the known baseline failures; no full-green claim is made here. Nearby signed-bootstrap/context/audit/adapter tests also remain required after the final merge.

## Activation stays blocked

The new controller template remains PENDING and the old entry remains blocked. No key, workflow, push, CI, Apple call or file write occurred here. The full real-source/intake chain, Root signing/publication/readback, fresh accepted app source and final toolkit/controller binding are mandatory before use. This patch completes the code path to scoped collection; it does not grant owner availability, database/public release acceptance or permission to publish.


## Root saved-file readback

Root applied the original 61,595-byte patch with SHA256 7bf22562fcb009273f132f9d2962a4fac6486838cf5575c01fbbe155df619cde on integrated base d9e116d. Both new production modules match its canonical bytes. All8 tests passed from saved files, including3 actual temporary-Git/Node/Python/CLI chains: success, missing required role and changed original input. The combined adjacent suite passed305/305; original Python intake controls passed118/118 (the102 separate-adapter Python cases also execute through its normal-suite wrapper). No skips/retries were used. Windows paths are projected only in the explicitly documented test copy; this does not verify production macOS path behavior.

The complete private normal suite ran3,794 tests:3,792 passed and the same2 inherited iosLoginProviders/iosSubmissionPreparation assertions failed; zero skipped/cancelled. No fully green private-suite claim is made. Public application code was not changed, and its separate normal suite passed3,972/3,972. Source QA473 remains failed, so no real source binding, controller activation, policy key generation, Apple key/API use, signature/upload or owner availability occurred. All actual controller anchors remain PENDING; the old audit entry is byte-identical and blocked.
