# Inherited Android preload in Capacitor plugin hooks

QA438 on `5580b795439c068f0b315bb99548d1a4e6d4f4d9` completed WWW bundling, then failed before APK/emulator startup. The inherited NODE_OPTIONS preload was also executed by `@capgo/capacitor-social-login`'s `capacitor:sync:before` Node hook. That child runs in its plugin directory. Resolving `android/app/build.gradle` against `process.cwd()` therefore attempted to read the nonexistent plugin-local path.

The preload now resolves the application Gradle file relative to its own checked-out module URL. The same build validation, real runtime-config functions, synthetic values and network refusal remain. No application version, compatibility guard, plugin hook or acceptance gate is weakened.

The normal-suite fixture copies the exact preload bytes into an isolated app layout and re-exports the real runtime-config implementation. It now executes one child from the exact plugin-directory shape as well as the existing 187/188/future-build, invalid-build and refused-network cases.

Evidence on 2026-10-12:

- Exact CI artifact 11761778505: 5,246 bytes; SHA256 `92b44de3cc22d0bfe9a5359c9e8c9a00a33eba3cff4fd6c2d44e9b7ef562bef5`. `www-build.log` shows successful bundling followed by ENOENT in the social-login hook. QA tools source was PR merge1584222f; app source5580b79. No emulator, trace, ANR or geometry acceptance exists for this job.
- Exact OLD preload5580b79 with the extended normal tests: 8 tests, 7 passed, 1 failed, 0 skipped/cancelled, 576.5384ms. The inherited plugin-directory case reproduces the same ENOENT.
- Final focused/nearby compatibility and isolated-fixture run: 17/17 passed, 0 failed/skipped/cancelled, 613.9313ms.
- Full local `npm run native:prepare` with the final synthetic preload and private environment autoload disabled passed, including Android, iOS and web Capacitor sync hooks and native-project finalization. This covers the complete previously failing preparation boundary; it is not APK, emulator, signature or store acceptance.
- The three generated tracked Capacitor dependency files were inspected and restored to the frozen source after this local preparation. No unrelated user changes were present in them before the run.
- A fresh full source-bound CI run is still required. Font30 passed on5580b79 and the large-text preflight reached the full mobile suite; those results remain historical after this fixture change.
