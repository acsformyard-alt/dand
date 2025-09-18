Cloudflare Worker: Durable Object Session Hub
=============================================

Deploy `workers/session-do/worker.js` as the Durable Object that manages live session
state and WebSocket fan-out.

Steps
-----
1. In the dashboard, go to **Workers & Pages → Create application → Create Worker**.
2. Name it `session-do` (or similar). Choose **Quick Edit** and replace the script
   with the contents of `workers/session-do/worker.js`. Save.
   - Alternatively install the package with
     `npm install git+https://github.com/your-org/dand.git#path:workers/session-do`
     and re-export `@dand/session-hub-do` from your own Worker project.
3. Open **Settings → Durable Objects** and configure:
   - Class name: `SessionHub`
   - Script: (this worker)
   - Add a namespace (e.g., `session-hub-prod`).
4. Under **Settings → Variables**, no extra bindings are required for this worker.
5. Deploy the worker.

Usage notes
-----------
- The API Worker binds this Durable Object as `SESSION_HUB`.
- Each game session creates/uses a Durable Object instance keyed by the session ID
  (`env.SESSION_HUB.idFromName(sessionId)`).
- WebSocket upgrades should be proxied through the API Worker route
  `/api/sessions/:id/ws` (already implemented in `api.js`).
- No cron triggers or additional routes are required; this worker only serves DO traffic.

Validation
----------
After publishing, return to the API Worker bindings and ensure the Durable Object
namespace references this worker and the `SessionHub` class. Then run a quick
manual test by opening the **Quick Edit → Preview** for the API Worker and
connecting to `/api/sessions/<sessionId>/ws` once a session exists.
