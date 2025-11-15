import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  QUANTIZATION_TABLE_100,
  STANDARD_LUMINANCE_QUANTIZATION,
  STANDARD_CHROMINANCE_QUANTIZATION,
  scaleQuantizationTable
} from '../../src/core/constants.js';

describe('Constants', () => {
  describe('QUANTIZATION_TABLE_100', () => {
    it('should be all 1s for maximum quality', () => {
      assert.strictEqual(QUANTIZATION_TABLE_100.length, 64);
      for (let i = 0; i < 64; i++) {
        assert.strictEqual(QUANTIZATION_TABLE_100[i], 1);
      }
    });
  });

  describe('Standard quantization tables', () => {
    it('should have 64 elements each', () => {
      assert.strictEqual(STANDARD_LUMINANCE_QUANTIZATION.length, 64);
      assert.strictEqual(STANDARD_CHROMINANCE_QUANTIZATION.length, 64);
    });

    it('should have valid values (1-255)', () => {
      for (let i = 0; i < 64; i++) {
        assert.ok(STANDARD_LUMINANCE_QUANTIZATION[i] >= 1 && STANDARD_LUMINANCE_QUANTIZATION[i] <= 255);
        assert.ok(STANDARD_CHROMINANCE_QUANTIZATION[i] >= 1 && STANDARD_CHROMINANCE_QUANTIZATION[i] <= 255);
      }
    });
  });

  describe('scaleQuantizationTable', () => {
    it('should return all 1s for quality 100', () => {
      const scaled = scaleQuantizationTable(STANDARD_LUMINANCE_QUANTIZATION, 100);
      for (let i = 0; i < 64; i++) {
        assert.strictEqual(scaled[i], 1);
      }
    });

    it('should scale values for quality 50', () => {
      const scaled = scaleQuantizationTable(STANDARD_LUMINANCE_QUANTIZATION, 50);
      assert.strictEqual(scaled.length, 64);

      // Values should be scaled up from the base table
      for (let i = 0; i < 64; i++) {
        assert.ok(scaled[i] >= 1 && scaled[i] <= 255);
      }
    });

    it('should increase quantization for lower quality', () => {
      const q90 = scaleQuantizationTable(STANDARD_LUMINANCE_QUANTIZATION, 90);
      const q50 = scaleQuantizationTable(STANDARD_LUMINANCE_QUANTIZATION, 50);
      const q10 = scaleQuantizationTable(STANDARD_LUMINANCE_QUANTIZATION, 10);

      // Lower quality should have higher quantization values (more compression)
      assert.ok(q10[0] > q50[0]);
      assert.ok(q50[0] > q90[0]);
    });

    it('should clamp values to 1-255 range', () => {
      const scaled = scaleQuantizationTable(STANDARD_LUMINANCE_QUANTIZATION, 1);
      for (let i = 0; i < 64; i++) {
        assert.ok(scaled[i] >= 1 && scaled[i] <= 255);
      }
    });
  });
});
