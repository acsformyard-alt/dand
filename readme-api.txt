Cloudflare Worker: API (REST + Auth + R2)
========================================

Service Overview
----------------
* Worker filename: `cloudflare/api.js`
* Purpose: Handles authentication, campaign/map CRUD, R2 presigned uploads, Durable Object coordination, and session lifecycle for the D&D map reveal platform.

Prerequisites (Cloudflare Dashboard)
------------------------------------
1. **R2 Bucket** (for map and asset storage)
   * Navigate to **R2** → **Create bucket**.
   * Suggested name: `dnd-map-assets`.
2. **D1 Database** (for metadata)
   * Navigate to **Workers & Pages** → **D1** → **Create database**.
   * Suggested name: `dnd-map-db`.
   * After creation, go to the database → **Query editor** → paste the contents of `schema/d1.sql` and run them to create tables.
3. **Durable Object Namespace**
   * Create a namespace that will be bound to the session Durable Object worker (`session-do.js`).
   * Suggested name: `SESSION_HUB`.

Deploying the API Worker
------------------------
1. In the Cloudflare dashboard, go to **Workers & Pages** → **Create application** → **Create Worker**.
2. Name the worker (e.g., `dnd-api`). Choose **Quick edit** and replace the default code with the contents of `/cloudflare/api.js`.
3. Under **Settings** → **Variables & Secrets**, add the following bindings:

   Environment Variables / Bindings
   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   * **D1 Database Binding**
     * Type: D1 Database
     * Variable name: `MAPS_DB`
     * Select the `dnd-map-db` (or your chosen database).
   * **R2 Bucket Binding**
     * Type: R2 Bucket
     * Variable name: `MAPS_BUCKET`
     * Select the `dnd-map-assets` bucket.
   * **Durable Object Binding**
     * Type: Durable Object Namespace
     * Variable name: `SESSION_HUB`
     * Class name: `SessionHub`
     * Select the namespace created earlier.
   * **Text Secret**
     * Name: `SESSION_SECRET`
     * Value: any strong random string (used to sign JWTs).

4. Under **Triggers** → **Routes**, add a route that maps your desired domain/path to the worker (e.g., `https://api.example.com/*`). This URL will become the base for `VITE_API_BASE_URL`.
5. Save and deploy the worker.

D1 Schema & Seed Data
---------------------
* Paste `schema/d1.sql` into the D1 query editor and execute once.
* Optionally load `seed-data.json` manually using the query editor or API Explorer to pre-populate demo data.

Post-Deployment Checklist
-------------------------
* Confirm the worker responds at `https://<your-worker>.<account>.workers.dev/api/lobby`.
* Record the public API base URL for use in the Pages project (`VITE_API_BASE_URL`).
