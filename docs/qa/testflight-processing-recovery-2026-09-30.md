# TestFlight processing authentication regression

The 4.52 (182) upload completed, but workflow run [36582156705](https://github.com/yarinn12/sogrim-hashbon/actions/runs/36582156705) failed while querying processing state with HTTP 401. The same signed build later reached VALID and was recovered without another upload.

## Cause and change

The upload action [creates a token once before uploading](https://github.com/apple-actions/upload-testflight-build/blob/v5/src/backends/appstore-api.ts) and passes that token into the entire processing poll. Its [default validity is 600 seconds](https://github.com/apple-actions/upload-testflight-build/blob/v5/src/auth/jwt.ts). Delayed Apple processing outlives that token.

The existing action now uploads only. A required repository-owned completion step signs each API request with a fresh short-lived token, waits for the exact app/version/build to become VALID, and saves and reads back the Hebrew release notes. Invalid builds, persistent authentication failures, timeouts and missing metadata acknowledgements still fail the workflow. Encryption is read from the signed app and verified rather than declared twice.

The manual **Complete existing TestFlight upload** workflow runs the same completion script for an already uploaded build. It does not rebuild, upload another binary, modify sign-in credentials, add testers or submit an App Store review. Explicit version/build inputs prevent recovering an unintended build. Historical versions also require explicit release notes.

## Regression evidence

`tests/appStoreRelease.test.mjs` uses a simulated Apple API, a real generated P-256 signing key and a virtual clock. The primary regression waits more than 21 minutes, including delayed build visibility, then checks the exact saved notes and final acknowledgement. A controlled copy retaining the initial token fails with HTTP 401 after ten minutes. The production implementation passes the same test by renewing request authentication.

Ten tests cover long processing, signatures and token claims, bounded 401 retry, failed/invalid processing, timeout, wrong version, idempotent recovery, preserving other locales, concurrent note creation, unsuccessful persistence, API destinations and invalid input. The existing workflow test requires the completion step after upload and forbids ignoring its errors.

Local verification: 16 focused tests and all 3,089 normal unit/integration tests passed, with zero failures or skips. The changes affect release automation only; app source, native versions and user authentication configuration are unchanged.

The original failed run remains historical evidence. New completion runs and their `testflight-completion.json` artifact provide independent, explicit verification rather than relabeling that failure as success.
