import { validateAndNormalizePlayerUrl } from './utils.ts';

type Next = (req: Request) => Promise<Response>;

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const RATE_LIMIT_MAP = new Map<string, RateLimitEntry>();
const MAX_REQUESTS = 100;
const WINDOW_MS = 60000;
const CLEANUP_INTERVAL = 300000;

const _createErrorResponse = (message: string, status: number): Response =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const _getClientId = (req: Request): string =>
  req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
  req.headers.get('x-real-ip') ||
  req.headers.get('cf-connecting-ip') ||
  'unknown';

const _cleanupExpiredEntries = (): void => {
  const now = Date.now();
  for (const [key, entry] of RATE_LIMIT_MAP) {
    if (now > entry.resetTime) {
      RATE_LIMIT_MAP.delete(key);
    }
  }
};

const _cleanupTimer = setInterval(_cleanupExpiredEntries, CLEANUP_INTERVAL);
if (_cleanupTimer.unref) _cleanupTimer.unref();

const _isRateLimited = (clientId: string): boolean => {
  const now = Date.now();
  const entry = RATE_LIMIT_MAP.get(clientId);

  if (!entry || now > entry.resetTime) {
    RATE_LIMIT_MAP.set(clientId, { count: 1, resetTime: now + WINDOW_MS });
    return false;
  }

  if (entry.count >= MAX_REQUESTS) {
    return true;
  }

  entry.count++;
  return false;
};

export const withPlayerUrlValidation = (handler: Next): Next => {
  return async (req: Request): Promise<Response> => {
    const clientId = _getClientId(req);
    if (_isRateLimited(clientId)) {
      return _createErrorResponse('Rate limit exceeded', 429);
    }

    if (req.method !== 'POST') {
      return handler(req);
    }

    let body: any;
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      return _createErrorResponse('Invalid JSON body', 400);
    }

    if (!body.player_url) {
      return _createErrorResponse('player_url is required', 400);
    }

    let normalizedUrl: string;
    try {
      normalizedUrl = validateAndNormalizePlayerUrl(body.player_url);
    } catch (error) {
      return _createErrorResponse(
        error instanceof Error ? error.message : 'Invalid player URL',
        400
      );
    }

    const newReq = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify({ ...body, player_url: normalizedUrl })
    });

    return handler(newReq);
  };
};