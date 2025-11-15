import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createAPP0,
  createDQT,
  createSOF0,
  createSOS,
  assembleJPEG
} from '../../packages/js-orchestrator/src/core/jpeg-markers.js';

describe('JPEG Markers', () => {
  describe('createAPP0', () => {
    it('should create valid JFIF APP0 marker', () => {
      const app0 = createAPP0();

      // Check marker
      assert.strictEqual(app0[0], 0xFF);
      assert.strictEqual(app0[1], 0xE0);

      // Check JFIF identifier
      assert.strictEqual(app0[4], 0x4A); // 'J'
      assert.strictEqual(app0[5], 0x46); // 'F'
      assert.strictEqual(app0[6], 0x49); // 'I'
      assert.strictEqual(app0[7], 0x46); // 'F'
      assert.strictEqual(app0[8], 0x00);
    });
  });

  describe('createDQT', () => {
    it('should create valid DQT marker with two tables', () => {
      const lumaTable = new Uint8Array(64).fill(1);
      const chromaTable = new Uint8Array(64).fill(2);

      const dqt = createDQT(lumaTable, chromaTable);

      // Check marker
      assert.strictEqual(dqt[0], 0xFF);
      assert.strictEqual(dqt[1], 0xDB);

      // Check luma table ID
      assert.strictEqual(dqt[4], 0x00);

      // Check luma table values
      for (let i = 0; i < 64; i++) {
        assert.strictEqual(dqt[5 + i], 1);
      }

      // Check chroma table ID
      assert.strictEqual(dqt[69], 0x01);

      // Check chroma table values
      for (let i = 0; i < 64; i++) {
        assert.strictEqual(dqt[70 + i], 2);
      }
    });
  });

  describe('createSOF0', () => {
    it('should create valid SOF0 marker', () => {
      const width = 640;
      const height = 480;
      const sof0 = createSOF0(width, height);

      // Check marker
      assert.strictEqual(sof0[0], 0xFF);
      assert.strictEqual(sof0[1], 0xC0);

      // Check precision
      assert.strictEqual(sof0[4], 0x08);

      // Check dimensions
      const h = (sof0[5] << 8) | sof0[6];
      const w = (sof0[7] << 8) | sof0[8];
      assert.strictEqual(h, height);
      assert.strictEqual(w, width);

      // Check number of components
      assert.strictEqual(sof0[9], 0x03);
    });
  });

  describe('createSOS', () => {
    it('should create valid SOS marker', () => {
      const sos = createSOS();

      // Check marker
      assert.strictEqual(sos[0], 0xFF);
      assert.strictEqual(sos[1], 0xDA);

      // Check number of components
      assert.strictEqual(sos[4], 0x03);
    });
  });

  describe('assembleJPEG', () => {
    it('should assemble a complete JPEG file', () => {
      const width = 16;
      const height = 16;
      const lumaQTable = new Uint8Array(64).fill(1);
      const chromaQTable = new Uint8Array(64).fill(1);
      const scanData = [new Uint8Array([0x01, 0x02, 0x03])];

      const jpeg = assembleJPEG(width, height, lumaQTable, chromaQTable, scanData);

      // Check SOI marker at start
      assert.strictEqual(jpeg[0], 0xFF);
      assert.strictEqual(jpeg[1], 0xD8);

      // Check EOI marker at end
      assert.strictEqual(jpeg[jpeg.length - 2], 0xFF);
      assert.strictEqual(jpeg[jpeg.length - 1], 0xD9);

      // Check that jpeg contains scan data
      assert.ok(jpeg.length > 100); // Should have headers + scan data
    });
  });
});
