// cacheManager.ts - Zstandard compression for Bun 1.3 lol
import { join } from 'path';
import fs from 'fs/promises';
import { zstdCompress, zstdDecompress } from 'bun';

const CACHE_DIR = join(process.cwd(), 'player_cache');
const PROCESSED_DIR = join(CACHE_DIR, 'processed');
const META_FILE = join(CACHE_DIR, 'meta.json');

// Constants
const MEMORY_CACHE_SIZE = 50;
const DISK_CACHE_SIZE = 100;
const SIGNATURE_CACHE_SIZE = 500;
const HASH_CACHE_SIZE = 200;
const PLAYER_TTL = 172800000; // 2 days
const CACHE_TTL = 86400000; // 1 day
const SIG_TTL = 3600000; // 1 hour
const CLEANUP_INTERVAL = 3600000; // 1 hour
const META_SAVE_DELAY = 5000;
const COMPRESSION_THRESHOLD = 262144; // Compress files larger than 2.5MB, ig this is good already

interface CacheEntry<T> {
  v: T;
  t: number;
  a: number;
}

interface Metadata {
  players: Record<string, { url: string; t: number; a: number; compressed?: boolean }>;
  processed: Record<string, { t: number; a: number; compressed?: boolean }>;
}

// Fast LRU cache implementation
class LRUCache<T> {
  private c = new Map<string, CacheEntry<T>>();
  private m: number;
  private ttl: number;

  constructor(maxSize: number, ttl: number) {
    this.m = maxSize;
    this.ttl = ttl;
  }

  get(k: string): T | undefined {
    const e = this.c.get(k);
    if (!e) return undefined;

    const now = Date.now();
    if (now - e.t > this.ttl) {
      this.c.delete(k);
      return undefined;
    }

    e.a = now;
    this.c.delete(k);
    this.c.set(k, e);
    return e.v;
  }

  set(k: string, v: T): void {
    const now = Date.now();
    if (this.c.has(k)) {
      this.c.delete(k);
    } else if (this.c.size >= this.m) {
      const firstKey = this.c.keys().next().value;
      this.c.delete(firstKey);
    }
    this.c.set(k, { v, t: now, a: now });
  }

  has(k: string): boolean {
    const e = this.c.get(k);
    if (!e) return false;
    if (Date.now() - e.t > this.ttl) {
      this.c.delete(k);
      return false;
    }
    return true;
  }
}

// Global caches
const hashCache = new LRUCache<string>(HASH_CACHE_SIZE, Infinity);
const contentCache = new LRUCache<string>(MEMORY_CACHE_SIZE, CACHE_TTL);
const sigCache = new LRUCache<string>(SIGNATURE_CACHE_SIZE, SIG_TTL);
const stsCache = new LRUCache<string>(100, CACHE_TTL);

let metadata: Metadata = { players: {}, processed: {} };
let metaLoaded = false;
let metaDirty = false;
let saveTimer: NodeJS.Timeout | undefined;

// Fast hash computation with caching
const _hash = async (s: string): Promise<string> => {
  const cached = hashCache.get(s);
  if (cached) return cached;

  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const h = Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  hashCache.set(s, h);
  return h;
};

// Compression helpers using Bun 1.3's native zstd
const _shouldCompress = (content: string): boolean => {
  return content.length > COMPRESSION_THRESHOLD;
};

const _compressContent = async (content: string): Promise<{ data: Uint8Array; compressed: boolean }> => {
  if (!_shouldCompress(content)) {
    return { data: new TextEncoder().encode(content), compressed: false };
  }

  const compressed = await zstdCompress(content);
  return { data: compressed, compressed: true };
};

const _decompressContent = async (data: Uint8Array, compressed: boolean): Promise<string> => {
  if (!compressed) {
    return new TextDecoder().decode(data);
  }

  const decompressed = await zstdDecompress(data);
  return new TextDecoder().decode(decompressed);
};

// Lazy metadata loading
const _loadMeta = async (): Promise<void> => {
  if (metaLoaded) return;

  try {
    const data = await fs.readFile(META_FILE, 'utf8');
    metadata = JSON.parse(data);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
    metadata = { players: {}, processed: {} };
  }
  metaLoaded = true;
};

// Batched metadata saving
const _saveMeta = async (): Promise<void> => {
  if (!metaDirty) return;
  await fs.writeFile(META_FILE, JSON.stringify(metadata), 'utf8');
  metaDirty = false;
};

const _scheduleSave = (): void => {
  if (saveTimer) return;
  metaDirty = true;
  saveTimer = setTimeout(async () => {
    await _saveMeta();
    saveTimer = undefined;
  }, META_SAVE_DELAY);
  if (saveTimer.unref) saveTimer.unref();
};

// Cleanup expired entries
const _cleanup = async (): Promise<void> => {
  await _loadMeta();
  const now = Date.now();
  const toDelete: string[] = [];

  for (const [hash, meta] of Object.entries(metadata.players)) {
    if (now - meta.t > PLAYER_TTL) {
      toDelete.push(hash);
      try {
        await fs.unlink(join(CACHE_DIR, `${hash}.js${meta.compressed ? '.zst' : ''}`));
      } catch {}
    }
  }

  for (const [key, meta] of Object.entries(metadata.processed)) {
    if (now - meta.t > CACHE_TTL) {
      const hash = key.split('/').pop()?.replace('.js', '') || '';
      try {
        await fs.unlink(join(PROCESSED_DIR, `${hash}_processed.js${meta.compressed ? '.zst' : ''}`));
      } catch {}
      delete metadata.processed[key];
    }
  }

  for (const hash of toDelete) {
    delete metadata.players[hash];
  }

  if (toDelete.length > 0) {
    metaDirty = true;
    await _saveMeta();
  }
};

const cleanupTimer = setInterval(_cleanup, CLEANUP_INTERVAL);
if (cleanupTimer.unref) cleanupTimer.unref();

// Public API
export const getPlayerFilePath = async (url: string): Promise<string> => {
  const hash = await _hash(url);
  const baseFilePath = join(CACHE_DIR, `${hash}.js`);
  const now = Date.now();

  await _loadMeta();

  if (metadata.players[hash]) {
    metadata.players[hash].a = now;
    if (now - metadata.players[hash].t <= PLAYER_TTL) {
      const filePath = metadata.players[hash].compressed
        ? `${baseFilePath}.zst`
        : baseFilePath;
      try {
        await fs.access(filePath);
        _scheduleSave();
        return baseFilePath; // Return base path, compression is handled internally
      } catch {
        delete metadata.players[hash];
      }
    } else {
      try {
        const filePath = metadata.players[hash].compressed
          ? `${baseFilePath}.zst`
          : baseFilePath;
        await fs.unlink(filePath);
      } catch {}
      delete metadata.players[hash];
    }
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch player: ${res.statusText}`);

  const content = await res.text();
  const { data, compressed } = await _compressContent(content);

  const filePath = compressed ? `${baseFilePath}.zst` : baseFilePath;
  await fs.writeFile(filePath, data);

  metadata.players[hash] = { url, t: now, a: now, compressed };
  _scheduleSave();

  return baseFilePath;
};

export const getPlayerContent = async (path: string): Promise<string> => {
  const cached = contentCache.get(path);
  if (cached) return cached;

  await _loadMeta();
  const hash = path.split('/').pop()?.replace('.js', '') || '';
  const playerMeta = metadata.players[hash];

  const filePath = playerMeta?.compressed ? `${path}.zst` : path;
  const data = await fs.readFile(filePath);
  const content = await _decompressContent(
    new Uint8Array(data),
    playerMeta?.compressed || false
  );

  contentCache.set(path, content);
  return content;
};

export const getPreprocessed = async (path: string): Promise<string | undefined> => {
  await _loadMeta();
  const meta = metadata.processed[path];
  if (!meta) return undefined;

  const now = Date.now();
  if (now - meta.t > CACHE_TTL) {
    const hash = path.split('/').pop()?.replace('.js', '') || '';
    const file = join(PROCESSED_DIR, `${hash}_processed.js${meta.compressed ? '.zst' : ''}`);
    try {
      await fs.unlink(file);
    } catch {}
    delete metadata.processed[path];
    _scheduleSave();
    return undefined;
  }

  const hash = path.split('/').pop()?.replace('.js', '') || '';
  const file = join(PROCESSED_DIR, `${hash}_processed.js${meta.compressed ? '.zst' : ''}`);
  try {
    const data = await fs.readFile(file);
    const content = await _decompressContent(
      new Uint8Array(data),
      meta.compressed || false
    );
    meta.a = now;
    _scheduleSave();
    return content;
  } catch {
    delete metadata.processed[path];
    _scheduleSave();
    return undefined;
  }
};

export const setPreprocessed = async (path: string, content: string): Promise<void> => {
  await _loadMeta();

  const keys = Object.keys(metadata.processed);
  if (keys.length >= DISK_CACHE_SIZE && !(path in metadata.processed)) {
    let lruKey: string | null = null;
    let lruTime = Infinity;
    for (const [k, m] of Object.entries(metadata.processed)) {
      if (m.a < lruTime) {
        lruTime = m.a;
        lruKey = k;
      }
    }
    if (lruKey) {
      const hash = lruKey.split('/').pop()?.replace('.js', '') || '';
      const oldMeta = metadata.processed[lruKey];
      const file = join(PROCESSED_DIR, `${hash}_processed.js${oldMeta?.compressed ? '.zst' : ''}`);
      try {
        await fs.unlink(file);
      } catch {}
      delete metadata.processed[lruKey];
    }
  }

  const hash = path.split('/').pop()?.replace('.js', '') || '';
  const { data, compressed } = await _compressContent(content);
  const file = join(PROCESSED_DIR, `${hash}_processed.js${compressed ? '.zst' : ''}`);
  await fs.writeFile(file, data);

  const now = Date.now();
  metadata.processed[path] = { t: now, a: now, compressed };
  _scheduleSave();
};

export const getSignature = (key: string): string | undefined => sigCache.get(key);
export const setSignature = (key: string, value: string): void => sigCache.set(key, value);
export const getSts = (path: string): string | undefined => stsCache.get(path);
export const setSts = (path: string, sts: string): void => stsCache.set(path, sts);

export const initCaches = async (): Promise<void> => {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(PROCESSED_DIR, { recursive: true });
  await _loadMeta();
  await _cleanup();
};
