# Security status — 22 October 2026

## Current production boundary

The primary application is https://localrivals.online/. GitHub Pages only redirects there. Player authentication accepts Secure/HttpOnly/SameSite=Lax cookies, not bearer headers. Retired Pages login, callback and token exchange paths cannot create handoffs or expose session tokens. Cross-origin API mutations and cross-origin preflights are rejected; the Render and retained Worker adapters no longer grant Pages CORS access. The job endpoint keeps its separate service credential.

Render applies no-referrer, frame denial, HSTS on HTTPS, a restrictive permissions policy, and the existing Content Security Policy. Request reception and headers have time limits. No credential or player-record migration/deletion is part of this release.

## Application abuse limits

- Steam login: burst of 5 per network bucket, replenishing at 5/minute.
- API requests: burst of 60 per network bucket, replenishing at 60/minute.
- Aggregate per-process budgets: login burst 30 / refill 60 per minute; API burst 600 / refill 600 per minute.
- Denied calls return HTTP 429 with Retry-After and no-store. Throttled logins do not reach database handlers.
- The pending login table has a 1,000-active-attempt admission budget. Expired attempts are removed before admitting new attempts. Existing authenticated attempts can rotate without adding another row. Concurrent PostgreSQL transactions can briefly exceed the admission budget; edge/application limits also bound arrival rate.
- In-memory rate-limit maps have bounded cardinality. Network addresses are hashed for bucket keys and are not added to logs or persistent storage.

A local server trusts only its socket address. On Render the server uses the address appended by one trusted proxy hop from the right of X-Forwarded-For, ignoring caller-provided prefixes. This is deliberately conservative: proxy/NAT users can share a bucket. Review the proxy topology before placing another proxy in front of the service. Never trust an arbitrary first X-Forwarded-For entry.

The limiter is per running instance and resets on restart. It is not a distributed quota or complete DDoS defense. Before scaling to multiple instances, use a shared limiter store and verify trusted proxy configuration. Health checks are exempt so application throttling cannot make a healthy instance fail readiness checks.

References: [Render edge/application boundary](https://render.com/articles/how-render-handles-ddos-attacks), [MDN trusted X-Forwarded-For selection](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For).

## Dependencies

Compatible transitive fixes pin fflate 0.7.5 and replace the deprecated esbuild-kit loader's esbuild 0.18.20 with the app's esbuild 0.28.2. The lockfile was regenerated retaining the resolved direct package versions; transitive packages were re-resolved. Drizzle's SQL export, both build paths and the regression suite verify compatibility.

Current npm audit results:

| Scope | Before | After |
|---|---:|---:|
| Production affected packages | 0 | 0 |
| Full development + production graph | 15 | 8 |
| Moderate affected packages | 7 | 0 |
| High affected packages | 8 | 8 |

The eight remaining development-only package entries all trace to [GHSA-vfj7-8cjw-p6xm in braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), through Next ESLint/Vinext globbing. The latest published braces version is 3.0.3 and remains affected. There is no compatible published patch at review time; npm's suggested broad downgrades are not applied. Render installs/prunes to production dependencies and does not run these build/development servers publicly.

`npm run security:audit` checks the full graph. The reviewed advisory is allowed only for development-only nodes and only until 21 November 2026. New advisories, production exposure, missing audit/lock data, registry failures and expired review exceptions fail the check. CI also retains a separate zero-production-vulnerability audit. This exception documents outstanding risk; it does not mean the full development graph is vulnerability-free.

## Verification

67 automated tests pass, covering cookie-only authentication, retired auth paths, cross-origin rejection, throttling and retry headers, spoofed forwarding prefixes, bounded limiter state, pending-attempt admission/expiry, PostgreSQL-backed routes, and audit-policy failures. TypeScript, ESLint, Render/Worker builds and Drizzle SQL export pass. Real interactive Steam sign-in remains a separate player check.

## Audit service outages

Both CI audit scopes use `scripts/security-audit.mjs`. Registry/network failures receive at most three attempts. npm fetch retries are disabled inside each attempt, individual fetches time out after 8 seconds, and the subprocess is limited to 22 seconds. A valid vulnerability report is evaluated immediately without retrying it. Authentication failures and malformed reports fail immediately; exhausted network failures explicitly state that no security verdict is available and fail CI. Raw registry diagnostics are not echoed by the wrapper. The workflow also has a 15-minute job limit.

## Privacy and security enforcement — 22 October 2026

- Privacy and terms pages are served at `/privacy` and `/terms`; contact: admin@edugen.io. They describe the deployed data flows, location inference, essential cookies, providers, retention limitations and League trial.
- Public ladder writes require a boolean public-sharing opt-in and the current policy version; League private saves require the current version. The database transaction records acceptance purpose/version/time with the profile write. Existing records are not labelled as retroactively accepted.
- Cookie-authenticated `/api/account/export` downloads only the caller's game snapshots, location, tracked League profile and policy acceptances; session credentials are excluded. Account deletion also removes policy and League rows. Provider records, backups and infrastructure logs are outside this active-database deletion.
- Every Render response receives frame, resource, opener and MIME protections and CSP with `object-src 'none'`. API responses default to `no-store`. Cross-site browser mutation metadata is rejected in addition to exact-origin checks. Data-writing POST routes require JSON. URLs are capped at 8 KiB and bodies at 210,000 bytes; League requests are additionally capped at 4,096 characters in the route.
- These are server checks, not browser-only validations. Provider keys, job secrets and database credentials remain environment settings; never hard-code credentials. The instance-local rate limiter and hosting/backups limitations above still apply.
