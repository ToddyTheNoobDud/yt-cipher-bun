// instrumentedCache.ts - Instrumented LRU cache for metrics
export class InstrumentedLRU<T> {
  private cache = new Map<string, T>();
  private maxSize: number;

  constructor(private cacheName: string, maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: T): this {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
    return this;
  }

  remove(key: string): void {
    this.cache.delete(key);
  }

  get size(): number {
    return this.cache.size;
  }
}
