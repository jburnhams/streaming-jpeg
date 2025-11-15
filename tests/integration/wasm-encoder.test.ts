import { describe, it } from 'node:test';
import assert from 'node:assert';
import sharp from 'sharp';
import { encode } from '../../src/index.js';

describe('WASM JPEG Encoder Integration', () => {
  it('should encode a simple solid color image', async () => {
    const width = 64;
    const height = 64;
    const quality = 100;

    // Create a solid red image
    const buffer = new Uint8Array(width * height * 4);
    for (let i = 0; i < buffer.length; i += 4) {
      buffer[i] = 255;     // R
      buffer[i + 1] = 0;   // G
      buffer[i + 2] = 0;   // B
      buffer[i + 3] = 255; // A
    }

    // Encode to JPEG
    const jpegBuffer = await encode(buffer, { width, height, quality }) as Buffer;

    // Verify it's a valid JPEG
    assert.ok(jpegBuffer.length > 0, 'JPEG buffer should not be empty');

    // Check SOI marker (FF D8)
    assert.strictEqual(jpegBuffer[0], 0xFF, 'Should start with 0xFF');
    assert.strictEqual(jpegBuffer[1], 0xD8, 'Should have SOI marker (0xD8)');

    // Check EOI marker (FF D9) at the end
    assert.strictEqual(jpegBuffer[jpegBuffer.length - 2], 0xFF, 'Should end with 0xFF');
    assert.strictEqual(jpegBuffer[jpegBuffer.length - 1], 0xD9, 'Should have EOI marker (0xD9)');

    // File should be reasonably sized (not too small, not too large)
    assert.ok(jpegBuffer.length > 100, 'JPEG should be larger than 100 bytes');
    assert.ok(jpegBuffer.length < 10000, 'JPEG should be smaller than 10KB for a small image');

    // Validate pixel content by decoding
    const decoded = await sharp(jpegBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    assert.strictEqual(decoded.info.width, width);
    assert.strictEqual(decoded.info.height, height);

    // Verify red color
    const { data } = decoded;
    assert.ok(data[0] > 200, 'Red channel should be high');
    assert.ok(data[1] < 100, 'Green channel should be low');
    assert.ok(data[2] < 100, 'Blue channel should be low');
  });

  it('should encode a gradient image', async () => {
    const width = 128;
    const height = 128;
    const quality = 100;

    // Create a gradient image (red gradient)
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

    // Encode to JPEG
    const jpegBuffer = await encode(buffer, { width, height, quality }) as Buffer;

    // Verify it's a valid JPEG
    assert.ok(jpegBuffer.length > 0, 'JPEG buffer should not be empty');
    assert.strictEqual(jpegBuffer[0], 0xFF, 'Should start with 0xFF');
    assert.strictEqual(jpegBuffer[1], 0xD8, 'Should have SOI marker');
    assert.strictEqual(jpegBuffer[jpegBuffer.length - 2], 0xFF, 'Should end with 0xFF');
    assert.strictEqual(jpegBuffer[jpegBuffer.length - 1], 0xD9, 'Should have EOI marker');

    // Gradient should create a larger file than solid color
    assert.ok(jpegBuffer.length > 200, 'Gradient JPEG should be reasonably sized');
  });

  it('should encode images with different quality settings', async () => {
    const width = 64;
    const height = 64;

    // Create a test pattern with gradients (better for testing quality differences)
    const buffer = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        buffer[offset] = (x * 255) / width;       // R gradient
        buffer[offset + 1] = (y * 255) / height;  // G gradient
        buffer[offset + 2] = ((x + y) * 128) / (width + height); // B gradient
        buffer[offset + 3] = 255;                  // A
      }
    }

    // Encode with quality 100
    const jpeg100 = await encode(buffer, { width, height, quality: 100 }) as Buffer;

    // Encode with quality 75
    const jpeg75 = await encode(buffer, { width, height, quality: 75 }) as Buffer;

    // Encode with quality 50
    const jpeg50 = await encode(buffer, { width, height, quality: 50 }) as Buffer;

    // All should be valid JPEGs with proper markers
    assert.strictEqual(jpeg100[0], 0xFF, 'Quality 100: Should start with 0xFF');
    assert.strictEqual(jpeg100[1], 0xD8, 'Quality 100: Should have SOI marker');
    assert.strictEqual(jpeg75[0], 0xFF, 'Quality 75: Should start with 0xFF');
    assert.strictEqual(jpeg75[1], 0xD8, 'Quality 75: Should have SOI marker');
    assert.strictEqual(jpeg50[0], 0xFF, 'Quality 50: Should start with 0xFF');
    assert.strictEqual(jpeg50[1], 0xD8, 'Quality 50: Should have SOI marker');

    // Verify all can be decoded successfully
    const decoded100 = await sharp(jpeg100).raw().toBuffer({ resolveWithObject: true });
    const decoded75 = await sharp(jpeg75).raw().toBuffer({ resolveWithObject: true });
    const decoded50 = await sharp(jpeg50).raw().toBuffer({ resolveWithObject: true });

    assert.strictEqual(decoded100.info.width, width, 'Quality 100: Width should match');
    assert.strictEqual(decoded75.info.width, width, 'Quality 75: Width should match');
    assert.strictEqual(decoded50.info.width, width, 'Quality 50: Width should match');

    // Higher quality should produce larger files
    assert.ok(jpeg100.length > jpeg75.length,
      `Quality 100 (${jpeg100.length} bytes) should be larger than quality 75 (${jpeg75.length} bytes)`);
    assert.ok(jpeg75.length > jpeg50.length,
      `Quality 75 (${jpeg75.length} bytes) should be larger than quality 50 (${jpeg50.length} bytes)`);

    console.log(`Quality comparison: Q100=${jpeg100.length}B, Q75=${jpeg75.length}B, Q50=${jpeg50.length}B`);
  });

  it('should handle images with dimensions not divisible by 8', async () => {
    const width = 100;  // Not divisible by 8
    const height = 100; // Not divisible by 8
    const quality = 100;

    // Create a simple test image
    const buffer = new Uint8Array(width * height * 4);
    for (let i = 0; i < buffer.length; i += 4) {
      buffer[i] = 128;     // R
      buffer[i + 1] = 128; // G
      buffer[i + 2] = 128; // B (gray)
      buffer[i + 3] = 255; // A
    }

    // Should encode without errors
    const jpegBuffer = await encode(buffer, { width, height, quality }) as Buffer;

    // Verify it's valid
    assert.strictEqual(jpegBuffer[0], 0xFF);
    assert.strictEqual(jpegBuffer[1], 0xD8);
    assert.strictEqual(jpegBuffer[jpegBuffer.length - 2], 0xFF);
    assert.strictEqual(jpegBuffer[jpegBuffer.length - 1], 0xD9);
  });

  it('should encode a very small image', async () => {
    const width = 1;
    const height = 1;
    const quality = 100;

    // Single pixel image
    const buffer = new Uint8Array([255, 255, 255, 255]); // White pixel

    const jpegBuffer = await encode(buffer, { width, height, quality }) as Buffer;

    // Should still be a valid JPEG
    assert.strictEqual(jpegBuffer[0], 0xFF);
    assert.strictEqual(jpegBuffer[1], 0xD8);
    assert.ok(jpegBuffer.length > 50, 'Even 1x1 JPEG should have headers');
  });
});
