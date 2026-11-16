# Keyboard measurement fixture regression

Source `f9b0844a1f7f167d89c9f37fb1c7f1638a5a7965`, tree `a436806c1e6b874cb287187ac9b074679910a721`, QA run [38109842847](https://github.com/yarinn12/sogrim-hashbon/actions/runs/38109842847).

The native keyboard measurement was expanded to require the real Back and accessibility controls. The product wizard contains both controls, but the isolated DOM measurement fixture still supplied only a header, field and footer. This omitted consumer caused the same missing-boundary exception across desktop engines and mobile profiles. The fixture now supplies both required controls without changing the measurement function, acceptance thresholds or application code.

The existing behavioral test also covers the new boundary: an overlay over Back makes only Back unhittable, while accessibility remains hittable; removing it restores the entire original measurement. Field edge coverage, field center coverage and glyph/ancestor clipping checks remain intact.

Controlled replay removed only the newly supplied fixture controls, keeping the measurement and assertions unchanged. All four desktop engine projects failed with `Required keyboard boundary is missing: .expense-modal-header-actions .modal-section-back-button`. Exact restoration passed all four. Test bytes before and after restoration have SHA-256 `7ffbd2e633ce49efc180b4d5a94cfd04da22d3faa138114a4f6206a362fda3e0`.

The complete measurement file passed 16 desktop cases and 20 mobile cases, with zero retries. The old/restored control, receipt and logs are retained in the coordinating workspace outputs under `ios-header-fixture-*`; full desktop/mobile logs are `ios-measurement-header-fixture-f9-{fixed,mobile}-green.log`. These are local DOM-boundary checks. They do not accept the failed native SDK run: Android diagnostic compatibility and the iOS native-form deadline remain separately unresolved.
