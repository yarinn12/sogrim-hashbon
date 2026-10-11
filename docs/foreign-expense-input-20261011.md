# Foreign-currency expense input: local candidate

This branch starts at local integration commit `bca81d1a03ccd6a0d23b01d3e8670997a682e27d`, before later PR55 native commits. It has not been pushed or released.

## Rate source and permission check (2026-10-11)

- [Frankfurter v2 documentation](https://frankfurter.dev/) describes free commercial API use, no API key, daily reference rates and a pair route. It has rate limiting but no daily or monthly quota. Its [license page](https://frankfurter.dev/license/) says underlying provider conditions apply and blended data is not an official institutional rate.
- To avoid the terms of other blended-feed providers, the implementation requests only `https://api.frankfurter.dev/v2/providers/ecb/rate/{source}/{target}`. [ECB reuse terms](https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html) permit free use with accurate attribution and disclosure of modification. The app and saved snapshot identify ECB via Frankfurter v2; the UI calls it a daily reference rate, not a live or transaction rate. No new agreement or payment was identified for this limited use.
- The [ECB reference table](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html) includes both USD and ILS. Six app-catalogue currencies are absent from its current daily table: AED, GEL, VND, MAD, EGP and JOD. Automatic coverage must not be described as applying to the entire catalogue. The endpoint must return a valid pair and date before automatic mode can save; a missing pair or failed request offers a manual rate instead.
- The request contains only source and target currency codes. It sends no amount, event, payer or account data. The CSP permits only the exact API host in addition to its previous destinations.

## Accounting contract

Only the single-expense form accepts a foreign source amount. The event's existing two-decimal integer ledger convention stays intact. Source inputs use ISO fraction digits (0, 2 or 3); their minor units are stored as decimal strings. A decimal rate means **target major units per one source major unit**. Integer arithmetic rounds the combined converted expense half up to the event's existing two-decimal units. Payer shares use largest remainders with original payer order as the tie-breaker, so their event-currency total equals the expense total. Each payer enters the same source currency.

`fxConversion` records the source amount and payer amounts, source/target codes and fraction digits, exact rate string and units, mode, source, rate date, fetch time and final target amount. Existing expenses without the field continue through the previous path. An existing converted expense opens with its saved rate and source values; it is not automatically repriced. The full snapshot passes through JSON backup, shared-state merge and expense-draft recovery. Reports show source amount and rate alongside event-currency ledger values.

Automatic quotes older than seven calendar days are rejected for new or changed conversions, with their date shown and a manual choice. A previously saved snapshot may be retained for a name-only edit. No rate is invented when offline, unavailable or unsupported. Restaurant multi-item entry remains in the event currency; its first step offers the single-expense form for foreign input.

## Local verification

- `npm test`: 3,544 passed, 0 failed. This includes calculation, financial validation, backup, interrupted-save recovery, draft recovery and service-worker module graph checks.
- Playwright expense regression suite: 14 passed, 0 failed in Android Chromium and iPhone WebKit profiles. The six new cases cover mocked automatic ECB data, a failed request with explicit manual fallback, three-decimal input, saved amounts and a name-only edit that retains the rate.
- Separate live browser smoke check without route mocks or browser security overrides: a public GET from `http://127.0.0.1:4197/privacy.html` succeeded in installed Playwright Chromium and WebKit. Both `https://api.frankfurter.dev/v2/providers/ecb/rate/usd/ils` and `https://api.frankfurter.dev/v2/providers/ecb/rate/thb/ils` returned HTTP 200 with `Response.type === "cors"` and no failed requests in either browser. Both responses were dated `2026-10-09`, with rates `3.0573` and `0.09118` respectively, matching the expected base/quote/date/rate shape. A PowerShell request from the same workspace separately failed before HTTP with `No such host is known. (api.frankfurter.dev:443)`; this did not describe the browser result or a provider rejection.
- `git diff --check` passed. The PWA release marker and precache were updated together to include the new module.

## Release checks remaining

Wait for the independent accounting review of `ba20dbf`. Repeat integrated browser and native QA against the latest PR55 head, including an actual device and the app flow with live rate loading. The localhost browser GET/CORS smoke check does not verify a native app. This local worktree has not performed a real-device test or a live database write. It is based on `bca81d1`, before later PR55 native commits, and must be integrated deliberately after that work is ready.
