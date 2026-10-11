# Foreign-currency expense input: local candidate

This branch starts at local integration commit `bca81d1a03ccd6a0d23b01d3e8670997a682e27d`, before later PR55 native commits. It has not been pushed or released.

## Rate source and permission check (2026-10-11)

- [Frankfurter v2 documentation](https://frankfurter.dev/) describes free commercial API use, no API key, daily reference rates and a pair route. It has rate limiting but no daily or monthly quota. Its [license page](https://frankfurter.dev/license/) says underlying provider conditions apply and blended data is not an official institutional rate.
- To avoid the terms of other blended-feed providers, the implementation requests only `https://api.frankfurter.dev/v2/providers/ecb/rate/{source}/{target}`. [ECB reuse terms](https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html) permit free use with accurate attribution and disclosure of modification. The app and saved snapshot identify ECB via Frankfurter v2; the UI calls it a daily reference rate, not a live or transaction rate. No new agreement or payment was identified for this limited use.
- The [ECB reference table](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html) includes both USD and ILS, so that cross pair is covered by the underlying provider. ECB does not cover every currency in the app. The endpoint must return an actual valid pair and date before automatic mode can save; a missing pair or failed request offers manual mode. The local execution host could not resolve the public API hostname, so a live response/CORS smoke test remains necessary before release. Browser QA used a response mock for this exact endpoint.
- The request contains only source and target currency codes. It sends no amount, event, payer or account data. The CSP permits only the exact API host in addition to its previous destinations.

## Accounting contract

Only the single-expense form accepts a foreign source amount. The event's existing two-decimal integer ledger convention stays intact. Source inputs use ISO fraction digits (0, 2 or 3); their minor units are stored as decimal strings. A decimal rate means **target major units per one source major unit**. Integer arithmetic rounds the combined converted expense half up to the event's existing two-decimal units. Payer shares use largest remainders with original payer order as the tie-breaker, so their event-currency total equals the expense total. Each payer enters the same source currency.

`fxConversion` records the source amount and payer amounts, source/target codes and fraction digits, exact rate string and units, mode, source, rate date, fetch time and final target amount. Existing expenses without the field continue through the previous path. An existing converted expense opens with its saved rate and source values; it is not automatically repriced. The full snapshot passes through JSON backup, shared-state merge and expense-draft recovery. Reports show source amount and rate alongside event-currency ledger values.

Automatic quotes older than seven calendar days are rejected for new or changed conversions, with their date shown and a manual choice. A previously saved snapshot may be retained for a name-only edit. No rate is invented when offline, unavailable or unsupported. Restaurant multi-item entry remains in the event currency; its first step offers the single-expense form for foreign input.

## Local verification

- `npm test`: 3,544 passed, 0 failed. This includes calculation, financial validation, backup, interrupted-save recovery, draft recovery and service-worker module graph checks.
- Playwright expense regression suite: 14 passed, 0 failed in Android Chromium and iPhone WebKit profiles. The six new cases cover mocked automatic ECB data, a failed request with explicit manual fallback, three-decimal input, saved amounts and a name-only edit that retains the rate.
- `git diff --check` passed. The PWA release marker and precache were updated together to include the new module.

## Release checks remaining

Run a real API pair/CORS check on Web and native app environments, inspect provider response shape and current date, then repeat integrated browser and native QA against the latest PR55 head. This local worktree has not performed a real-device test or a live database write. It is based on `bca81d1`, before later PR55 native commits, and must be integrated deliberately after that work is ready.
