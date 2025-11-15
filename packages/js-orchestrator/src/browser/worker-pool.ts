/**
 * Browser-specific worker pool using Web Workers
 */

import type { WorkerPool } from '../core/encoder.js';

export class BrowserWorkerPool implements WorkerPool {
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

  constructor(poolSize: number = navigator.hardwareConcurrency || 4) {
    this.poolSize = poolSize;
    this.initializePool();
  }

  private initializePool(): void {
    // Create worker script inline
    const workerScript = `
      let wasmModule = null;

      self.onmessage = async (event) => {
        const { id, stripData, width, lumaQTable, chromaQTable } = event.data;

        try {
          // Load WASM module if not already loaded
          if (!wasmModule) {
            // In a real implementation, this would import the WASM module
            // For now, we'll create a placeholder
            // import('wasm-engine').then(module => { wasmModule = module; });
          }

          // Process strip (placeholder - will be replaced with actual WASM call)
          // const result = wasmModule.process_strip(stripData, width, lumaQTable, chromaQTable);
          const result = new Uint8Array(stripData.length / 2); // Placeholder

          self.postMessage({ id, result }, [result.buffer]);
        } catch (error) {
          self.postMessage({ id, error: error.message });
        }
      };
    `;

    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);

    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(workerUrl);
      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }

    URL.revokeObjectURL(workerUrl);
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

    const handleMessage = (event: MessageEvent) => {
      if (event.data.id === taskId) {
        worker.removeEventListener('message', handleMessage);
        this.availableWorkers.push(worker);

        if (event.data.error) {
          task.reject(new Error(event.data.error));
        } else {
          task.resolve(event.data.result);
        }

        // Process next task in queue
        if (this.taskQueue.length > 0) {
          const nextTask = this.taskQueue.shift()!;
          this.executeTask(nextTask);
        }
      }
    };

    worker.addEventListener('message', handleMessage);

    worker.postMessage(
      {
        id: taskId,
        stripData: task.stripData,
        width: task.width,
        lumaQTable: task.lumaQTable,
        chromaQTable: task.chromaQTable,
      },
      [task.stripData.buffer, task.lumaQTable.buffer, task.chromaQTable.buffer]
    );
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
