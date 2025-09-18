# Cloudflare Workers packages

This directory exposes the Cloudflare runtime code as standalone npm packages so
you can consume them from other repositories (including via git subpath
installs or `wrangler` remote module imports).

## Packages

- `@dand/workers-api` – REST API Worker published from `workers/api/worker.js`.
- `@dand/session-hub-do` – Durable Object Worker published from
  `workers/session-do/worker.js`.

Each package declares `type: "module"` and ships a default export compatible
with Cloudflare's module worker syntax.

### Installing directly from git

```bash
npm install git+https://github.com/your-org/dand.git#path:workers/api
npm install git+https://github.com/your-org/dand.git#path:workers/session-do
```

After installing you can import the worker module and re-export it from your own
Wrangler project or consume it as a remote module:

```js
import apiWorker from '@dand/workers-api';
export default apiWorker;
```

Update the git URL above to match wherever this repository is hosted.
