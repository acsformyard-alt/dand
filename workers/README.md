# Cloudflare Workers

This directory hosts the Cloudflare Workers that power the Dand application. Each folder is a self-contained [Wrangler](https://developers.cloudflare.com/workers/wrangler/) project that can be deployed directly to your Cloudflare account.

## Projects

- `api/` – REST API Worker that exposes authentication, campaign, map, asset, and session endpoints. The worker expects bindings to a D1 database, an R2 bucket, and the Session Hub Durable Object namespace.
- `session-do/` – Durable Object Worker that maintains real-time session state and coordinates WebSocket connections between the API and clients.

Each project ships with:

- TypeScript source in `src/`.
- Ambient binding definitions in `worker-configuration.d.ts`.
- A `wrangler.toml` file that you can customize with your account-specific resource IDs.
- Scripts in `package.json` for local development (`npm run dev`), deployment (`npm run deploy`), and type checking (`npm run typecheck`).

Refer to the README within each project for detailed setup and deployment instructions.
