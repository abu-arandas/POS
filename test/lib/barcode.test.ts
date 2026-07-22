import { describe, it, expect } from 'vitest';
import { code128BValues, code128Modules, code128Svg } from '../../src/lib/barcode';

describe('code128BValues', () => {
  it('wraps the payload with Start B (104) and Stop (106)', () => {
    const vals = code128BValues('A');
    expect(vals[0]).toBe(104);
    expect(vals[vals.length - 1]).toBe(106);
  });

  it('encodes data chars as codepoint minus 32 and appends the mod-103 checksum', () => {
    // 'A' -> 65-32 = 33; checksum = (104 + 33*1) % 103 = 34
    expect(code128BValues('A')).toEqual([104, 33, 34, 106]);
  });

  it('computes a positional checksum for multi-char payloads', () => {
    // "12": '1'->17 (·1), '2'->18 (·2); sum = 104 + 17 + 36 = 157; 157 % 103 = 54
    expect(code128BValues('12')).toEqual([104, 17, 18, 54, 106]);
  });

  it('drops characters outside printable ASCII', () => {
    expect(code128BValues('A\nB')).toEqual(code128BValues('AB'));
  });
});

describe('code128Modules', () => {
  it('emits 11 modules per data/start symbol and 13 for the stop', () => {
    // "A" => [start, 33, checksum, stop] = 3 symbols × 11 + 13 = 46 modules
    const total = code128Modules('A').reduce((a, b) => a + b, 0);
    expect(total).toBe(3 * 11 + 13);
  });

  it('always starts with a bar run and never emits a zero-width module', () => {
    const mods = code128Modules('TX-10001');
    expect(mods.length).toBeGreaterThan(0);
    expect(mods.every((m) => m >= 1 && m <= 4)).toBe(true);
  });
});

describe('code128Svg', () => {
  it('produces a self-contained svg sized to the module count', () => {
    const svg = code128Svg('TX-9', { height: 40, moduleWidth: 2 });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('height="40"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('<rect');
  });

  it('renders one rect per bar run (half the runs, since bars alternate with spaces)', () => {
    const runs = code128Modules('AB').length;
    const rectCount = (code128Svg('AB').match(/<rect/g) || []).length;
    // Bars are the 1st, 3rd, 5th… runs. Every 6-run symbol ends on a space and
    // the 7-run stop ends on a bar, so bars = ceil(runs / 2).
    expect(rectCount).toBe(Math.ceil(runs / 2));
  });
});
