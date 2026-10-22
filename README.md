# Local Rival

An open-source Dota 2 community leaderboard connecting gamers to their postcode, city/town, state and country.

[Open the live app on Render](https://localrival-api.onrender.com/)

## Features

- Steam OpenID sign-in with saved accounts and 30-day browser sessions.
- OpenDota match history across Turbo, normal and other available modes.
- Local points across the latest 50 matches: 3 base points for a win or 1 for a completed loss, plus a KDA bonus of `(kills + assists) / max(deaths, 1)`, capped at 3 and rounded to 0.1 per match. Abandoned matches earn zero.
- Typed Australian postcodes, suburb selection and self-declared location membership.
- Optional nightly GitHub Actions refresh at 02:00 Australia/Perth, requiring a matching job token in the backend and Actions secrets.

## Development

Requires Node.js 22.13 or later. Install dependencies with `npm ci`, run `npm run dev`, and build with `npm run build`.

The frontend is in `public/`; server routes are in `app/api/`. The primary deployment serves the frontend and API together on Render with PostgreSQL. The repository also retains a Vinext/Cloudflare Workers build and the legacy Pages frontend. See [HOSTING.md](HOSTING.md) for deployment requirements and [POSTCODE-DATA.md](POSTCODE-DATA.md) for locality-data provenance.

The current site ID and origin belong to the live Local Rival deployment. Forks need their own hosting identity, database, Steam callback origin and secrets. GitHub Pages alone cannot execute the backend or store player accounts.

Run regression tests with:

```sh
node --experimental-vm-modules --test tests/*.test.mjs
```

## Secrets and player data

Configure credentials in your deployment's secret store, never in source. `NIGHTLY_SYNC_TOKEN` must be configured in both the hosting environment and GitHub Actions secrets. Optional provider credentials are listed in `.env.example`. Runtime player records, session tokens and database contents are not part of this repository.

Browser-imported matches are private snapshots and cannot change public ladder scores. Public scores require a server-side provider refresh. Local points are a community scoring experiment, not a skill rating; they do not account for objectives, role or opponent strength. Locations are self-declared. Provider availability and coverage vary.

## Contributing

Issues and pull requests are welcome. Keep credentials and real player records out of contributions. Include relevant tests for changes to scoring, authentication or account isolation.

## Licence

Local Rival's original code is MIT-licensed; see [LICENSE](LICENSE). Dependencies, vendor files and reference data retain their own terms. Valve and OpenDota are not affiliated with or endorsing this project.

### League profile trial

The League of Legends button opens a Riot ID and region search. The server reads OP.GG public JSON-LD profile metadata and recent matches, with a 15-minute bounded cache, request limits, fixed upstream URLs, timeout and response-size limits. No OP.GG login or API credentials are used. Source retrieval time and OP.GG update time are distinct. Missing or changed metadata returns an error rather than a guessed profile.

Anyone can preview. Existing Local Rival Steam sessions can save one private tracked profile per account in PostgreSQL (`league_profiles`); a tracked profile is not proof of Riot account ownership. Deleting the Local Rival account removes it. This trial does not publish League players to a ladder, award custom points, or perform nightly League refreshes. Riot Sign On and production ladder design remain separate future work. OP.GG attribution and Riot disclaimer appear in the dialog.
