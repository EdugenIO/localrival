# Render clean launch — 22 October 2026

Primary app: https://localrival-api.onrender.com/ (frontend and API on one origin).
Project: LocalRival / Production, Singapore. Existing Starter web service and Basic-256mb PostgreSQL; no additional paid resource.

## Player data

The owner explicitly requested a clean Render database. All six player tables were truncated transactionally after checking `current_database()` was `localrival`. Schema was retained. The legacy Sites database was not reset or migrated. All players must sign in and opt in again on Render.

## Release behavior

- The Render server serves static frontend files and APIs together. Steam sessions use Secure/HttpOnly cookies on this origin.
- GitHub Pages builds a redirect to Render, rather than maintaining a separate bearer-token frontend.
- The build copies public assets into render-dist/public, then the Render build command prunes development dependencies.
- Render waits for successful CI checks. CI runs regression tests, type checking, lint, Render/Worker/Pages builds and a production dependency audit.
- PostgreSQL initialization applies additive browser_data/leaderboard_data columns idempotently. The Cloudflare alternative has an explicit SQL migration; do not deploy its new routes without applying it.

## Verified scores

Browser imports are personal data in browser_data. They cannot write verified dota_data or public leaderboard_data. Server and nightly provider results publish a small score summary atomically with the verified snapshot. Old snapshots without a verified summary stay off the ladder until refreshed. Manual writes compare the snapshot read before the provider call, and empty responses preserve populated data.

Leaderboard responses are scoped and paginated to 100 players; the UI offers Load more. Search and alternative sorting apply to the loaded players.

Disconnect deletes sessions, handoffs, attempts, membership, locality and Steam data in a transaction. Missing KDA fields remain unknown and earn no bonus. Callback error paths return to the correct frontend.

## Optional nightly refresh

Nightly GitHub Actions refresh is gated by repository variable ENABLE_NIGHTLY_SYNC=true. Leave it disabled until NIGHTLY_SYNC_TOKEN is configured with the same secret in Render and GitHub Actions. This is independent of manual provider refresh, which works without that token. Never store the token in this repository.

## Security verification

The production npm audit reports zero vulnerabilities after dependency updates. The full development graph still contains transitive advisories (including braces and the Drizzle toolchain); npm does not offer a compatible complete fix for all of them. The Render runtime prunes development packages. Do not expose the development server publicly or downgrade the framework to silence audit output.

Real Steam sign-in requires the player's interaction with Steam and is not completed by automated tests.
