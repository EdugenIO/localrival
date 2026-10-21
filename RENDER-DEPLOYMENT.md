# Render migration — prepared, not deployed

## Proposed resources (owner approval required)
- Always-on Node web service in Singapore: Starter (published baseline US$7/month).
- Managed PostgreSQL in Singapore: Basic-256mb (published baseline US$6/month), 1 GB storage.
- Estimate: approximately US$13/month compute; allow US$13.30/month including 1 GB at US$0.30/GB if charged separately, before taxes and usage overages. Current pricing may include the first GB, so confirm the checkout total. Confirm the Render checkout price before creation. Do not create a paid service until the owner approves it.

The reviewed configuration is `render.yaml`. Build: `npm ci && npm run build:render`. Start: `npm run start:render`. Health check: `/health`. Node binds 0.0.0.0 and Render's PORT. Database access uses the internal DATABASE_URL supplied by Render. It does not use a local database file.

## What the server reuses
The Render entry point reuses the tested API route handlers, Steam validation, sessions, account isolation and score normalization. A PostgreSQL adapter replaces Cloudflare D1, with parameterized queries, BIGINT timestamps, JSON field extraction and transactional batches. Hosted identity headers are never accepted from public callers. Steam identifies players on Render.

## Deployment sequence
1. Connect Render to the EdugenIO/localrival repository, approve the cost and create the Blueprint.
2. Configure NIGHTLY_SYNC_TOKEN privately to match the GitHub Actions secret. Never add it or DATABASE_URL to the repository.
3. Keep the existing Pages API_ORIGIN unchanged until /health reports the new PostgreSQL connection healthy and authentication checks pass.
4. Migrate saved Steam links and ladder memberships from the existing database through an authenticated export/import. Do not copy raw player data or session tokens into GitHub. Require fresh Steam sign-in on the new server; old-host session tokens should not be reused.
5. Set GitHub repository variable API_ORIGIN to the assigned Render HTTPS origin; deploy the Pages workflow. This also switches the nightly job's destination.
6. Test Steam sign-in, manual sync, postcode save, page reload and sign-out against Render. Restart the Render service and verify those saved records remain. Run the nightly job manually and confirm readback.
7. Keep the original backend available for rollback until validation succeeds. Redeploy the Pages workflow with the old API_ORIGIN to roll back.

The server uses RENDER_EXTERNAL_URL automatically for the OpenID realm and callback, or RUNTIME_SITE_ORIGIN for a custom domain. The existing Steam API key is optional for Dota and need not be moved for OpenID sign-in.

## Current state
The code and configuration are ready for local verification. Creating the Render resources, migrating production records, setting API_ORIGIN and changing the live backend are separate steps and are not complete merely because this file exists.
