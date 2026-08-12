# Design Audit: Home Screen Before Ledger Refresh

## Scope

- Production home screen at desktop and mobile widths
- Empty-account state
- Header, primary actions, event empty state, and mobile navigation

## Product Goal

Help a returning user start or join an expense event in seconds, while making a
new user trust that balances and transfers will be handled accurately.

## What Already Works

1. The main actions are visible without opening a menu.
2. RTL alignment is consistent across the first screen.
3. Mobile controls are generally large enough to tap.
4. The green and coral brand colors are recognizable.

## High-Risk Findings

1. The generated hero image dominates the mobile viewport and makes the product
   read like a landing page instead of a working financial tool.
2. Four layers of introductory copy compete with the two actions the user needs.
3. The desktop canvas is too wide for the amount of information shown, producing
   a large inactive area and weak hierarchy.
4. The empty state uses a large dashed container and decorative icon treatment,
   which feels generic and repeats the actions above it.
5. The mobile navigation gives permanent space to installation and does not
   visually prioritize the current task.
6. Button labels wrap inconsistently at narrow widths.
7. Surfaces use several different shadow, radius, and border treatments, so the
   interface does not feel like one system.

## Accessibility And Usability Risks

1. Muted text is too light in several secondary labels.
2. Focus and selected states are not equally strong across all controls.
3. Fixed mobile navigation competes with other sticky actions and can reduce
   usable vertical space.
4. Monetary values do not consistently use tabular numerals.

## Direction

Use a modern ledger visual language: warm paper canvas, white working surfaces,
hairline separators, compact typography, tabular amounts, and semantic color.
Green is reserved for actions and credit; coral is reserved for debt. Shadows
are limited to actual floating layers.

## Evidence

- `01-before-home-desktop.png`
- `02-before-home-mobile.png`

Behavior, persistence, and accessibility require browser and automated testing;
the screenshots alone only support the visual findings above.
