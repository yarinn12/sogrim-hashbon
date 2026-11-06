# Signing fixture temporary-root correction

Original signing run 42209781757, attempt 1, job 127865264501 failed before any service-key or signing step. Of 439 Node controls, only the actual first-creation CLI fixture failed: `Require fresh output inside RUNNER_TEMP`. The macOS temporary path was a `/var` alias, while the guard canonicalizes RUNNER_TEMP to `/private/var`.

The fixture now canonicalizes its newly created owned temporary root before deriving RUNNER_TEMP and the output path. The production first-creation guard remains byte-identical to commit 0c9334bbb40db992f50f89cac6e3d9e2b62c4100. Freshness, direct parent ownership, event identity, two complete history reads and rejection before transport remain enforced.

The normal Node suite runs the actual CLI test under an aliased temporary directory. POSIX uses an owned directory symlink. Windows uses a real case alias plus native realpath in an isolated test preload, because this host cannot create directory links. The preload preserves an aliased mkdtemp return, exercising the canonical-root precondition before unchanged real CLI acceptance, evidence and no-GET rejection assertions. It does not change operational source. OLD fails the precondition; FINAL passes. The child must actually report the targeted test, avoiding a false pass from inherited NODE_TEST_CONTEXT.

Local final checks: 440 Node, 30 packaged-assets, 4 certificate and 8 release-notes controls passed. A sandboxed Git Bash parse failed on a Windows named-object permission; its log is retained and the same source passed outside that sandbox. This is local synthetic evidence, not a macOS signing result. A successor still requires its original hosted execution after binding the final accepted application source.

The failed remote branch remains unchanged. No rerun, signed IPA, upload or audience change resulted from that failure. This preparation branch has not been published.
