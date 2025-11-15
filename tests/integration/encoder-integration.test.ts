import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createPixelStreamFromBuffer } from '../../src/core/encoder.js';
import { assembleJPEG } from '../../src/core/jpeg-markers.js';
import { scaleQuantizationTable, STANDARD_LUMINANCE_QUANTIZATION, STANDARD_CHROMINANCE_QUANTIZATION } from '../../src/core/constants.js';

describe('JPEG Encoder Integration', () => {
  it('should assemble a complete JPEG from components', async () => {
    const width = 16;
    const height = 16;

    // Create a simple test image (red gradient)
    const buffer = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        buffer[offset] = (x * 16) % 256;     // R
        buffer[offset + 1] = (y * 16) % 256; // G
        buffer[offset + 2] = 0;              // B
        buffer[offset + 3] = 255;            // A
      }
    }

    // Get quantization tables
    const lumaQTable = scaleQuantizationTable(STANDARD_LUMINANCE_QUANTIZATION, 100);
    const chromaQTable = scaleQuantizationTable(STANDARD_CHROMINANCE_QUANTIZATION, 100);

    // Mock scan data (in a real test, this would come from the WASM engine)
    const scanData = [new Uint8Array([0x01, 0x02, 0x03, 0x04])];

    // Assemble JPEG
    const jpeg = assembleJPEG(width, height, lumaQTable, chromaQTable, scanData);

    // Verify JPEG structure
    assert.ok(jpeg.length > 0, 'JPEG should have content');

    // Check SOI marker
    assert.strictEqual(jpeg[0], 0xFF, 'Should start with FF');
    assert.strictEqual(jpeg[1], 0xD8, 'Should start with SOI marker');

    // Check EOI marker
    assert.strictEqual(jpeg[jpeg.length - 2], 0xFF, 'Should end with FF');
    assert.strictEqual(jpeg[jpeg.length - 1], 0xD9, 'Should end with EOI marker');

    // Verify JFIF marker exists
    let hasJFIF = false;
    for (let i = 0; i < jpeg.length - 5; i++) {
      if (jpeg[i] === 0xFF && jpeg[i + 1] === 0xE0) {
        // Check for JFIF string
        if (jpeg[i + 4] === 0x4A && jpeg[i + 5] === 0x46 && jpeg[i + 6] === 0x49 && jpeg[i + 7] === 0x46) {
          hasJFIF = true;
          break;
        }
      }
    }
    assert.ok(hasJFIF, 'JPEG should contain JFIF marker');
  });

  it('should create pixel stream that can be consumed', async () => {
    const width = 8;
    const height = 8;
    const buffer = new Uint8Array(width * height * 4).fill(128);

    const stream = createPixelStreamFromBuffer(buffer, width, height);
    let lineCount = 0;

    for await (const scanline of stream) {
      assert.strictEqual(scanline.length, width * 4);
      lineCount++;
    }

    assert.strictEqual(lineCount, height);
  });
});
