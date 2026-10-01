# Android upload identity recovery guard — 2026-10-01

## Failure and cause

Base: main at `3bf5bda5749408e205421cb153d436ed0716f6e6`.

The repository already records separate Upload and Google Play signing
certificates. `setup-android-upload-key.mjs` rejected one missing external file,
but treated two missing files as a new app. It generated a replacement key and
rewrote the recorded Upload certificate and App Links. It also rewrote those
public files when an existing external key had a different certificate.
The APK/AAB build errors recommended that setup command unconditionally.

## Change

- Refuse key creation when either public certificate is recorded and external
  signing material is missing. Refuse before any keytool invocation or write.
- Refuse a different external Upload certificate before updating public files.
- Keep first-key bootstrap for an app without a recorded signing identity,
  matching-key reuse, and the existing incomplete-pair rejection.
- Direct missing-key operators to restore the original matching pair. The
  Gradle change updates only the failure message; versions, package, signing
  configuration and real certificate/App Links files are unchanged.
- Document the Console metadata needed before deciding a version or recovery
  route; do not infer publication or request a key reset.

## Behavioral evidence

`tests/androidUploadKeyIdentity.test.mjs` runs copied production scripts in
temporary synthetic projects. A subprocess preload replaces keytool/process
calls with a fake signer; it never runs keytool or generates a real key. The
fixtures have explicit external paths, synthetic credentials and a sanitized
environment. Assertions inspect output files and captured operations.

Before the source fix, 5/9 cases failed: both documented-identity cases created
a replacement keystore, the mismatched-key case changed the recorded Upload
certificate and App Links, and both build errors omitted recovery guidance.
The matching-key, new-app and incomplete-pair cases already passed.

After the fix, all nine cases pass, including unchanged public files and no
keytool invocation on missing existing material. The focused regression plus
Android security, private custody, Java, native foundation and source
fingerprint tests passed 30/30. `npm test` passed all 3,108 unit/integration
tests and JavaScript syntax checks, with no failures or skips. `git diff
--check` passed.

No real signing material was read, generated or changed. No native build,
cryptographic key validation, physical-device test or Play Console action was
performed. The real Upload key/configuration and current Console metadata are
still needed for the next signed Android release.
