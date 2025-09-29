// processedCache.ts
import { join } from 'path';
import fs from 'fs/promises';
import { CACHE_DIR } from './playerCache.ts'; // Assuming playerCache.ts exports CACHE_DIR

const PROCESSED_CACHE_DIR = join(CACHE_DIR, 'processed');
const METADATA_FILE = join(PROCESSED_CACHE_DIR, 'metadata.json');

interface CacheMetadata {
  [key: string]: {
    timestamp: number;
    lastAccessed: number;
  };
}

interface CacheOptions {
  maxSize: number;
  ttl: number;
  cleanupInterval: number;
}

export class ProcessedCache {
  private metadata: CacheMetadata = {};
  private options: CacheOptions;
  private cleanupTimer?: NodeJS.Timeout;
  private metadataLoaded = false;

  constructor(options: Partial<CacheOptions> = {}) {
    this.options = {
      maxSize: options.maxSize ?? 100,
      ttl: options.ttl ?? 86400000,
      cleanupInterval: options.cleanupInterval ?? 3600000
    };

    this._startCleanupTimer();
  }

  private async _ensureDir(): Promise<void> {
    await fs.mkdir(PROCESSED_CACHE_DIR, { recursive: true });
  }

  private async _loadMetadata(): Promise<void> {
    if (this.metadataLoaded) return;

    await this._ensureDir();

    try {
      const data = await fs.readFile(METADATA_FILE, 'utf8');
      this.metadata = JSON.parse(data);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.error('Failed to load cache metadata:', err);
      }
      this.metadata = {};
    }

    this.metadataLoaded = true;
  }

  private async _saveMetadata(): Promise<void> {
    await this._ensureDir();
    await fs.writeFile(METADATA_FILE, JSON.stringify(this.metadata), 'utf8');
  }

  private _getFilePath(key: string): string {
    // Assuming key is the playerFilePath, which is join(CACHE_DIR, `${hash}.js`)
    // To avoid collisions, hash the key again or extract hash
    const hash = key.split('/').pop()?.replace('.js', '') || '';
    return join(PROCESSED_CACHE_DIR, `${hash}_processed.js`);
  }

  async get(key: string): Promise<string | undefined> {
    await this._loadMetadata();

    const entry = this.metadata[key];
    if (!entry) return undefined;

    const now = Date.now();
    if (now - entry.timestamp > this.options.ttl) {
      await this._deleteFile(key);
      return undefined;
    }

    const filePath = this._getFilePath(key);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      entry.lastAccessed = now;
      await this._saveMetadata();
      return data;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        delete this.metadata[key];
        await this._saveMetadata();
      }
      return undefined;
    }
  }

  async set(key: string, data: string): Promise<void> {
    await this._loadMetadata();

    await this._ensureDir();

    if (Object.keys(this.metadata).length >= this.options.maxSize && !(key in this.metadata)) {
      await this._evictLRU();
    }

    const filePath = this._getFilePath(key);
    await fs.writeFile(filePath, data, 'utf8');

    this.metadata[key] = {
      timestamp: Date.now(),
      lastAccessed: Date.now()
    };
    await this._saveMetadata();
  }

  async has(key: string): Promise<boolean> {
    await this._loadMetadata();

    const entry = this.metadata[key];
    if (!entry) return false;

    if (Date.now() - entry.timestamp > this.options.ttl) {
      await this._deleteFile(key);
      return false;
    }

    const filePath = this._getFilePath(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      await this._deleteFile(key);
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    await this._loadMetadata();

    if (!(key in this.metadata)) return false;

    await this._deleteFile(key);
    return true;
  }

  async clear(): Promise<void> {
    await this._loadMetadata();

    for (const key of Object.keys(this.metadata)) {
      await this._deleteFile(key);
    }
    this.metadata = {};
    await this._saveMetadata();
  }

  private async _deleteFile(key: string): Promise<void> {
    const filePath = this._getFilePath(key);
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.error(`Failed to delete cache file ${filePath}:`, err);
      }
    }
    delete this.metadata[key];
    await this._saveMetadata();
  }

  private async _evictLRU(): Promise<void> {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of Object.entries(this.metadata)) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      await this._deleteFile(lruKey);
    }
  }

  private _startCleanupTimer(): void {
    this.cleanupTimer = setInterval(async () => {
      await this._loadMetadata();

      const now = Date.now();
      for (const [key, entry] of Object.entries(this.metadata)) {
        if (now - entry.timestamp > this.options.ttl) {
          await this._deleteFile(key);
        }
      }
    }, this.options.cleanupInterval);

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  async destroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    await this.clear();
  }
}

export const preprocessedCache = new ProcessedCache({
  maxSize: 100,
  ttl: 86400000,
  cleanupInterval: 3600000
});