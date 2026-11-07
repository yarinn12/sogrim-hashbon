# Regression coverage for identity change between TERM and KILL

This follows `ffc7874c012fb09871261fc132c269899feae062`; the cleanup
implementation is unchanged. The first commit and its12-case evidence remain
history. The source blob still has SHA256
`0073a2954f2668f182340423c134a17bf313f0bb92ac27c4002b9f66c044cc8f`.

The final test now covers a child initially having the expected parent,
startTicks and complete split argv. It ignores TERM. The controlled TERM hook
first sends the real signal, then synchronously changes one synthetic proc
observation before returning to the generated script: cmdline mask, startTicks
or parent. No sleep/random race chooses when this change occurs. All three
cases require only TERM in the signal receipt, no KILL, unconfirmed cleanup and
exit7. The cmdline case retains the pre-change bytes and verifies `w` becomes
`a`, with the rest of the complete argv unchanged.

The targeted mutant removes only the revalidation immediately before KILL,
keeping the initial validation and all polling checks. The late-cmdline test
then fails the prevention assertion, not an incidental status assertion:

```text
AssertionError: Never send KILL after the confirmed child identity changes
actual:   ['-TERM 2473', '-KILL 2473']
expected: ['-TERM 2473']
```

The PID above belongs only to that synthetic test run. The actual SDK watcher
PID/stat/cmdline and journal were not retained in QA431; this is regression
protection, not proof of the SDK timeout's precise cause.

Final15-case test SHA256:
`79246de7fbbb4179328d0b2108a156f2ac8cb875884bf33f8fd8f9c7a04d3534`.
Exactly those bytes against ca21's old implementation:1pass/14fail,
47066.5379ms. Final candidate:15pass/0fail/skip/cancel,38136.1201ms.
Six mutants, including the targeted pre-KILL bypass, fail behaviorally.
Final nearby suite passes66/66. The normal suite passes3502/3502,
zero failures/skips/cancellations,41065.6614ms.

The tested working checkout's earlier source differed from its immutable Git
blob only in CRLF/LF line endings. Those earlier bytes are retained separately;
the checkout was canonicalized to the exact Git blob before all final runs.
The final source and test bytes are verified against the committed blobs and
against the baseline/mutant inputs. No logic changed during canonicalization.

All these tests use Bash, synthetic OS/SDK observations and a real owned test
child. They do not validate Android/mksh or device timing. The actual15s guest
and20s ADB limits, buffers, resources, renderer and acceptance assertions remain
unchanged. No SDK rerun was dispatched; the original ca21 archive and partial
trace are preserved. Native acceptance and historical ANR causes remain open.
