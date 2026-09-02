import { describe, it, expect } from 'vitest';
import { logoBox } from '../../../src/lib/receiptCanvas';
import { RASTER_WIDTH } from '../../../src/lib/escposRaster';

// Where the store logo lands on the roll.
//
// This is the part of the logo fix that had no test at all. Everything else
// about it is checked one level up — that the DocRow carries a logo row, that
// the raster path gets chosen, that the decode is bounded — but the bitmap
// geometry itself sat inside renderReceiptRaster's draw switch, and jsdom
// implements no canvas 2D context, so any test reaching for it silently
// exercises the ESC/POS text path instead and proves nothing.
//
// A print head enforces these rules in hardware and reports nothing: overrun
// the head width and the roll clips the overhang. Nobody sees that until a
// receipt comes out of a real printer with half a logo on it.

const NARROW = RASTER_WIDTH['58mm']; // 384 dots
const WIDE = RASTER_WIDTH['80mm']; // 576 dots
const PAD = 12; // side margin, mirrored from receiptCanvas
const BAND = 96; // LOGO_HEIGHT — the height the measure pass reserves

const printable = (paper: number) => paper - PAD * 2;

describe('logoBox', () => {
  describe.each([
    ['58mm', NARROW],
    ['80mm', WIDE],
  ])('on a %s roll', (_label, paper) => {
    it('prints a square logo at the full band height', () => {
      expect(logoBox({ width: 512, height: 512 }, paper)).toEqual({
        x: (paper - BAND) / 2,
        width: BAND,
        height: BAND,
      });
    });

    it('never lets a wide logo overrun the printable width', () => {
      // 6:1 banner. At the full band height it would want 576 dots, which is
      // wider than either roll can print — the head would clip the overhang and
      // say nothing about it.
      const box = logoBox({ width: 1200, height: 200 }, paper);
      expect(box.width).toBe(printable(paper));
      expect(box.width).toBeLessThanOrEqual(paper - PAD * 2);
      expect(box.x).toBeGreaterThanOrEqual(PAD);
    });

    it('scales height down with width rather than squashing the logo', () => {
      const box = logoBox({ width: 1200, height: 200 }, paper);
      // 6:1 in, 6:1 out. Keeping the height at 96 while clamping the width is
      // the obvious wrong fix, and it distorts every wide logo on the roll.
      expect(box.width / box.height).toBeCloseTo(6, 10);
      expect(box.height).toBeLessThan(BAND);
    });

    it('gives a tall logo the band height and a narrow column', () => {
      const box = logoBox({ width: 100, height: 1000 }, paper);
      expect(box.height).toBe(BAND);
      expect(box.width).toBeCloseTo(9.6, 10);
    });

    it('never exceeds the band height, which is all the measure pass reserves', () => {
      // The measure pass adds exactly LOGO_HEIGHT for a logo row and the draw
      // pass advances by the same. A taller bitmap would overlap the store name
      // printed beneath it.
      for (const natural of [
        { width: 1, height: 1 },
        { width: 4000, height: 3 },
        { width: 3, height: 4000 },
        { width: 1920, height: 1080 },
      ]) {
        expect(logoBox(natural, paper).height).toBeLessThanOrEqual(BAND);
      }
    });

    it('centres the logo on the roll', () => {
      for (const natural of [
        { width: 512, height: 512 },
        { width: 1200, height: 200 },
        { width: 100, height: 1000 },
      ]) {
        const box = logoBox(natural, paper);
        expect(box.x + box.width / 2).toBeCloseTo(paper / 2, 10);
      }
    });
  });

  it('uses the wider roll when it has one, rather than printing 58mm output on 80mm paper', () => {
    const narrow = logoBox({ width: 1200, height: 200 }, NARROW);
    const wide = logoBox({ width: 1200, height: 200 }, WIDE);
    expect(wide.width).toBeGreaterThan(narrow.width);
    expect(wide.height).toBeGreaterThan(narrow.height);
  });

  describe('degenerate intrinsic sizes', () => {
    // An <img> that failed to decode reports 0×0, and the ratio it implies is
    // NaN or Infinity. Either one reaches drawImage and paints nothing, so the
    // logo disappears with no error anywhere.
    it.each([
      ['zero width and height', { width: 0, height: 0 }],
      ['zero height', { width: 512, height: 0 }],
      ['zero width', { width: 0, height: 512 }],
      ['NaN', { width: Number.NaN, height: Number.NaN }],
    ])('falls back to a square for %s', (_label, natural) => {
      const box = logoBox(natural, NARROW);
      expect(box).toEqual({ x: (NARROW - BAND) / 2, width: BAND, height: BAND });
    });

    it('never emits NaN into drawImage', () => {
      for (const natural of [
        { width: 0, height: 0 },
        { width: Number.NaN, height: 10 },
        { width: 10, height: Number.NaN },
      ]) {
        const box = logoBox(natural, NARROW);
        expect(Number.isFinite(box.x)).toBe(true);
        expect(Number.isFinite(box.width)).toBe(true);
        expect(Number.isFinite(box.height)).toBe(true);
      }
    });
  });
});
