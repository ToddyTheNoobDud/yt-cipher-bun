import type { Input } from '../../ejs/src/main.ts';
import { execInPool } from '../workerPool.ts';
import {
  getPlayerFilePath,
  getPlayerContent,
  getPreprocessed,
  setPreprocessed,
  getSignature,
  setSignature
} from '../cacheManager.ts';
import type { SignatureRequest, SignatureResponse } from '../types.ts';

const _error = (msg: string, status: number): Response =>
  new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const _key = (path: string, sig: string, n: string): string => `${path}:${sig}:${n}`;

export const handleDecryptSignature = async (req: Request): Promise<Response> => {
  let body: any;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return _error('Invalid JSON body', 400);
  }

  const { encrypted_signature, n_param, player_url } = body as SignatureRequest;

  if (!player_url) return _error('player_url is required', 400);

  let path: string;
  try {
    path = await getPlayerFilePath(player_url);
  } catch (err) {
    return _error(err instanceof Error ? err.message : 'Failed to resolve player file path', 500);
  }

  const key = _key(path, encrypted_signature || '', n_param || '');
  const cached = getSignature(key);

  if (cached) {
    const [sig, nsig] = cached.split('|');
    const res: SignatureResponse = {
      decrypted_signature: sig || '',
      decrypted_n_sig: nsig || ''
    };
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const preprocessed = await getPreprocessed(path);

  let player: string | undefined;
  if (!preprocessed) {
    try {
      player = await getPlayerContent(path);
    } catch {
      return _error('Failed to read player file', 500);
    }
  }

  const input: Input = preprocessed
    ? {
        type: 'preprocessed',
        preprocessed_player: preprocessed,
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

  const output = await execInPool(input);

  if (output.type === 'error') return _error(output.error, 500);

  if (output.preprocessed_player && !preprocessed) {
    await setPreprocessed(path, output.preprocessed_player);
  }

  let sig = '';
  let nsig = '';

  for (const r of output.responses || []) {
    if (r.type === 'result') {
      if (encrypted_signature && encrypted_signature in r.data) {
        sig = r.data[encrypted_signature];
      }
      if (n_param && n_param in r.data) {
        nsig = r.data[n_param];
      }
    }
  }

  const value = `${sig}|${nsig}`;
  setSignature(key, value);

  const res: SignatureResponse = {
    decrypted_signature: sig,
    decrypted_n_sig: nsig
  };

  return new Response(JSON.stringify(res), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });

};
