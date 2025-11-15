/**
 * Node.js entry point for streaming-jpeg encoder
 */

import { readFile } from 'fs/promises';
import { Readable } from 'stream';
// @ts-ignore - WASM package may not have perfect types
import { StreamingJpegEncoder, WasmColorType } from 'jpeg-encoder-wasm/pkg/jpeg_encoder.js';

export type NodeImageSource =
  | string              // File path
  | Buffer              // Raw RGBA buffer
  | Uint8Array          // Raw RGBA buffer
  | Readable;           // Readable stream

export interface NodeEncodeOptions {
  width?: number;   // Required for raw buffer/stream
  height?: number;  // Required for raw buffer/stream
  quality?: number; // JPEG quality (1-100), defaults to 100
}

/**
 * Convert a Node.js image source to a Uint8Array buffer
 */
async function sourceToBuffer(
  source: NodeImageSource
): Promise<Uint8Array> {
  // Handle file path
  if (typeof source === 'string') {
    const buffer = await readFile(source);
    return new Uint8Array(buffer);
  }

  // Handle Buffer
  if (Buffer.isBuffer(source)) {
    return new Uint8Array(source);
  }

  // Handle Uint8Array
  if (source instanceof Uint8Array) {
    return source;
  }

  // Handle Readable stream
  if (source instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of source) {
      chunks.push(chunk);
    }
    return new Uint8Array(Buffer.concat(chunks));
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
  const { width, height, quality = 100 } = options;

  if (!width || !height) {
    throw new Error('Width and height are required');
  }

  // Convert source to buffer
  const imageData = await sourceToBuffer(source);

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

  // Return as Buffer
  return Buffer.from(jpegBuffer);
}

// Export WasmColorType for advanced usage
export { WasmColorType, StreamingJpegEncoder };
