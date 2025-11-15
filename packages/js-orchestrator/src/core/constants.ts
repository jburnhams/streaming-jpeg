/**
 * JPEG marker constants and standard tables
 */

// Standard JPEG markers
export const MARKERS = {
  SOI: 0xFFD8,   // Start of Image
  EOI: 0xFFD9,   // End of Image
  SOF0: 0xFFC0,  // Start of Frame (Baseline DCT)
  DHT: 0xFFC4,   // Define Huffman Table
  DQT: 0xFFDB,   // Define Quantization Table
  SOS: 0xFFDA,   // Start of Scan
  APP0: 0xFFE0,  // JFIF marker
} as const;

// Standard quantization table for quality 100 (all 1s for maximum quality)
export const QUANTIZATION_TABLE_100 = new Uint8Array(64).fill(1);

// Standard quantization table for baseline quality (can be scaled for different quality levels)
export const STANDARD_LUMINANCE_QUANTIZATION = new Uint8Array([
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
]);

export const STANDARD_CHROMINANCE_QUANTIZATION = new Uint8Array([
  17, 18, 24, 47, 99, 99, 99, 99,
  18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
]);

/**
 * Scale quantization table based on quality (1-100)
 * Quality 100 = all 1s (maximum quality)
 * Quality 1 = maximum quantization (minimum quality)
 */
export function scaleQuantizationTable(baseTable: Uint8Array, quality: number): Uint8Array {
  if (quality === 100) {
    return QUANTIZATION_TABLE_100;
  }

  // Convert quality to scaling factor
  const scale = quality < 50 ? 5000 / quality : 200 - quality * 2;

  const result = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    let value = Math.floor((baseTable[i] * scale + 50) / 100);
    value = Math.max(1, Math.min(255, value)); // Clamp to 1-255
    result[i] = value;
  }

  return result;
}
