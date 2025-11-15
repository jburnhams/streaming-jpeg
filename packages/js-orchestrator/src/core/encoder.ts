/**
 * Universal JPEG encoder core
 * Works in both browser and Node.js environments via dependency injection
 */

import { scaleQuantizationTable, STANDARD_LUMINANCE_QUANTIZATION, STANDARD_CHROMINANCE_QUANTIZATION } from './constants.js';
import { assembleJPEG } from './jpeg-markers.js';

export interface WorkerPool {
  processStrip(stripData: Uint8Array, width: number, lumaQTable: Uint8Array, chromaQTable: Uint8Array): Promise<Uint8Array>;
  terminate(): void;
}

export interface EncodeOptions {
  width: number;
  height: number;
  quality?: number; // 1-100, default 100
}

export type PixelStream = AsyncGenerator<Uint8Array, void, unknown>;

/**
 * Universal JPEG encoder
 * Processes images as horizontal strips for constant memory usage
 */
export class JpegEncoder {
  private workerPool: WorkerPool;

  constructor(workerPool: WorkerPool) {
    this.workerPool = workerPool;
  }

  /**
   * Encode a pixel stream to JPEG
   * @param pixelStream AsyncGenerator that yields scanlines of RGBA pixel data
   * @param options Encoding options
   * @returns Encoded JPEG data
   */
  async encode(pixelStream: PixelStream, options: EncodeOptions): Promise<Uint8Array> {
    const { width, height, quality = 100 } = options;

    // Generate quantization tables
    const lumaQTable = scaleQuantizationTable(STANDARD_LUMINANCE_QUANTIZATION, quality);
    const chromaQTable = scaleQuantizationTable(STANDARD_CHROMINANCE_QUANTIZATION, quality);

    // Process strips
    const scanDataChunks: Uint8Array[] = [];
    const stripBuffer: Uint8Array[] = [];
    let linesBuffered = 0;

    for await (const scanline of pixelStream) {
      stripBuffer.push(scanline);
      linesBuffered++;

      // Process when we have 8 scanlines
      if (linesBuffered === 8) {
        const stripData = this.combineLines(stripBuffer, width);
        const compressed = await this.workerPool.processStrip(stripData, width, lumaQTable, chromaQTable);
        scanDataChunks.push(compressed);

        stripBuffer.length = 0;
        linesBuffered = 0;
      }
    }

    // Process remaining lines (if height is not a multiple of 8)
    if (linesBuffered > 0) {
      // Pad to 8 lines by repeating the last line
      const lastLine = stripBuffer[stripBuffer.length - 1];
      while (stripBuffer.length < 8) {
        stripBuffer.push(lastLine);
      }

      const stripData = this.combineLines(stripBuffer, width);
      const compressed = await this.workerPool.processStrip(stripData, width, lumaQTable, chromaQTable);
      scanDataChunks.push(compressed);
    }

    // Assemble final JPEG
    return assembleJPEG(width, height, lumaQTable, chromaQTable, scanDataChunks);
  }

  /**
   * Combine scanlines into a single strip buffer
   */
  private combineLines(lines: Uint8Array[], width: number): Uint8Array {
    const stripData = new Uint8Array(width * 8 * 4); // 8 rows, RGBA
    for (let i = 0; i < lines.length; i++) {
      stripData.set(lines[i], i * width * 4);
    }
    return stripData;
  }

  /**
   * Cleanup resources
   */
  terminate(): void {
    this.workerPool.terminate();
  }
}

/**
 * Create a pixel stream from raw RGBA buffer
 */
export async function* createPixelStreamFromBuffer(
  buffer: Uint8Array,
  width: number,
  height: number
): PixelStream {
  const bytesPerLine = width * 4; // RGBA

  for (let y = 0; y < height; y++) {
    const start = y * bytesPerLine;
    const end = start + bytesPerLine;
    yield buffer.slice(start, end);
  }
}
