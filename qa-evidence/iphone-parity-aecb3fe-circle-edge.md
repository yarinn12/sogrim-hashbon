# Source/WWW circle-edge paint evidence

Captured 2026-10-11. This note records the preserved discrepancy and subsequent controls; it does not turn the original failing comparison into a pass.

## Immutable input and scope

- Source commit: `aecb3fe946ca25408b60851f791918e8c5b17c7c`
- Source tree: `97d2ca554501ea0db4e8fcd7aa342ca303118297`
- The WWW directory was rebuilt from that source and kept unchanged throughout these reads. The comparison used synthetic local state, a local source server, and a static WWW server with the same injected runtime configuration. It is browser readback evidence, not a Native or physical iPhone result.
- Browser profiles: iPhone 15 viewport at 3 device pixels per CSS pixel, normal text, Chromium and WebKit, each with plain CSS and an added `native-app` class fixture. Service workers were blocked; Rubik and Inter loaded; live animations were paused at time zero and screenshots disabled animations.
- Primary helper: `C:\Users\A\Documents\Codex\2026-10-02\new-chat-4\outputs\check-iphone-parity-final-www-frozen-motion.mjs`
- Primary artifacts: `C:\Users\A\Documents\Codex\2026-10-02\new-chat-4\outputs\iphone-parity-aecb3fe-www-readback-frozen-motion-primary`
- Repeat helper: `C:\Users\A\Documents\Codex\2026-10-02\new-chat-4\outputs\check-aecb3fe-www-repeat-paint-probe.mjs`
- Repeat artifacts: `C:\Users\A\Documents\Codex\2026-10-02\new-chat-4\outputs\iphone-parity-aecb3fe-www-readback-frozen-motion-repeat-paint-probe`
- Independent eight-context control: `qa-evidence/iphone-parity-aecb3fe-www-readback-frozen-motion-circle-contexts-preserved/`. Its helper is `qa-evidence/scratch-circle-contexts.mjs`; it alternates four fresh source and four fresh WWW Chromium/plain contexts on ports 4342/4343. These ports and the state file are isolated from the root checks. Compared with the primary helper, it selects only Chromium/plain CSS, repeats the source/WWW sequence four times, uses unique file names, and omits a clean-status assertion that the restricted read-only checkout could not satisfy. Browser setup, capture method, product bytes, and WWW bytes are unchanged.

## Exact and nonexact observations

The primary run has identical markup, style, and geometry for all 13 visible SVGs in every source/WWW pair. The accessibility button itself has identical markup, a 48×48 CSS-pixel box at `(62, 10)`, `border-radius: 50%`, `border-color: rgba(11, 74, 56, 0.16)`, white background, and the same computed box shadow. Hover and focus are false, its transform is `none`, and every non-custom computed property captured by the helper matches. No selector for an accessibility-button pseudo-element was found in the source styles. These are component and geometric parity observations; they are not proof that the pixels always match.

| Pair | Primary source/WWW pixel result | Repeat probe source/WWW pixel result |
| --- | ---: | ---: |
| Chromium, plain CSS | **149 differing pixels** | 0 |
| Chromium, `native-app` fixture | 0 | 0 |
| WebKit, plain CSS | 0 | 0 |
| WebKit, `native-app` fixture | 0 | 0 |

The primary Chromium/plain difference is confined to image pixels `x=186..323, y=36..168` in a `1179×1977` PNG, along the antialiased perimeter of the circular accessibility button. The changed pixels lie about 67.7–73.1 physical pixels from its center `(257, 101)`; the maximum individual channel difference is 11, with most changed channels differing by one. The source PNG in the primary run and source PNG in the repeat probe are byte-identical. The **primary WWW PNG is different**; the repeat WWW PNG matches both source PNGs. The repeat probe's two additional captures per page remain identical to their first capture. All 12 Chromium PNGs have one hash and all 12 WebKit PNGs have another; each source/WWW pair is exact. The independent eight-context Chromium/plain control produced eight more byte-identical PNGs, including four fresh WWW contexts.

The CSS custom properties are textually serialized differently in source and minified WWW (for example `rgba(...)` versus equivalent eight-digit hex), but no winning non-custom button property differs. The differing custom-property serialization has not been shown to cause the observed pixel change. A one-time rasterization or compositing variation is an inference consistent with the localized antialiasing and non-reproduction; the mechanism is **unproven**. There is no deterministic producer/CSS change justified by this evidence. The original 149-pixel failure must remain in the record, and the repeat run must not be used as retry acceptance, a mask, or a relaxed tolerance.

## SHA-256 of each retained PNG

`C` = `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee`

`A` = `84840caedbf650624e3b175dc8b4003ec69222648e05c600e89959a6b23510c3`

`W` = `4f6c7b9edf8e1f0f8e54e4e49edb50a8da2856006a55d3db48ea66f8bd73019c`

### Primary artifact directory

| PNG | SHA-256 |
| --- | --- |
| `chromium-false-source.png` | `C` |
| `chromium-false-www.png` | `A` |
| `chromium-true-source.png` | `C` |
| `chromium-true-www.png` | `C` |
| `webkit-false-source.png` | `W` |
| `webkit-false-www.png` | `W` |
| `webkit-true-source.png` | `W` |
| `webkit-true-www.png` | `W` |

### Repeat-paint artifact directory

For each `native` value `false` and `true`, and each `mode` value `source` and `www`, these three distinct PNGs were retained: `ENGINE-native-mode.png`, `ENGINE-native-mode-repeat1.png`, and `ENGINE-native-mode-repeat2.png`. Every one of the 12 `chromium-*` PNGs has SHA-256 `C`; every one of the 12 `webkit-*` PNGs has SHA-256 `W`. This naming rule enumerates all 24 PNGs in that directory.

### Independent fresh-context artifact directory

| PNG | SHA-256 |
| --- | --- |
| `chromium-false-source-1.png` | `C` |
| `chromium-false-www-2.png` | `C` |
| `chromium-false-source-3.png` | `C` |
| `chromium-false-www-4.png` | `C` |
| `chromium-false-source-5.png` | `C` |
| `chromium-false-www-6.png` | `C` |
| `chromium-false-source-7.png` | `C` |
| `chromium-false-www-8.png` | `C` |

The three `readback.json` SHA-256 digests are, respectively, primary `98da45fcdd9e95abd0df0a0771e9ab39bdbd87c3bb6dcf361dbb7453e44bd273`, repeat `74df673ced5b6f71768a471c8c4a692c36a301a40c774040b2a34d57b436539b`, and independent control `924477af02e86a3bead57e9e330b727d259d85dce3ee267eb34f69ae9c28f7fe`.

### Expanded per-PNG hash manifest

The rows below expand the filename patterns above; hashes are over the retained file bytes.

| Artifact | PNG | SHA-256 |
| --- | --- | --- |
| primary | `chromium-false-source.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| primary | `chromium-false-www.png` | `84840caedbf650624e3b175dc8b4003ec69222648e05c600e89959a6b23510c3` |
| primary | `chromium-true-source.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| primary | `chromium-true-www.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| primary | `webkit-false-source.png` | `4f6c7b9edf8e1f0f8e54e4e49edb50a8da2856006a55d3db48ea66f8bd73019c` |
| primary | `webkit-false-www.png` | `4f6c7b9edf8e1f0f8e54e4e49edb50a8da2856006a55d3db48ea66f8bd73019c` |
| primary | `webkit-true-source.png` | `4f6c7b9edf8e1f0f8e54e4e49edb50a8da2856006a55d3db48ea66f8bd73019c` |
| primary | `webkit-true-www.png` | `4f6c7b9edf8e1f0f8e54e4e49edb50a8da2856006a55d3db48ea66f8bd73019c` |
| repeat | `chromium-false-source-repeat1.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| repeat | `chromium-false-source-repeat2.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| repeat | `chromium-false-source.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| repeat | `chromium-false-www-repeat1.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| repeat | `chromium-false-www-repeat2.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| repeat | `chromium-false-www.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| repeat | `chromium-true-source-repeat1.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| repeat | `chromium-true-source-repeat2.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| repeat | `chromium-true-source.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| repeat | `chromium-true-www-repeat1.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| repeat | `chromium-true-www-repeat2.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| repeat | `chromium-true-www.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| repeat | `webkit-false-source-repeat1.png` | `4f6c7b9edf8e1f0f8e54e4e49edb50a8da2856006a55d3db48ea66f8bd73019c` |
| repeat | `webkit-false-source-repeat2.png` | `4f6c7b9edf8e1f0f8e54e4e49edb50a8da2856006a55d3db48ea66f8bd73019c` |
| repeat | `webkit-false-source.png` | `4f6c7b9edf8e1f0f8e54e4e49edb50a8da2856006a55d3db48ea66f8bd73019c` |
| repeat | `webkit-false-www-repeat1.png` | `4f6c7b9edf8e1f0f8e54e4e49edb50a8da2856006a55d3db48ea66f8bd73019c` |
| repeat | `webkit-false-www-repeat2.png` | `4f6c7b9edf8e1f0f8e54e4e49edb50a8da2856006a55d3db48ea66f8bd73019c` |
| repeat | `webkit-false-www.png` | `4f6c7b9edf8e1f0f8e54e4e49edb50a8da2856006a55d3db48ea66f8bd73019c` |
| repeat | `webkit-true-source-repeat1.png` | `4f6c7b9edf8e1f0f8e54e4e49edb50a8da2856006a55d3db48ea66f8bd73019c` |
| repeat | `webkit-true-source-repeat2.png` | `4f6c7b9edf8e1f0f8e54e4e49edb50a8da2856006a55d3db48ea66f8bd73019c` |
| repeat | `webkit-true-source.png` | `4f6c7b9edf8e1f0f8e54e4e49edb50a8da2856006a55d3db48ea66f8bd73019c` |
| repeat | `webkit-true-www-repeat1.png` | `4f6c7b9edf8e1f0f8e54e4e49edb50a8da2856006a55d3db48ea66f8bd73019c` |
| repeat | `webkit-true-www-repeat2.png` | `4f6c7b9edf8e1f0f8e54e4e49edb50a8da2856006a55d3db48ea66f8bd73019c` |
| repeat | `webkit-true-www.png` | `4f6c7b9edf8e1f0f8e54e4e49edb50a8da2856006a55d3db48ea66f8bd73019c` |
| eight-context | `chromium-false-source-1.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| eight-context | `chromium-false-source-3.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| eight-context | `chromium-false-source-5.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| eight-context | `chromium-false-source-7.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| eight-context | `chromium-false-www-2.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| eight-context | `chromium-false-www-4.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| eight-context | `chromium-false-www-6.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| eight-context | `chromium-false-www-8.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |

## Same-page origin-order control

The later read-only helper `qa-evidence/scratch-same-context-paint.mjs` used one Chromium iPhone 15 plain-CSS page and one browser context. It navigated source → WWW → source → WWW against the same frozen `aecb3fe` tree, with a first and unchanged second screenshot after each navigation. It used isolated ports 4344/4345, the same synthetic state, loaded fonts, paused animations at zero, and disabled screenshot animations. The resulting files are retained in `qa-evidence/same-context-aecb3fe/`.

Each of the four navigations exposed 13 visible SVGs. The accessibility button's markup, geometry, main computed properties, ancestor presentation, and `::before`/`::after` computed presentation matched across all steps; both pseudo-elements reported `content: none`. All eight PNGs were byte-identical to the canonical Chromium hash `C`, including both WWW visits. Thus neither fresh-context switching nor source/WWW order in a single page reproduced the original 149-pixel anomaly. This control does not identify a renderer/compositor trigger or turn the original failing capture into an accepted pass.

| Same-page PNG | SHA-256 |
| --- | --- |
| `1-source-first.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| `1-source-unchanged-second.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| `2-www-first.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| `2-www-unchanged-second.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| `3-source-first.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| `3-source-unchanged-second.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| `4-www-first.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |
| `4-www-unchanged-second.png` | `066c5bb9e45cef670bfcca194dee0d4a60e657c36935c3c1d1f200a6f0b8c5ee` |

SHA-256 of this control's `readback.json`: `5f8b38041a86ae04018629249ebec1254fc501110ded0663fa1ed9b5df4402e1`.
