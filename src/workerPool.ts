// workerPool.ts - Optimized worker management
import type { Input, Output } from '../ejs/src/main.ts';
import { preprocessPlayer } from '../ejs/src/solvers.ts';
import { env } from 'bun';

interface Task {
  data: Input;
  resolve: (output: Output) => void;
  reject: (error: any) => void;
}

const CONCURRENCY = parseInt(env.MAX_THREADS || '', 30) || navigator.hardwareConcurrency || 1;
const TIMEOUT = 30000;

const queue: Task[] = [];
let activeTasks = 0;

const _processTask = async (task: Task): Promise<void> => {
  activeTasks++;

  try {
    // For now, run preprocessing directly instead of using workers
    // This avoids the worker termination issues
    if (task.data.type === 'player') {
      const preprocessed = preprocessPlayer(task.data.player);
      task.resolve({
        type: 'result',
        preprocessed_player: preprocessed,
        responses: []
      });
    } else if (task.data.type === 'preprocessed') {
      // For preprocessed players, we need to handle them differently
      // This is a simplified approach
      task.resolve({
        type: 'result',
        preprocessed_player: task.data.preprocessed_player,
        responses: []
      });
    } else {
      throw new Error('Unsupported task type');
    }
  } catch (error) {
    const err = error as Error;
    task.reject(new Error(`Processing failed: ${err.message}`));
  } finally {
    activeTasks--;
    _dispatch();
  }
};

const _dispatch = (): void => {
  if (activeTasks >= CONCURRENCY || queue.length === 0) return;

  const task = queue.shift()!;
  if (task) {
    // Use setTimeout to avoid blocking the main thread
    setTimeout(() => _processTask(task), 0);
  }
};

export const execInPool = (data: Input): Promise<Output> =>
  new Promise((resolve, reject) => {
    queue.push({ data, resolve, reject });
    _dispatch();
  });

export const initWorkers = (): void => {
  console.log(`Initialized worker pool with concurrency: ${CONCURRENCY}`);
};

export const shutdownWorkers = (): void => {
  queue.length = 0;
  activeTasks = 0;
};
