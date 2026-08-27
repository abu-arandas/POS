import { describe, it, expect } from 'vitest';
import { packRaster, rasterCommands, needsRaster, RASTER_WIDTH } from '../../src/lib/escposRaster';

// Builds an RGBA buffer from an ASCII-art bitmap: '#' is black, '.' is white.
function rgbaFrom(rows: string[]): { rgba: Uint8ClampedArray; w: number; h: number } {
  const h = rows.length;
  const w = rows[0].length;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const black = rows[y][x] === '#';
      rgba[i] = rgba[i + 1] = rgba[i + 2] = black ? 0 : 255;
      rgba[i + 3] = 255;
    }
  }
  return { rgba, w, h };
}

describe('packRaster', () => {
  it('packs 8 pixels per byte, MSB first', () => {
    const { rgba, w, h } = rgbaFrom(['#.......']);
    expect(packRaster(rgba, w, h)[0]).toBe(0b10000000);
  });

  it('sets the low bit for the last pixel in a byte', () => {
    const { rgba, w, h } = rgbaFrom(['.......#']);
    expect(packRaster(rgba, w, h)[0]).toBe(0b00000001);
  });

  it('encodes a mixed row exactly', () => {
    const { rgba, w, h } = rgbaFrom(['#.#.#.#.']);
    expect(packRaster(rgba, w, h)[0]).toBe(0b10101010);
  });

  it('pads a partial final byte with white', () => {
    const { rgba, w, h } = rgbaFrom(['###']); // 3px wide -> 1 byte
    const packed = packRaster(rgba, w, h);
    expect(packed).toHaveLength(1);
    expect(packed[0]).toBe(0b11100000);
  });

  it('keeps rows independent', () => {
    const { rgba, w, h } = rgbaFrom(['########', '........']);
    const packed = packRaster(rgba, w, h);
    expect(packed[0]).toBe(0xff);
    expect(packed[1]).toBe(0x00);
  });

  // Canvas starts fully transparent. Treating transparent as ink would print a
  // solid black receipt for any area the renderer never painted.
  it('treats transparent pixels as paper, not ink', () => {
    const rgba = new Uint8ClampedArray(8 * 1 * 4); // all zero => transparent black
    expect(packRaster(rgba, 8, 1)[0]).toBe(0x00);
  });
});

describe('rasterCommands', () => {
  it('emits a GS v 0 header with little-endian width and height', () => {
    const packed = new Uint8Array(72); // 576px wide => 72 bytes, 1 row
    const cmd = rasterCommands(packed, 576, 1);
    expect(cmd.slice(0, 4)).toEqual([0x1d, 0x76, 0x30, 0x00]);
    expect(cmd[4]).toBe(72); // xL
    expect(cmd[5]).toBe(0); // xH
    expect(cmd[6]).toBe(1); // yL
    expect(cmd[7]).toBe(0); // yH
  });

  it('carries every payload byte', () => {
    const packed = new Uint8Array(72 * 3).fill(0xab);
    const cmd = rasterCommands(packed, 576, 3);
    expect(cmd).toHaveLength(8 + 72 * 3);
    expect(cmd.slice(8).every((b) => b === 0xab)).toBe(true);
  });

  // A single huge raster overruns some printers' input buffers.
  it('splits a tall receipt into bands', () => {
    const height = 300;
    const packed = new Uint8Array(72 * height);
    const cmd = rasterCommands(packed, 576, height);
    const headers = cmd.filter(
      (_, i) => cmd[i] === 0x1d && cmd[i + 1] === 0x76 && cmd[i + 2] === 0x30,
    );
    expect(headers.length).toBeGreaterThan(1);
    // Every row still ships: 3 headers (128 + 128 + 44) plus the full payload.
    expect(cmd).toHaveLength(3 * 8 + 72 * height);
  });

  it('encodes a height above 255 across both bytes', () => {
    const cmd = rasterCommands(new Uint8Array(72 * 128), 576, 128);
    expect(cmd[6]).toBe(128);
    expect(cmd[7]).toBe(0);
  });
});

describe('needsRaster', () => {
  it('is false for a purely ASCII receipt, keeping the fast text path', () => {
    expect(needsRaster(['Al Asalah Cafe', 'Latte', 'TOTAL', '$12.50'])).toBe(false);
  });

  it('is true for Arabic', () => {
    expect(needsRaster(['مقهى الأصالة'])).toBe(true);
  });

  it('is true for a non-ASCII currency symbol', () => {
    expect(needsRaster(['Total', '£12.50'])).toBe(true);
  });

  it('is true for accented Latin', () => {
    expect(needsRaster(['Café'])).toBe(true);
  });

  it('ignores null and undefined entries', () => {
    expect(needsRaster([null, undefined, 'plain'])).toBe(false);
  });
});

describe('RASTER_WIDTH', () => {
  it('matches the standard head widths and divides into whole bytes', () => {
    expect(RASTER_WIDTH['80mm']).toBe(576);
    expect(RASTER_WIDTH['58mm']).toBe(384);
    expect(RASTER_WIDTH['80mm'] % 8).toBe(0);
    expect(RASTER_WIDTH['58mm'] % 8).toBe(0);
  });
});
