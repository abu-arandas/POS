import { describe, it, expect } from 'vitest';
import { barcodeBox } from '../../../src/lib/receiptCanvas';
import { code128Modules } from '../../../src/lib/barcode';
import { RASTER_WIDTH } from '../../../src/lib/escposRaster';

// Whether the Code 128 bars fit on the roll at all.
//
// The renderer used to clamp the module width to a minimum of one dot:
//
//   const module = Math.max(1, Math.floor((width - PAD * 2) / total));
//
// That does not make an oversized barcode fit — it makes it overrun. The bars
// were then centred with a NEGATIVE x and the print head clipped both ends.
// What it clips is the start and stop patterns, which is exactly what a scanner
// needs, so the receipt carried something that looked like a barcode and could
// never be read. Nothing reports that: it only shows up at the counter.

const NARROW = RASTER_WIDTH['58mm']; // 384 dots
const WIDE = RASTER_WIDTH['80mm']; // 576 dots
const PAD = 12;

const printable = (paper: number) => paper - PAD * 2;
const totalModules = (value: string) => code128Modules(value).reduce((a, b) => a + b, 0);

// What the app actually puts in the barcode: `TX-` plus an uppercased UUID.
const REAL_ID = `TX-${'0f9a1b2c-3d4e-5f60-8192-a3b4c5d6e7f8'.toUpperCase()}`;

describe('barcodeBox', () => {
  it('refuses the real receipt id on a 58mm roll rather than printing it clipped', () => {
    // 39 characters is 464 modules against 360 printable dots. There is no
    // module width that fits, so there is no honest barcode to print.
    expect(REAL_ID).toHaveLength(39);
    expect(totalModules(REAL_ID)).toBeGreaterThan(printable(NARROW));
    expect(barcodeBox(code128Modules(REAL_ID), NARROW)).toBeNull();
  });

  it('still prints that id on an 80mm roll, which has the room', () => {
    const box = barcodeBox(code128Modules(REAL_ID), WIDE);
    expect(box).not.toBeNull();
    expect(box!.module).toBe(1);
    expect(box!.width).toBeLessThanOrEqual(printable(WIDE));
  });

  describe.each([
    ['58mm', NARROW],
    ['80mm', WIDE],
  ])('on a %s roll', (_label, paper) => {
    it('never returns bars wider than the printable area', () => {
      for (const value of ['1', 'TX-1', 'TX-000123', 'TX-0123456789ABCDEF', REAL_ID]) {
        const box = barcodeBox(code128Modules(value), paper);
        if (box) expect(box.width).toBeLessThanOrEqual(printable(paper));
      }
    });

    it('never returns a negative x, which is what clipping looked like', () => {
      for (const value of ['1', 'TX-1', 'TX-0123456789ABCDEF', REAL_ID]) {
        const box = barcodeBox(code128Modules(value), paper);
        if (box) expect(box.x).toBeGreaterThanOrEqual(PAD);
      }
    });

    it('centres the bars', () => {
      const box = barcodeBox(code128Modules('TX-1234'), paper);
      expect(box!.x + box!.width / 2).toBeCloseTo(paper / 2, 10);
    });

    it('uses whole dots only, because the head has no finer unit', () => {
      const box = barcodeBox(code128Modules('TX-1234'), paper);
      expect(Number.isInteger(box!.module)).toBe(true);
      expect(box!.module).toBeGreaterThanOrEqual(1);
    });

    it('takes the widest module that still fits, so short ids stay scannable', () => {
      // A short id has room to spare, and spending it on wider bars is what
      // keeps the barcode readable by a cheap scanner.
      const box = barcodeBox(code128Modules('1'), paper);
      const total = totalModules('1');
      expect(box!.module).toBe(Math.floor(printable(paper) / total));
      expect(box!.module).toBeGreaterThan(1);
      // One module wider would overrun.
      expect(total * (box!.module + 1)).toBeGreaterThan(printable(paper));
    });
  });

  describe('degenerate input', () => {
    it('returns null for an empty module list rather than dividing by zero', () => {
      expect(barcodeBox([], NARROW)).toBeNull();
    });

    it('returns null when the paper has no printable width', () => {
      expect(barcodeBox(code128Modules('TX-1'), PAD * 2)).toBeNull();
      expect(barcodeBox(code128Modules('TX-1'), 0)).toBeNull();
    });
  });

  it('is the boundary that decides, not a rounded guess', () => {
    // Construct the exact widest barcode that fits at one dot per module, and
    // confirm one module more is refused.
    const fits = barcodeBox(code128Modules(REAL_ID), WIDE);
    expect(fits).not.toBeNull();
    const total = totalModules(REAL_ID);
    // A roll one dot narrower than the bars need must refuse them.
    expect(barcodeBox(code128Modules(REAL_ID), total + PAD * 2 - 1)).toBeNull();
    expect(barcodeBox(code128Modules(REAL_ID), total + PAD * 2)).not.toBeNull();
  });
});
