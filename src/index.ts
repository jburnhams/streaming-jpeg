/**
 * Universal streaming JPEG encoder for Node.js and browsers
 * Uses runtime detection to support platform-specific features
 */

// @ts-ignore - WASM package may not have perfect types
import { StreamingJpegEncoder, WasmColorType } from 'jpeg-encoder-wasm/pkg/jpeg_encoder.js';
import type { Readable } from 'stream';

/**
 * Universal image source type
 * - Uint8Array: Raw RGBA buffer (works everywhere)
 * - string: File path (Node.js only)
 * - Buffer: Node.js buffer (Node.js only)
 * - Readable: Node.js stream (Node.js only)
 * - HTMLCanvasElement: Browser canvas (browser/jsdom only)
 * - ImageData: Canvas image data (browser/jsdom only)
 */
export type ImageSource =
  | Uint8Array
  | string
  | Buffer
  | Readable
  | HTMLCanvasElement
  | ImageData;

export interface EncodeOptions {
  width?: number;   // Required for raw buffer (Uint8Array/Buffer)
  height?: number;  // Required for raw buffer (Uint8Array/Buffer)
  quality?: number; // JPEG quality (1-100), defaults to 100
}

/**
 * Universal return type - actual type depends on environment
 * - Browser: Blob
 * - Node.js: Buffer
 * - Fallback: Uint8Array
 */
export type EncodeResult = Blob | Buffer | Uint8Array;

/**
 * Runtime environment detection
 */
const runtime = {
  hasNodeFS: typeof process !== 'undefined' &&
             process.versions != null &&
             process.versions.node != null,
  hasBuffer: typeof Buffer !== 'undefined',
  hasBlob: typeof Blob !== 'undefined',
  hasCanvas: typeof HTMLCanvasElement !== 'undefined',
  hasImageData: typeof ImageData !== 'undefined',
};

/**
 * Convert any supported image source to a Uint8Array buffer
 */
async function sourceToBuffer(source: ImageSource): Promise<{
  buffer: Uint8Array;
  width?: number;
  height?: number;
}> {
  // Handle HTMLCanvasElement (browser/jsdom)
  if (runtime.hasCanvas && source instanceof HTMLCanvasElement) {
    const ctx = source.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas 2D context');
    }
    const imageData = ctx.getImageData(0, 0, source.width, source.height);
    return {
      buffer: new Uint8Array(imageData.data),
      width: source.width,
      height: source.height,
    };
  }

  // Handle ImageData (browser/jsdom)
  if (runtime.hasImageData && source instanceof ImageData) {
    return {
      buffer: new Uint8Array(source.data),
      width: source.width,
      height: source.height,
    };
  }

  // Handle file path (Node.js only)
  if (typeof source === 'string') {
    if (!runtime.hasNodeFS) {
      throw new Error('File path sources are only supported in Node.js environments');
    }
    // Dynamic import to avoid bundling fs in browser builds
    const { readFile } = await import('fs/promises');
    const buffer = await readFile(source);
    return { buffer: new Uint8Array(buffer) };
  }

  // Handle Node.js Buffer
  if (runtime.hasBuffer && Buffer.isBuffer(source)) {
    return { buffer: new Uint8Array(source) };
  }

  // Handle Uint8Array
  if (source instanceof Uint8Array) {
    return { buffer: source };
  }

  // Handle Node.js Readable stream
  if (runtime.hasNodeFS && source && typeof (source as any).read === 'function') {
    // Dynamic import to avoid bundling stream in browser builds
    const { Readable } = await import('stream');
    if (source instanceof Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of source) {
        chunks.push(chunk);
      }
      return { buffer: new Uint8Array(Buffer.concat(chunks)) };
    }
  }

  throw new Error('Unsupported image source type');
}

/**
 * Encode an image to JPEG
 *
 * @param source Image source (file path, Buffer, Uint8Array, Readable stream, Canvas, or ImageData)
 * @param options Encoding options
 * @returns Promise resolving to encoded JPEG data
 *   - Browser: Returns Blob with type 'image/jpeg'
 *   - Node.js: Returns Buffer
 *   - Fallback: Returns Uint8Array
 *
 * @example
 * // Node.js with file path
 * const jpeg = await encode('/path/to/image.raw', { width: 800, height: 600 });
 *
 * @example
 * // Browser with canvas
 * const canvas = document.getElementById('myCanvas');
 * const jpeg = await encode(canvas);
 *
 * @example
 * // Node.js with Buffer
 * const buffer = Buffer.from(rgbaData);
 * const jpeg = await encode(buffer, { width: 800, height: 600 });
 *
 * @example
 * // Browser/Node with ImageData (jsdom)
 * const imageData = ctx.getImageData(0, 0, 100, 100);
 * const jpeg = await encode(imageData, { quality: 85 });
 */
export async function encode(
  source: ImageSource,
  options: EncodeOptions = {}
): Promise<EncodeResult> {
  const { quality = 100 } = options;

  // Convert source to buffer and extract dimensions if available
  const { buffer: imageData, width: detectedWidth, height: detectedHeight } =
    await sourceToBuffer(source);

  // Determine final dimensions
  const width = options.width ?? detectedWidth;
  const height = options.height ?? detectedHeight;

  if (!width || !height) {
    throw new Error('Width and height are required (provide in options or use Canvas/ImageData source)');
  }

  // Validate buffer size
  const expectedSize = width * height * 4; // RGBA
  if (imageData.length < expectedSize) {
    throw new Error(
      `Buffer too small: expected at least ${expectedSize} bytes for ${width}x${height} RGBA image, got ${imageData.length}`
    );
  }

  // Create WASM encoder
  const encoder = new StreamingJpegEncoder(width, height, WasmColorType.Rgba, quality);

  // Collect output chunks
  const chunks: Uint8Array[] = [];

  // Process in 8-scanline strips
  const stripHeight = 8;
  const bytesPerRow = width * 4; // RGBA

  for (let y = 0; y < height; y += stripHeight) {
    const actualStripHeight = Math.min(stripHeight, height - y);
    const stripSize = actualStripHeight * bytesPerRow;
    const stripStart = y * bytesPerRow;
    const stripData = imageData.slice(stripStart, stripStart + stripSize);

    const output = encoder.encode_strip(stripData);
    if (output && output.length > 0) {
      chunks.push(output);
    }
  }

  // Finish encoding
  const finalOutput = encoder.finish();
  if (finalOutput && finalOutput.length > 0) {
    chunks.push(finalOutput);
  }

  // Combine all chunks into a single buffer
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const jpegBuffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    jpegBuffer.set(chunk, offset);
    offset += chunk.length;
  }

  // Return appropriate type based on environment
  // Prioritize Buffer in Node.js, even if Blob is available (e.g., via polyfill)
  if (runtime.hasBuffer && runtime.hasNodeFS) {
    return Buffer.from(jpegBuffer);
  } else if (runtime.hasBlob) {
    return new Blob([jpegBuffer], { type: 'image/jpeg' });
  } else {
    return jpegBuffer;
  }
}

// Export WasmColorType for advanced usage
export { WasmColorType, StreamingJpegEncoder };
