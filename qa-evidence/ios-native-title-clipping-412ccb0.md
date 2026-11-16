# Expense title clipping behind the keyboard rail

Visual review of the corrected cover caught another defect at source `412ccb0dc401cb0bd5b71a52806efb6745c93e1c`, tree `a869b8dfc48ad36f43c4772fe3f804dc2215cd1c`: the header remained sticky while the amount form scrolled. At the observed native-size fixture (393×793 layout, visual height 417, safe top 59, requested scroll 102), the title occupied y=103.5–131.5 and the white rail y=60–115. Only 16.5 of the 28-pixel title line was painted.

While the software keyboard is open, the header now has `position:static` and 32px top padding. Its title scrolls away completely during focused editing and is fully readable below the controls on scrollback. Back and accessibility remain fixed. A user can still scroll the form naturally, including moving the field away while reading its title.

The permanent normal/32px/AX regression compares every title text rectangle with the opaque rail, rejects partially painted lines, verifies complete text on scrollback, and retains the existing amount/Next/button bounds, hit and real-click assertions. With the exact final test and original 412 CSS, normal fails on the 16.5-pixel fragment; 32px/AX already pass. The restored fix passes all three.

Owner commit `f20edfdbe9ff86c36dac1f549c2221a7fd9a8f23` was integrated as `d606c2f`. Patch SHA-256: `7f0b1c5c7d2018b60ed95012ec84e5ebfe17d84262dc11a9f02f1a0671205579`. Owner runs passed 30 nearby mobile cases, six final mobile cases, nine compact desktop engine cases, and 3,469 normal tests without skips. Before/after screenshots and logs are retained in `ios-native-title-412-evidence` in the design workspace.

These are browser reproductions with simulated viewport/inset state. Fresh UIKit/XCTest validation is required. They do not establish the cause of the separate f9 native-form delay.
