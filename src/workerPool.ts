
import type { Input, Output } from '../ejs/src/main.ts';
import { env } from 'bun';

interface Task {
  data: Input;
  resolve: (output: Output) => void;
  reject: (error: any) => void;
  timeout?: NodeJS.Timeout;
}

const CONCURRENCY = parseInt(env.MAX_THREADS || '', 10) || navigator.hardwareConcurrency || 4;
const TIMEOUT = 30000;
const WORKER_PATH = new URL('./worker.ts', import.meta.url).href;

class WorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private queue: Task[] = [];
  private taskMap = new Map<Worker, Task>();

  constructor(private size: number) {
    this.initWorkers();
  }

  private initWorkers(): void {
    for (let i = 0; i < this.size; i++) {
      const worker = new Worker(WORKER_PATH);

      worker.onmessage = (e: MessageEvent) => {
        const task = this.taskMap.get(worker);
        if (!task) return;

        if (task.timeout) clearTimeout(task.timeout);
        this.taskMap.delete(worker);
        this.availableWorkers.push(worker);

        const { type, data } = e.data;

        if (type === 'success') {
          task.resolve(data);
        } else if (type === 'error') {
          task.reject(new Error(data.message));
        }

        this.dispatch();
      };

      worker.onerror = (error) => {
        const task = this.taskMap.get(worker);
        if (task) {
          if (task.timeout) clearTimeout(task.timeout);
          this.taskMap.delete(worker);
          task.reject(error);
        }

        const idx = this.workers.indexOf(worker);
        if (idx !== -1) {
          worker.terminate();
          const newWorker = new Worker(WORKER_PATH);
          this.workers[idx] = newWorker;
          this.availableWorkers.push(newWorker);
        }

        this.dispatch();
      };

      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }
  }

  private dispatch(): void {
    while (this.availableWorkers.length > 0 && this.queue.length > 0) {
      const worker = this.availableWorkers.shift()!;
      const task = this.queue.shift()!;

      this.taskMap.set(worker, task);

      task.timeout = setTimeout(() => {
        this.taskMap.delete(worker);
        this.availableWorkers.push(worker);
        task.reject(new Error('Task timeout'));
        this.dispatch();
      }, TIMEOUT);

      worker.postMessage(task.data);
    }
  }

  exec(data: Input): Promise<Output> {
    return new Promise((resolve, reject) => {
      this.queue.push({ data, resolve, reject });
      this.dispatch();
    });
  }

  shutdown(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.availableWorkers = [];
    this.queue = [];
    this.taskMap.clear();
  }
}

let pool: WorkerPool | null = null;

export const initWorkers = (): void => {
  if (!pool) {
    pool = new WorkerPool(CONCURRENCY);
    console.log(`Initialized worker pool with ${CONCURRENCY} workers`);
  }
};

export const execInPool = (data: Input): Promise<Output> => {
  if (!pool) {
    throw new Error('Worker pool not initialized');
  }
  return pool.exec(data);
};

export const shutdownWorkers = (): void => {
  if (pool) {
    pool.shutdown();
    pool = null;
  }
};