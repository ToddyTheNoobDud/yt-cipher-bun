// getSts.ts - Optimized with compiled regex
import {
  getPlayerFilePath,
  getPlayerContent,
  getSts,
  setSts
} from '../cacheManager.ts';
import type { StsRequest, StsResponse } from '../types.ts';

const STS_REGEX = /(?:signatureTimestamp|sts):(\d+)/;

const _error = (msg: string, status: number): Response =>
  new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

export const handleGetSts = async (req: Request): Promise<Response> => {
  let body: any;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return _error('Invalid JSON body', 400);
  }

  const { player_url } = body as StsRequest;

  if (!player_url) return _error('player_url is required', 400);

  let path: string;
  try {
    path = await getPlayerFilePath(player_url);
  } catch (err) {
    return _error(err instanceof Error ? err.message : 'Failed to resolve player file path', 500);
  }

  const cached = getSts(path);
  if (cached) {
    const res: StsResponse = { sts: cached };
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let content: string;
  try {
    content = await getPlayerContent(path);
  } catch {
    return _error('Failed to read player file', 500);
  }

  const match = content.match(STS_REGEX);
  if (!match?.[1]) return _error('Timestamp not found in player script', 404);

  const sts = match[1];
  setSts(path, sts);

  const res: StsResponse = { sts };
  return new Response(JSON.stringify(res), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};