# Session Hub Durable Object

This directory contains the Session Hub Durable Object that coordinates WebSocket connections for live game sessions. The project is configured as a standalone [Cloudflare Worker Durable Object](https://developers.cloudflare.com/workers/learning/using-durable-objects/) so it can be deployed directly with Wrangler.

## Project structure

```
workers/session-do/
├── src/index.ts              # Durable Object implementation and stub handler
├── worker-configuration.d.ts # Ambient type definitions for bindings
├── wrangler.toml             # Wrangler configuration and migrations
├── tsconfig.json             # TypeScript compiler options
├── package.json              # Development scripts and dependencies
└── .gitignore
```

## Getting started

Install dependencies and run the Durable Object locally:

```bash
npm install
npm run dev
```

`npm run dev` starts `wrangler dev` so you can exercise the Durable Object locally. If you need to override bindings for different environments, add additional sections such as `[env.production]` to `wrangler.toml`.

## Deploying

Deploy the worker with Wrangler once you have linked it to your Cloudflare account:

```bash
npm run deploy
```

The default configuration registers the `SessionHub` class under the `SESSION_HUB` binding and includes a migration (`v1`) that provisions the Durable Object namespace the first time you deploy.
