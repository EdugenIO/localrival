# Local Rival hosting

Primary deployment: https://localrival-api.onrender.com/ serves the frontend and API with PostgreSQL. GitHub Pages redirects there. See CLEAN-LAUNCH.md for current release behavior. The sections below describe the retained legacy Sites/Pages architecture.

The current production site is https://local-rival-brett.stony-fir-8901.chatgpt.site/leaderboard and permits anyone with the link.

## Accounts
Players sign in through Steam OpenID. Steam assertions are checked server-side. A 256-bit random session cookie lasts 30 days (Secure, HttpOnly, SameSite=Lax); only its SHA-256 hash is stored. Returning Steam sign-ins reuse saved match data and ladder membership. Hosted ChatGPT identity remains supported for existing accounts. Sign out revokes the browser session; disconnect removes linked game data and all sessions for that player.

## GitHub and deployment
Source can be mirrored into the owner's EdugenIO GitHub account once its authentication is renewed. GitHub Pages alone cannot run the server routes or database. A standalone deployment needs a Cloudflare Worker-compatible host and D1 database (or an equivalent port), HTTPS and server-side secrets. Do not upload environment files, session rows, account records, or Steam API keys to GitHub.

The existing Sites deployment uses .openai/hosting.json and the Sites source/publish workflow. Moving to another domain requires replacing SITE_ORIGIN in lib/steam-openid.mjs, registering the Steam API domain and applying the database schema. Steam login verification itself uses OpenID and does not require a Steam API key; Counter-Strike data uses STEAM_WEB_API_KEY.

## Database
Base schema: drizzle/0000_flashy_alex_power.sql. Ladder membership, locality and session tables are created idempotently by their server modules. Persist the database between deployments.

## Testing
Run node --experimental-vm-modules --test tests/*.test.mjs and the production build before deployment. Browser end-to-end sign-in needs a real Steam user and must be completed by the player.

## Nightly Dota refresh
GitHub Actions workflow `.github/workflows/nightly-dota.yml` runs at 18:00 UTC (02:00 Australia/Perth) daily and supports manual dispatch. It runs `scripts/nightly-dota.mjs` without installing dependencies. The same random `NIGHTLY_SYNC_TOKEN` must exist as a GitHub Actions secret and a secret Sites environment variable. Never commit it. `/api/jobs/dota` rejects ordinary users; this service credential is needed to list stale connected Steam accounts and write normalized provider records.

Refresh accounts older than six hours. Read OpenDota from the GitHub runner with at least 1.1 seconds between requests and stop on rate limits. Keep saved data on errors or empty responses. A conditional update prevents overwriting a newer manual sync or recreating a disconnected account. The job paginates 100 accounts at a time. GitHub may delay scheduled jobs; it is not an exact-time guarantee. Ordinary users keep the manual browser sync fallback.

Counter-Strike is hidden and no longer refreshed. Existing stored CS records are retained for a future return.

## GitHub Pages frontend
The main public frontend is https://edugenio.github.io/localrival/. `.github/workflows/pages.yml` builds the frontend from public/ with scripts/build-pages.mjs and deploys on main pushes. GitHub Pages hosts the actual static application, not a redirect. Account APIs, Steam OpenID verification, D1 data and nightly writes stay on the Sites backend.

Pages uses bearer sessions so third-party cookie blocking does not prevent API requests. A random browser verifier is stored in sessionStorage before Steam sign-in. Its hash is bound to the signed OpenID callback. The backend issues a two-minute one-use code returned in the Pages URL fragment; exchange requires the verifier and exact Pages origin. The exchange returns a 30-day session token stored on the Pages origin. Only session hashes are in the database. Sign-out revokes that token. CORS is allowed only for https://edugenio.github.io; other projects on that origin must be trusted.

## Custom domain

Production uses `localrivals.online`, with `www.localrivals.online` redirecting to the root domain in Render. VentraIP DNS: root A record `216.24.57.1`; www CNAME `localrival-api.onrender.com`; TTL 300 during cutover. Existing NS records remain unchanged.

After Render verifies both domains and HTTPS is valid, set the non-secret `RUNTIME_SITE_ORIGIN=https://localrivals.online` on the existing Render service and deploy. This overrides the platform onrender URL for Steam OpenID callbacks and same-origin checks. The server redirects GET/HEAD requests on the old Render hostname to this fixed origin, preserving path/query, while /health stays available for readiness checks. Before the override is set, the old origin keeps working. Existing Steam accounts are retained; users sign in again on the new cookie origin.

The service-level public-origin setting is managed in the Dashboard and is intentionally omitted from the Blueprint; Blueprint sync preserves omitted environment variables. Custom-domain associations are managed in the Dashboard. Do not remove or rotate database/provider/session credentials as part of a domain change.
