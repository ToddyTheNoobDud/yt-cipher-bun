// tuff
import { serve, env } from 'bun';
import { initWorkers, shutdownWorkers } from './src/workerPool.ts';
import { initCaches } from './src/cacheManager.ts';
import { handleDecryptSignature } from './src/handlers/decryptSignature.ts';
import { handleGetSts } from './src/handlers/getSts.ts';
import { handleResolveUrl } from './src/handlers/resolveUrl.ts';
import { withValidation } from './src/middleware.ts';

const API_TOKEN = env.API_TOKEN || '';
const PORT = parseInt(env.PORT || '8001', 10);

const ROUTES = new Map([
  ['/decrypt_signature', handleDecryptSignature],
  ['/get_sts', handleGetSts],
  ['/resolve_url', handleResolveUrl]
]);

const _error = (msg: string, status: number): Response =>
  new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const _auth = (req: Request): boolean =>
  !API_TOKEN || req.headers.get('authorization') === API_TOKEN;

const handler = async (req: Request): Promise<Response> => {
  if (!_auth(req)) return _error(API_TOKEN ? 'Invalid API token' : 'Missing API token', 401);

  const fn = ROUTES.get(new URL(req.url).pathname);
  if (!fn) return _error('Not Found', 404);

  try {
    return await withValidation(fn)(req);
  } catch (error) {
    return _error(error instanceof Error ? error.message : 'Unknown error', 500);
  }
};

const init = async (): Promise<void> => {
  await initCaches();
  initWorkers();
};

const start = async (): Promise<void> => {
  await init();
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

