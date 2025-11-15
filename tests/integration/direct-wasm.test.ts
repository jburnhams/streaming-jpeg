import { describe, it } from 'node:test';
import assert from 'node:assert';
import sharp from 'sharp';
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

    // Decode the JPEG and validate contents
    const decoded = await sharp(jpegBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    assert.strictEqual(decoded.info.width, width, 'Decoded width should match');
    assert.strictEqual(decoded.info.height, height, 'Decoded height should match');

    // Check a few pixels are red (allowing for JPEG compression artifacts)
    const { data } = decoded;
    for (let i = 0; i < 10; i++) {
      const offset = i * 100 * 4; // Sample every 100th pixel
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];

      assert.ok(r > 200, `Red channel should be high, got ${r}`);
      assert.ok(g < 100, `Green channel should be low, got ${g}`);
      assert.ok(b < 100, `Blue channel should be low, got ${b}`);
    }

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

    // Decode and validate gradient pattern
    const decoded = await sharp(jpegBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    assert.strictEqual(decoded.info.width, width, 'Decoded width should match');
    assert.strictEqual(decoded.info.height, height, 'Decoded height should match');

    // Check gradient increases from left to right (red) and top to bottom (green)
    const { data } = decoded;
    const topLeftRed = data[0]; // Top-left corner, red should be near 0
    const topLeftGreen = data[1]; // Top-left corner, green should be near 0
    const topRightRed = data[(width - 1) * 4]; // Top-right corner, red should be near 255
    const bottomLeftGreen = data[((height - 1) * width) * 4 + 1]; // Bottom-left corner, green should be near 255
    const bottomRightRed = data[((height - 1) * width + (width - 1)) * 4]; // Bottom-right corner, red should be near 255
    const bottomRightGreen = data[((height - 1) * width + (width - 1)) * 4 + 1]; // Bottom-right corner, green should be near 255

    assert.ok(topLeftRed < 50, `Top-left red should be low, got ${topLeftRed}`);
    assert.ok(topLeftGreen < 50, `Top-left green should be low, got ${topLeftGreen}`);
    assert.ok(topRightRed > 200, `Top-right red should be high, got ${topRightRed}`);
    assert.ok(bottomLeftGreen > 200, `Bottom-left green should be high, got ${bottomLeftGreen}`);
    assert.ok(bottomRightRed > 200, `Bottom-right red should be high, got ${bottomRightRed}`);
    assert.ok(bottomRightGreen > 200, `Bottom-right green should be high, got ${bottomRightGreen}`);

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

    // Decode and validate white pixel
    const decoded = await sharp(jpegBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    assert.strictEqual(decoded.info.width, width, 'Decoded width should match');
    assert.strictEqual(decoded.info.height, height, 'Decoded height should match');

    const { data } = decoded;
    assert.ok(data[0] > 200, `Red should be high (white), got ${data[0]}`);
    assert.ok(data[1] > 200, `Green should be high (white), got ${data[1]}`);
    assert.ok(data[2] > 200, `Blue should be high (white), got ${data[2]}`);

    console.log(`Encoded 1x1 pixel image to ${jpegBuffer.length} bytes`);
  });
});
