Cloudflare Pages Frontend (React + Vite)
=======================================

Project Location
----------------
* Directory: `apps/pages`
* Framework: React 18 + TypeScript + Tailwind CSS (built with Vite)

Creating the Pages Project
--------------------------
1. Commit this repository to your source control (GitHub/GitLab/Bitbucket) or upload manually.
2. In the Cloudflare dashboard, go to **Workers & Pages** → **Create application** → **Pages**.
3. Choose **Connect to Git** and authorize the repository.
4. When prompted for build settings, use:
   * **Production branch:** `main` (or your default branch)
   * **Build command:** `npm install && npm run build`
   * **Build output directory:** `apps/pages/dist`
   * **Node version:** 18 or newer (Pages defaults to a modern Node runtime).
5. Click **Save and Deploy**. The first deployment will install dependencies and generate the static build.

Environment Variables
---------------------
* Navigate to the Pages project → **Settings** → **Environment Variables**.
* Add the variable below for both Production and Preview environments:
  * Name: `VITE_API_BASE_URL`
  * Value: The full HTTPS base URL of the API worker route (e.g., `https://api.example.com`).
* Re-deploy after saving to ensure the frontend picks up the configuration.

Preview Deployments
-------------------
* Every commit/PR automatically triggers a Preview build.
* You can override `VITE_API_BASE_URL` for Preview deployments (e.g., point to a staging API Worker) under the **Preview** tab in Environment Variables.

Connecting to the API & DO Workers
----------------------------------
* Ensure the API worker exposes the `/api/*` routes on the hostname used in `VITE_API_BASE_URL`.
* The API worker internally proxies WebSocket upgrades to the Durable Object (`/api/sessions/:id/socket`), so no extra configuration is needed in Pages.

Local Development (Optional)
----------------------------
While all deployment steps can be performed via the dashboard, you can test locally by running:
```
cd apps/pages
npm install
npm run dev
```
Then visit `http://localhost:5173` with `VITE_API_BASE_URL` set in a `.env` file or shell environment.
