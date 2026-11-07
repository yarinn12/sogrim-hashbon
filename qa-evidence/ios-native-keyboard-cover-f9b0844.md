# Native keyboard header cover

The actual iOS artifact for source `f9b0844a1f7f167d89c9f37fb1c7f1638a5a7965`, tree `a436806c1e6b874cb287187ac9b074679910a721`, shows Back and accessibility hidden under a white strip while the amount field and real UIKit keyboard are visible. Artifact `11691740122` was downloaded and verified: 76,844,795 bytes, SHA-256 `d30984857a4170ad14f13b8413784036c5a515cc5c3c6957f7f2c165eef5ee74`.

The backdrop's white `::after` had z-index 7. The header formed a stacking context at z-index 5, so its buttons stayed underneath the strip even with their own z-index 8. Moving the existing strip into the header keeps it below the header's buttons. No acceptance threshold or keyboard geometry budget changes.

The permanent browser regression models the observed 393×793 layout, 417-pixel visual viewport, 59-pixel safe area and modal scrolling of at least 102 pixels. It checks normal and AX font sizes, field/Next/button bounds, actual accessibility and Back clicks, and the painted order. A temporary hit-test probe enables pointer events on the existing pseudo-elements without changing their layout or paint order; this catches the white overlay that ordinary production hit-testing misses because the cover has `pointer-events:none`.

With the final test and original f9 CSS, normal text fails on the backdrop covering the controls; AX already passes. The exact restored fix passes both. Final test SHA-256: `501ab183f567a9ba39ba0c78f9d787bf9c23e3b3e536ecb9c22edb317a7a3b1b`. Restored CSS source SHA-256: `3cb7eda96390f56eeb4e01d41338c65e50aa0f3b66f061de348024c76809d6b3`. Owner commit `7338a93868198c4d15acd1bb392a5d4d17349b40` was integrated as `412ccb0`.

Those restoration hashes describe the owner's unchanged raw files. Windows checkout line-ending conversion produces different raw hashes in the coordinating checkout. Both checkouts have identical Git file contents: test SHA-256 `50ce7b3c4d800c185319de1741bd815236170f514b80bae465170409b0df35ee` and CSS source SHA-256 `a78bd04f7017e1f5e76597fe53f118c602bf2d029b40bf5f3d4212ea2ec50e94`.

Owner validation: 28 nearby Android Chromium/iPhone WebKit cases and 3,463 normal tests passed. The initial restricted-sandbox EACCES/EPERM run is retained as an environment failure, not behavioral RED. Coordinating workspace and design evidence retain the original UIKit screenshot, baseline/fixed screenshots, exact-source backup and logs.

This fixes the reproduced cover. It does not establish the cause of the separate native-form timeout before rotation/tap/typeText. The native status journal records a 28.694-second AX main-run-loop response delay and late keyboard-ready publication. Fresh native SDK acceptance is required, including normal/AX, real input, acknowledged save and relaunch.
