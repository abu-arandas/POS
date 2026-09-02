import { describe, it, expect } from 'vitest';
import { barcodeBox } from '../../../src/lib/receiptCanvas';
import {
  code128Modules,
  code128ModuleWidth,
  CODE128_QUIET_MODULES,
} from '../../../src/lib/barcode';
import { RASTER_WIDTH } from '../../../src/lib/escposRaster';

// Whether a Code 128 symbol fits the roll at all.
//
// Both renderers used to answer this wrongly, in the same direction, by
// clamping the module width to a minimum instead of admitting it did not fit:
//
//   raster : Math.max(1, Math.floor((width - PAD * 2) / total))
//   ESC/POS: a fixed `GS w 2`, no check at all
//
// Neither makes an oversized barcode fit. They make it overrun, and the print
// head clips both ends — taking the start and stop patterns, which is exactly
// what a scanner needs. So the receipt carried something that looked like a
// barcode and could never be read, on every till with a narrow roll.

const NARROW = RASTER_WIDTH['58mm']; // 384 dots
const WIDE = RASTER_WIDTH['80mm']; // 576 dots

const symbolModules = (value: string) => code128Modules(value).reduce((a, b) => a + b, 0);
const withQuiet = (value: string) => symbolModules(value) + CODE128_QUIET_MODULES * 2;

// What the app actually puts in the barcode: `TX-` plus an uppercased UUID.
const REAL_ID = `TX-${'0f9a1b2c-3d4e-5f60-8192-a3b4c5d6e7f8'.toUpperCase()}`;

describe('code128ModuleWidth', () => {
  it('refuses the real receipt id on a 58mm roll', () => {
    expect(REAL_ID).toHaveLength(39);
    expect(symbolModules(REAL_ID)).toBe(464);
    expect(withQuiet(REAL_ID)).toBeGreaterThan(NARROW);
    expect(code128ModuleWidth(REAL_ID, NARROW)).toBeNull();
  });

  it('allows it on an 80mm roll, which has the room', () => {
    expect(code128ModuleWidth(REAL_ID, WIDE)).toBe(1);
  });

  it('counts the quiet zone as part of the symbol', () => {
    // Bars that fit the paper with no quiet zone still fail to read, so a fit
    // that ignores it is not a fit. Exactly enough room for the bars alone must
    // still be refused.
    const bars = symbolModules('TX-1');
    expect(code128ModuleWidth('TX-1', bars)).toBeNull();
    expect(code128ModuleWidth('TX-1', bars + CODE128_QUIET_MODULES * 2)).toBe(1);
  });

  it('takes the widest module that fits, so short ids stay scannable', () => {
    const module = code128ModuleWidth('TX-1', NARROW)!;
    expect(module).toBe(Math.floor(NARROW / withQuiet('TX-1')));
    expect(module).toBeGreaterThan(1);
    // One wider would overrun.
    expect(withQuiet('TX-1') * (module + 1)).toBeGreaterThan(NARROW);
  });

  it('honours a minimum, because the native engine cannot draw a one-dot module', () => {
    // GS w takes 2..6. A width the raster path would happily use is refused
    // here, and the caller prints the id as text instead.
    expect(code128ModuleWidth(REAL_ID, WIDE, 1)).toBe(1);
    expect(code128ModuleWidth(REAL_ID, WIDE, 2)).toBeNull();
  });

  it('honours a maximum, because GS w tops out at 6', () => {
    expect(code128ModuleWidth('1', WIDE, 2, 6)).toBeLessThanOrEqual(6);
    expect(code128ModuleWidth('1', WIDE)).toBeGreaterThan(6);
  });

  it('returns null when there is no paper to print on', () => {
    expect(code128ModuleWidth('TX-1', 0)).toBeNull();
    expect(code128ModuleWidth('TX-1', -10)).toBeNull();
  });

  it('treats an empty payload as the valid symbol it is, not as a degenerate case', () => {
    // Code 128 still emits start, checksum and stop for empty data, so there
    // are real bars to place. receiptDoc only ever passes tx.id, so this never
    // arises in practice — but silently returning null here would be the
    // function lying about what it was given.
    expect(symbolModules('')).toBeGreaterThan(0);
    expect(code128ModuleWidth('', 384)).not.toBeNull();
  });
});

describe('barcodeBox', () => {
  it('refuses the real receipt id on 58mm rather than drawing it clipped', () => {
    expect(barcodeBox(REAL_ID, NARROW)).toBeNull();
  });

  describe.each([
    ['58mm', NARROW],
    ['80mm', WIDE],
  ])('on a %s roll', (_label, paper) => {
    const ids = ['1', 'TX-1', 'TX-000123', 'TX-0123456789ABCDEF', REAL_ID];

    it('never returns bars wider than the paper', () => {
      for (const value of ids) {
        const box = barcodeBox(value, paper);
        if (box) expect(box.width).toBeLessThanOrEqual(paper);
      }
    });

    it('never returns a negative x, which is what clipping looked like', () => {
      for (const value of ids) {
        const box = barcodeBox(value, paper);
        if (box) expect(box.x).toBeGreaterThanOrEqual(0);
      }
    });

    it('leaves a quiet zone on both sides', () => {
      for (const value of ids) {
        const box = barcodeBox(value, paper);
        if (box) {
          expect(box.x).toBeGreaterThanOrEqual(CODE128_QUIET_MODULES * box.module);
        }
      }
    });

    it('centres the bars', () => {
      const box = barcodeBox('TX-1234', paper)!;
      expect(box.x + box.width / 2).toBeCloseTo(paper / 2, 10);
    });

    it('uses whole dots only, because the head has no finer unit', () => {
      const box = barcodeBox('TX-1234', paper)!;
      expect(Number.isInteger(box.module)).toBe(true);
      expect(box.module).toBeGreaterThanOrEqual(1);
    });
  });

  it('agrees with the shared rule the ESC/POS path uses', () => {
    // The two renderers must not disagree about the same symbol on the same
    // paper: refusing on one path and clipping on the other is the original bug
    // wearing a different hat.
    for (const paper of [NARROW, WIDE]) {
      for (const value of ['TX-1', REAL_ID]) {
        const fits = code128ModuleWidth(value, paper, 1) !== null;
        expect(barcodeBox(value, paper) !== null).toBe(fits);
      }
    }
  });
});
