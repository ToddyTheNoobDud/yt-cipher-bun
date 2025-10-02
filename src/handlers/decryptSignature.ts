// decryptSignature.ts - Optimized with result caching
import type { Input as MainInput } from '../../ejs/src/main.ts';
import { execInPool } from '../workerPool.ts';
import {
  getPlayerFilePath,
  getPlayerContent,
  getPreprocessedPlayer,
  setPreprocessedPlayer,
  getSignatureResult,
  setSignatureResult
} from '../cacheManager.ts';
import type { SignatureRequest, SignatureResponse } from '../types.ts';

const createErrorResponse = (message: string, status: number): Response =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

function generateCacheKey(playerFilePath: string, encSig: string, nParam: string): string {
  return `${playerFilePath}:${encSig}:${nParam}`;
}

export const handleDecryptSignature = async (req: Request): Promise<Response> => {
  let body: any;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return createErrorResponse('Invalid JSON body', 400);
  }

  const { encrypted_signature, n_param, player_url } = body as SignatureRequest;

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

  const cacheKey = generateCacheKey(
    playerFilePath,
    encrypted_signature || '',
    n_param || ''
  );
  const cachedResult = getSignatureResult(cacheKey);

  if (cachedResult) {
    const [decryptedSignature, decryptedNSig] = cachedResult.split('|');
    const response: SignatureResponse = {
      decrypted_signature: decryptedSignature || '',
      decrypted_n_sig: decryptedNSig || ''
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const cachedPreprocessed = await getPreprocessedPlayer(playerFilePath);

  let player: string | undefined;
  if (!cachedPreprocessed) {
    try {
      player = await getPlayerContent(playerFilePath);
    } catch (err) {
      return createErrorResponse('Failed to read player file', 500);
    }
  }

  const mainInput: MainInput = cachedPreprocessed
    ? {
        type: 'preprocessed',
        preprocessed_player: cachedPreprocessed,
        requests: [
          { type: 'sig', challenges: encrypted_signature ? [encrypted_signature] : [] },
          { type: 'nsig', challenges: n_param ? [n_param] : [] }
        ]
      }
    : {
        type: 'player',
        player: player!,
        output_preprocessed: true,
        requests: [
          { type: 'sig', challenges: encrypted_signature ? [encrypted_signature] : [] },
          { type: 'nsig', challenges: n_param ? [n_param] : [] }
        ]
      };

  const output = await execInPool(mainInput);

  if (output.type === 'error') {
    return createErrorResponse(output.error, 500);
  }

  if (output.preprocessed_player && !cachedPreprocessed) {
    await setPreprocessedPlayer(playerFilePath, output.preprocessed_player);
  }

  let decryptedSignature = '';
  let decryptedNSig = '';

  for (const r of output.responses || []) {
    if (r.type === 'result') {
      if (encrypted_signature && encrypted_signature in r.data) {
        decryptedSignature = r.data[encrypted_signature];
      }
      if (n_param && n_param in r.data) {
        decryptedNSig = r.data[n_param];
      }
    }
  }

  const resultValue = `${decryptedSignature}|${decryptedNSig}`;
  setSignatureResult(cacheKey, resultValue);

  const response: SignatureResponse = {
    decrypted_signature: decryptedSignature,
    decrypted_n_sig: decryptedNSig
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};