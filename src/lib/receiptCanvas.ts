// Draws a receipt document (see receiptDoc.ts) onto a canvas at the thermal
// printer's exact head width, then hands the pixels to escposRaster.ts.
//
// The whole point is that the platform text engine does the hard part: Canvas
// fillText shapes Arabic into its positional forms, applies the lam-alef
// ligature, and orders a mixed Arabic/Latin line correctly. None of that is
// something a thermal printer can do with a codepage, and none of it is
// something we should be hand-rolling.
//
// DOM-dependent by nature, so the layout decisions live in receiptDoc.ts where
// they can be tested; this module only measures and paints.

import { DocRow } from './receiptDoc';
import { code128Modules } from './barcode';
import { packRaster, rasterCommands, RASTER_WIDTH } from './escposRaster';

// Type sizes in dots, at 203dpi (the near-universal thermal head density).
// 24px ≈ 3mm cap height, which is the size a standard receipt font prints at.
const SIZE: Record<string, number> = {
  muted: 19,
  normal: 24,
  bold: 24,
  large: 32,
  title: 46, // the store name — the one thing read from across a counter
};

const PAD = 12; // side margin in dots
const LINE_GAP = 9; // extra leading between rows
const DIVIDER_GAP = 12;
const BARCODE_HEIGHT = 70;
// The total gets a ruled box. On thermal paper a box survives poor contrast
// and fading far better than weight alone.
const BOX_PAD = 8;

function fontFor(style: string, family: string): string {
  const weight = style === 'bold' || style === 'title' || style === 'large' ? '700' : '400';
  return `${weight} ${SIZE[style] ?? SIZE.normal}px ${family}`;
}

/**
 * Greedy word wrap against a measured width.
 *
 * Canvas fillText's maxWidth argument does NOT wrap or clip — it scales the
 * glyphs horizontally to fit, so a long product name printed noticeably
 * narrower than everything around it and got harder to read the longer it was.
 * Wrapping keeps every name legible at one size. A single word longer than the
 * line (a SKU, a URL) is broken by character rather than left to overflow.
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (maxWidth <= 0 || ctx.measureText(text).width <= maxWidth) return [text];
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (ctx.measureText(word).width <= maxWidth) {
      line = word;
    } else {
      // Break the oversized word itself.
      let chunk = '';
      for (const ch of word) {
        if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      line = chunk;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function rowHeight(row: DocRow): number {
  switch (row.kind) {
    case 'divider':
      return DIVIDER_GAP * 2;
    case 'barcode':
      return BARCODE_HEIGHT + SIZE.muted + LINE_GAP * 2;
    default: {
      const style = ('style' in row && row.style) || 'normal';
      const boxed = row.kind === 'pair' && row.boxed;
      return (SIZE[style] ?? SIZE.normal) + LINE_GAP + (boxed ? BOX_PAD * 2 + 4 : 0);
    }
  }
}

export interface RasterReceipt {
  data: number[]; // ESC/POS bytes (GS v 0 bands)
  width: number;
  height: number;
}

/**
 * Renders the rows to a monochrome raster sized for the roll.
 *
 * `rtl` flips the leading/trailing edges so labels sit on the right and values
 * on the left, matching how the HTML receipt lays out in Arabic.
 */
export function renderReceiptRaster(
  rows: DocRow[],
  paperSize: '58mm' | '80mm',
  opts: { rtl?: boolean; fontFamily?: string } = {},
): RasterReceipt | null {
  const width = RASTER_WIDTH[paperSize];
  const rtl = opts.rtl ?? false;
  // Cairo is bundled with the app and covers Arabic properly; it is loaded in
  // the renderer document, so the canvas can use it. The fallbacks matter for
  // a browser deploy where it may not have finished loading.
  const family = opts.fontFamily ?? "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif";

  const canvas = document.createElement('canvas');
  canvas.width = width;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Pass 1 — measure. Wrapping depends on the font metrics, and the canvas
  // height depends on how many lines each row wraps to, so the layout has to be
  // resolved before the bitmap can be sized. Resizing a canvas clears it, which
  // is why this cannot be folded into the drawing pass.
  const inner = width - PAD * 2;
  const wrapped = new Map<DocRow, string[]>();
  let height = PAD * 2;
  for (const row of rows) {
    if (row.kind === 'center' || row.kind === 'line') {
      ctx.font = fontFor(row.style ?? 'normal', family);
      const lines = wrapText(ctx, row.text, inner);
      wrapped.set(row, lines);
      height += rowHeight(row) + (lines.length - 1) * (SIZE[row.style ?? 'normal'] ?? SIZE.normal);
    } else if (row.kind === 'pair') {
      ctx.font = fontFor(row.style ?? 'normal', family);
      const boxInset = row.boxed ? (PAD + BOX_PAD) * 2 : 0;
      const avail = inner - ctx.measureText(row.value).width - 12 - boxInset;
      const lines = wrapText(ctx, row.label, avail);
      wrapped.set(row, lines);
      height += rowHeight(row) + (lines.length - 1) * (SIZE[row.style ?? 'normal'] ?? SIZE.normal);
    } else {
      height += rowHeight(row);
    }
  }

  // Pass 2 — draw. Setting height resets every context property, so the whole
  // context is re-established below.
  canvas.height = height;

  // Paper first: the canvas starts transparent, and only opaque dark pixels
  // become dots.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';
  // Base direction for the whole receipt. fillText resolves bidi against this,
  // so an Arabic label followed by a Latin amount orders correctly.
  ctx.direction = rtl ? 'rtl' : 'ltr';

  const lead = rtl ? width - PAD : PAD; // leading edge x
  const trail = rtl ? PAD : width - PAD; // trailing edge x
  const leadAlign: CanvasTextAlign = rtl ? 'right' : 'left';
  const trailAlign: CanvasTextAlign = rtl ? 'left' : 'right';

  let y = PAD;
  for (const row of rows) {
    switch (row.kind) {
      case 'divider': {
        const lineY = y + DIVIDER_GAP;
        // A dashed rule, drawn as dots so it survives thresholding cleanly.
        for (let x = PAD; x < width - PAD; x += 8) ctx.fillRect(x, lineY, 4, 2);
        break;
      }
      case 'center': {
        ctx.font = fontFor(row.style ?? 'normal', family);
        ctx.textAlign = 'center';
        const step = SIZE[row.style ?? 'normal'] ?? SIZE.normal;
        (wrapped.get(row) ?? [row.text]).forEach((ln, i) => {
          ctx.fillText(ln, width / 2, y + i * step);
        });
        break;
      }
      case 'line': {
        ctx.font = fontFor(row.style ?? 'normal', family);
        ctx.textAlign = leadAlign;
        const step = SIZE[row.style ?? 'normal'] ?? SIZE.normal;
        (wrapped.get(row) ?? [row.text]).forEach((ln, i) => {
          ctx.fillText(ln, lead, y + i * step);
        });
        break;
      }
      case 'pair': {
        ctx.font = fontFor(row.style ?? 'normal', family);
        const textY = row.boxed ? y + BOX_PAD + 2 : y;
        if (row.boxed) {
          const h = (SIZE[row.style ?? 'normal'] ?? SIZE.normal) + BOX_PAD * 2;
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#000';
          ctx.strokeRect(PAD, y, width - PAD * 2, h);
        }
        const inset = row.boxed ? PAD + BOX_PAD : 0;
        // The value sits on the first line; a long label wraps beneath it
        // rather than being squeezed into the leftover width.
        ctx.textAlign = trailAlign;
        ctx.fillText(row.value, rtl ? trail + inset : trail - inset, textY);
        ctx.textAlign = leadAlign;
        const step = SIZE[row.style ?? 'normal'] ?? SIZE.normal;
        (wrapped.get(row) ?? [row.label]).forEach((ln, i) => {
          ctx.fillText(ln, rtl ? lead - inset : lead + inset, textY + i * step);
        });
        break;
      }
      case 'barcode': {
        const widths = code128Modules(row.value);
        const total = widths.reduce((a, b) => a + b, 0);
        // Largest whole-dot module width that still fits the roll, so the bars
        // land on exact dot boundaries and stay scannable.
        const module = Math.max(1, Math.floor((width - PAD * 2) / total));
        const barsWidth = total * module;
        let x = (width - barsWidth) / 2;
        let bar = true;
        const top = y + LINE_GAP;
        for (const w of widths) {
          if (bar) ctx.fillRect(Math.round(x), top, w * module, BARCODE_HEIGHT);
          x += w * module;
          bar = !bar;
        }
        ctx.font = fontFor('muted', family);
        ctx.textAlign = 'center';
        // The human-readable line is always LTR — it is a receipt id.
        ctx.direction = 'ltr';
        ctx.fillText(row.value, width / 2, top + BARCODE_HEIGHT + LINE_GAP);
        ctx.direction = rtl ? 'rtl' : 'ltr';
        break;
      }
    }
    const extra = (wrapped.get(row)?.length ?? 1) - 1;
    const style = ('style' in row && row.style) || 'normal';
    y += rowHeight(row) + extra * (SIZE[style] ?? SIZE.normal);
  }

  const { data: rgba } = ctx.getImageData(0, 0, width, height);
  const packed = packRaster(rgba, width, height);
  return { data: rasterCommands(packed, width, height), width, height };
}

/**
 * Waits for the bundled Cairo face to be usable before drawing, so the first
 * receipt of a session does not silently fall back to a system font. Resolves
 * either way — a fallback receipt is better than no receipt.
 */
export async function ensureReceiptFont(): Promise<void> {
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts) return;
    await Promise.all([fonts.load('400 24px Cairo'), fonts.load('700 38px Cairo')]);
  } catch {
    /* fall back to the system stack */
  }
}
