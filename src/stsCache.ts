// stsCache.ts - Cache for STS values
import { InstrumentedLRU } from './instrumentedCache.ts';

const cacheSizeEnv = 150; // Default size for Bun version
export const stsCache = new InstrumentedLRU<string>('sts', cacheSizeEnv);
