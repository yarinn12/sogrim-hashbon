# Production resilience

## Current architecture

- The Android and iOS packages contain the complete web interface. Opening the installed app does not download the UI from Vercel.
- Account state and shared-event state are written directly to Supabase. Local snapshots and a pending-sync queue preserve edits during a temporary connection failure.
- Vercel serves public links and the Node API used for revocable invites, push delivery, account deletion, metrics and future purchase verification.
- Native builds keep the official public-link host but probe the Vercel API first and the Render recovery API second. A successful recovery response becomes the active API origin without moving account or financial data.
- A Vercel deployment block freezes releases but does not delete Supabase data or remove an already installed native app.

## Current launch risks

1. The active Vercel production project is `sogrim-hesbon-app` in the dedicated `sogrim-hesbon` team. The previous hosting workspace is not part of the runtime configuration.
2. Production assets use the prepared CDN cache policy. Every deployment must still pass the strict availability gate before promotion.
3. A free Render recovery host is active and passes the strict recovery gate, but it sleeps after inactivity and is not an always-on failover target.
4. Public links use the provider-owned `sogrim-hesbon-app.vercel.app` hostname. Changing providers therefore requires an app release unless a stable custom domain is introduced.
5. Push delivery is not launch-ready until the Firebase service-account values are restored in the active Vercel project and `/api/health` reports `pushDeliveryReady: true`.

## Vercel deployment procedure

1. Deploy only to the linked `sogrim-hesbon-app` project in the `sogrim-hesbon` team.
2. Create or update a preview deployment first and inspect its build logs.
3. Verify the preview with the production availability gate, including `/app-ads.txt`, the intro video's cache headers, App Links, legal pages and one private invite.
4. Promote the verified artifact to production, then scan runtime errors and rerun the Android store gate.
5. Keep deployment credentials in GitHub Actions secrets. Never commit a Vercel token or project environment value.

## Required production shape

1. Keep Supabase as the source of truth for accounts and financial state.
2. Serve the app shell and invitation routes as static CDN files.
3. Run the same `server.mjs` container on a second host with the same environment variables.
4. Put a stable custom domain in front of the public app and API. DNS can then move between hosts without publishing a new mobile build.
5. Run `npm run qa:production` every 30 minutes and open one incident when a user-facing boundary fails.
6. Keep Vercel and the backup host in separate billing/resource scopes so traffic from another product cannot block this app.

The complete domain migration order and the automated Android/iOS origin gates are
documented in [`public-domain-cutover-he.md`](./public-domain-cutover-he.md).

## Failure behavior

| Failure | User impact | Recovery |
| --- | --- | --- |
| Vercel cannot deploy | Existing app and data continue; releases are frozen | Remove the block or deploy the prepared container elsewhere |
| Vercel runtime is unavailable | Account and financial sync continue through Supabase; a current native build moves server API calls to the recovery host | Verify the recovery host and move a future stable custom domain if public links are also affected |
| Supabase is temporarily unavailable | Edits remain local and enter the pending-sync queue | Sync resumes when Supabase returns |
| A bad release is published | Installed app may remain on the previous store build; web can be rolled back | Promote the last healthy deployment and stop rollout |
| Google Play release has a defect | Only the active rollout is affected | Halt staged rollout and publish the last verified AAB with a higher version code |

## Incident checklist

1. Run `npm run qa:production` and identify the first failed boundary.
2. Check `/api/health`, Supabase Auth and the Data API separately.
3. If only Vercel is affected, keep Supabase untouched and switch the public/API domain to the backup container.
4. If Supabase is affected, leave clients in local pending-sync mode and avoid destructive retries.
5. After recovery, run `npm test`, `npm run qa:mobile`, `npm run qa:recovery:strict` and one two-account invitation journey before resuming store rollout.

## Backup-host environment

The container requires the same production values used by the current server. At minimum:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`
- `GOOGLE_CLIENT_ID`

`APP_PUBLIC_URL` is optional because the server can derive the active HTTPS origin from the request. Push delivery additionally requires the Firebase project and service-account values. Ads, sponsored cards and Play billing are intentionally disabled on the recovery host so that it only restores the core account, sync, invitation and notification journeys.

Never copy `.env.local` into an image or commit production secrets. The Docker image contains application files and production dependencies only.

## Prepared backup artifact

Every push to `main` builds and publishes the provider-portable server image to:

`ghcr.io/yarinn12/sogrim-hashbon-server:latest`

An immutable tag matching the Git commit SHA is published alongside `latest`. The image is only a deployable artifact; production failover is complete only after a second host is connected to it, its secrets are configured, and the stable public domain passes `npm run qa:recovery:strict` against that host. This recovery gate allows an explicitly origin-backed shell while preserving the account, API, invite, legal-page, asset and Supabase checks.

## Prepared free Render recovery host

`render.yaml` defines a free Docker recovery service in Frankfurt. It follows commits on `main` when the repository integration supports auto-deploy and uses `/api/health` as its application-level readiness check. Render keeps the previous release serving traffic when a replacement does not become healthy.

The free service sleeps after inactivity and can have a cold start. It is useful for validating provider portability and for manual recovery, but it is not an always-on failover target. The project has an explicit no-paid-hosting rule until the owner changes that decision.

If an incident requires immediate sustained traffic, the approved recovery path is to wake and verify the free service first, then upgrade that existing service to `starter` only after the owner explicitly approves the charge. This preserves the tested configuration and avoids building a new host during the incident.

Activation still requires an explicit Render account action:

1. Create a Blueprint from this repository and keep the configured `free` plan. Do not add payment information.
2. Supply every `sync: false` value from the current production environment. The Blueprint keeps ads, sponsored cards and Play billing disabled by design.
3. Let the server derive its assigned HTTPS `onrender.com` origin. Set `APP_PUBLIC_URL` later only if a stable custom recovery domain is introduced.
4. Wait for `/api/health` to report `ok: true`, `cloudStorageReady: true`, `googleAuthReady: true`, `accountDeletionReady: true`, `pushDeliveryReady: true` and `shareLinksReady: true`.
5. Run the production gate against the backup host, followed by a two-account invite and settlement journey.

Do not send normal user traffic to the recovery host merely because the container started. A healthy API response and a complete invitation journey are both required before it can be used during an incident, and its cold-start behavior must be accepted explicitly.
