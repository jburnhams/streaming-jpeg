import { describe, it } from 'node:test';
import assert from 'node:assert';
// @ts-ignore - WASM package may not have perfect types
import { StreamingJpegEncoder, WasmColorType } from 'jpeg-encoder-wasm/pkg/jpeg_encoder.js';

describe('Direct WASM Encoder', () => {
  it('should encode a simple solid color image directly', async () => {
    const width = 64;
    const height = 64;
    const quality = 100;

    // Create a solid red image (RGBA format)
    const buffer = new Uint8Array(width * height * 4);
    for (let i = 0; i < buffer.length; i += 4) {
      buffer[i] = 255;     // R
      buffer[i + 1] = 0;   // G
      buffer[i + 2] = 0;   // B
      buffer[i + 3] = 255; // A
    }

    // Create encoder instance directly
    const encoder = new StreamingJpegEncoder(width, height, WasmColorType.Rgba, quality);

    // Collect output chunks
    const chunks: Uint8Array[] = [];

    // Process the entire image as strips of 8 scanlines
    const stripHeight = 8;
    const bytesPerRow = width * 4; // RGBA

    for (let y = 0; y < height; y += stripHeight) {
      const actualStripHeight = Math.min(stripHeight, height - y);
      const stripSize = actualStripHeight * bytesPerRow;
      const stripStart = y * bytesPerRow;
      const stripData = buffer.slice(stripStart, stripStart + stripSize);

      const output = encoder.encode_strip(stripData);
      if (output && output.length > 0) {
        chunks.push(output);
      }
    }

    // Finish encoding and get final output
    const finalOutput = encoder.finish();
    if (finalOutput && finalOutput.length > 0) {
      chunks.push(finalOutput);
    }

    // Combine all chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const jpegBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      jpegBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    // Verify it's a valid JPEG
    assert.ok(jpegBuffer.length > 0, 'JPEG buffer should not be empty');

    // Check SOI marker (FF D8)
    assert.strictEqual(jpegBuffer[0], 0xFF, 'Should start with 0xFF');
    assert.strictEqual(jpegBuffer[1], 0xD8, 'Should have SOI marker (0xD8)');

    // Check EOI marker (FF D9) at the end
    assert.strictEqual(jpegBuffer[jpegBuffer.length - 2], 0xFF, 'Should end with 0xFF');
    assert.strictEqual(jpegBuffer[jpegBuffer.length - 1], 0xD9, 'Should have EOI marker (0xD9)');

    // File should be reasonably sized
    assert.ok(jpegBuffer.length > 100, 'JPEG should be larger than 100 bytes');
    assert.ok(jpegBuffer.length < 10000, 'JPEG should be smaller than 10KB for a small image');

    console.log(`Encoded 64x64 solid red image to ${jpegBuffer.length} bytes`);
  });

  it('should encode a gradient image directly', async () => {
    const width = 128;
    const height = 128;
    const quality = 100;

    // Create a gradient image (red-green gradient)
    const buffer = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        buffer[offset] = (x * 255) / width;       // R gradient
        buffer[offset + 1] = (y * 255) / height;  // G gradient
        buffer[offset + 2] = 0;                    // B
        buffer[offset + 3] = 255;                  // A
      }
    }

    // Create encoder
    const encoder = new StreamingJpegEncoder(width, height, WasmColorType.Rgba, quality);

    // Collect output chunks
    const chunks: Uint8Array[] = [];

    // Process in 8-scanline strips
    const stripHeight = 8;
    const bytesPerRow = width * 4;

    for (let y = 0; y < height; y += stripHeight) {
      const actualStripHeight = Math.min(stripHeight, height - y);
      const stripSize = actualStripHeight * bytesPerRow;
      const stripStart = y * bytesPerRow;
      const stripData = buffer.slice(stripStart, stripStart + stripSize);

      const output = encoder.encode_strip(stripData);
      if (output && output.length > 0) {
        chunks.push(output);
      }
    }

    // Finish and get final output
    const finalOutput = encoder.finish();
    if (finalOutput && finalOutput.length > 0) {
      chunks.push(finalOutput);
    }

    // Combine all chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const jpegBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      jpegBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    // Verify it's a valid JPEG
    assert.ok(jpegBuffer.length > 0, 'JPEG buffer should not be empty');
    assert.strictEqual(jpegBuffer[0], 0xFF, 'Should start with 0xFF');
    assert.strictEqual(jpegBuffer[1], 0xD8, 'Should have SOI marker');
    assert.strictEqual(jpegBuffer[jpegBuffer.length - 2], 0xFF, 'Should end with 0xFF');
    assert.strictEqual(jpegBuffer[jpegBuffer.length - 1], 0xD9, 'Should have EOI marker');

    console.log(`Encoded 128x128 gradient image to ${jpegBuffer.length} bytes`);
  });

  it('should encode a 1x1 pixel image directly', async () => {
    const width = 1;
    const height = 1;
    const quality = 100;

    // Single white pixel
    const buffer = new Uint8Array([255, 255, 255, 255]); // RGBA

    const encoder = new StreamingJpegEncoder(width, height, WasmColorType.Rgba, quality);

    // Collect output chunks
    const chunks: Uint8Array[] = [];

    // Encode the single pixel
    const output = encoder.encode_strip(buffer);
    if (output && output.length > 0) {
      chunks.push(output);
    }

    const finalOutput = encoder.finish();
    if (finalOutput && finalOutput.length > 0) {
      chunks.push(finalOutput);
    }

    // Combine all chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const jpegBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      jpegBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    // Should still be a valid JPEG
    assert.strictEqual(jpegBuffer[0], 0xFF);
    assert.strictEqual(jpegBuffer[1], 0xD8);
    assert.ok(jpegBuffer.length > 50, 'Even 1x1 JPEG should have headers');

    console.log(`Encoded 1x1 pixel image to ${jpegBuffer.length} bytes`);
  });
});
