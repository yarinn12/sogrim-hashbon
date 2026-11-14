# Unified release follow-up regressions

The application baseline is `92cc45ce4ad45cf99d443ee2ead1bcb58375d727`, tree `23ae0378c502eaebe576a58f925904690a6583fe`. QA439 (38284309199) is an OLD receipt for the changes below. Its Linux and Windows suites passed 3,639/3,639, font provenance passed 9/9, and authentication-return, two-client synchronization, Android native and backup runtime passed. Its aggregate release gate failed.

## Event navigation and management copy

At 320 px with 32 px text, the long shared-notes tab label pushed its SVG over the summary tab. The notes tab was at x=17–107, but its icon extended to x=153–174 and intercepted the summary tab's center at x=115–205. The portrait close-event test failed its original hit assertion. The compact visible word is restored to `פתקים`; the shared-notes heading and full accessible label are retained. The hit assertion remains and now attaches bounds and the actual hit owner.

The management explanation was intentionally expanded in commit 75056080. The old exact-copy expectation is updated to that approved explanation; complete copy, natural whole-word wrapping, line count, scrolling and touch assertions remain.

OLD: three related cases failed locally on the baseline and in QA438/439. Isolated final: 3/3 focused reflow, 15/15 nearby browser checks across reflow, iPhone WebKit and large text, 107/107 nearby Node checks, and 3,639/3,639 Windows normal tests. Patch SHA-256: `44053237ef7e3c7915b7d49052e0145abd617040d56bd42d4941dec8304b75e9`.

## Service worker activation with unsaved drafts

The former test used `framenavigated` as proof of a new document. Same-document SPA navigation also emits that event, while automatic replacement is deliberately deferred for an open editor. Both note cases timed out waiting for the prohibited reload; the edited-expense case attempted to reopen from the home screen after a same-document route change.

The corrected fixture requires the new cache, removal of the previous cache and a changed worker controller. It checks unchanged `performance.timeOrigin`, editor value and durable draft payload during activation, then explicitly reloads, requires a new document, resumes the actual editor and retains save, draft-removal, duplicate-note and final reload assertions.

OLD failures were reproduced on the baseline. Isolated final: 3/3 draft cases and 1/1 nearby worker-recovery case. Patch SHA-256: `c9298d4b23f08795dc41800fa97c535017552178ec55d0d2bd0d43da8a5bab70`. This local-mode fixture proves local draft and saved-state behavior; it does not claim server acknowledgement or cloud synchronization.

## iOS visual viewport and keyboard mapping

The original iOS QA439 artifact (11764110303) is 67,979,453 bytes with SHA-256 `2690dbd760d1a3b4470011a24c652604d265d8e56a7cd86122ec8c13e2d7f178`. Its default keyboard-name record had `offsetTop=196`, `scrollY=196`, native content offset 196, visual height 449 and keyboard top 449. The validator counted focus scrolling twice and calculated 645. Field, Next, header and native hit bounds passed. Three diagnostic readbacks independently measured `pageTop=196`.

Future acceptance captures `visualViewport.pageTop`. The validator uses that document-space origin and requires either the standard origin relation or the measured WKWebView focus-scroll relation. Older sealed records may use `scrollY` only when it agrees with `offsetTop`; unsupported independent panning without `pageTop` fails. Keyboard-boundary tolerance remains one point, with field/header/native/hit/input/save/ACK assertions retained.

OLD validator: exact original artifact failed at line 183 with exit 1; two new positive controls reproduced it. Final validator: original artifact and earlier 2f81 artifact passed with exit 0, 47/47 controls and 12/12 nearby iOS source checks passed. Patch SHA-256: `35be164d109fbd81bfb81f1709d948c3f1420d4f88f86a7315bdd4c0abc50076`. Controls run before simulator acceptance in the existing mandatory iOS native workflow. Fresh CI must verify the new capture field.

## iPad permission status geometry

The original participant-roster fixture limited status height from the message text alone. On iPad the text is 19.25 px high, the retry target is 44 px high and padding plus borders adds 18 px: the correct unchanged product height is 62 px. The old test failed at 62 versus 44 on the exact QA439 source. OLD and FINAL screenshots are byte-identical because no product change was needed.

The existing test now includes the retry target in its content bound, caps vertical chrome at 18 px, checks full permission text without clipping, bounds the status within its modal, and requires an enabled, hittable 44 px retry target with a real tap/click. The pending-status silence and body-gap guards remain. Injecting 40 px padding fails the new chrome guard at 82 versus 18; the injection was reverted.

Isolated final on the combined application source: iPad focused 1/1, five mobile/reflow profiles 5/5, iPad mobile-layout 37 passed with one existing scope skip, normal Node 3,639/3,639 with no skips/failures (109,208.3913 ms). Patch SHA-256: `115d9c419d9122fc672fab505e1bfb74232cb13a641e72e95d317ccaa1a781bd`.

## Combined acceptance boundary

After integrating these changes locally, the coordinator passed 64/64 nearby Node cases with no failures/skips/cancellations (9,334.135 ms), and 47/47 Python acceptance controls. Syntax and diff checks passed. The coordinator's combined Playwright attempt did not reach test execution after web-server startup and was stopped; it is not a pass.

QA439 completed with six known failures in Android mobile (322 passed, 10 existing scope skips), iPhone WebKit (328 passed, four scope skips) and reflow (316 passed, 16 scope skips). iPad had seven failures (330 passed, one scope skip), adding the corrected participant permission-status geometry fixture. Cross-platform and large-text jobs hit their existing time budgets after known failures; timeouts have not been raised. The whole-phone preflight separately passed 8/8 at both 32 and 37.64706.

A new complete source-bound CI run is required after all fixes are integrated. Previous artifact acceptance does not establish acceptance for the new source. Physical iPhone testing remains unavailable. Database backup/restore, hosted Auth/RLS and the three required production migrations remain release prerequisites; no production or store publication is performed by these patches.
