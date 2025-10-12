// types.ts - Type definitions
export interface SignatureRequest {
  encrypted_signature: string;
  n_param: string;
  player_url: string;
}

export interface SignatureResponse {
  decrypted_signature: string;
  decrypted_n_sig: string;
}

export interface StsRequest {
  player_url: string;
}

export interface StsResponse {
  sts: string;
}

export interface ResolveUrlRequest {
  stream_url: string;
  player_url: string;
  encrypted_signature?: string;
  signature_key?: string;
  n_param?: string;
}

export interface ResolveUrlResponse {
  resolved_url: string;
}

export interface Solvers {
  n: ((val: string) => string) | null;
  sig: ((val: string) => string) | null;
}

export interface RequestContext {
  req: Request;
  body: ApiRequest;
}

export type ApiRequest = SignatureRequest | StsRequest | ResolveUrlRequest;
