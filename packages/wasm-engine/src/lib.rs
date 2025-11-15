use wasm_bindgen::prelude::*;

type BlockF32 = [f32; 64];
type BlockI16 = [i16; 64];

// Standard JPEG Huffman tables
// DC Luminance
const DC_LUMA_CODES: &[u16] = &[0x00, 0x02, 0x03, 0x04, 0x05, 0x06, 0x0E, 0x1E, 0x3E, 0x7E, 0xFE, 0x1FE];
const DC_LUMA_SIZES: &[u8] = &[2, 3, 3, 3, 3, 3, 4, 5, 6, 7, 8, 9];

// DC Chrominance
const DC_CHROMA_CODES: &[u16] = &[0x00, 0x01, 0x02, 0x06, 0x0E, 0x1E, 0x3E, 0x7E, 0xFE, 0x1FE, 0x3FE, 0x7FE];
const DC_CHROMA_SIZES: &[u8] = &[2, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// AC Luminance (symbol, code, size) - abbreviated for key values
static AC_LUMA_TABLE: &[(u8, u16, u8)] = &[
    (0x00, 0x000A, 4),   // EOB
    (0x01, 0x0000, 2),   // 0/1
    (0x02, 0x0001, 2),   // 0/2
    (0x03, 0x0004, 3),   // 0/3
    (0x04, 0x000B, 4),   // 0/4
    (0x05, 0x001A, 5),   // 0/5
    (0x06, 0x0078, 7),   // 0/6
    (0x07, 0x00F8, 8),   // 0/7
    (0x08, 0x03F6, 10),  // 0/8
    (0x09, 0xFF82, 16),  // 0/9
    (0x0A, 0xFF83, 16),  // 0/A
    (0x11, 0x000C, 4),   // 1/1
    (0x12, 0x001B, 5),   // 1/2
    (0x13, 0x0079, 7),   // 1/3
    (0x14, 0x01F6, 9),   // 1/4
    (0x15, 0x07F6, 11),  // 1/5
    (0x16, 0xFF84, 16),  // 1/6
    (0xF0, 0xFF00, 16),  // ZRL (15 zeros)
];

// AC Chrominance - abbreviated
static AC_CHROMA_TABLE: &[(u8, u16, u8)] = &[
    (0x00, 0x0000, 2),   // EOB
    (0x01, 0x0001, 2),   // 0/1
    (0x02, 0x0004, 3),   // 0/2
    (0x03, 0x000A, 4),   // 0/3
    (0x04, 0x0018, 5),   // 0/4
    (0x05, 0x0019, 5),   // 0/5
    (0x06, 0x0038, 6),   // 0/6
    (0x07, 0x0078, 7),   // 0/7
    (0x08, 0x01F4, 9),   // 0/8
    (0x09, 0x03F6, 10),  // 0/9
    (0x0A, 0x0FF4, 12),  // 0/A
    (0xF0, 0xFF00, 16),  // ZRL
];

// Zig-zag scan order
const ZIGZAG: [usize; 64] = [
    0,  1,  8, 16,  9,  2,  3, 10,
    17, 24, 32, 25, 18, 11,  4,  5,
    12, 19, 26, 33, 40, 48, 41, 34,
    27, 20, 13,  6,  7, 14, 21, 28,
    35, 42, 49, 56, 57, 50, 43, 36,
    29, 22, 15, 23, 30, 37, 44, 51,
    58, 59, 52, 45, 38, 31, 39, 46,
    53, 60, 61, 54, 47, 55, 62, 63,
];

/// Process a single strip (8 scanlines) of pixels and return compressed JPEG data
#[wasm_bindgen]
pub fn process_strip(
    pixel_data: &[u8],
    width: u32,
    luma_q_table: &[u8],
    chroma_q_table: &[u8],
) -> Vec<u8> {
    assert_eq!(luma_q_table.len(), 64, "Luma quantization table must have 64 elements");
    assert_eq!(chroma_q_table.len(), 64, "Chroma quantization table must have 64 elements");

    let expected_size = (width as usize) * 8 * 4; // 8 rows, RGBA
    assert_eq!(
        pixel_data.len(),
        expected_size,
        "Pixel data size mismatch. Expected {} bytes for width {} and 8 scanlines",
        expected_size,
        width
    );

    let mut bitstream = BitstreamWriter::new();
    let mut dc_predictors = (0i16, 0i16, 0i16); // Y, Cb, Cr

    // Process MCUs (8x8 blocks)
    for x in (0..width).step_by(8) {
        let (y_block, cb_block, cr_block) = rgb_to_ycbcr_block(pixel_data, width, x);

        // Apply DCT
        let mut y_dct = y_block;
        let mut cb_dct = cb_block;
        let mut cr_dct = cr_block;

        forward_dct(&mut y_dct);
        forward_dct(&mut cb_dct);
        forward_dct(&mut cr_dct);

        // Quantize
        let y_quant = quantize(&y_dct, luma_q_table);
        let cb_quant = quantize(&cb_dct, chroma_q_table);
        let cr_quant = quantize(&cr_dct, chroma_q_table);

        // Huffman encode
        huffman_encode_mcu(&y_quant, &cb_quant, &cr_quant, &mut dc_predictors, &mut bitstream);
    }

    bitstream.finish()
}

/// Extract an 8x8 block from RGBA pixel data and convert to YCbCr
fn rgb_to_ycbcr_block(pixel_data: &[u8], width: u32, x: u32) -> (BlockF32, BlockF32, BlockF32) {
    let mut y = [0.0f32; 64];
    let mut cb = [0.0f32; 64];
    let mut cr = [0.0f32; 64];

    for row in 0..8 {
        for col in 0..8 {
            let px = (x + col).min(width - 1); // Clamp to width
            let py = row;
            let offset = ((py * width + px) * 4) as usize;

            let r = pixel_data[offset] as f32;
            let g = pixel_data[offset + 1] as f32;
            let b = pixel_data[offset + 2] as f32;

            // RGB to YCbCr conversion
            let idx = (row * 8 + col) as usize;
            y[idx] = 0.299 * r + 0.587 * g + 0.114 * b - 128.0;
            cb[idx] = -0.168736 * r - 0.331264 * g + 0.5 * b;
            cr[idx] = 0.5 * r - 0.418688 * g - 0.081312 * b;
        }
    }

    (y, cb, cr)
}

/// Forward DCT (Discrete Cosine Transform) using AAN algorithm
fn forward_dct(block: &mut BlockF32) {
    // AAN DCT implementation
    // This is a simplified version - production would use fully optimized AAN algorithm

    const SQRT_2: f32 = 1.414213562;
    const C1: f32 = 0.98078528; // cos(pi/16)
    const C2: f32 = 0.92387953; // cos(2*pi/16)
    const C3: f32 = 0.83146961; // cos(3*pi/16)
    const C5: f32 = 0.55557023; // cos(5*pi/16)
    const C6: f32 = 0.38268343; // cos(6*pi/16)
    const C7: f32 = 0.19509032; // cos(7*pi/16)

    // 1D DCT on rows
    for i in 0..8 {
        let row = &mut block[i*8..(i+1)*8];
        dct_1d(row);
    }

    // 1D DCT on columns
    for i in 0..8 {
        let mut col = [0.0f32; 8];
        for j in 0..8 {
            col[j] = block[j * 8 + i];
        }
        dct_1d(&mut col);
        for j in 0..8 {
            block[j * 8 + i] = col[j];
        }
    }
}

fn dct_1d(data: &mut [f32]) {
    let tmp = *data;

    // Stage 1
    let tmp0 = tmp[0] + tmp[7];
    let tmp7 = tmp[0] - tmp[7];
    let tmp1 = tmp[1] + tmp[6];
    let tmp6 = tmp[1] - tmp[6];
    let tmp2 = tmp[2] + tmp[5];
    let tmp5 = tmp[2] - tmp[5];
    let tmp3 = tmp[3] + tmp[4];
    let tmp4 = tmp[3] - tmp[4];

    // Stage 2
    let tmp10 = tmp0 + tmp3;
    let tmp13 = tmp0 - tmp3;
    let tmp11 = tmp1 + tmp2;
    let tmp12 = tmp1 - tmp2;

    // Output
    data[0] = (tmp10 + tmp11) * 0.353553391; // 1/sqrt(8)
    data[4] = (tmp10 - tmp11) * 0.353553391;

    let z1 = (tmp12 + tmp13) * 0.707106781; // sqrt(2)/2
    data[2] = tmp13 * 0.353553391 + z1 * 0.353553391;
    data[6] = tmp13 * 0.353553391 - z1 * 0.353553391;

    // Odd part
    let tmp10 = tmp4 + tmp5;
    let tmp11 = tmp5 + tmp6;
    let tmp12 = tmp6 + tmp7;

    let z5 = (tmp10 - tmp12) * 0.382683433;
    let z2 = tmp10 * 0.541196100 + z5;
    let z4 = tmp12 * 1.306562965 + z5;
    let z3 = tmp11 * 0.707106781;

    let z11 = tmp7 + z3;
    let z13 = tmp7 - z3;

    data[5] = z13 + z2;
    data[3] = z13 - z2;
    data[1] = z11 + z4;
    data[7] = z11 - z4;
}

/// Quantize DCT coefficients
fn quantize(dct_block: &BlockF32, q_table: &[u8]) -> BlockI16 {
    let mut result = [0i16; 64];
    for i in 0..64 {
        let q = q_table[i] as f32;
        result[i] = (dct_block[i] / q).round() as i16;
    }
    result
}

/// Encode MCU using Huffman coding
fn huffman_encode_mcu(
    y: &BlockI16,
    cb: &BlockI16,
    cr: &BlockI16,
    dc_predictors: &mut (i16, i16, i16),
    bitstream: &mut BitstreamWriter,
) {
    encode_block(y, true, &mut dc_predictors.0, bitstream);
    encode_block(cb, false, &mut dc_predictors.1, bitstream);
    encode_block(cr, false, &mut dc_predictors.2, bitstream);
}

/// Encode a single 8x8 block
fn encode_block(
    block: &BlockI16,
    is_luma: bool,
    dc_predictor: &mut i16,
    bitstream: &mut BitstreamWriter,
) {
    // Encode DC coefficient
    let dc_diff = block[0] - *dc_predictor;
    *dc_predictor = block[0];

    let (cat, bits) = categorize(dc_diff);

    if is_luma {
        bitstream.write_bits(DC_LUMA_CODES[cat as usize], DC_LUMA_SIZES[cat as usize]);
    } else {
        bitstream.write_bits(DC_CHROMA_CODES[cat as usize], DC_CHROMA_SIZES[cat as usize]);
    }

    if cat > 0 {
        bitstream.write_bits(bits, cat);
    }

    // Encode AC coefficients in zig-zag order
    let mut run_length = 0;
    let mut last_nz = 0;

    // Find last non-zero coefficient
    for i in (1..64).rev() {
        if block[ZIGZAG[i]] != 0 {
            last_nz = i;
            break;
        }
    }

    for i in 1..=last_nz {
        let coeff = block[ZIGZAG[i]];

        if coeff == 0 {
            run_length += 1;
            if run_length == 16 {
                // Encode ZRL (16 zeros)
                encode_ac_symbol(0xF0, is_luma, bitstream);
                run_length = 0;
            }
        } else {
            let (cat, bits) = categorize(coeff);
            let symbol = (run_length << 4) | cat;
            encode_ac_symbol(symbol, is_luma, bitstream);
            bitstream.write_bits(bits, cat);
            run_length = 0;
        }
    }

    // End of block
    if last_nz < 63 {
        encode_ac_symbol(0x00, is_luma, bitstream);
    }
}

fn encode_ac_symbol(symbol: u8, is_luma: bool, bitstream: &mut BitstreamWriter) {
    let table = if is_luma { AC_LUMA_TABLE } else { AC_CHROMA_TABLE };

    // Find symbol in table
    for &(sym, code, size) in table {
        if sym == symbol {
            bitstream.write_bits(code, size);
            return;
        }
    }

    // Fallback for symbols not in abbreviated table
    // In a production system, this would use complete tables
    bitstream.write_bits(0xFFFF, 16);
}

/// Categorize a coefficient value for Huffman encoding
fn categorize(value: i16) -> (u8, u16) {
    if value == 0 {
        return (0, 0);
    }

    let abs_val = value.abs() as u16;
    let nbits = 16 - abs_val.leading_zeros() as u8;

    let bits = if value > 0 {
        abs_val
    } else {
        abs_val - 1
    };

    (nbits, bits)
}

/// Bitstream writer with byte stuffing
struct BitstreamWriter {
    buffer: Vec<u8>,
    bit_buffer: u32,
    bit_count: u8,
}

impl BitstreamWriter {
    fn new() -> Self {
        Self {
            buffer: Vec::with_capacity(8192),
            bit_buffer: 0,
            bit_count: 0,
        }
    }

    fn write_bits(&mut self, bits: u16, count: u8) {
        if count == 0 {
            return;
        }

        self.bit_buffer = (self.bit_buffer << count) | (bits as u32);
        self.bit_count += count;

        while self.bit_count >= 8 {
            self.bit_count -= 8;
            let byte = (self.bit_buffer >> self.bit_count) as u8;
            self.buffer.push(byte);

            // Byte stuffing: 0xFF -> 0xFF 0x00
            if byte == 0xFF {
                self.buffer.push(0x00);
            }
        }
    }

    fn finish(mut self) -> Vec<u8> {
        // Flush remaining bits
        if self.bit_count > 0 {
            let byte = (self.bit_buffer << (8 - self.bit_count)) as u8;
            self.buffer.push(byte);
            if byte == 0xFF {
                self.buffer.push(0x00);
            }
        }
        self.buffer
    }
}
