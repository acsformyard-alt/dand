import type { D1Database, R2Bucket, DurableObjectNamespace } from '@cloudflare/workers-types';

export {};

declare global {
  interface Env {
    MAPS_DB: D1Database;
    MAPS_BUCKET: R2Bucket;
    SESSION_SECRET: string;
    SESSION_HUB: DurableObjectNamespace;
  }
}
