// cacheManager.ts - Centralized multi-layer caching system with persistent storage
import { join } from 'path';
import fs from 'fs/promises';
import { stat } from 'fs/promises';

export const CACHE_DIR = join(process.cwd(), 'player_cache');
const PROCESSED_DIR = join(CACHE_DIR, 'processed');
const METADATA_FILE = join(PROCESSED_DIR, 'metadata.json');
const PLAYER_METADATA_FILE = join(CACHE_DIR, 'player_metadata.json');

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  lastAccessed: number;
}

interface DiskCacheMetadata {
  [key: string]: {
    timestamp: number;
    lastAccessed: number;
  };
}

const DEFAULT_MEMORY_CACHE_SIZE = 50;
const DEFAULT_DISK_CACHE_SIZE = 100;
const DEFAULT_TTL = 86400000;
const CLEANUP_INTERVAL = 3600000;
const PLAYER_FILE_TTL = 259200000;

class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private readonly maxSize: number;
  private readonly ttl: number;

  constructor(maxSize: number = DEFAULT_MEMORY_CACHE_SIZE, ttl: number = DEFAULT_TTL) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    entry.lastAccessed = now;
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    const now = Date.now();

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, { value, timestamp: now, lastAccessed: now });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  clear(): void {
    this.cache.clear();
  }
}

class DiskCache {
  private metadata: DiskCacheMetadata = {};
  private readonly maxSize: number;
  private readonly ttl: number;
  private cleanupTimer?: NodeJS.Timeout;
  private metadataLoaded = false;

  constructor(maxSize: number = DEFAULT_DISK_CACHE_SIZE, ttl: number = DEFAULT_TTL) {
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.startCleanupTimer();
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(PROCESSED_DIR, { recursive: true });
  }

  private async loadMetadata(): Promise<void> {
    if (this.metadataLoaded) return;

    await this.ensureDir();

    try {
      const data = await fs.readFile(METADATA_FILE, 'utf8');
      this.metadata = JSON.parse(data);
    } catch (err: any) {
      if (err.code !== 'ENOENT') return;
      this.metadata = {};
    }

    this.metadataLoaded = true;
  }

  private async saveMetadata(): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(METADATA_FILE, JSON.stringify(this.metadata), 'utf8');
  }

  private getFilePath(key: string): string {
    const hash = key.split('/').pop()?.replace('.js', '') || '';
    return join(PROCESSED_DIR, `${hash}_processed.js`);
  }

  async get(key: string): Promise<string | undefined> {
    await this.loadMetadata();

    const entry = this.metadata[key];
    if (!entry) return undefined;

    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      await this.deleteFile(key);
      return undefined;
    }

    const filePath = this.getFilePath(key);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      entry.lastAccessed = now;
      await this.saveMetadata();
      return data;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        delete this.metadata[key];
        await this.saveMetadata();
      }
      return undefined;
    }
  }

  async set(key: string, data: string): Promise<void> {
    await this.loadMetadata();

    if (Object.keys(this.metadata).length >= this.maxSize && !(key in this.metadata)) {
      await this.evictLRU();
    }

    const filePath = this.getFilePath(key);
    await fs.writeFile(filePath, data, 'utf8');

    this.metadata[key] = {
      timestamp: Date.now(),
      lastAccessed: Date.now()
    };
    await this.saveMetadata();
  }

  async has(key: string): Promise<boolean> {
    await this.loadMetadata();

    const entry = this.metadata[key];
    if (!entry) return false;

    if (Date.now() - entry.timestamp > this.ttl) {
      await this.deleteFile(key);
      return false;
    }

    const filePath = this.getFilePath(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      await this.deleteFile(key);
      return false;
    }
  }

  private async deleteFile(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    try {
      await fs.unlink(filePath);
    } catch {}
    delete this.metadata[key];
    await this.saveMetadata();
  }

  private async evictLRU(): Promise<void> {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of Object.entries(this.metadata)) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) await this.deleteFile(lruKey);
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(async () => {
      await this.loadMetadata();

      const now = Date.now();
      for (const [key, entry] of Object.entries(this.metadata)) {
        if (now - entry.timestamp > this.ttl) {
          await this.deleteFile(key);
        }
      }
    }, CLEANUP_INTERVAL);

    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  async destroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}

const playerUrlHashCache = new LRUCache<string>(200, Infinity);
const playerContentCache = new LRUCache<string>(20, DEFAULT_TTL);
const preprocessedCache = new DiskCache(100, DEFAULT_TTL);
const signatureResultCache = new LRUCache<string>(500, 3600000);
const stsCache = new LRUCache<string>(100, DEFAULT_TTL);

interface PlayerFileMetadata {
  [hash: string]: {
    playerUrl: string;
    timestamp: number;
    lastAccessed: number;
  };
}

let playerMetadata: PlayerFileMetadata = {};

async function computeHash(playerUrl: string): Promise<string> {
  const cached = playerUrlHashCache.get(playerUrl);
  if (cached) return cached;

  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(playerUrl));
  const hash = Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('');

  playerUrlHashCache.set(playerUrl, hash);
  return hash;
}

async function loadPlayerMetadata(): Promise<void> {
  try {
    const data = await fs.readFile(PLAYER_METADATA_FILE, 'utf8');
    playerMetadata = JSON.parse(data);
  } catch (err: any) {
    if (err.code !== 'ENOENT') return;
    playerMetadata = {};
  }
}

async function savePlayerMetadata(): Promise<void> {
  await fs.writeFile(PLAYER_METADATA_FILE, JSON.stringify(playerMetadata), 'utf8');
}

async function cleanupExpiredPlayerFiles(): Promise<void> {
  const now = Date.now();
  const filesToDelete: string[] = [];

  for (const [hash, meta] of Object.entries(playerMetadata)) {
    if (now - meta.timestamp > PLAYER_FILE_TTL) {
      filesToDelete.push(hash);
    }
  }

  for (const hash of filesToDelete) {
    const filePath = join(CACHE_DIR, `${hash}.js`);
    try {
      await fs.unlink(filePath);
      delete playerMetadata[hash];
    } catch {}
  }

  if (filesToDelete.length > 0) {
    await savePlayerMetadata();
  }
}

const playerCleanupTimer = setInterval(cleanupExpiredPlayerFiles, CLEANUP_INTERVAL);
if (playerCleanupTimer.unref) playerCleanupTimer.unref();

export async function getPlayerFilePath(playerUrl: string): Promise<string> {
  const hash = await computeHash(playerUrl);
  const filePath = join(CACHE_DIR, `${hash}.js`);

  const now = Date.now();

  if (playerMetadata[hash]) {
    playerMetadata[hash].lastAccessed = now;

    if (now - playerMetadata[hash].timestamp <= PLAYER_FILE_TTL) {
      try {
        await fs.access(filePath);
        await savePlayerMetadata();
        return filePath;
      } catch {
        delete playerMetadata[hash];
      }
    } else {
      try {
        await fs.unlink(filePath);
      } catch {}
      delete playerMetadata[hash];
    }
  }

  const response = await fetch(playerUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch player: ${response.statusText}`);
  }

  const content = await response.text();
  await fs.writeFile(filePath, content, 'utf8');

  playerMetadata[hash] = {
    playerUrl,
    timestamp: now,
    lastAccessed: now
  };
  await savePlayerMetadata();

  return filePath;
}

export async function getPlayerContent(playerFilePath: string): Promise<string> {
  const cached = playerContentCache.get(playerFilePath);
  if (cached) return cached;

  const content = await fs.readFile(playerFilePath, 'utf8');
  playerContentCache.set(playerFilePath, content);
  return content;
}

export async function getPreprocessedPlayer(playerFilePath: string): Promise<string | undefined> {
  return await preprocessedCache.get(playerFilePath);
}

export async function setPreprocessedPlayer(playerFilePath: string, data: string): Promise<void> {
  await preprocessedCache.set(playerFilePath, data);
}

export function getSignatureResult(cacheKey: string): string | undefined {
  return signatureResultCache.get(cacheKey);
}

export function setSignatureResult(cacheKey: string, result: string): void {
  signatureResultCache.set(cacheKey, result);
}

export function getStsValue(playerFilePath: string): string | undefined {
  return stsCache.get(playerFilePath);
}

export function setStsValue(playerFilePath: string, sts: string): void {
  stsCache.set(playerFilePath, sts);
}

export async function initializeAllCaches(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await loadPlayerMetadata();
  await cleanupExpiredPlayerFiles();
}