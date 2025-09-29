import { serve, env } from 'bun';
import { initializeWorkers, shutdownWorkers } from './src/workerPool.ts';
import { initializeCache } from './src/playerCache.ts';
import { handleDecryptSignature } from './src/handlers/decryptSignature.ts';
import { handleGetSts } from './src/handlers/getSts.ts';
import { withPlayerUrlValidation } from './src/middleware.ts';

const API_TOKEN = env.API_TOKEN || '';
const PORT = parseInt(env.PORT || '8001', 10);
const HOST = env.HOST || '127.0.0.1';

const ROUTES = new Map<string, (req: Request) => Promise<Response>>([
  ['/decrypt_signature', handleDecryptSignature],
  ['/get_sts', handleGetSts]
]);

const _createErrorResponse = (message: string, status: number): Response =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const _authenticate = (req: Request): boolean =>
  !API_TOKEN || req.headers.get('authorization') === API_TOKEN;

const handler = async (req: Request): Promise<Response> => {
  if (!_authenticate(req)) {
    return _createErrorResponse(API_TOKEN ? 'Invalid API token' : 'Missing API token', 401);
  }

  const handler = ROUTES.get(new URL(req.url).pathname);
  if (!handler) {
    return _createErrorResponse('Not Found', 404);
  }

  try {
    return await withPlayerUrlValidation(handler)(req);
  } catch (error) {
    return _createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
};

const _initialize = async (): Promise<void> => {
  await initializeCache();
  initializeWorkers();
};

const _startServer = async (): Promise<void> => {
  await _initialize();

  const server = serve({ fetch: handler, port: PORT });

  const shutdown = (): void => {
    shutdownWorkers();
    server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

_startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});