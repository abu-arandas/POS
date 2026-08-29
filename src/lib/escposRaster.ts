// ESC/POS raster bitmap output.
//
// The text path in escpos.ts can only emit bytes a thermal printer's codepage
// understands, so it strips everything above 0x7F to '?'. That makes Arabic
// (and any other non-Latin script) impossible to print as text without both a
// matching printer codepage and a hand-written shaping engine — Arabic letters
// change form by position and need RTL reordering, neither of which a thermal
// printer does.
//
// Sending the receipt as a bitmap sidesteps all of it: the platform text engine
// shapes and orders the text when it is drawn, and the printer just prints
// dots. It works on any ESC/POS printer regardless of codepage support, and it
// keeps every other command available — including the cash-drawer pulse.
//
// This module is the pure half (threshold, pack, encode) so it unit-tests
// without a DOM. The drawing lives in receiptCanvas.ts.

/**
 * Printable width in dots for the two supported roll sizes. These are the
 * standard head widths: 576 dots for 80mm, 384 for 58mm.
 */
export const RASTER_WIDTH: Record<'58mm' | '80mm', number> = {
  '58mm': 384,
  '80mm': 576,
};

// Rows per GS v 0 command. The command itself allows up to 65535, but printers
// have finite input buffers and many firmwares drop or garble a single huge
// raster. Splitting into bands is the portable behaviour; the bands print
// contiguously with no visible seam.
const BAND_ROWS = 128;

/**
 * Reduces RGBA pixels to 1 bit per pixel, packed MSB-first, 8 pixels per byte —
 * the layout GS v 0 expects. A set bit prints a dot.
 *
 * `threshold` is the luminance below which a pixel is treated as black. The
 * receipt is drawn as pure black on white, so anything but the antialiased
 * glyph edges is far from the boundary; 0.5 keeps stems solid without
 * thickening them.
 */
export function packRaster(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  threshold = 128,
): Uint8Array {
  const bytesPerRow = Math.ceil(width / 8);
  const out = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = rgba[i + 3];
      // Transparent pixels are paper, not ink. Canvas starts transparent, so
      // without this an unpainted receipt would come out solid black.
      if (alpha < 128) continue;
      // Rec. 601 luma, which matches how the eye weights the channels. The
      // receipt is greyscale in practice, so this mostly just reads one value.
      const luma = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
      if (luma < threshold) {
        out[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return out;
}

/**
 * Wraps packed 1bpp rows in GS v 0 commands, split into bands.
 *
 * GS v 0 m xL xH yL yH d1..dk
 *   m  = 0 (normal density)
 *   xL/xH = bytes per row, little-endian
 *   yL/yH = rows in this band, little-endian
 */
export function rasterCommands(packed: Uint8Array, width: number, height: number): number[] {
  const bytesPerRow = Math.ceil(width / 8);
  const out: number[] = [];

  for (let start = 0; start < height; start += BAND_ROWS) {
    const rows = Math.min(BAND_ROWS, height - start);
    out.push(
      0x1d,
      0x76,
      0x30,
      0x00,
      bytesPerRow & 0xff,
      (bytesPerRow >> 8) & 0xff,
      rows & 0xff,
      (rows >> 8) & 0xff,
    );
    const from = start * bytesPerRow;
    for (let i = 0; i < rows * bytesPerRow; i++) out.push(packed[from + i]);
  }
  return out;
}

/**
 * True when the ESC/POS *text* path would destroy this string.
 *
 * EscPosBuilder.text() replaces every codepoint above 0x7F with '?', so a
 * receipt carrying Arabic, accented Latin, or a currency symbol like £ has to
 * go out as a raster instead. Pure-ASCII receipts keep the text path, which is
 * far smaller on the wire and faster to print.
 */
export function needsRaster(strings: Array<string | null | undefined>): boolean {
  return strings.some((s) => {
    if (!s) return false;
    for (const ch of s) if ((ch.codePointAt(0) ?? 0) > 0x7f) return true;
    return false;
  });
}
