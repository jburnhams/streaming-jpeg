import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createPixelStreamFromBuffer } from '../../src/core/encoder.js';

describe('Encoder Core', () => {
  describe('createPixelStreamFromBuffer', () => {
    it('should yield scanlines from RGBA buffer', async () => {
      const width = 4;
      const height = 2;
      const buffer = new Uint8Array(width * height * 4); // RGBA

      // Fill with test data
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = i % 256;
      }

      const stream = createPixelStreamFromBuffer(buffer, width, height);
      const scanlines: Uint8Array[] = [];

      for await (const scanline of stream) {
        scanlines.push(scanline);
      }

      assert.strictEqual(scanlines.length, height);
      assert.strictEqual(scanlines[0].length, width * 4);
      assert.strictEqual(scanlines[1].length, width * 4);

      // Verify first scanline
      for (let i = 0; i < width * 4; i++) {
        assert.strictEqual(scanlines[0][i], i % 256);
      }

      // Verify second scanline
      for (let i = 0; i < width * 4; i++) {
        assert.strictEqual(scanlines[1][i], (width * 4 + i) % 256);
      }
    });

    it('should handle single pixel image', async () => {
      const width = 1;
      const height = 1;
      const buffer = new Uint8Array([255, 0, 0, 255]); // Red pixel

      const stream = createPixelStreamFromBuffer(buffer, width, height);
      const scanlines: Uint8Array[] = [];

      for await (const scanline of stream) {
        scanlines.push(scanline);
      }

      assert.strictEqual(scanlines.length, 1);
      assert.deepStrictEqual(Array.from(scanlines[0]), [255, 0, 0, 255]);
    });

    it('should handle empty height', async () => {
      const width = 4;
      const height = 0;
      const buffer = new Uint8Array(0);

      const stream = createPixelStreamFromBuffer(buffer, width, height);
      const scanlines: Uint8Array[] = [];

      for await (const scanline of stream) {
        scanlines.push(scanline);
      }

      assert.strictEqual(scanlines.length, 0);
    });
  });
});
