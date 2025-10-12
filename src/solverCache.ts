// solverCache.ts - Cache for solver functions
import { InstrumentedLRU } from './instrumentedCache.ts';
import type { Solvers } from './types.ts';

const cacheSizeEnv = 50; // Default size for Bun version
export const solverCache = new InstrumentedLRU<Solvers>('solver', cacheSizeEnv);
