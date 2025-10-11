// resolveUrl.ts - Optimized URL resolution with signature and n-parameter decryption
import main from '../../ejs/src/main.ts';
import {
  getPlayerFilePath,
  getPlayerContent,
  getPreprocessed,
  setPreprocessed
} from '../cacheManager.ts';
import type { ResolveUrlRequest, ResolveUrlResponse } from '../types.ts';

const _error = (msg: string, status: number): Response =>
  new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const _decryptSignature = async (player_url: string, encrypted_signature: string): Promise<string | null> => {
  let path: string;
  try {
    path = await getPlayerFilePath(player_url);
  } catch {
    return null;
  }

  const preprocessed = await getPreprocessed(path);
  let player: string | undefined;

  if (!preprocessed) {
    try {
      player = await getPlayerContent(path);
    } catch {
      return null;
    }
  }

  try {
    const input = preprocessed
      ? {
          type: 'preprocessed' as const,
          preprocessed_player: preprocessed,
          requests: [
            { type: 'sig' as const, challenges: [encrypted_signature] }
          ]
        }
      : {
          type: 'player' as const,
          player: player!,
          output_preprocessed: true,
          requests: [
            { type: 'sig' as const, challenges: [encrypted_signature] }
          ]
        };

    const output = main(input);

    if (output.type === 'error') return null;

    if (output.preprocessed_player && !preprocessed) {
      await setPreprocessed(path, output.preprocessed_player);
    }

    // Extract the decrypted signature from the response
    for (const response of output.responses) {
      if (response.type === 'result' && encrypted_signature in response.data) {
        return response.data[encrypted_signature];
      }
    }

    return null;
  } catch (error) {
    console.error('Error decrypting signature:', error);
    return null;
  }
};

const _decryptNParam = async (player_url: string, n_param: string): Promise<string | null> => {
  let path: string;
  try {
    path = await getPlayerFilePath(player_url);
  } catch {
    return null;
  }

  const preprocessed = await getPreprocessed(path);
  let player: string | undefined;

  if (!preprocessed) {
    try {
      player = await getPlayerContent(path);
    } catch {
      return null;
    }
  }

  try {
    const input = preprocessed
      ? {
          type: 'preprocessed' as const,
          preprocessed_player: preprocessed,
          requests: [
            { type: 'nsig' as const, challenges: [n_param] }
          ]
        }
      : {
          type: 'player' as const,
          player: player!,
          output_preprocessed: true,
          requests: [
            { type: 'nsig' as const, challenges: [n_param] }
          ]
        };

    const output = main(input);

    if (output.type === 'error') return null;

    if (output.preprocessed_player && !preprocessed) {
      await setPreprocessed(path, output.preprocessed_player);
    }

    // Extract the decrypted n parameter from the response
    for (const response of output.responses) {
      if (response.type === 'result' && n_param in response.data) {
        return response.data[n_param];
      }
    }

    return null;
  } catch (error) {
    console.error('Error decrypting n parameter:', error);
    return null;
  }
};

export const handleResolveUrl = async (req: Request): Promise<Response> => {
  let body: any;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return _error('Invalid JSON body', 400);
  }

  const { stream_url, player_url, encrypted_signature, signature_key, n_param: nParamFromRequest } = body as ResolveUrlRequest;

  if (!stream_url) return _error('stream_url is required', 400);
  if (!player_url) return _error('player_url is required', 400);
  if (!encrypted_signature) return _error('encrypted_signature is required', 400);

  const url = new URL(stream_url);

  // Decrypt signature if provided
  if (encrypted_signature) {
    const decryptedSig = await _decryptSignature(player_url, encrypted_signature);
    if (!decryptedSig) {
      return _error('Failed to decrypt signature', 500);
    }
    const sigKey = signature_key || 'sig';
    url.searchParams.set(sigKey, decryptedSig);
    url.searchParams.delete('s');
  }

  // Decrypt n parameter if provided or found in URL
  let nParam = nParamFromRequest || null;
  if (!nParam) {
    nParam = url.searchParams.get('n');
  }

  if (nParam) {
    const decryptedN = await _decryptNParam(player_url, nParam);
    if (!decryptedN) {
      return _error('Failed to decrypt n parameter', 500);
    }
    url.searchParams.set('n', decryptedN);
  }

  const response: ResolveUrlResponse = {
    resolved_url: url.toString(),
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
