import type { Input, Output } from "../ejs/src/yt/solver/main.ts";
import { env } from "bun";

interface Task {
	data: Input;
	resolve: (output: Output) => void;
	reject: (error: unknown) => void;
	timeout?: NodeJS.Timeout;
	id: number;
}

const CONCURRENCY = parseInt(env.MAX_THREADS || "", 10) || Math.min(navigator.hardwareConcurrency || 4, 8);
const TIMEOUT = parseInt(env.WORKER_TIMEOUT || "", 10) || 60000;
const MAX_QUEUE_SIZE = 1000;
const WORKER_PATH = new URL("../worker.ts", import.meta.url).href;

let taskIdCounter = 0;

class WorkerPool {
	private workers: Worker[] = [];
	private availableWorkers: Worker[] = [];
	private queue: Task[] = [];
	private taskMap = new Map<Worker, Task>();

	constructor(private size: number) {
		// Lazy initialization: Workers are spawned in dispatch() as needed
	}

	private createWorker(): Worker {
		const worker = new Worker(WORKER_PATH);
		this.setupHandlers(worker);
		return worker;
	}

	private setupHandlers(worker: Worker): void {
		worker.onmessage = (e: MessageEvent) => {
			const task = this.taskMap.get(worker);
			if (!task) return;

			if (task.timeout) clearTimeout(task.timeout);
			this.taskMap.delete(worker);
			this.availableWorkers.push(worker);

			const { type, data } = e.data;

			if (type === "success") {
				task.resolve(data);
			} else if (type === "error") {
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

			setTimeout(() => {
				this.replaceWorker(worker);
				this.dispatch();
			}, 1000);
		};
	}

	private replaceWorker(oldWorker: Worker): void {
		const idx = this.workers.indexOf(oldWorker);
		if (idx === -1) return;

		oldWorker.terminate();
		const newWorker = this.createWorker();
		this.workers[idx] = newWorker;
		this.availableWorkers.push(newWorker);
	}

	private dispatch(): void {
		if (this.queue.length > 0 && this.availableWorkers.length === 0 && this.workers.length < this.size) {
			const worker = this.createWorker();
			this.workers.push(worker);
			this.availableWorkers.push(worker);
		}

		while (this.availableWorkers.length > 0 && this.queue.length > 0) {
			const worker = this.availableWorkers.shift()!;
			const task = this.queue.shift()!;

			this.taskMap.set(worker, task);

			task.timeout = setTimeout(() => {
				const currentTask = this.taskMap.get(worker);
				if (currentTask?.id !== task.id) return;

				this.taskMap.delete(worker);
				task.reject(new Error(`Task timeout after ${TIMEOUT}ms`));

				// Terminate and replace the worker since it might be stuck
				worker.terminate();
				const idx = this.workers.indexOf(worker);
				if (idx !== -1) {
					this.workers.splice(idx, 1);
				}
				// Create new worker on demand in dispatch()
				this.dispatch();
			}, TIMEOUT);

			worker.postMessage(task.data);
		}
	}

	exec(data: Input): Promise<Output> {
		if (this.queue.length >= MAX_QUEUE_SIZE) {
			return Promise.reject(new Error("Worker pool queue is full, try again later"));
		}

		return new Promise((resolve, reject) => {
			const id = ++taskIdCounter;
			this.queue.push({ data, resolve, reject, id });
			this.dispatch();
		});
	}

	shutdown(): void {
		for (const worker of this.workers) {
			worker.terminate();
		}
		// Reject all pending tasks
		for (const task of this.queue) {
			if (task.timeout) clearTimeout(task.timeout);
			task.reject(new Error("Worker pool shutting down"));
		}
		for (const [, task] of this.taskMap) {
			if (task.timeout) clearTimeout(task.timeout);
			task.reject(new Error("Worker pool shutting down"));
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
		console.log(`Initialized lazy worker pool (max ${CONCURRENCY} workers, timeout ${TIMEOUT}ms)`);
	}
};

export const execInPool = (data: Input): Promise<Output> => {
	if (!pool) {
		throw new Error("Worker pool not initialized");
	}
	return pool.exec(data);
};

export const shutdownWorkers = (): void => {
	if (pool) {
		pool.shutdown();
		pool = null;
	}
};
