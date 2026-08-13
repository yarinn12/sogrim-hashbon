# Production resilience

## Current architecture

- The Android and iOS packages contain the complete web interface. Opening the installed app does not download the UI from Vercel.
- Account state and shared-event state are written directly to Supabase. Local snapshots and a pending-sync queue preserve edits during a temporary connection failure.
- Vercel serves public links and the Node API used for revocable invites, push delivery, account deletion, metrics and future purchase verification.
- A Vercel deployment block freezes releases but does not delete Supabase data or remove an already installed native app.

## Launch blockers

1. The currently deployed Vercel release is older than the static-routing fix. Its app shell is still returned with `Cache-Control: no-store`, so requests can continue to consume Fast Origin Transfer.
2. A second API host is not active yet. Vercel is still the only server for revocable invitation redemption and privileged operations.
3. Public links use the provider-owned `sogrim-hashbon.vercel.app` hostname. Changing providers therefore requires an app release unless a stable custom domain is introduced.

## Required production shape

1. Keep Supabase as the source of truth for accounts and financial state.
2. Serve the app shell and invitation routes as static CDN files.
3. Run the same `server.mjs` container on a second host with the same environment variables.
4. Put a stable custom domain in front of the public app and API. DNS can then move between hosts without publishing a new mobile build.
5. Run `npm run qa:production` every 30 minutes and open one incident when a user-facing boundary fails.
6. Keep Vercel and the backup host in separate billing/resource scopes so traffic from another product cannot block this app.

## Failure behavior

| Failure | User impact | Recovery |
| --- | --- | --- |
| Vercel cannot deploy | Existing app and data continue; releases are frozen | Remove the block or deploy the prepared container elsewhere |
| Vercel runtime is unavailable | Existing local data remains usable; revocable invites and server notifications pause | Move the custom domain to the backup host |
| Supabase is temporarily unavailable | Edits remain local and enter the pending-sync queue | Sync resumes when Supabase returns |
| A bad release is published | Installed app may remain on the previous store build; web can be rolled back | Promote the last healthy deployment and stop rollout |
| Google Play release has a defect | Only the active rollout is affected | Halt staged rollout and publish the last verified AAB with a higher version code |

## Incident checklist

1. Run `npm run qa:production` and identify the first failed boundary.
2. Check `/api/health`, Supabase Auth and the Data API separately.
3. If only Vercel is affected, keep Supabase untouched and switch the public/API domain to the backup container.
4. If Supabase is affected, leave clients in local pending-sync mode and avoid destructive retries.
5. After recovery, run `npm test`, `npm run qa:mobile`, `npm run qa:production:strict` and one two-account invitation journey before resuming store rollout.

## Backup-host environment

The container requires the same production values used by the current server. At minimum:

- `APP_PUBLIC_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`
- `GOOGLE_CLIENT_ID`

Push delivery additionally requires the Firebase project and service-account values. Billing verification remains disabled until its Google Play values are intentionally enabled.

Never copy `.env.local` into an image or commit production secrets. The Docker image contains application files and production dependencies only.

## Prepared backup artifact

Every push to `main` builds and publishes the provider-portable server image to:

`ghcr.io/yarinn12/sogrim-hashbon-server:latest`

An immutable tag matching the Git commit SHA is published alongside `latest`. The image is only a deployable artifact; production failover is complete only after a second host is connected to it, its secrets are configured, and the stable public domain passes `npm run qa:production:strict` against that host.

## Prepared Render backup

`render.yaml` defines a production-sized Docker web service in Frankfurt. It deploys only after the `main` branch checks pass and uses `/api/health` as its application-level readiness check. Render keeps the previous release serving traffic when a replacement does not become healthy.

Activation still requires an explicit Render account action:

1. Create a Blueprint from this repository and keep the configured `starter` plan so the backup does not sleep between requests.
2. Supply every `sync: false` value from the current production environment. Keep ads and Play billing disabled unless those features are intentionally active in the primary environment.
3. Set `APP_PUBLIC_URL` to the final public hostname. Before a custom domain exists, use the assigned HTTPS `onrender.com` URL.
4. Wait for `/api/health` to report `ok: true`, `cloudStorageReady: true`, `googleAuthReady: true`, `accountDeletionReady: true`, `pushDeliveryReady: true` and `shareLinksReady: true`.
5. Run the production gate against the backup host, followed by a two-account invite and settlement journey.

Do not send user traffic to the backup host merely because the container started. A healthy API response and a complete invitation journey are both required before it can be considered a failover target.
