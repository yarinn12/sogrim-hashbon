# Large-text settlement proximity: local reproduction and cause

Source: `bcfbbc9b6df9a52bd67d1f5656948a3d9547ba48` (synthetic Playwright state). The focused `iphone-large-text` core mobile journey fails with the existing assertion in `e2e/mobile-layout.spec.mjs`: on a 390×664 iPhone 13 WebKit viewport with 28px root text, `.settlement-stage-heading` starts at 1078px; the existing limit is strictly less than 1.5×664 = 996px. The same value appears in the older `ff83a6e` and `10a1760` Linux CI lanes and locally on the integrated source. The ordinary `iphone-webkit` run at 16px root text passes, with the heading at 557px.

The attached full-page screenshot, [`settlement-large-text-bcfbbc9.png`](settlement-large-text-bcfbbc9.png), shows the first transfer below the heading. The read-only `settlement-large-text-geometry` attachment now records the section boxes before the unchanged assertion.

| Block before transfers | Normal height | 28px text height | Increase |
| --- | ---: | ---: | ---: |
| App identity | 64px | 139px | 75px |
| Event header | 121px | 257px | 136px |
| Workspace navigation | 66px | 153px | 87px |
| Event header actions | 68px | 202px | 134px |
| Settlement hero | 192px | 282px | 90px |

The immediate cause of the 82px proximity breach is the event action block. At 28px root text, it has one 338px grid column, three 54px buttons in three rows, 8px gaps and 12px top/bottom padding. The portrait accessibility rule in `src/publicDynamicTypeLayer.mjs` under `@media (max-width: 480px) and (orientation: portrait)` forces `.screen:is([data-screen-kind="event"], [data-screen-kind="event-notes"]) > .event-header-actions` to `grid-template-columns: minmax(0, 1fr) !important`. The settlement summary is an event screen and therefore inherits this rule.

For diagnosis only, I temporarily set that element to three equal columns in the browser, measured the result, and restored the original inline style before the original assertion. The action block became 93px and the transfer heading rose to 969px, below the unchanged 996px limit. The three buttons each retained a 107×69px box. Their label element boxes measured 57–85px against 105px of button content width. A separate glyph-level check found Hebrew words split inside those boxes, so this three-column variant is rejected as a product fix. It only establishes that the tall single-column action block causes the proximity breach.

The product fix should preserve all three actions, whole readable words, tap targets and the existing proximity assertion. Verify the whole core journey at 28px, then the nearby iPhone, iPad, Android and maximum Apple text cases. No tolerance, skip, deadline or font-size reduction was used for this diagnosis.
