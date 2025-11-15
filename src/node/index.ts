/**
 * Node.js entry point for streaming-jpeg encoder
 */

import { readFile } from 'fs/promises';
import { Readable } from 'stream';
import { JpegEncoder, createPixelStreamFromBuffer, type PixelStream, type EncodeOptions } from '../core/encoder.js';
import { NodeWorkerPool } from './worker-pool.js';

export type NodeImageSource =
  | string              // File path
  | Buffer              // Raw RGBA buffer
  | Uint8Array          // Raw RGBA buffer
  | Readable;           // Readable stream

export interface NodeEncodeOptions extends Omit<EncodeOptions, 'width' | 'height'> {
  width?: number;  // Required for raw buffer/stream
  height?: number; // Required for raw buffer/stream
}

/**
 * Create a pixel stream from a Node.js image source
 */
async function* createNodePixelStream(
  source: NodeImageSource,
  options: NodeEncodeOptions
): PixelStream {
  // Handle file path
  if (typeof source === 'string') {
    const buffer = await readFile(source);
    const { width, height } = options;
    if (!width || !height) {
      throw new Error('Width and height are required when encoding from file');
    }
    yield* createPixelStreamFromBuffer(new Uint8Array(buffer), width, height);
    return;
  }

  // Handle Buffer
  if (Buffer.isBuffer(source)) {
    const { width, height } = options;
    if (!width || !height) {
      throw new Error('Width and height are required for raw buffer encoding');
    }
    yield* createPixelStreamFromBuffer(new Uint8Array(source), width, height);
    return;
  }

  // Handle Uint8Array
  if (source instanceof Uint8Array) {
    const { width, height } = options;
    if (!width || !height) {
      throw new Error('Width and height are required for raw buffer encoding');
    }
    yield* createPixelStreamFromBuffer(source, width, height);
    return;
  }

  // Handle Readable stream
  if (source instanceof Readable) {
    const { width, height } = options;
    if (!width || !height) {
      throw new Error('Width and height are required for stream encoding');
    }

    const bytesPerLine = width * 4; // RGBA
    let buffer = Buffer.alloc(0);

    for await (const chunk of source) {
      buffer = Buffer.concat([buffer, chunk]);

      // Yield complete scanlines
      while (buffer.length >= bytesPerLine) {
        const line = buffer.subarray(0, bytesPerLine);
        buffer = buffer.subarray(bytesPerLine);
        yield new Uint8Array(line);
      }
    }

    // Handle remaining data
    if (buffer.length > 0) {
      console.warn('Warning: Incomplete scanline data at end of stream');
    }
    return;
  }

  throw new Error('Unsupported image source type');
}

/**
 * Encode an image to JPEG in Node.js
 * @param source Image source (file path, Buffer, Uint8Array, or Readable stream)
 * @param options Encoding options
 * @returns Promise resolving to a Buffer containing the JPEG data
 */
export async function encode(
  source: NodeImageSource,
  options: NodeEncodeOptions
): Promise<Buffer> {
  const { width, height } = options;

  if (!width || !height) {
    throw new Error('Width and height are required');
  }

  // Create worker pool
  const workerPool = new NodeWorkerPool();

  try {
    // Create encoder
    const encoder = new JpegEncoder(workerPool);

    // Create pixel stream
    const pixelStream = createNodePixelStream(source, options);

    // Encode
    const jpegData = await encoder.encode(pixelStream, { width, height, quality: options.quality });

    // Return as Buffer
    return Buffer.from(jpegData);
  } finally {
    workerPool.terminate();
  }
}

// Export types and classes for advanced usage
export { JpegEncoder, NodeWorkerPool };
export type { PixelStream, EncodeOptions };
