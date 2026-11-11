// Minimal Cloudflare Workers type stubs for the main tsconfig compilation context.
// Full types come from @cloudflare/workers-types in functions/tsconfig.json.
// These stubs exist so that server/http.ts (and other server/ files) typecheck correctly
// when imported transitively by tests/ under the main tsconfig.

/* eslint-disable @typescript-eslint/no-empty-object-type */
interface KVNamespace {}
interface D1Database {}
