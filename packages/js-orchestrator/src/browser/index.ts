/**
 * Browser entry point for streaming-jpeg encoder
 */

import { JpegEncoder, createPixelStreamFromBuffer, type PixelStream, type EncodeOptions } from '../core/encoder.js';
import { BrowserWorkerPool } from './worker-pool.js';

export type BrowserImageSource =
  | HTMLCanvasElement
  | ImageData
  | Uint8Array; // Raw RGBA buffer

export interface BrowserEncodeOptions extends Omit<EncodeOptions, 'width' | 'height'> {
  width?: number;  // Required for raw buffer
  height?: number; // Required for raw buffer
}

/**
 * Create a pixel stream from a browser image source
 */
async function* createBrowserPixelStream(
  source: BrowserImageSource,
  options: BrowserEncodeOptions
): PixelStream {
  // Handle Canvas
  if (source instanceof HTMLCanvasElement) {
    const ctx = source.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas 2D context');
    }

    const imageData = ctx.getImageData(0, 0, source.width, source.height);
    yield* createPixelStreamFromBuffer(new Uint8Array(imageData.data), source.width, source.height);
    return;
  }

  // Handle ImageData
  if (source instanceof ImageData) {
    yield* createPixelStreamFromBuffer(new Uint8Array(source.data), source.width, source.height);
    return;
  }

  // Handle raw buffer
  if (source instanceof Uint8Array) {
    const { width, height } = options;
    if (!width || !height) {
      throw new Error('Width and height are required for raw buffer encoding');
    }
    yield* createPixelStreamFromBuffer(source, width, height);
    return;
  }

  throw new Error('Unsupported image source type');
}

/**
 * Encode an image to JPEG in the browser
 * @param source Image source (Canvas, ImageData, or raw RGBA buffer)
 * @param options Encoding options
 * @returns Promise resolving to a Blob containing the JPEG data
 */
export async function encode(
  source: BrowserImageSource,
  options: BrowserEncodeOptions = {}
): Promise<Blob> {
  // Determine dimensions
  let width: number;
  let height: number;

  if (source instanceof HTMLCanvasElement) {
    width = source.width;
    height = source.height;
  } else if (source instanceof ImageData) {
    width = source.width;
    height = source.height;
  } else {
    if (!options.width || !options.height) {
      throw new Error('Width and height are required for raw buffer encoding');
    }
    width = options.width;
    height = options.height;
  }

  // Create worker pool
  const workerPool = new BrowserWorkerPool();

  try {
    // Create encoder
    const encoder = new JpegEncoder(workerPool);

    // Create pixel stream
    const pixelStream = createBrowserPixelStream(source, { ...options, width, height });

    // Encode
    const jpegData = await encoder.encode(pixelStream, { width, height, quality: options.quality });

    // Return as Blob (create new Uint8Array to ensure proper ArrayBuffer type)
    return new Blob([new Uint8Array(jpegData)], { type: 'image/jpeg' });
  } finally {
    workerPool.terminate();
  }
}

// Export types and classes for advanced usage
export { JpegEncoder, BrowserWorkerPool };
export type { PixelStream, EncodeOptions };
