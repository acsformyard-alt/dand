Cloudflare Worker: API (REST + Auth + R2 + D1)
================================================

This guide walks through deploying `cloudflare/api.js` as a Worker using only the
Cloudflare dashboard.

Prerequisites
-------------
1. **R2 bucket** for map and asset storage (example name: `dand-map-assets`).
2. **D1 database** provisioned in the same account/region.
3. **Durable Object Worker** (`session-do`) already published (see `readme-session-do.txt`).

Step-by-step
------------
1. In the Cloudflare dashboard, go to **Workers & Pages → Create application → Create Worker**.
2. Name the Worker (example: `dand-api`). Choose **Quick Edit**.
3. Replace the default script with the contents of `cloudflare/api.js`. Save.
4. Open the Worker’s **Settings → Variables** tab and configure bindings:
   - **D1 Database Binding**
     - Type: D1 Database
     - Variable name: `MAPS_DB`
     - Database: select the D1 instance created above.
   - **R2 Bucket Binding**
     - Type: R2 Bucket
     - Variable name: `MAPS_BUCKET`
     - Bucket: select the R2 bucket.
   - **Durable Object**
     - Type: Durable Object Namespace
     - Variable name: `SESSION_HUB`
     - Class name: `SessionHub`
     - Script: select the deployed `session-do` Worker.
   - **Secret**
     - Click *Add secret*, name it `SESSION_SECRET`, and enter a long random string.
5. (Optional) Add an environment variable `LOG_LEVEL` if you want to gate internal logging.
6. Under **Settings → Triggers → Routes**, add a route such as `https://<your-domain>/api/*` pointing to this Worker. For testing, you can use the default workers.dev subdomain.
7. Click **Save** and deploy.

D1 schema setup
---------------
1. From the dashboard, open the D1 database and go to **Query**.
2. Paste the SQL from `schema/d1.sql` into the editor and run it once to initialize all tables and indexes.
3. (Optional) Seed data by adapting the JSON in `seed-data.json` into SQL insert statements via the query console.

R2 key layout reminder
----------------------
- `maps/{campaignId}/{mapId}/original.{ext}` – uploaded via the signed URL returned by `POST /api/maps`.
- `maps/{campaignId}/{mapId}/display.{ext}` – optimized copy for player display.
- `assets/{ownerId}/{fileNameOrId}` – marker/icon uploads.
- `backups/{campaignId}/{yyyy}/{mm}/{dd}/{HHmmss}.json` – automated session backups.

API Worker checklist
--------------------
- ✔️ `MAPS_DB` binding pointing at D1.
- ✔️ `MAPS_BUCKET` binding pointing at R2.
- ✔️ `SESSION_HUB` Durable Object namespace bound to the `SessionHub` class.
- ✔️ `SESSION_SECRET` secret populated.
- ✔️ Route covering `/api/*` so the Pages app can call the Worker.
- ✔️ D1 schema created before first use.

After deployment, test from the Quick Edit console with a `POST` to `/api/auth/signup`
(using the *Send test request* button) to verify the Worker responds correctly.
