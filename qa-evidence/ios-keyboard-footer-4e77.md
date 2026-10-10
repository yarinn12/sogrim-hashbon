# Focused expense field hidden by keyboard-open sticky controls

The real UIKit iOS26.5 run for application source
`4e77d12932f281377a2f3d8d2b0755d380ff39a5` (tree
`bb38527086217c396f17b774f0f2b0315d1c0f8a`) failed its unchanged
Native `hittable namePoint` check after switching from amount to name.
This was a product occlusion, not an accepted retry or a fabricated Native result.

At the normal OS body size17, visual viewport393x390 and actual safe insets59/34,
the focused name input occupied y276.625–334.625, the sticky footer y291–390,
and Next y304–356. The input center hit Next; modal scrollTop was0.
The actual OS screenshot shows the name input covered by the footer.
The downloaded run38083486841 artifact11681543735 was hash-verified:
SHA256 `8a4745422270197547de44105fb6e9a3014b3619db7916f134290308c5f76c83`.
The26 validator controls passed, but the Native journey itself did not pass.

The prior reveal used `scrollIntoView(center)` with inherited scroll margins and
padding. It does not target the space between the real sticky header and footer.
The correction now moves the modal scrollport by only its measured out-of-bounds
delta, rounds away from clipped fractional edges, and measures once more if the
first scroll changes the sticky footer position. Fully visible fields keep their
scroll position. A ResizeObserver on the current modal/header/fields/body/footer
also handles later content or font layout changes without requiring another
keyboard/input event; it disconnects when the observed modal changes or closes.

The permanent `e2e/expense-keyboard-footer-regression.spec.mjs` reproduces the
browser viewport boundary with actual local Rubik fonts and explicit59/34 safe
reservations, at16px and manual37.64706px accessibility CSS. It verifies the whole
field below the actual sticky header and above the actual footer, center hits on
both input and Next, late body growth with unchanged keyboard/focus/input, typing,
stable geometry after the product animation-frame callback, and advancing to payer.
This is a browser/CSS boundary fixture: it does not mock Capacitor or establish
actual Native font/keyboard acceptance.

Controlled original4e reveal: both permanent cases failed at name visibility.
Controlled observer-disabled candidate: both cases failed, including the late
layout boundary. Exact candidate source bytes were restored after each fault
(SHA256 `eecf514d0ee6fcb9118a79649d47b922c6852e4351c1d01a6f99b5e250fb8552`).
Root unit/integration3398/3398 passed. The nearby mobile keyboard/persistence/zoom
suite passed 36 cases with 4 existing non-touch skips.
The final strengthened whole-header/footer assertions passed all18 cases:
10/10 across the five mobile browser profiles and8/8 across the four desktop
engine profiles, with no failures, retries or skips in those focused tests.
Native hit predicates,
font values, touch targets, assertions, deadlines and flaky-test rejection remain
unchanged. Final exact-source UIKit and Android SDK acceptance must be read from
the new combined CI run; these local results do not replace it.
