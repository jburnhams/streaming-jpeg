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
    // Create worker script inline that uses the WASM encoder
    const workerScript = `
      let wasmModule = null;
      let WasmColorType = null;
      let StreamingJpegEncoder = null;

      self.onmessage = async (event) => {
        const { id, stripData, width, height, quality } = event.data;

        try {
          // Load WASM module if not already loaded
          if (!wasmModule) {
            // Import the WASM module (browser will need the WASM files bundled or available)
            const module = await import('jpeg-encoder-wasm');
            wasmModule = module;
            WasmColorType = module.WasmColorType;
            StreamingJpegEncoder = module.StreamingJpegEncoder;
          }

          // Create encoder and encode the strip
          const encoder = new StreamingJpegEncoder(width, height, WasmColorType.Rgba, quality);
          const result = encoder.encode_strip(stripData);
          encoder.free();

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

    // Calculate height from strip data (8 scanlines)
    const height = Math.ceil(task.stripData.length / (task.width * 4));

    worker.postMessage(
      {
        id: taskId,
        stripData: task.stripData,
        width: task.width,
        height: height,
        quality: 100 // Use maximum quality
      },
      [task.stripData.buffer]
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
