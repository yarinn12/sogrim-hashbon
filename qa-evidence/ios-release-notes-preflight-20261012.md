# iOS artifact-only release notes preflight

Application source remains bf254b5235deb706234b00362e6eaea78e129e98 / tree 4a208e596cbaf0576cccd7f67fc99a665287836d. All four exact-source CI workflows passed on their first attempt before signing was requested.

OLD: signing preparation run 38304663467 on tools 7d374e8 failed in the unchanged application configuration validator with `IOS_RELEASE_NOTES is missing or invalid`. Exact source/CI and the read-only unused-build/unused-artifact gates had passed. No native preparation, archive, export, encrypted release artifact or Apple upload occurred.

FINAL: a release-tool helper reads the public version 4.58/build 193 notes from the frozen application metadata and writes the validated multiline value to GITHUB_ENV before the configuration validator. Bundle, version, build, length and environment delimiter are checked. No application code, credentials, signing guards or CI policy changes.

Focused controls reproduce OLD failure and pass the unchanged application validator with FINAL delivery; 8/8 controls include wrong identity, empty/oversized notes and delimiter injection. Existing 39 Node and 18 Python artifact/source controls are rerun separately. Their synthetic configuration values establish validator behavior only, not signing validity. Actual signing still requires successful macOS execution and the original artifact verification.
## Retained automated controls

The eight release-notes controls are retained in tests/ios-signing-release-notes.test.mjs, discovered by the normal Node test suite and explicitly run before Apple keys in the prepared release workflows. IOS_RELEASE_SOURCE_DIR selects the frozen application checkout on CI; the test uses synthetic signing configuration and does not read real credentials. This follow-up does not change the completed original signing run 38307202558 on tools 931dcfa or its retained encrypted artifact.
