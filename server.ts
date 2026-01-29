import { serve, env } from 'bun';
import { initWorkers, shutdownWorkers } from './src/workerPool.ts';
import { initCaches } from './src/cacheManager.ts';
import { handleDecryptSignature } from './src/handlers/decryptSignature.ts';
import { handleGetSts } from './src/handlers/getSts.ts';
import { handleResolveUrl } from './src/handlers/resolveUrl.ts';
import { withValidation } from './src/middleware.ts';

const API_TOKEN = env.API_TOKEN || '';
const PORT = parseInt(env.PORT || '8001', 10);
const HAS_TOKEN = !!API_TOKEN;

const ROUTES = new Map([
  ['/decrypt_signature', handleDecryptSignature],
  ['/get_sts', handleGetSts],
  ['/resolve_url', handleResolveUrl]
]);

const ERROR_HEADERS = { 'Content-Type': 'application/json' };
const UNAUTHORIZED = new Response(
  JSON.stringify({ error: HAS_TOKEN ? 'Invalid API token' : 'Missing API token' }),
  { status: 200, headers: ERROR_HEADERS }
);
const NOT_FOUND = new Response(
  JSON.stringify({ error: 'Not Found' }),
  { status: 404, headers: ERROR_HEADERS }
);

const _error = (msg: string, status: number): Response =>
  new Response(JSON.stringify({ error: msg }), {
    status,
    headers: ERROR_HEADERS
  });

const handler = async (req: Request): Promise<Response> => {
  if (HAS_TOKEN && req.headers.get('authorization') !== API_TOKEN) {
    return UNAUTHORIZED;
  }

  const fn = ROUTES.get(new URL(req.url).pathname);
  if (!fn) return NOT_FOUND;

  try {
    return await withValidation(fn)(req);
  } catch (error) {
    return _error(error instanceof Error ? error.message : 'Unknown error', 500);
  }
};

const start = async (): Promise<void> => {
  await initCaches();
  initWorkers();

  const server = serve({ fetch: handler, port: PORT });

  const shutdown = (): void => {
    shutdownWorkers();
    server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

start().catch(() => process.exit(1));
