# Dand API Worker

This project packages the Dand REST API as a standalone [Cloudflare Worker](https://developers.cloudflare.com/workers/). It exposes the JSON API that backs the battle map application and is ready to deploy with [Wrangler](https://developers.cloudflare.com/workers/wrangler/).

## Project structure

```
workers/api/
├── src/index.ts              # Worker entry point
├── worker-configuration.d.ts # Type definitions for bindings
├── wrangler.toml             # Wrangler deployment config
├── tsconfig.json             # TypeScript configuration
├── package.json              # Scripts and dev dependencies
└── .gitignore
```

## Getting started

Install dependencies and run the worker locally:

```bash
npm install
npm run dev
```

`npm run dev` executes `wrangler dev`, which spins up the worker using the bindings defined in `wrangler.toml`. Update the binding placeholders (database IDs, bucket names, secrets, etc.) before running it against your own Cloudflare account.

## Deploying

Deploy with Wrangler once the configuration matches your Cloudflare resources:

```bash
npm run deploy
```

You can set per-environment overrides in `[env.production]` or other sections inside `wrangler.toml` if you need different bindings between environments.

## Environment bindings

The worker expects the following Cloudflare resources:

- `MAPS_DB` – D1 database containing campaign, map, and user tables.
- `MAPS_BUCKET` – R2 bucket used for map images, assets, and backups.
- `SESSION_SECRET` – secret string used to sign session tokens.
- `SESSION_HUB` – Durable Object namespace that points at the Session Hub worker.

Refer to `worker-configuration.d.ts` for the full type definitions.
