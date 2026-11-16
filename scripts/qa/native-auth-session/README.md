# Native authentication return regression

The iOS authentication return QA workflow builds the current application with
the real Capacitor and Apple SDK on an isolated iPad simulator. The fixture
replaces only the external authorization page with a local redirect server and
account APIs with synthetic data. Production plugin registration, callback
transport, flow validation, PKCE exchange, final account write and persistence
after termination/relaunch are exercised. The canonical HTTPS return reaches
the deployed fixed-destination relay; no real account or snapshot is written.

The fixture seals its synthetic runtime bootstrap on every WebView reload and
rejects unexpected Supabase origins. A failed or empty native result fails the
test. Authentication assertions must not be relaxed to accept a login screen.
This verifies the OS return boundary; it does not perform Apple authentication
or Face ID and does not replace the TestFlight real-device acceptance check.

Baseline evidence: build190's Safari path left the account signed out with zero
PKCE exchanges. The attempted HTTPS session path also did not complete in an
unsigned simulator. A production-origin/CDN probe separately showed the origin
had the new webcredentials service while Apple's six-hour-cached copy did not.
The custom-scheme OS session avoids that deployment/cache dependency on all
supported iOS versions. It remains bound to the originating flow and accepts
only a single code or error from the registered callback.

The probe's optional before/legacy modes are retained for isolated comparisons;
normal CI uses custom mode with the shipping transport unchanged. The initial
local HTTP URL exists only in the test copy; production uses Supabase HTTPS.

Build-for-testing and test-without-building explicitly select the same
iphonesimulator SDK, Xcode, scheme, Debug configuration, owned simulator UDID
and derived products. The SDK flag states the configuration consistently; it
is not evidence that an omitted flag caused a previous destination failure.
Apple's TN2339 documents the scheme-based two-stage flow and requires existing
build products for test-without-building:
https://developer.apple.com/library/archive/technotes/tn2339/_index.html
The Base SDK is described in Apple's build settings reference:
https://developer.apple.com/documentation/xcode/build-settings-reference

Only after failure, the workflow captures device/runtime/type inventories and
both implicit-SDK and explicit-simulator destination listings. Each log records
the owned UDID, command, UTC start/end and exit status, including failed queries.
The queries run after the failed journey, never as a warm-up, fallback or test
retry. They preserve the original failure and do not establish Native success.
The real SDK/OS scenario and all original assertion/time budgets remain required.
The failure-only capture step has a separate five-minute cap within the existing
35-minute job limit, so destination discovery cannot run indefinitely.
