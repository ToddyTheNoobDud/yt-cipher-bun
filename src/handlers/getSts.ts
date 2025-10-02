// getSts.ts - Optimized with compiled regex and integrated caching
import {
  getPlayerFilePath,
  getPlayerContent,
  getStsValue,
  setStsValue
} from '../cacheManager.ts';
import type { StsRequest, StsResponse } from '../types.ts';

const STS_REGEX = /(?:signatureTimestamp|sts):(\d+)/;

const createErrorResponse = (message: string, status: number): Response =>
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
    return createErrorResponse('Invalid JSON body', 400);
  }

  const { player_url } = body as StsRequest;

  if (!player_url) {
    return createErrorResponse('player_url is required', 400);
  }

  let playerFilePath: string;
  try {
    playerFilePath = await getPlayerFilePath(player_url);
  } catch (err) {
    return createErrorResponse(
      err instanceof Error ? err.message : 'Failed to resolve player file path',
      500
    );
  }

  const cached = getStsValue(playerFilePath);
  if (cached) {
    const response: StsResponse = { sts: cached };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let playerContent: string;
  try {
    playerContent = await getPlayerContent(playerFilePath);
  } catch {
    return createErrorResponse('Failed to read player file', 500);
  }

  const match = playerContent.match(STS_REGEX);
  if (!match?.[1]) {
    return createErrorResponse('Timestamp not found in player script', 404);
  }

  const sts = match[1];
  setStsValue(playerFilePath, sts);

  const response: StsResponse = { sts };
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};