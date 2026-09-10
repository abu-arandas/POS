import { describe, it, expect } from 'vitest';
import { layoutPair } from '../../../../src/lib/printing/receiptCanvas';

// The thermal renderer sized a pair's label as
// `Math.max(1, inner - measure(value) - 12)` and wrapped the label into it.
// For the 39-character receipt id — the widest value on the receipt — that left
// 1.1 dot against a 17.3 dot character on an 80mm roll, so the label came out
// one letter per line as a vertical column, with its first letter drawn
// underneath the id. The clamp was the bug: one dot is not a width, it is the
// function declining to notice the two do not fit.

// A stand-in for canvas metrics: every character is one unit wide. Enough to
// pin the RULE, which is what broke; the real metrics only move the threshold.
const measure = (text: string) => text.length;
const wrap = (text: string, maxWidth: number): string[] => {
  if (maxWidth <= 0) return [text];
  const out: string[] = [];
  for (const word of text.split(/\s+/)) {
    const last = out[out.length - 1];
    if (last && (last + ' ' + word).length <= maxWidth) out[out.length - 1] = `${last} ${word}`;
    else if (word.length <= maxWidth) out.push(word);
    else {
      // Break the oversized word, as the real wrapText does.
      for (let i = 0; i < word.length; i += maxWidth) out.push(word.slice(i, i + maxWidth));
    }
  }
  return out.length ? out : [text];
};

const RECEIPT_ID = `TX-${'0f9a1b2c-3d4e-5f60-8192-a3b4c5d6e7f8'.toUpperCase()}`;

describe('layoutPair', () => {
  it('stacks a value that would leave the label no room', () => {
    const layout = layoutPair(measure, wrap, 'RECEIPT:', RECEIPT_ID, 48);

    expect(layout.stacked).toBe(true);
    // The label stays one readable run — never a column of single characters.
    expect(layout.labelLines).toEqual(['RECEIPT:']);
    layout.labelLines.forEach((line) => expect(line.length).toBeGreaterThan(1));
  });

  it('wraps a stacked value so it cannot run off the roll', () => {
    // On 58mm the id is wider than the paper on its own, so the value itself
    // has to wrap once it is on its own line.
    const layout = layoutPair(measure, wrap, 'RECEIPT:', RECEIPT_ID, 30);

    expect(layout.stacked).toBe(true);
    expect(layout.valueLines.length).toBeGreaterThan(1);
    layout.valueLines.forEach((line) => expect(line.length).toBeLessThanOrEqual(30));
    expect(layout.valueLines.join('')).toBe(RECEIPT_ID);
  });

  it('keeps an ordinary pair side by side', () => {
    const layout = layoutPair(measure, wrap, 'OPERATOR:', 'Ada Lovelace', 48);

    expect(layout.stacked).toBe(false);
    expect(layout.labelLines).toEqual(['OPERATOR:']);
    expect(layout.valueLines).toEqual(['Ada Lovelace']);
    expect(layout.extraLines).toBe(0);
  });

  it('still wraps a long label beside a short value', () => {
    // The item rows depend on this: a long product name wraps under itself
    // while its price holds the first line.
    const layout = layoutPair(
      measure,
      wrap,
      '1x Sourdough Avocado Toast with Poached Eggs',
      '$11.50',
      48,
    );

    expect(layout.stacked).toBe(false);
    expect(layout.labelLines.length).toBeGreaterThan(1);
    expect(layout.extraLines).toBe(layout.labelLines.length - 1);
  });

  it('reports the extra lines a stacked pair costs, so the two passes agree', () => {
    // renderReceiptRaster reserves height in pass 1 and advances by it in pass
    // 2 off this same number; if it under-counted, rows would overprint.
    const layout = layoutPair(measure, wrap, 'RECEIPT:', RECEIPT_ID, 30);

    expect(layout.extraLines).toBe(layout.labelLines.length - 1 + layout.valueLines.length);
  });
});
