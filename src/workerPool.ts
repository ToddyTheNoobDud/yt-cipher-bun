// workerPool.ts - Optimized with better worker lifecycle management
import type { Input as MainInput, Output as MainOutput } from '../ejs/src/main.ts';
import type { WorkerWithStatus, Task } from './types.ts';
import { env } from 'bun';

const CONCURRENCY = parseInt(env.MAX_THREADS || '', 10) || navigator.hardwareConcurrency || 1;
const WORKER_TIMEOUT = 30000;

const workers: WorkerWithStatus[] = [];
const taskQueue: Task[] = [];

const replaceWorker = (oldWorker: WorkerWithStatus): void => {
  const index = workers.indexOf(oldWorker);
  if (index === -1) return;

  oldWorker.terminate();

  const newWorker: WorkerWithStatus = new Worker(
    new URL('../worker.ts', import.meta.url).href,
    { type: 'module' }
  );
  newWorker.isIdle = true;
  workers[index] = newWorker;
};

const dispatch = (): void => {
  const idleWorker = workers.find(w => w.isIdle);
  if (!idleWorker || taskQueue.length === 0) return;

  const task = taskQueue.shift()!;
  idleWorker.isIdle = false;

  let timeoutId: NodeJS.Timeout | undefined;
  let messageHandler: ((e: MessageEvent) => void) | undefined;

  const cleanup = (): void => {
    if (timeoutId) clearTimeout(timeoutId);
    if (messageHandler) idleWorker.removeEventListener('message', messageHandler);
    idleWorker.isIdle = true;
  };

  timeoutId = setTimeout(() => {
    cleanup();
    task.reject(new Error('Worker timeout'));
    replaceWorker(idleWorker);
    dispatch();
  }, WORKER_TIMEOUT);

  messageHandler = (e: MessageEvent): void => {
    cleanup();

    const { type, data } = e.data;
    if (type === 'success') {
      task.resolve(data);
    } else {
      const err = new Error(data.message || 'Worker error');
      if (data.stack) err.stack = data.stack;
      task.reject(err);
    }

    dispatch();
  };

  idleWorker.addEventListener('message', messageHandler);
  idleWorker.postMessage(task.data);
};

export const execInPool = (data: MainInput): Promise<MainOutput> =>
  new Promise((resolve, reject) => {
    taskQueue.push({ data, resolve, reject });
    dispatch();
  });

export const initializeWorkers = (): void => {
  for (let i = 0; i < CONCURRENCY; i++) {
    const worker: WorkerWithStatus = new Worker(
      new URL('../worker.ts', import.meta.url).href,
      { type: 'module' }
    );
    worker.isIdle = true;
    workers.push(worker);
  }

  console.log(`Initialized ${CONCURRENCY} workers`);
};

export const shutdownWorkers = (): void => {
  workers.forEach(w => w.terminate());
  workers.length = 0;
  taskQueue.length = 0;
};