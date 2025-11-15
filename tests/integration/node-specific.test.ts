import { describe, it } from 'node:test';
import assert from 'node:assert';
import { writeFile, unlink } from 'fs/promises';
import { Readable } from 'stream';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import { encode } from '../../src/index.js';

describe('Node.js-specific Integration Tests (no browser APIs)', () => {
  describe('Buffer input', () => {
    it('should encode from Node.js Buffer', async () => {
      const width = 32;
      const height = 32;

      // Create a Buffer (Node.js-specific)
      const buffer = Buffer.alloc(width * height * 4);
      for (let i = 0; i < buffer.length; i += 4) {
        buffer[i] = 0;       // R
        buffer[i + 1] = 255; // G (green)
        buffer[i + 2] = 0;   // B
        buffer[i + 3] = 255; // A
      }

      // Encode should work with Node.js Buffer
      const result = await encode(buffer, { width, height });

      // In Node.js, should return Buffer
      assert.ok(Buffer.isBuffer(result), 'Should return Buffer in Node.js environment');
      assert.strictEqual(result[0], 0xFF, 'Should start with JPEG SOI marker');
      assert.strictEqual(result[1], 0xD8, 'Should have SOI marker');

      // Validate by decoding
      const decoded = await sharp(result).raw().toBuffer({ resolveWithObject: true });
      assert.strictEqual(decoded.info.width, width);
      assert.strictEqual(decoded.info.height, height);

      // Check it's green
      const { data } = decoded;
      assert.ok(data[0] < 100, 'Red should be low');
      assert.ok(data[1] > 200, 'Green should be high');
      assert.ok(data[2] < 100, 'Blue should be low');
    });

    it('should encode from Uint8Array', async () => {
      const width = 16;
      const height = 16;

      // Create a Uint8Array
      const buffer = new Uint8Array(width * height * 4);
      for (let i = 0; i < buffer.length; i += 4) {
        buffer[i] = 255;     // R
        buffer[i + 1] = 255; // G
        buffer[i + 2] = 0;   // B (yellow)
        buffer[i + 3] = 255; // A
      }

      const result = await encode(buffer, { width, height });

      // Should return Buffer in Node.js
      assert.ok(Buffer.isBuffer(result), 'Should return Buffer in Node.js');
      assert.strictEqual(result[0], 0xFF);
      assert.strictEqual(result[1], 0xD8);

      // Validate yellow color
      const decoded = await sharp(result).raw().toBuffer({ resolveWithObject: true });
      const { data } = decoded;
      assert.ok(data[0] > 200, 'Red should be high (yellow)');
      assert.ok(data[1] > 200, 'Green should be high (yellow)');
      assert.ok(data[2] < 100, 'Blue should be low (yellow)');
    });
  });

  describe('File path input', () => {
    it('should encode from file path', async () => {
      const width = 48;
      const height = 48;

      // Create a temporary raw RGBA file
      const tempPath = join(tmpdir(), `test-image-${Date.now()}.raw`);
      const rawData = Buffer.alloc(width * height * 4);
      for (let i = 0; i < rawData.length; i += 4) {
        rawData[i] = 0;       // R
        rawData[i + 1] = 0;   // G
        rawData[i + 2] = 255; // B (blue)
        rawData[i + 3] = 255; // A
      }

      try {
        // Write test file
        await writeFile(tempPath, rawData);

        // Encode from file path (Node.js only feature)
        const result = await encode(tempPath, { width, height });

        assert.ok(Buffer.isBuffer(result), 'Should return Buffer');
        assert.strictEqual(result[0], 0xFF);
        assert.strictEqual(result[1], 0xD8);

        // Validate blue color
        const decoded = await sharp(result).raw().toBuffer({ resolveWithObject: true });
        assert.strictEqual(decoded.info.width, width);
        assert.strictEqual(decoded.info.height, height);

        const { data } = decoded;
        assert.ok(data[0] < 100, 'Red should be low');
        assert.ok(data[1] < 100, 'Green should be low');
        assert.ok(data[2] > 200, 'Blue should be high');
      } finally {
        // Clean up
        await unlink(tempPath).catch(() => {});
      }
    });

    it('should throw error for non-existent file', async () => {
      const nonExistentPath = join(tmpdir(), 'non-existent-file.raw');

      await assert.rejects(
        async () => {
          await encode(nonExistentPath, { width: 10, height: 10 });
        },
        {
          name: 'Error',
          message: /ENOENT|no such file/i,
        },
        'Should reject with file not found error'
      );
    });
  });

  describe('Readable stream input', () => {
    it('should encode from Readable stream', async () => {
      const width = 24;
      const height = 24;

      // Create a cyan image
      const buffer = Buffer.alloc(width * height * 4);
      for (let i = 0; i < buffer.length; i += 4) {
        buffer[i] = 0;       // R
        buffer[i + 1] = 255; // G
        buffer[i + 2] = 255; // B (cyan)
        buffer[i + 3] = 255; // A
      }

      // Create a Readable stream (Node.js-specific)
      const stream = Readable.from([buffer]);

      const result = await encode(stream, { width, height });

      assert.ok(Buffer.isBuffer(result), 'Should return Buffer');
      assert.strictEqual(result[0], 0xFF);
      assert.strictEqual(result[1], 0xD8);

      // Validate cyan color
      const decoded = await sharp(result).raw().toBuffer({ resolveWithObject: true });
      const { data } = decoded;
      assert.ok(data[0] < 100, 'Red should be low (cyan)');
      assert.ok(data[1] > 200, 'Green should be high (cyan)');
      assert.ok(data[2] > 200, 'Blue should be high (cyan)');
    });

    it('should encode from chunked stream', async () => {
      const width = 32;
      const height = 32;

      // Create magenta image
      const buffer = Buffer.alloc(width * height * 4);
      for (let i = 0; i < buffer.length; i += 4) {
        buffer[i] = 255;     // R
        buffer[i + 1] = 0;   // G
        buffer[i + 2] = 255; // B (magenta)
        buffer[i + 3] = 255; // A
      }

      // Split into multiple chunks
      const chunkSize = 1024;
      const chunks: Buffer[] = [];
      for (let i = 0; i < buffer.length; i += chunkSize) {
        chunks.push(buffer.subarray(i, i + chunkSize));
      }

      // Create stream from chunks
      const stream = Readable.from(chunks);

      const result = await encode(stream, { width, height });

      assert.ok(Buffer.isBuffer(result), 'Should return Buffer');
      assert.strictEqual(result[0], 0xFF);
      assert.strictEqual(result[1], 0xD8);

      // Validate magenta color
      const decoded = await sharp(result).raw().toBuffer({ resolveWithObject: true });
      const { data } = decoded;
      assert.ok(data[0] > 200, 'Red should be high (magenta)');
      assert.ok(data[1] < 100, 'Green should be low (magenta)');
      assert.ok(data[2] > 200, 'Blue should be high (magenta)');
    });
  });

  describe('Error handling', () => {
    it('should require width and height for raw buffer', async () => {
      const buffer = Buffer.alloc(100);

      await assert.rejects(
        async () => {
          await encode(buffer, {});
        },
        {
          message: /width and height are required/i,
        },
        'Should require dimensions for raw buffer'
      );
    });

    it('should validate buffer size', async () => {
      const width = 100;
      const height = 100;
      const tooSmallBuffer = Buffer.alloc(100); // Way too small

      await assert.rejects(
        async () => {
          await encode(tooSmallBuffer, { width, height });
        },
        {
          message: /buffer too small/i,
        },
        'Should reject undersized buffer'
      );
    });
  });

  describe('Return type validation', () => {
    it('should return Buffer in Node.js environment', async () => {
      const width = 8;
      const height = 8;
      const buffer = Buffer.alloc(width * height * 4, 255);

      const result = await encode(buffer, { width, height });

      // In Node.js, should return Buffer (even though Blob exists in modern Node.js)
      assert.ok(Buffer.isBuffer(result), 'Should return Buffer');
      assert.strictEqual(typeof result.length, 'number', 'Should have length property');

      // Verify it's a valid JPEG
      assert.strictEqual(result[0], 0xFF, 'Should start with JPEG SOI');
      assert.strictEqual(result[1], 0xD8, 'Should have SOI marker');
    });
  });
});
