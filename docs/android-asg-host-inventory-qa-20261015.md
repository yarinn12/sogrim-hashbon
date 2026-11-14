# ASG and complete host scheduler inventory — QA candidate

Base: `ac50be0e2af336f007b1ab2f702339eb1cebaf27`, tree
`b05d47ceb919cf016b3a85344e95a68f6483d363`. This changes isolated emulator QA only.
Application behavior, APK runtime code, measurements and ANR gates are unchanged.
No push, CI activation or Native rerun is authorized by this preparation.

The prior one-shot diagnostic failed overall. PIPE stopped before installation
after an unrecognized empty status255 boot probe. ASG passed 216 matrix, 313 page
and 8 journey checks with complete zero-target-ANR history, but host scheduling
capture was incomplete. Its 506 samples selected only the main emulator thread;
observed names included an empty string and no renderer name. This is one favorable
ASG observation, not a valid causal A/B result or proof that the ANR is fixed.

## Explicit ASG preparation and readback

The original AVD configuration receives only `hw.gltransport=asg`. GPU remains
SwiftShader/GLES, Vulkan inactive, with the same image, DMA flags, CPU/RAM and
buffer defaults. No alternate transport or graphics path is selected on failure.

Before boot, the new guard reads the actual installed hardware schema. ASG must
be advertised and buffer defaults must equal 1048576/4096/32768/800. The schema
SHA256 and original renderer SDK receipts are bound to the source/device/AVD.
Verification requires the same bytes after boot, effective host configuration and
both actual guest transport properties. Conflicting legacy properties, a changed
EGL/gralloc path, HWUI mode, renderer, Vulkan activation or buffer value fail.
The existing strict DMA/SwiftShader checks remain.

Guest property reads use the exact SDK ADB path, explicit serial, 20-second command
bound and emulator PID/startTicks checks before and after every read. Readbacks
and ownership failures are retained. These checks precede trace start and all
measurement stages. They establish selection evidence; per-command stream
execution and exact guest binary/source equivalence are not claimed.

## Host inventory and scheduler completeness

`sampleOwnedHost` reads every numeric TID in the verified emulator's task directory,
including unnamed and differently named threads. Every retained counter record
includes the emulator PID/startTicks and task TID/startTicks, real CPU ticks,
schedstat run time, runqueue time and timeslices. The task identity is re-read
after scheduler reads. The emulator owner is checked at both sample boundaries.

The inventory is listed before and after the sample. Additions, removals and
within-read TID reuse are explicitly recorded as lifecycle events. Unknown read
errors remain errors and are not relabeled as benign exits. Missing/invalid CPU,
scheduler or identity data, permission failures and lifecycle gaps make scheduler
coverage incomplete. No zero or final counter is invented. A reused TID's new
startTicks forms a distinct lifetime; counters may not decrease within one lifetime.

This is conservative: even natural churn during a sample leaves it incomplete.
Separate one-second snapshots cannot observe a thread born and dead entirely
between polls and do not establish a lifetime event trace. Every coverage claim
is limited to the observed inventories and identity-verified scheduler samples.

A real `wchan=0` is preserved and reported as wait-channel unavailable, just as
the original tool reported it. It is not by itself a scheduler-counter gap. Other
wait-channel read errors remain explicit failures. `kernelWaitChannelsComplete`
continues to describe this optional wait-channel coverage separately.

Capture completeness requires at least two complete inventories, real non-main
task samples and matching coverage counts. The finisher also checks the summary's
owner and coverage contract. `rendererNames` is descriptive only;
`rendererRoleProven=false` remains explicit. Full task scheduling evidence replaces
the invalid assumption that a renderer must carry a particular name.

The original one-second interval, 20-minute observer duration, 64MiB host cap,
512MiB guest cap, trace buffers, command deadlines and ANR/history gates remain.
The byte cap is checked before appending a full sample; hitting it records a cap
failure, not a truncated successful sample. All-task capture is larger and can hit
the unchanged cap earlier. Read count, scanned/selected task count, CPU, RSS and
maximum sample duration remain reported so actual CI overhead can be reviewed.

## Regression and review boundaries

The normal-suite regression invokes actual `sampleOwnedHost` against a synthetic
proc tree containing a main task, unnamed task, ASG-like name and unrelated name.
The immutable ac50 implementation retains 1/4; this candidate must retain all four
with their exact real fixture counters. This is an observer regression, not an ANR
reproduction. Controls cover ownership, lifecycle, reuse, permission failures,
unknown errors, missing/malformed counters, complete inventories and the byte cap.

Existing trace protocol tests now supply the stronger host-summary contract and
expect two extra task-identity reads. Their original close-write, failure, source,
ownership and cleanup assertions remain. The original matrix/pages/journey,
font/geometry measurements, Launcher preparation and historical ANR collection
are not modified. Vercel deployment is disabled for the candidate branch.

The actual prior ASG host lines are retained as a small fixture. Primary AOSP
reference code passes an optional name to an ASG RenderThread and creates a
RingStream consumer; it does not prove renderer roles for unnamed runtime TIDs.
[RenderThread](https://android.googlesource.com/platform/hardware/google/gfxstream/+/refs/heads/main/host/RenderThread.cpp)
and [consumer creation](https://android.googlesource.com/platform/hardware/google/gfxstream/+/refs/heads/main/host/RendererImpl.cpp).

Local tests validate the covered contracts. The candidate still needs Root/QA
review and full exact-source CI/Native verification before any release decision.
