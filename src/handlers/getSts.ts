import { getPlayerFilePath } from '../playerCache.ts';
import type { StsRequest, StsResponse } from '../types.ts';
import fs from 'fs/promises';

const STS_REGEX = /(?:signatureTimestamp|sts):(\d+)/;
const stsCache = new Map<string, string>();

const _createErrorResponse = (message: string, status: number): Response =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

export const handleGetSts = async (req: Request): Promise<Response> => {
  let body: any;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return _createErrorResponse('Invalid JSON body', 400);
  }

  const { player_url } = body as StsRequest;

  if (!player_url) {
    return _createErrorResponse('player_url is required', 400);
  }

  let playerFilePath: string;
  try {
    playerFilePath = await getPlayerFilePath(player_url);
  } catch (err) {
    return _createErrorResponse(
      err instanceof Error ? err.message : 'Failed to resolve player file path',
      500
    );
  }

  const cached = stsCache.get(playerFilePath);
  if (cached) {
    const response: StsResponse = { sts: cached };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let playerContent: string;
  try {
    playerContent = await fs.readFile(playerFilePath, 'utf8');
  } catch {
    return _createErrorResponse('Failed to read player file', 500);
  }

  const match = playerContent.match(STS_REGEX);
  if (!match?.[1]) {
    return _createErrorResponse('Timestamp not found in player script', 404);
  }

  const sts = match[1];
  stsCache.set(playerFilePath, sts);

  if (stsCache.size > 100) {
    const firstKey = stsCache.keys().next().value;
    stsCache.delete(firstKey);
  }

  const response: StsResponse = { sts };
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};