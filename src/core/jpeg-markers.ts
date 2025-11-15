/**
 * JPEG marker segment creation utilities
 */

import { MARKERS } from './constants.js';

/**
 * Write a 16-bit big-endian value
 */
function writeU16(value: number): Uint8Array {
  return new Uint8Array([value >> 8, value & 0xFF]);
}

/**
 * Create JFIF APP0 marker
 */
export function createAPP0(): Uint8Array {
  const data = new Uint8Array(18);
  let offset = 0;

  // Marker
  data[offset++] = 0xFF;
  data[offset++] = 0xE0;

  // Length
  data[offset++] = 0x00;
  data[offset++] = 0x10;

  // JFIF identifier
  data[offset++] = 0x4A; // 'J'
  data[offset++] = 0x46; // 'F'
  data[offset++] = 0x49; // 'I'
  data[offset++] = 0x46; // 'F'
  data[offset++] = 0x00; // null terminator

  // Version 1.1
  data[offset++] = 0x01;
  data[offset++] = 0x01;

  // Density units (0 = no units)
  data[offset++] = 0x00;

  // X density
  data[offset++] = 0x00;
  data[offset++] = 0x01;

  // Y density
  data[offset++] = 0x00;
  data[offset++] = 0x01;

  // Thumbnail size (0x0)
  data[offset++] = 0x00;
  data[offset++] = 0x00;

  return data;
}

/**
 * Create DQT (Define Quantization Table) marker
 */
export function createDQT(lumaTable: Uint8Array, chromaTable: Uint8Array): Uint8Array {
  const length = 2 + 65 + 65; // length field + 2 tables (1 byte ID + 64 bytes each)
  const data = new Uint8Array(2 + length);
  let offset = 0;

  // Marker
  data[offset++] = 0xFF;
  data[offset++] = 0xDB;

  // Length
  data[offset++] = length >> 8;
  data[offset++] = length & 0xFF;

  // Luma table (ID = 0)
  data[offset++] = 0x00; // Precision (0) + Table ID (0)
  data.set(lumaTable, offset);
  offset += 64;

  // Chroma table (ID = 1)
  data[offset++] = 0x01; // Precision (0) + Table ID (1)
  data.set(chromaTable, offset);
  offset += 64;

  return data;
}

/**
 * Create SOF0 (Start of Frame) marker for baseline JPEG
 */
export function createSOF0(width: number, height: number): Uint8Array {
  const data = new Uint8Array(19);
  let offset = 0;

  // Marker
  data[offset++] = 0xFF;
  data[offset++] = 0xC0;

  // Length
  data[offset++] = 0x00;
  data[offset++] = 0x11; // 17 bytes

  // Precision
  data[offset++] = 0x08; // 8 bits per sample

  // Height
  data[offset++] = height >> 8;
  data[offset++] = height & 0xFF;

  // Width
  data[offset++] = width >> 8;
  data[offset++] = width & 0xFF;

  // Number of components
  data[offset++] = 0x03; // 3 components (Y, Cb, Cr)

  // Y component
  data[offset++] = 0x01; // Component ID
  data[offset++] = 0x11; // Sampling factor (1x1 = 4:4:4)
  data[offset++] = 0x00; // Quantization table ID

  // Cb component
  data[offset++] = 0x02; // Component ID
  data[offset++] = 0x11; // Sampling factor (1x1)
  data[offset++] = 0x01; // Quantization table ID

  // Cr component
  data[offset++] = 0x03; // Component ID
  data[offset++] = 0x11; // Sampling factor (1x1)
  data[offset++] = 0x01; // Quantization table ID

  return data;
}

/**
 * Create DHT (Define Huffman Table) marker with standard tables
 */
export function createDHT(): Uint8Array {
  // This is a simplified version - production would include full standard Huffman tables
  // For now, we'll create a minimal DHT that references standard tables
  const data = new Uint8Array([
    0xFF, 0xC4, // DHT marker
    0x01, 0xA2, // Length (418 bytes for standard tables)
    // DC Luma table
    0x00, // Table class (DC) + Table ID (0)
    // Bits (16 bytes)
    0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01,
    0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    // Values (12 bytes)
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    0x08, 0x09, 0x0A, 0x0B,
  ]);

  // Note: A complete implementation would include all 4 tables
  // (DC Luma, DC Chroma, AC Luma, AC Chroma)
  return data;
}

/**
 * Create SOS (Start of Scan) marker
 */
export function createSOS(): Uint8Array {
  const data = new Uint8Array(14);
  let offset = 0;

  // Marker
  data[offset++] = 0xFF;
  data[offset++] = 0xDA;

  // Length
  data[offset++] = 0x00;
  data[offset++] = 0x0C; // 12 bytes

  // Number of components
  data[offset++] = 0x03; // 3 components

  // Y component
  data[offset++] = 0x01; // Component ID
  data[offset++] = 0x00; // DC table 0, AC table 0

  // Cb component
  data[offset++] = 0x02; // Component ID
  data[offset++] = 0x11; // DC table 1, AC table 1

  // Cr component
  data[offset++] = 0x03; // Component ID
  data[offset++] = 0x11; // DC table 1, AC table 1

  // Spectral selection
  data[offset++] = 0x00; // Start
  data[offset++] = 0x3F; // End

  // Successive approximation
  data[offset++] = 0x00;

  return data;
}

/**
 * Assemble complete JPEG file from header and scan data
 */
export function assembleJPEG(
  width: number,
  height: number,
  lumaQTable: Uint8Array,
  chromaQTable: Uint8Array,
  scanData: Uint8Array[]
): Uint8Array {
  // Calculate total size
  const headerParts = [
    writeU16(MARKERS.SOI),
    createAPP0(),
    createDQT(lumaQTable, chromaQTable),
    createSOF0(width, height),
    createDHT(),
    createSOS(),
  ];

  let totalSize = headerParts.reduce((sum, part) => sum + part.length, 0);
  totalSize += scanData.reduce((sum, part) => sum + part.length, 0);
  totalSize += 2; // EOI marker

  // Assemble
  const result = new Uint8Array(totalSize);
  let offset = 0;

  // Write header
  for (const part of headerParts) {
    result.set(part, offset);
    offset += part.length;
  }

  // Write scan data
  for (const part of scanData) {
    result.set(part, offset);
    offset += part.length;
  }

  // Write EOI marker
  result.set(writeU16(MARKERS.EOI), offset);

  return result;
}
