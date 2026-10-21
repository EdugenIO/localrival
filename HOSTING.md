# Local Rival hosting

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
