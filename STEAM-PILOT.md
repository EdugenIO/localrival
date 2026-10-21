# Steam pilot

The Site remains private and requires its existing ChatGPT access. Steam is linked to that Site user; it does not replace the hosting platform sign-in. Account links and cached provider data persist in D1 and are isolated by the server-derived Site user ID.

## Test flow

1. Open the Site and select Sign in through Steam.
2. Complete sign-in on steamcommunity.com. Return to the same browser with the Site identity and state cookie intact.
3. After a verified return, Dota 2 data refreshes automatically. Enable Expose Public Match Data in Dota 2 for available public match data. OpenDota may have delayed, missing or old data.
4. Refresh game data retrieves the latest provider response, with a one-minute server-enforced cooldown. It is not a live in-match telemetry feed. Old successful data survives a provider outage, retaining its fetch timestamp.
5. Disconnect deletes the account link, cached game data and pending login attempts.

## Counter-Strike setup

Configure `STEAM_WEB_API_KEY` as a secret via Sites runtime environment variables, then deploy. Obtain a user Web API key from https://steamcommunity.com/dev/apikey using the Site hostname. Do not put the key in chat, Git or browser code. The key enables Steam GetUserStatsForGame for app 730; availability depends on Steam and profile privacy. It does not provide a verified Premier rating or match-by-match CS2 history. A separately authorized provider (for example FACEIT for FACEIT matches) is needed before competitive CS rankings can go live.

## Data and ranking boundaries

- No accounts or matches are fabricated in this connection flow. Existing sample leaderboard data remains separate.
- Steam account ownership is verified through OpenID; location and game ownership are not verified by that assertion.
- Public Dota rank medal is displayed as provided, never converted into an invented exact MMR.
- Steam stats may include legacy CS:GO totals. Do not use them as a current competitive rating.
- No automatic schedule is enabled. Refresh is on demand and on a successful new connection.
- The account link is unique per Steam ID. Switching linked accounts clears previous cached stats.

## Security checks

Use the existing server-side Site identity for all account operations. OpenID uses a random one-use state bound to an HttpOnly Secure SameSite cookie and the Site user; the callback verifies expected origin/return URL, endpoint, claimed identity, signed fields and nonce age, and calls Steam check_authentication before saving. Cross-origin writes and anonymous account reads are rejected. No Steam credentials or Web API key are returned to browsers.
