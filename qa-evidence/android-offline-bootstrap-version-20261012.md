# Android QA bootstrap follows the checked-out build

QA437 (run 38280270544, source `f9b055f00c92f16b8f0b879ab641dac389db2258`) failed in Android job 114916171127 before APK build or emulator launch. Its private synthetic config still supplied build 187, while `android/app/build.gradle` declared 188. The unchanged production bundle compatibility guard correctly refused the mismatch.

`scripts/qa/android-native-isolated/offline-build-config.mjs` now reads a positive safe integer versionCode from the checked-out application's Gradle file. Missing or invalid values abort the preload. Synthetic storage/auth values and refusal of requests outside `/api/config` remain in place. No production config, build compatibility guard, emulator acceptance, signing or networking policy was relaxed.

Evidence on 2026-10-12:

- Original failed artifact 11759984859: 4,981 bytes; ZIP SHA256 `a7eed7d840b7f2af48f6764a2412a599f76b16295e15c5e0fd9885083e3b669a`. `www-build.log` reports the exact update-policy mismatch. No emulator PID, trace, ANR result or geometry acceptance exists for that job.
- Added normal-suite behavioral cases execute the actual preload in isolated synthetic Gradle workspaces. Builds 187, 188 and a future 244 must produce a compatible runtime config; missing, zero and invalid values must fail; a non-config request must still be rejected.
- Exact OLD preload, before modification: 7 tests, 2 passed, 5 failed, 0 skipped, 478.1391 ms. Both newer build checks and all invalid-build checks rejected the old behavior.
- Final and nearby compatibility/fixture tests: 16 passed, 0 failed/skipped, 504.5203 ms.
- The real `scripts/build-native-web.mjs` completed locally with the final synthetic preload and private environment autoload disabled: `Native web bundle is ready in www/.` This is bundle preparation, not APK, emulator or store acceptance.
- `git diff --check` passed. A fresh complete source-bound CI run is required after integration with the remaining layout/fixture findings.

Local OLD/final logs remain outside Git in the main chat's outputs directory.
