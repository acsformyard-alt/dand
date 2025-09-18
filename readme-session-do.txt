Cloudflare Worker: Durable Object (Session Hub)
===============================================

Service Overview
----------------
* Worker filename: `cloudflare/session-do.js`
* Class exported: `SessionHub`
* Role: Maintains per-session realtime state (revealed regions, live markers, connected players) and powers WebSocket fan-out.

Setup Steps (Dashboard)
-----------------------
1. Navigate to **Workers & Pages** → **Create application** → **Create Worker**.
2. Name this worker (e.g., `dnd-session-hub`).
3. Click **Quick edit** and replace the default script with the contents of `/cloudflare/session-do.js`.
4. Press **Save and deploy**.

Durable Object Namespace
------------------------
1. From the deployed worker's settings, locate **Durable Objects** → **Add binding**.
2. Add a namespace with:
   * Class name: `SessionHub`
   * Binding name: `SESSION_HUB`
3. When prompted, create a new namespace (e.g., `dnd-session-hub`).
4. After saving, this namespace can now be bound to other workers.

Connecting to the API Worker
----------------------------
* In the API worker (`readme-api.txt`), add a Durable Object namespace binding pointing at the namespace created above. The binding must use the same class name (`SessionHub`) and binding variable (`SESSION_HUB`).
* No additional environment variables are required for the Durable Object worker itself.

Testing
-------
* From the Workers dashboard, open the Durable Object worker → **Quick edit** → **Preview**.
* Send an HTTP request to `/state` to verify it returns default JSON.
* Use the API worker WebSocket endpoint (`/api/sessions/:id/socket`) after session creation to validate realtime messaging.
