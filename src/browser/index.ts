/**
 * Browser entry point for streaming-jpeg encoder
 */

// @ts-ignore - WASM package may not have perfect types
import { StreamingJpegEncoder, WasmColorType } from 'jpeg-encoder-wasm/pkg/jpeg_encoder.js';

export type BrowserImageSource =
  | HTMLCanvasElement
  | ImageData
  | Uint8Array; // Raw RGBA buffer

export interface BrowserEncodeOptions {
  width?: number;   // Required for raw buffer
  height?: number;  // Required for raw buffer
  quality?: number; // JPEG quality (1-100), defaults to 100
}

/**
 * Convert a browser image source to a Uint8Array buffer
 */
function sourceToBuffer(source: BrowserImageSource): Uint8Array {
  // Handle Canvas
  if (source instanceof HTMLCanvasElement) {
    const ctx = source.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas 2D context');
    }

    const imageData = ctx.getImageData(0, 0, source.width, source.height);
    return new Uint8Array(imageData.data);
  }

  // Handle ImageData
  if (source instanceof ImageData) {
    return new Uint8Array(source.data);
  }

  // Handle raw buffer
  if (source instanceof Uint8Array) {
    return source;
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
  const { quality = 100 } = options;

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

  // Convert source to buffer
  const imageData = sourceToBuffer(source);

  // Validate buffer size
  const expectedSize = width * height * 4; // RGBA
  if (imageData.length < expectedSize) {
    throw new Error(`Buffer too small: expected at least ${expectedSize} bytes for ${width}x${height} RGBA image, got ${imageData.length}`);
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

  // Return as Blob
  return new Blob([jpegBuffer], { type: 'image/jpeg' });
}

// Export WasmColorType for advanced usage
export { WasmColorType, StreamingJpegEncoder };
