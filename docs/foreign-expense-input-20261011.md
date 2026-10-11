# Foreign-currency expense input: local candidate

This isolated branch starts at local integration commit `bca81d1a03ccd6a0d23b01d3e8670997a682e27d`, before later PR55 native commits. It has not been pushed or released. The feature and first audit fixes are separate commits: `ba20dbf` and `286d010`.

## Rate source and permission check (2026-10-11)

- [ExchangeRate-API Open Access documentation](https://www.exchangerate-api.com/docs/free) describes a public, keyless endpoint, free commercial conversion use, caching, daily updates and required linked attribution on pages using its rates. The [supported-currency list](https://www.exchangerate-api.com/docs/supported-currencies) includes the app catalogue, including AED, GEL, VND, MAD, EGP and JOD, which were missing from the earlier ECB feed. Its [terms](https://www.exchangerate-api.com/terms) disallow redistributing the feed as a rate API or standalone rate product and discourage reliance for actual transactions. This app uses a rate only while the user records and confirms an expense; it does not provide a rate feed or execute a transaction.
- Automatic mode requests `https://open.er-api.com/v6/latest/{sourceCurrency}`. The request contains only a currency code, with no amount, event, payer or account data. The response is checked for provider, base, target rate, update times and expiry. The app caches the provider response in that browser until the next update, capped at 24 hours. Synced expenses, backups and reports contain only the applied pair rate and provenance, never the provider's full table. A refresh can fetch again; a failed or unavailable rate offers an explicit personal-rate option.
- A visible linked “Rates By Exchange Rate API” attribution is shown when selecting, confirming and viewing an expense that uses an Open Access rate. Previously saved ECB via Frankfurter v2 snapshots retain their original source label and rate; opening or changing their name does not reprice them.
- The CSP allows the exact `https://open.er-api.com` host. There is no key, new account, payment or new permission. Provider terms and availability should be reviewed again for release.

## Accounting contract

Only the single-expense form accepts a foreign source amount. The event's existing two-decimal integer ledger convention stays intact. Source inputs use ISO fraction digits (0, 2 or 3); their minor units are stored as decimal strings. A decimal rate means **target major units per one source major unit**. Integer arithmetic rounds the combined converted expense half up to the event's existing two-decimal units. Payer shares use largest remainders with original payer order as the tie-breaker, so their event-currency total equals the expense total. Each payer enters the same source currency.

`fxConversion` records source and target amounts, currencies, fraction digits, source payer amounts, the exact applied rate, mode and source, fetch and update times. Existing expenses without the field continue through the previous path. An existing converted expense opens with its saved rate and source values; it is not automatically repriced. A converted expense blocks changing its event's currency with an explanation in settings, because that would silently change the denomination of the saved ledger. Reports and backups show only the saved pair rate and provenance.

Automatic quotes older than seven calendar days are rejected for new or changed conversions. A previously saved snapshot may be retained for a name-only edit. No rate is invented when offline, unavailable or unsupported. Restaurant multi-item entry remains in the event currency; its first step offers the single-expense form for foreign input. The user sees the converted amount before confirming the expense and can enter a personal rate explicitly.

The audit of `ba20dbf` also fixed three data-integrity edges: account-link remapping now preserves three-decimal JOD source amounts, a legacy client's name-only edit can retain the valid FX snapshot when ledger values are unchanged, and scientific-notation JSON rates retain their exact decimal value. Current-client intentional removal records `fxConversionRemovedAt`; full compatibility with every older client still needs integrated version testing.

## Local verification

- `npm test`: 3,550 passed, 0 failed, including FX calculation, merge and recovery regressions. Playwright foreign-expense and event-settings suites in Android Chromium and iPhone WebKit profiles: 26 passed, 0 failed.
- Direct browser GET/CORS check without route mocks or browser security overrides: from a local page, installed Playwright Chromium and WebKit both received HTTP 200 with `Response.type === "cors"` from `https://open.er-api.com/v6/latest/USD` and `/VND`. Responses carried the documented provider, base, update times and rates including ILS. This checks access and response shape, not a native app.
- Browser regression covers automatic and personal rates, zero-decimal VND and three-decimal JOD, rate snapshot retention on name edit, event currency lock, and a delayed quote arriving while an amount field is focused. The generic choice picker now respects focus moved by the select change handler.
- A separate temporary live local-app smoke check (no route mock) passed in Android Chromium and iPhone WebKit with a dummy event and `VND` input. Each browser fetched `https://open.er-api.com/v6/latest/VND` with HTTP 200, showed the rate, saved a 10,000 VND expense as 119 ILS minor units at rate `0.000119` and displayed the linked attribution. The saved snapshot contained no full rate table. The temporary smoke-test file was removed after the run; no production or live database data was touched.

## Release checks remaining

Integrate deliberately against the latest PR55 head after its separate work is ready. Run combined accounting and native QA, including an actual device, and confirm source attribution and network availability in the release environment. This worktree has not performed a real-device test or a live database write. No push or release was performed.
