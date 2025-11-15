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
    // Worker code that uses the WASM encoder
    const workerCode = `
      const { parentPort } = require('worker_threads');

      let wasmModule = null;

      parentPort.on('message', async (data) => {
        const { id, stripData, width, height, quality } = data;

        try {
          // Load WASM module if not already loaded
          if (!wasmModule) {
            wasmModule = await import('jpeg-encoder-wasm');
          }

          // Create encoder and encode the strip
          const { StreamingJpegEncoder, WasmColorType } = wasmModule;
          const encoder = new StreamingJpegEncoder(width, height, WasmColorType.Rgba, quality);
          const result = encoder.encode_strip(stripData);
          encoder.free();

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
      // Note: We're not using the Q tables since the WASM encoder handles quality internally
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

    // Calculate height from strip data (8 scanlines)
    const height = Math.ceil(task.stripData.length / (task.width * 4));

    worker.postMessage({
      id: taskId,
      stripData: task.stripData,
      width: task.width,
      height: height,
      quality: 100 // Use maximum quality
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
