# AX currency and keyboard action acceptance

Source `d9eefac75fb3b70dc3c6959b32fcf35a84246d00`, QA run `38105834472`,
passed its original iOS simulator gates on iPhone 16 / iOS 26.5: 13 captures
in each of the default and Accessibility XL OS categories and 30 validator
controls. Root downloaded artifact `11690207255` (43,621,210 bytes), verified
SHA-256 `cf9cb599848735aca6c2e1c843e8c8c4693817ff2482ff51c03f6b4991a33c97`,
and independently repeated the original strict validator.

Actual UIKit screenshots exposed missing coverage. The AX restored image
`4D114B87-4018-42C5-98D6-0FF1D29BADA7.png` shows the day-group amount
`₪120.00` split before its final digit. The AX keyboard image
`A771FA85-012E-467C-ADC0-CB7EF445F02A.png` shows the wizard header above the
visible area. Recorded header tops are -188 and -268 while field/Next pass.
Internal modal scrolling makes room for AX input, so a negative title top
alone is not a failure. Back/accessibility must remain available and clear
the native status bar and keyboard. The original captures did not measure
those controls or the group currency.

The journey now captures the real group amount, all its rendered glyph
rows, wizard title/step, and header action geometry/hit tests. Currency is
required to remain one visual unit; each header action must be hittable
and its full rectangle must fit between the native bar and keyboard using
the same document-to-window mapping as the fields. Original font, input,
payload/ACK, lifecycle, relaunch, 35/45-second deadlines and existing
validator checks remain required.

Behavioral controls recorded by root on the unchanged old validator:
three currency cases (split digit, missing measurement, separated symbol)
were wrongly accepted. After the currency guard, five header cases
(missing controls, inaccessible Back/accessibility, bar/keyboard occlusion)
were wrongly accepted. The strengthened validator passes all 38 controls.
Root also passed 25 browser preflight cases across five mobile profiles,
two bootstrap/relaunch unit cases, and 3,443 normal checks after adapting
the restored-journey DOM fixture to include the real group element. The
original rendered-expense failure and controlled bypass remain tested.

Machine-local logs are preserved under the main chat's `outputs/`:
`ios-d9eefac-group-currency-old-validator-red-3.log`,
`ios-d9eefac-header-controls-old-validator-red.log`,
`ios-d9eefac-header-controls-fixed-validator-green.log`,
`ios-currency-coverage-preflight.log`,
`ios-currency-coverage-nearby-corrected.log`, and
`ios-currency-coverage-normal-unit-restored.log`.
The first normal attempt's missing DOM-fixture target failure is also
retained. These controls establish detection; they are not current-source
Native proof of a layout fix. CSS correction and a fresh two-mode SDK run
on the final combined source are still required. No physical iPhone proof
is available, and the prior initial-status failure's cause remains open.
