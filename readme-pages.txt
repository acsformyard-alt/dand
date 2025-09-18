Cloudflare Pages: React + Vite frontend
======================================

The UI lives in `apps/pages`. Deploy it as a Cloudflare Pages project directly from
the dashboard (no local CLI required).

Project creation
----------------
1. Zip or upload the `apps/pages` folder contents when prompted by Pages.
2. In the Cloudflare dashboard, go to **Workers & Pages → Create application → Pages → Upload assets**.
3. Upload the folder (drag & drop) or provide a Git repo with the same structure.
4. When configuring build settings, use:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node version:** use the default (>=18) or set `NODE_VERSION=18` in environment variables.
5. Save and deploy. Pages will install dependencies, run `npm run build`, and publish the static assets from `dist`.

Environment variables
---------------------
Create the same variables for both **Production** and **Preview** environments:
- `VITE_API_BASE_URL` → URL to your API Worker route (e.g., `https://dand-api.yourdomain.com`). Include the `/api` prefix.

(Optional) secrets or additional vars can be added through the Pages dashboard as needed.

Connecting to the Workers backend
---------------------------------
- Ensure the API Worker route is publicly accessible (e.g., `https://yourdomain.com/api/*`).
- In the Pages project, the frontend reads `import.meta.env.VITE_API_BASE_URL` to build REST and WebSocket URLs.
- If the Worker shares the same hostname as Pages, you may set `VITE_API_BASE_URL` to an empty string to use relative requests.

Preview deployments
-------------------
Every upload or Git commit creates a preview. Remember to set the preview environment variable `VITE_API_BASE_URL` so previews
hit the correct API base (usually the same value as production if using a workers.dev subdomain).

After the first deploy, visit the Pages URL, log in using the API Worker’s auth endpoints, and verify you can list campaigns and
join a session.
