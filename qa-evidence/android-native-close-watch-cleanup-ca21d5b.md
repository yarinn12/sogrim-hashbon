# Owned Android close-watch cleanup

This change repairs two QA cleanup defects. It does not establish the cause of
the historical application ANRs or retroactively accept the failed SDK run.

## Actual run retained

- Application source: `ca21d5bcdf2eddfb7271c3c1a01bb7773df879bb`, tree
  `5175649368d51925dc54137c9650a8eb2c746bc2`.
- QA431, run `38120396758`, attempt1, Android job `114413946194` failed in
  diagnostic finalization after all behavioral and system-health gates passed.
- Artifact `11695201856`: 121859271 bytes, SHA256
  `d464bec960c02f874f656d964489dec1a11766bcccd50c687d70fa199287c105`.
- Original archive and all 147 extracted diagnostic files are retained outside
  this checkout. APK/source/207 web assets/13 fonts were independently verified.
- Matrix198/198, pages312/312 with24 samples, journey8/8 and geometry4/4 passed.
  The font negative control detected all three injected errors and restored the
  exact rules/text and OS scale. Independent orientation16/16 and font32/32 passed.
- Continuous history, its exact digest-verified snapshot, final ALL logcat,
  last-ANR and both DropBox dumps contain no target-app ANR. The two boot-time
  Google/Play Store incidents remain retained. Historical4acd/D9/7b ANRs stay open.

Actual `perfetto-stop-close` argv was `shell toybox timeout 15 sh -s`. The ADB
observer's existing20000ms limit expired: started07:25:22.718Z,
completed07:25:42.732Z, exitCode=null, error=`ETIMEDOUT`, stderr0bytes. Its stdout
contained these exact observations:

```text
WATCH_READY 148060 /data/misc/perfetto-traces/sogrim_ci_38120396758_1_a4550508bd7aeabe.pftrace
CLOSE_WRITE 148060 /data/misc/perfetto-traces/sogrim_ci_38120396758_1_a4550508bd7aeabe.pftrace
```

The configured journal was in the proven shell-writable config directory.
The journal itself and the watcher PID/stat/cmdline before/after were not pulled.
Only the tracer PID2614/startTicks7040 and trace inode65080:148060 were retained.
Therefore the observed timeout's precise cleanup cause remains unconfirmed.
Later pull exit0 retained209537709bytes/SHA256
`a76f75786e9d7f7fec05279f9bc54961e2197d7aa871354d95c0599baeee8920`;
its normal stderr progress was accepted against the exact owned path and size.
No accepted stop-command completion means captureComplete=false and
nativeAcceptance=false. The complete-capture analyzer rejected before queries;
the retained file was parsed only through a separate incomplete forensic path.

## Proven defects and repair

The old cleanup required the literal `FILE:w` in `/proc/PID/cmdline`.
[Official AOSP Toybox source](https://android.googlesource.com/platform/external/toybox/+/e21e76d30fa15996188b79affbc25cfd0c13deff/toys/other/inotifyd.c)
splits that argument by replacing the colon in the argv buffer with NUL.
The actual bytes consequently become `FILE<NUL>w<NUL>`; matching only
`FILE:w` can reject the direct child and leave its inherited stderr open.
That source is3308bytes/SHA256
`1649a24a81f57ada2146cf9a82b7c5b74487e826864f7012b9d52a2b111106b1`,
Git blob `4e886bc5094389d8ae9dc907955aec99fea170ac` independently verified.
The exact guest Toybox binary revision was not retained; this is evidence of the
code defect and a plausible connection, not proof of that SDK instance's cause.

Cleanup now requires the complete exact Toybox/inotifyd argv in either original
or split form. It retains direct-parent and startTicks checks before TERM and
again before KILL. Foreign program, path, extra argument, parent and reused PID
are rejected. TERM is followed by at most20 polls of50ms; only the revalidated
direct child can receive KILL, followed by at most20 additional polls. `wait`
is called only after confirmed exit/Z. An unconfirmed cleanup rejects an
otherwise successful close with exit7; original exit5/6 remain unchanged.
The existing15s guest/20s ADB limits, resources, buffers, renderer and acceptance
tolerances are unchanged. Source/close ACK/inode/pull/host/history guards remain.

## Behavioral evidence

The normal suite includes the new12-case test. It executes the generated shell
in Bash with synthetic proc/SDK observations and a real owned background child
that holds inherited stderr open. It checks actual signalling, parent exit,
pipe EOF and original failure status. It models polling rather than claiming
Android timings. No SDK or device is run locally.

Exactly the final test bytes against the exact old ca21 source:1pass/11fail;
the intact-argv control passes, split-argv completion fails, and an intact child
ignoring TERM exposes the old unbounded wait. The candidate passes12/12.
Nearby trace/CLI/Gradle/ANR/health tests pass66/66. The normal suite with the
final12-case test passes3499/3499, zero failures/skips/cancellations,
31220.592ms. Exact log receipts are in the external handoff receipt.
Five controlled output/ownership mutations all fail behaviorally:
original-only argv, reused PID bypass, parent bypass, full argv bypass and
unbounded wait. Each fails the relevant behavioral assertion.

Preparatory syntax, sandbox and harness-timing failures are retained separately
and are not counted as regression evidence. The final baseline/candidate tests
have identical hashes. No existing assertion was weakened or skipped.

No identical SDK rerun, product CSS change, dependency change, permission change,
Store action or database action was performed. Android SDK validation of this
new cleanup and resolution of historical ANRs remain required.
