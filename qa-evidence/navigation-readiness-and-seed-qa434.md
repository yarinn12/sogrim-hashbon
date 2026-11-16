# QA434 home readiness and acknowledged navigation fixture

QA434 on `2c5a4ad1b2bdc7248ca6be8a9161e825e1c03296` rejected two flaky
Firefox cases: the accessibility XL keyboard preflight waited for
DOMContentLoaded, and unavailable-event feedback waited for load. In both
original failure screenshots, home was already visible. The traces contain no
recorded network failure; the exact Firefox internal cause remains unproved.

The final keyboard scenario deliberately holds an unrelated deferred script;
the final feedback scenario holds a nonessential hidden image. Both require
that the resource was actually requested and that its readiness boundary is
still pending, then continue from a fresh, visible home. Existing field,
geometry, click, permission and timeout assertions remain unchanged. Resources
are released in `finally`; no navigation error or expired UI budget is ignored.

The exact final scenarios were copied without changing their bytes. Restoring
only each original navigation operation makes all eight controls fail at
`page.goto` in Chromium, Firefox, WebKit and compact Firefox. The final
implementation passes all eight with zero skips, retries or flaky results.
Both sides use the same stricter 30-second control scenario budget; the old
preflight's own 15-second navigation timeout remains unchanged.

The original navigation seed PUT also returned HTTP 400 because its friend
contact lacked an ID. This is a separate fixture error, not the demonstrated
cause of the goto stall. The fixture now has a stable contact ID and requires
a successful PUT acknowledgement plus an exact GET of the retained state.
Removing only that ID from the same final spec makes all four engine controls
fail at the seed acknowledgement, with `Invalid state payload`; the corrected
four cases pass. Local cache alone cannot conceal a rejected server seed.

All 99 nearby cases pass after the final seed change: both full specs across
five mobile profiles and both Firefox profiles, plus their existing readiness
controls for hidden, stale, late, HTTP-error and rejected-navigation states.
No product file, native XCTest tap, SDK acceptance deadline or retry policy
changes in this patch. The normal suite is required again on the final unified
source before publication; its exact source and logs belong in the handoff.

Normal entry points are `npm test`, `npm run qa:cross-platform` and
`npm run qa:mobile`. The two final held-resource scenarios remain in their
ordinary specs. Seed ACK/GET checks run before every navigation inventory case.
These controls prove the covered readiness and seed errors; they do not prove
that every earlier native stall or Firefox implementation issue is resolved.
