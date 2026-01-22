import { join } from 'path';
import fs from 'fs/promises';
import { zstdCompress, zstdDecompress } from 'bun';
import { extractPlayerId, validateUrl } from './utils.ts';

const CACHE_DIR = join(process.cwd(), 'player_cache');
const PROCESSED_DIR = join(CACHE_DIR, 'processed');
const META_FILE = join(CACHE_DIR, 'meta.json');

const MEMORY_CACHE_SIZE = 50;
const DISK_CACHE_SIZE = 100;
const SIGNATURE_CACHE_SIZE = 500;
const HASH_CACHE_SIZE = 200;
const PLAYER_TTL = 172800000; // 2 days
const CACHE_TTL = 86400000; // 1 day
const SIG_TTL = 3600000; // 1 hour
const CLEANUP_INTERVAL = 3600000; // 1 hour
const META_SAVE_DELAY = 5000;
const COMPRESSION_THRESHOLD = 4194304; // 4 mb

interface CacheEntry<T> {
  v: T;
  t: number;
  a: number;
}

interface Metadata {
  players: Record<string, { url: string; t: number; a: number; compressed?: boolean }>;
  processed: Record<string, { t: number; a: number; compressed?: boolean }>;
}

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
      if (firstKey !== undefined) {
        this.c.delete(firstKey);
      }
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

const hashCache = new LRUCache<string>(HASH_CACHE_SIZE, Infinity);
const contentCache = new LRUCache<string>(MEMORY_CACHE_SIZE, CACHE_TTL);
const sigCache = new LRUCache<string>(SIGNATURE_CACHE_SIZE, SIG_TTL);
const stsCache = new LRUCache<string>(100, CACHE_TTL);

let metadata: Metadata = { players: {}, processed: {} };
let metaLoaded = false;
let metaDirty = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let cleanupTimer: ReturnType<typeof setInterval>;

const _internal = {
  async hash(s: string): Promise<string> {
    const cached = hashCache.get(s);
    if (cached) return cached;

    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    const h = Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
    hashCache.set(s, h);
    return h;
  },

  shouldCompress(content: string): boolean {
    return content.length > COMPRESSION_THRESHOLD;
  },

  async compressContent(content: string): Promise<{ data: Uint8Array; compressed: boolean }> {
    if (!this.shouldCompress(content)) {
      return { data: new TextEncoder().encode(content), compressed: false };
    }
    const compressed = await zstdCompress(content);
    return { data: compressed, compressed: true };
  },

  async decompressContent(data: Uint8Array, compressed: boolean): Promise<string> {
    if (!compressed) {
      return new TextDecoder().decode(data);
    }
    const decompressed = await zstdDecompress(data);
    return new TextDecoder().decode(decompressed);
  },

  async loadMeta(): Promise<void> {
    if (metaLoaded) return;
    try {
      const data = await fs.readFile(META_FILE, 'utf8');
      metadata = JSON.parse(data);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
      metadata = { players: {}, processed: {} };
    }
    metaLoaded = true;
  },

  async saveMeta(): Promise<void> {
    if (!metaDirty) return;
    await fs.writeFile(META_FILE, JSON.stringify(metadata), 'utf8');
    metaDirty = false;
  },

  scheduleSave(): void {
    if (saveTimer) return;
    metaDirty = true;
    saveTimer = setTimeout(async () => {
      await this.saveMeta();
      saveTimer = undefined;
    }, META_SAVE_DELAY);
  },

  async unlinkFile(path: string): Promise<void> {
    try {
      await fs.unlink(path);
    } catch {}
  },

  getFilePath(hash: string, compressed: boolean, baseDir: string = CACHE_DIR, suffix: string = '.js'): string {
    const base = join(baseDir, `${hash}${suffix}`);
    return compressed ? `${base}.zst` : base;
  },

  async cleanup(): Promise<void> {
    await this.loadMeta();
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [hash, meta] of Object.entries(metadata.players)) {
      if (now - meta.t > PLAYER_TTL) {
        toDelete.push(hash);
        await this.unlinkFile(this.getFilePath(hash, !!meta.compressed));
      }
    }

    for (const [key, meta] of Object.entries(metadata.processed)) {
      if (now - meta.t > CACHE_TTL) {
        const hash = key.split('/').pop()?.replace('.js', '') || '';
        await this.unlinkFile(this.getFilePath(hash, !!meta.compressed, PROCESSED_DIR, '_processed.js'));
        delete metadata.processed[key];
      }
    }

    for (const hash of toDelete) {
      delete metadata.players[hash];
    }

    if (toDelete.length > 0) {
      metaDirty = true;
      await this.saveMeta();
    }
  }
};

cleanupTimer = setInterval(() => _internal.cleanup(), CLEANUP_INTERVAL);

export const getPlayerFilePath = async (url: string): Promise<string> => {
  const normalizedUrl = validateUrl(url);
  const playerId = extractPlayerId(normalizedUrl);
  const hash = playerId !== 'unknown' ? playerId : await _internal.hash(normalizedUrl);

  const baseFilePath = join(CACHE_DIR, `${hash}.js`);
  const now = Date.now();

  await _internal.loadMeta();

  if (metadata.players[hash]) {
    metadata.players[hash].a = now;
    if (now - metadata.players[hash].t <= PLAYER_TTL) {
      const filePath = _internal.getFilePath(hash, !!metadata.players[hash].compressed);
      try {
        await fs.access(filePath);
        _internal.scheduleSave();
        return baseFilePath;
      } catch {
        delete metadata.players[hash];
      }
    } else {
      await _internal.unlinkFile(_internal.getFilePath(hash, !!metadata.players[hash].compressed));
      delete metadata.players[hash];
    }
  }

  const res = await fetch(normalizedUrl);
  if (!res.ok) throw new Error(`Failed to fetch player: ${res.statusText}`);

  const content = await res.text();
  const { data, compressed } = await _internal.compressContent(content);

  const filePath = _internal.getFilePath(hash, compressed);
  await fs.writeFile(filePath, data);

  metadata.players[hash] = { url: normalizedUrl, t: now, a: now, compressed };
  _internal.scheduleSave();

  return baseFilePath;
};

export const getPlayerContent = async (path: string): Promise<string> => {
  const cached = contentCache.get(path);
  if (cached) return cached;

  await _internal.loadMeta();
  const hash = path.split('/').pop()?.replace('.js', '') || '';
  const playerMeta = metadata.players[hash];

  const filePath = _internal.getFilePath(hash, !!playerMeta?.compressed);
  const data = await fs.readFile(filePath);
  const content = await _internal.decompressContent(new Uint8Array(data), !!playerMeta?.compressed);

  contentCache.set(path, content);
  return content;
};

export const getPreprocessed = async (path: string): Promise<string | undefined> => {
  await _internal.loadMeta();
  const meta = metadata.processed[path];
  if (!meta) return undefined;

  const now = Date.now();
  if (now - meta.t > CACHE_TTL) {
    const hash = path.split('/').pop()?.replace('.js', '') || '';
    await _internal.unlinkFile(_internal.getFilePath(hash, !!meta.compressed, PROCESSED_DIR, '_processed.js'));
    delete metadata.processed[path];
    _internal.scheduleSave();
    return undefined;
  }

  const hash = path.split('/').pop()?.replace('.js', '') || '';
  const file = _internal.getFilePath(hash, !!meta.compressed, PROCESSED_DIR, '_processed.js');
  try {
    const data = await fs.readFile(file);
    const content = await _internal.decompressContent(new Uint8Array(data), !!meta.compressed);
    meta.a = now;
    _internal.scheduleSave();
    return content;
  } catch {
    delete metadata.processed[path];
    _internal.scheduleSave();
    return undefined;
  }
};

export const setPreprocessed = async (path: string, content: string): Promise<void> => {
  await _internal.loadMeta();

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
      await _internal.unlinkFile(_internal.getFilePath(hash, !!oldMeta?.compressed, PROCESSED_DIR, '_processed.js'));
      delete metadata.processed[lruKey];
    }
  }

  const hash = path.split('/').pop()?.replace('.js', '') || '';
  const { data, compressed } = await _internal.compressContent(content);
  const file = _internal.getFilePath(hash, compressed, PROCESSED_DIR, '_processed.js');
  await fs.writeFile(file, data);

  const now = Date.now();
  metadata.processed[path] = { t: now, a: now, compressed };
  _internal.scheduleSave();
};

export const getSignature = (key: string): string | undefined => sigCache.get(key);
export const setSignature = (key: string, value: string): void => sigCache.set(key, value);
export const getSts = (path: string): string | undefined => stsCache.get(path);
export const setSts = (path: string, sts: string): void => stsCache.set(path, sts);

export const initCaches = async (): Promise<void> => {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(PROCESSED_DIR, { recursive: true });
  await _internal.loadMeta();
  await _internal.cleanup();
};

process.on('exit', () => {
  if (cleanupTimer) clearInterval(cleanupTimer);
  if (saveTimer) clearTimeout(saveTimer);
});
