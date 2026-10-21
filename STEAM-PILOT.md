# Steam pilot

The Site remains private and requires its existing ChatGPT access. Steam is linked to that Site user; it does not replace the hosting platform sign-in. Account links and cached provider data persist in D1 and are isolated by the server-derived Site user ID.

## Test flow

1. Open the Site and select Sign in through Steam.
2. Complete sign-in on steamcommunity.com. Return to the same browser with the Site identity and state cookie intact.
3. After a verified return, Dota 2 data refreshes automatically. Enable Expose Public Match Data in Dota 2 for available public match data. OpenDota may have delayed, missing or old data.
4. Refresh game data retrieves the latest provider response, with a one-minute server-enforced cooldown. HTTP 429 respects the provider Retry-After header (60 seconds to 1 hour), or pauses for 10 minutes when no header is provided. The UI shows the remaining wait. It is not a live in-match telemetry feed. Old successful data survives a provider outage, retaining its fetch timestamp and a separate refresh-failure notice.
5. Disconnect deletes the account link, cached game data and pending login attempts.

## OpenDota quota

The **Sync OpenDota profile** button loads the connected player's public profile, latest 50 all-mode matches (including optional replay-stat projections), and all-mode recorded win/loss totals directly through the visitor's browser. OpenDota permits this cross-origin access. No Steam or OpenDota API key is sent by this path. The browser respects its own rate limit; it does not rotate identities, proxy requests or auto-retry blocked calls.

`POST /api/dota/browser-sync` requires the signed-in Site user and matching linked Steam/account IDs. It limits the request to 200 KB and 50 matches, recalculates points/averages/hero breakdowns on the server, stores only that user's Dota snapshot, and enforces a one-minute save cooldown. Counter-Strike data and the hosted provider's cooldown remain separate. Browser-supplied snapshots carry `leaderboardEligible: false`; they are personal data, not authenticated provider proof for competitive local standings.

Profile display includes hero names from OpenDota's open-source dotaconstants, match K/D/A and duration, recorded all-mode totals, most-played heroes over the latest window, and available replay averages. Missing replay metrics are omitted instead of treated as zero. All-mode totals may differ from OpenDota's default standard-only overview counters.

The hosted app can be rate-limited even when a separate direct request succeeds. A 429 is not evidence of private match data. Optionally configure a separate `OPENDOTA_API_KEY` as a Sites secret to use an OpenDota account's API quota; a Steam Web API key cannot replace it. Never transmit either key to the other provider. Keys are not returned in account or provider-status responses. The API returns safe per-provider status codes and HTTP status values without raw exception text or upstream error bodies.

## Counter-Strike setup

Configure `STEAM_WEB_API_KEY` as a secret via Sites runtime environment variables, then deploy. Obtain a user Web API key from https://steamcommunity.com/dev/apikey using the Site hostname. Do not put the key in chat, Git or browser code. The key enables Steam GetUserStatsForGame for app 730; availability depends on Steam and profile privacy. It does not provide a verified Premier rating or match-by-match CS2 history. A separately authorized provider (for example FACEIT for FACEIT matches) is needed before competitive CS rankings can go live.

## Data and ranking boundaries

- No accounts or matches are fabricated in this connection flow. Existing sample leaderboard data remains separate.
- Steam account ownership is verified through OpenID; location and game ownership are not verified by that assertion.
- Dota local points use the latest 50 available recorded matches: 3 per win, 1 per completed loss, and 0 for a match the player left (`leaver_status >= 2`). All modes receive equal points per match; fewer than 10 scored matches is an early sample. This is a results/participation score, not an opponent-adjusted skill estimate.
- Request `/players/{account_id}/matches?significant=0&limit=50` without game-mode or ranked-lobby filters. Store game and lobby mode on each record, deduplicate by match ID and show a mode filter plus breakdown. Turbo, normal, ranked and any other modes OpenDota returns are included. Provider coverage is not guaranteed for private games or every custom mode.
- A missing profile or rank medal does not prevent loading valid match history. No MMR or medal is required or displayed for scoring. An empty match response has no assigned score.
- The local geographic ladder remains explicitly labelled sample data; its demo values now use the same points formula. Connected Steam data stays separate until location and multi-player leaderboard persistence are implemented.
- Steam stats may include legacy CS:GO totals. Do not use them as a current competitive rating.
- No automatic schedule is enabled. Refresh is on demand and on a successful new connection.
- The account link is unique per Steam ID. Switching linked accounts clears previous cached stats.

## Security checks

Outbound requests use `redirect: manual` and reject non-success responses, including redirects. Cloudflare Workers rejects `redirect: error` before sending a request. The Worker-runtime regression tests cover Steam verification and both game-data adapters to prevent Node-only tests from missing this difference again.

Use the existing server-side Site identity for all account operations. OpenID uses a random one-use state bound to an HttpOnly Secure SameSite cookie and the Site user; the callback verifies expected origin/return URL, endpoint, claimed identity, signed fields and nonce age, and calls Steam check_authentication before saving. Cross-origin writes and anonymous account reads are rejected. No Steam credentials or Web API key are returned to browsers.
