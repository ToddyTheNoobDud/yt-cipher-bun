// server.ts - Main server with optimized routing and authentication
import { serve, env } from 'bun';
import { initializeWorkers, shutdownWorkers } from './src/workerPool.ts';
import { initializeAllCaches } from './src/cacheManager.ts';
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

const createErrorResponse = (message: string, status: number): Response =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const authenticate = (req: Request): boolean =>
  !API_TOKEN || req.headers.get('authorization') === API_TOKEN;

const handler = async (req: Request): Promise<Response> => {
  if (!authenticate(req)) {
    return createErrorResponse(API_TOKEN ? 'Invalid API token' : 'Missing API token', 401);
  }

  const handlerFn = ROUTES.get(new URL(req.url).pathname);
  if (!handlerFn) {
    return createErrorResponse('Not Found', 404);
  }

  try {
    return await withPlayerUrlValidation(handlerFn)(req);
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
};

const initialize = async (): Promise<void> => {
  await initializeAllCaches();
  initializeWorkers();
};

const startServer = async (): Promise<void> => {
  await initialize();

  const server = serve({ fetch: handler, port: PORT });

  const shutdown = (): void => {
    shutdownWorkers();
    server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

startServer().catch((error) => {
  process.exit(1);
});