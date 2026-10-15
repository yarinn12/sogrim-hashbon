# Android diagnostic observations v5 / envelope v2

This changes diagnostic tool contracts only. The application candidate remains
59b599c until a separate integration/release decision. A later diagnostic harness
must record its application source and tools commit separately. This source does
not dispatch CI, attach a profiler, change product/UI/ANR gates or publish a store
build. Native acceptance remains false in every diagnostic receipt.

## Finite observed cohort

Host version5 is `observed-owned-cohort-v5`, scope `observed-owned-cohort`.
Each frame fixes `inventory.cohort` as the sorted union of **before** and
**afterDiscovery**, with `cohortSelection: union-before-afterDiscovery`. Membership
is computed from inventories, before considering whether reads succeeded. The
consumer independently recomputes it; missing/shrunken/forged cohorts fail.

All four inventories remain. The initial cohort gets one counter pass, discovery
adds one pass for newly observed members, and closing identities are read only
for cohort members present in afterFinal. A surviving cohort member needs its
five actual counters and matching identities at the performed reads. Full/partial
records, malformed raw reads and all read/lifecycle errors remain. Existing
observed ENOENT departures remain explicit unknown/partial/verified departures;
live gaps, EACCES/EIO, malformed observations, observed identity reuse and counter
regression still fail. The counter pass is never retried or repaired.

TIDs first appearing in afterFinal or terminal are retained as
`coverage.observedOutsideCohort` and explicit lifecycle observations with null
identity/start/counters. They get no counter pass, closing identity, worker credit
or coverage credit in this frame. They cannot stop an otherwise valid window.
If a later frame includes them in its before/discovery union, they are measured
in that frame only. No start value, final identity or previous contribution is
invented. Read/identity records falsely supplied outside the cohort are rejected.

The summary counts cohort targets, all four accepted cohort classifications,
outside observations and samples with outside observations separately. Target
counts must equal the accepted classification totals. At least two complete
cohort frames and actual non-main cohort survivors are still required; a late
worker cannot replace them. History updates use actual cohort measurements.
Matching closed identities and unresolved unknown-TID returns observed within a
later cohort remain rejected. Outside numeric appearances alone neither update
counter history nor prove identity reuse.

`atomic`, `lifetimeCoverageProven`, `identityContinuityProven`,
`allThreadsCoverageProven`, and `rendererRoleProven` remain explicitly false.
`survivorsVerified` means records with matching identities at the reads performed,
for cohort TIDs numerically present at terminal. The finite observations cannot
prove that the same identity continued between/after those points, account for
every lifetime, or cover all threads. Another closing pass would merely move the
unobserved interval.

## Separate transport, observation integrity and capture window

The diagnostic envelope is explicitly version2,
`owned-transport-and-cohort-v2`. Start, host and finish producers are named
`owned-trace-start-v2`, `owned-host-observer-v2` and `owned-trace-finish-v2`.
Consumers reject older schema/producers; they do not reinterpret old receipts.

- `guestTransportComplete`: the guest start was owned and acknowledged, current
  ownership/path/inode checks passed, CLOSE_WRITE and watcher cleanup were
  acknowledged, actual pulled bytes/hash and structural framing passed, caps were
  respected, and no guest transport error occurred. Host failure has its own
  bucket. This is not a semantic scheduling/frame/losslessness guarantee.
- `hostObservationIntegrity`: the retained cohort sequence passes identities,
  counter/history/accounting/worker requirements, with no observation/global I/O
  failure. The journal is reserved exclusively; preexisting bytes are never
  adopted. Full appends have a byte-size acknowledgement. A running digest/byte
  count of the serialized acknowledged frames must match the final actual file
  hash/size, detecting partial, extra or same-length corrupt journal writes.
- `hostCaptureWindowComplete`: an integral host sequence continued until a stop
  request matching this source, random capture session, owner PID and start ticks
  was observed, and there is no window failure. A valid prefix can be integral
  while this flag remains false. A stop file created later cannot retroactively
  complete a stopped observer's receipt.

Host `observationErrors` and typed `windowErrors` retain separate causes; their
combined `errors` accounting is checked. Missing/invalid stop and duration expiry
are window failures. Malformed inventories, owner/counter failures, journal/write
errors and the storage caps still fail collection. The source/session-bound stop
is a cooperative control acknowledgement, not a claim of OS-level authentication.

`captureComplete` keeps its aggregate meaning. In a host summary it requires
observation integrity and the owned-stop window. In final trace diagnostics it
requires acknowledged overall start, all three component flags and no retained
startup/finalization errors. It is not renamed to mean transport alone. A complete
guest transport with partial/failed host collection still has captureComplete=false.
Both complete and partial diagnostic envelopes always have nativeAcceptance=false.
Original UI and full historical ANR checks run separately and still reject ANRs
despite later recovery or transport success.

The host64MiB/guest512MiB caps,1s interval,20min bound, guest close-write protocol,
existing deadlines, original ANR/UI gates and workflow are unchanged. Integrity
hashing/serialization bookkeeping does not add counter reads or drop records.

## OLD / FINAL and historical evidence

QA469/run38754139702/attempt1 sample421 is stored byte-for-byte, including its
newline:95,494 bytes, SHA256
`37e9cbd3f65f572db09bd53e2012b4e5ff475ccc910ec70d4ace33ce303b666a`.
Its inventories are215/215/215/216, with6047 first seen only at terminal. The
unchanged regression fails on59b/v4 at the coverage assertion and passes on v5.
All215 original counter rows, post-counter identities and closing identities
compare exactly. All four observed lists remain unchanged. The new cohort excludes
6047 from required reads but retains its actual numeric observation without credit.

This prospective frame replay does not make the historical stopped prefix window
complete. The actual v4 host summary is also retained unchanged and is rejected
by the new consumer. Actual QA469 ANR rows are a separately labeled derived
fixture; the original full evidence remains frozen outside the source tree.
QA469 still failed its177/216 matrix, two target-app FocusEvent ANRs and incomplete
host window. No old run is accepted, and no ANR/product fix is claimed here.

Legacy late-birth assertions change explicitly with the contract: an afterFinal
or terminal-only TID is now an outside-cohort observation, not a required unmeasured
member. Tests require its retention, zero reads/identity/counter invention and zero
worker credit. Existing live-gap, permission, malformed-read, reuse, monotonicity,
ownership, cap and ANR failures remain negatives. New tests cover future-frame
measurement, forged cohort/outside evidence, continued collection, prefix versus
owned stop, stale/malformed controls, corrupt/failed journal writes, old schemas
and guest-transport success alongside partial host collection and real ANR rows.

These are local synthetic protocol/collector tests plus replay of immutable
historical observations. They do not establish fresh emulator/device coverage,
an ANR remedy, a complete/lossless trace, production readiness or release approval.
