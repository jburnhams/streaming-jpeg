/**
 * Node.js-specific worker pool using worker_threads
 */

import { Worker } from 'worker_threads';
import type { WorkerPool } from '../core/encoder.js';

export class NodeWorkerPool implements WorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private taskQueue: Array<{
    stripData: Uint8Array;
    width: number;
    lumaQTable: Uint8Array;
    chromaQTable: Uint8Array;
    resolve: (result: Uint8Array) => void;
    reject: (error: Error) => void;
  }> = [];
  private poolSize: number;

  constructor(poolSize?: number) {
    this.poolSize = poolSize || require('os').cpus().length;
    this.initializePool();
  }

  private initializePool(): void {
    // In a real implementation, workers would be created from worker.js
    // For now, we'll use inline workers with eval (not recommended for production)
    const workerCode = `
      const { parentPort } = require('worker_threads');

      let wasmModule = null;

      parentPort.on('message', async (data) => {
        const { id, stripData, width, lumaQTable, chromaQTable } = data;

        try {
          // Load WASM module if not already loaded
          if (!wasmModule) {
            // In a real implementation: wasmModule = await import('wasm-engine');
          }

          // Process strip (placeholder)
          const result = new Uint8Array(stripData.length / 2);

          parentPort.postMessage({ id, result });
        } catch (error) {
          parentPort.postMessage({ id, error: error.message });
        }
      });
    `;

    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(workerCode, { eval: true });
      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }
  }

  async processStrip(
    stripData: Uint8Array,
    width: number,
    lumaQTable: Uint8Array,
    chromaQTable: Uint8Array
  ): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const task = { stripData, width, lumaQTable, chromaQTable, resolve, reject };

      if (this.availableWorkers.length > 0) {
        this.executeTask(task);
      } else {
        this.taskQueue.push(task);
      }
    });
  }

  private executeTask(task: {
    stripData: Uint8Array;
    width: number;
    lumaQTable: Uint8Array;
    chromaQTable: Uint8Array;
    resolve: (result: Uint8Array) => void;
    reject: (error: Error) => void;
  }): void {
    const worker = this.availableWorkers.pop()!;
    const taskId = Math.random().toString(36);

    const handleMessage = (message: any) => {
      if (message.id === taskId) {
        worker.off('message', handleMessage);
        this.availableWorkers.push(worker);

        if (message.error) {
          task.reject(new Error(message.error));
        } else {
          task.resolve(message.result);
        }

        // Process next task in queue
        if (this.taskQueue.length > 0) {
          const nextTask = this.taskQueue.shift()!;
          this.executeTask(nextTask);
        }
      }
    };

    worker.on('message', handleMessage);

    worker.postMessage({
      id: taskId,
      stripData: task.stripData,
      width: task.width,
      lumaQTable: task.lumaQTable,
      chromaQTable: task.chromaQTable,
    });
  }

  terminate(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.availableWorkers = [];
    this.taskQueue = [];
  }
}
