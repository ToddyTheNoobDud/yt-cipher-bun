interface CacheEntry {
    data: string;
    timestamp: number;
    accessCount: number;
    lastAccessed: number;
}

interface CacheOptions {
    maxSize: number;
    ttl: number;
    persistenceFile?: string;
    cleanupInterval: number;
}

export class ProcessedCache {
    private cache = new Map<string, CacheEntry>();
    private options: CacheOptions;
    private cleanupTimer?: NodeJS.Timeout;

    constructor(options: Partial<CacheOptions> = {}) {
        this.options = {
            maxSize: options.maxSize ?? 100,
            ttl: options.ttl ?? 24 * 60 * 60 * 1000,
            persistenceFile: options.persistenceFile,
            cleanupInterval: options.cleanupInterval ?? 60 * 60 * 1000,
        };

        if (this.options.persistenceFile) {
            this.loadFromDisk().catch(console.error);
        }

        this.startCleanupTimer();
    }

    get(key: string): string | undefined {
        const entry = this.cache.get(key);

        if (!entry) {
            return undefined;
        }

        if (Date.now() - entry.timestamp > this.options.ttl) {
            this.cache.delete(key);
            return undefined;
        }

        entry.accessCount++;
        entry.lastAccessed = Date.now();

        return entry.data;
    }

    set(key: string, data: string): void {

        if (this.cache.size >= this.options.maxSize && !this.cache.has(key)) {
            this.evictLRU();
        }

        const entry: CacheEntry = {
            data,
            timestamp: Date.now(),
            accessCount: 1,
            lastAccessed: Date.now(),
        };

        this.cache.set(key, entry);

        if (this.options.persistenceFile) {
            this.saveToDisk().catch(console.error);
        }
    }

    has(key: string): boolean {
        const entry = this.cache.get(key);
        if (!entry) return false;

        if (Date.now() - entry.timestamp > this.options.ttl) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    delete(key: string): boolean {
        const deleted = this.cache.delete(key);
        if (deleted && this.options.persistenceFile) {
            this.saveToDisk().catch(console.error);
        }
        return deleted;
    }

    clear(): void {
        this.cache.clear();
        if (this.options.persistenceFile) {
            this.saveToDisk().catch(console.error);
        }
    }

    getStats(): {
        size: number;
        maxSize: number;
        hitRate: number;
        entries: Array<{
            key: string;
            accessCount: number;
            lastAccessed: number;
            age: number;
        }>;
    } {
        const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
            key,
            accessCount: entry.accessCount,
            lastAccessed: entry.lastAccessed,
            age: Date.now() - entry.timestamp,
        }));

        const totalAccesses = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
        const hitRate = totalAccesses > 0 ? entries.length / totalAccesses : 0;

        return {
            size: this.cache.size,
            maxSize: this.options.maxSize,
            hitRate,
            entries,
        };
    }

    private evictLRU(): void {
        let lruKey: string | null = null;
        let lruTime = Date.now();

        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccessed < lruTime) {
                lruTime = entry.lastAccessed;
                lruKey = key;
            }
        }

        if (lruKey) {
            this.cache.delete(lruKey);
        }
    }

    private startCleanupTimer(): void {
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, this.options.cleanupInterval);
    }

    private cleanup(): void {
        const now = Date.now();
        const expiredKeys: string[] = [];

        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.options.ttl) {
                expiredKeys.push(key);
            }
        }

        expiredKeys.forEach(key => this.cache.delete(key));

        if (expiredKeys.length > 0) {
            console.log(`Cleaned up ${expiredKeys.length} expired cache entries`);
            if (this.options.persistenceFile) {
                this.saveToDisk().catch(console.error);
            }
        }
    }

    private async saveToDisk(): Promise<void> {
        if (!this.options.persistenceFile) return;

        try {
            const fs = await import('fs/promises');
            const path = await import('path');

            // Ensure directory exists
            const dir = path.dirname(this.options.persistenceFile!);
            await fs.mkdir(dir, { recursive: true });

            const dataToSave = {
                options: this.options,
                cache: Array.from(this.cache.entries()),
                timestamp: Date.now(),
            };

            await fs.writeFile(
                this.options.persistenceFile!,
                JSON.stringify(dataToSave, null, 2),
                'utf8'
            );
        } catch (error) {
            console.error('Failed to save cache to disk:', error);
        }
    }

    private async loadFromDisk(): Promise<void> {
        if (!this.options.persistenceFile) return;

        try {
            const fs = await import('fs/promises');
            const data = await fs.readFile(this.options.persistenceFile!, 'utf8');
            const parsed = JSON.parse(data);

            if (parsed.cache && Array.isArray(parsed.cache)) {
                this.cache = new Map(parsed.cache);

                this.cleanup();

                console.log(`Loaded ${this.cache.size} cache entries from disk`);
            }
        } catch (error) {

            console.log('No valid cache file found, starting with empty cache');
        }
    }

    destroy(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
    }
}

export const preprocessedCache = new ProcessedCache({
    maxSize: 100,
    ttl: 24 * 60 * 60 * 1000,
    persistenceFile: './cache/preprocessed_cache.json',
    cleanupInterval: 60 * 60 * 1000,
});
