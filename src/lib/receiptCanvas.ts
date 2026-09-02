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
// Printed height of the store logo in dots. ~10mm at 203dpi: big enough to read
// across a counter, small enough not to push the first item off the visible top
// of the roll.
const LOGO_HEIGHT = 96;

/**
 * Where the store logo lands on the roll, in dots.
 *
 * Split out from the draw pass because it is the one part of the raster
 * renderer that can be checked without a canvas: jsdom implements no 2D
 * context, so a test that goes through renderReceiptRaster asserts on the
 * ESC/POS text path instead and proves nothing about the bitmap. The rules it
 * encodes are the ones a real printer enforces in hardware — overrun the head
 * width and the roll clips the overhang, silently — so they are worth stating
 * where they can be asserted.
 *
 * The logo fills the band height, and shrinks below it when that would overrun
 * the paper. Both dimensions scale together: the aspect ratio is the
 * operator's, not ours to change, and a squashed logo is the kind of thing
 * nobody reports and everybody notices.
 */
export function logoBox(
  natural: { width: number; height: number },
  paperWidth: number,
): { x: number; width: number; height: number } {
  const inner = paperWidth - PAD * 2;
  // A zero or malformed intrinsic size would make the ratio NaN or Infinity and
  // put NaN into drawImage, which paints nothing at all. Square is the neutral
  // assumption: it prints something recognisable rather than nothing.
  const ratio = natural.width > 0 && natural.height > 0 ? natural.width / natural.height : 1;
  const width = Math.min(LOGO_HEIGHT * ratio, inner);
  return {
    x: (paperWidth - width) / 2,
    width,
    height: Math.min(LOGO_HEIGHT, width / ratio),
  };
}
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

/**
 * Where the Code 128 bars land on the roll, or null when they cannot fit.
 *
 * A module is the narrowest bar, and it can only be a whole number of dots —
 * the print head has no finer unit. So the widest module that fits is
 * floor(printable / total), and when that floor is 0 the barcode does not fit
 * on this paper at any size.
 *
 * Returning null for that case is the point. The previous code clamped the
 * module to a minimum of 1 dot, which does not make the barcode fit — it makes
 * it overrun. A `TX-` prefix plus an uppercased UUID is 39 characters, or 464
 * modules, against 360 printable dots on a 58mm roll: the bars ran 40 dots off
 * each edge and the head clipped them. What it clips is the start and stop
 * patterns, which is precisely what a scanner needs, so the receipt carried
 * something that looked like a barcode and could never be read.
 *
 * The caller prints the human-readable id either way, so a receipt that cannot
 * carry scannable bars still carries a value someone can type.
 */
export function barcodeBox(
  moduleWidths: number[],
  paperWidth: number,
): { x: number; module: number; width: number } | null {
  const total = moduleWidths.reduce((sum, w) => sum + w, 0);
  const printable = paperWidth - PAD * 2;
  if (total <= 0 || printable <= 0) return null;

  const module = Math.floor(printable / total);
  if (module < 1) return null;

  const width = total * module;
  return { x: (paperWidth - width) / 2, module, width };
}

/**
 * A rendered monochrome receipt bitmap, as ESC/POS `GS v 0` raster bands.
 */
export interface RasterReceipt {
  data: number[]; // ESC/POS bytes (GS v 0 bands)
  width: number;
  height: number;
}

/**
 * How long a logo decode may hold up a receipt. A data: URL decodes in
 * microseconds, so anything approaching this is already pathological.
 */
export const LOGO_DECODE_TIMEOUT_MS = 2_000;

/**
 * Decodes the store logo so it can be drawn onto the receipt canvas.
 *
 * Resolves null rather than rejecting on any failure — a missing, malformed or
 * unreachable logo must cost the customer a picture, never the receipt.
 *
 * The timeout is the load-bearing part. onload and onerror between them cover
 * the cases a browser reports, but not the one that matters most here: an image
 * that reports NEITHER. A remote logo behind a stalled connection, or a decoder
 * that simply never comes back, leaves the promise pending forever — and this
 * is awaited on the path to the printer, so the receipt is never sent and the
 * operator is left holding a sale that appears to have vanished. Losing the
 * picture is recoverable; losing the receipt is not.
 */
export async function loadReceiptLogo(src: string | undefined): Promise<HTMLImageElement | null> {
  if (!src) return null;
  if (typeof Image === 'undefined') return null;
  try {
    return await new Promise<HTMLImageElement | null>((resolve) => {
      let settled = false;
      const finish = (value: HTMLImageElement | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), LOGO_DECODE_TIMEOUT_MS);
      const image = new Image();
      image.onload = () => finish(image);
      image.onerror = () => finish(null);
      image.src = src;
    });
  } catch {
    return null;
  }
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
  opts: { rtl?: boolean; fontFamily?: string; logo?: HTMLImageElement | null } = {},
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
  const barcodes = new Map<DocRow, ReturnType<typeof barcodeBox>>();
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
      const avail = Math.max(1, inner - ctx.measureText(row.value).width - 12 - boxInset);
      const lines = wrapText(ctx, row.label, avail);
      wrapped.set(row, lines);
      height += rowHeight(row) + (lines.length - 1) * (SIZE[row.style ?? 'normal'] ?? SIZE.normal);
    } else if (row.kind === 'barcode') {
      // Resolved here and reused when drawing, so the height reserved and the
      // height used cannot drift apart — the same reason wrapping is cached.
      const box = barcodeBox(code128Modules(row.value), width);
      barcodes.set(row, box);
      // Without bars only the human-readable line prints, so reserving the full
      // barcode height would leave a band of blank paper above it.
      height += box ? rowHeight(row) : SIZE.muted + LINE_GAP * 2;
    } else if (row.kind === 'logo') {
      // A logo row with nothing decoded takes no space at all, so a store that
      // has not uploaded one does not print a blank band.
      if (opts.logo) height += LOGO_HEIGHT + LINE_GAP;
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
      case 'logo': {
        if (!opts.logo) break;
        const box = logoBox(opts.logo, width);
        ctx.drawImage(opts.logo, box.x, y, box.width, box.height);
        break;
      }
      case 'barcode': {
        // Decided in pass 1 against this same roll width; null means the bars
        // cannot fit at one dot per module, so only the readable id prints.
        const box = barcodes.get(row) ?? null;
        const top = y + LINE_GAP;
        if (box) {
          let x = box.x;
          let bar = true;
          for (const w of code128Modules(row.value)) {
            if (bar) ctx.fillRect(Math.round(x), top, w * box.module, BARCODE_HEIGHT);
            x += w * box.module;
            bar = !bar;
          }
        }
        ctx.font = fontFor('muted', family);
        ctx.textAlign = 'center';
        // The human-readable line is always LTR — it is a receipt id.
        ctx.direction = 'ltr';
        ctx.fillText(row.value, width / 2, top + (box ? BARCODE_HEIGHT + LINE_GAP : SIZE.muted));
        ctx.direction = rtl ? 'rtl' : 'ltr';
        break;
      }
    }
    if (row.kind === 'logo') {
      if (opts.logo) y += LOGO_HEIGHT + LINE_GAP;
      continue;
    }
    if (row.kind === 'barcode') {
      // Mirrors pass 1 exactly, off the same resolved box.
      y += barcodes.get(row) ? rowHeight(row) : SIZE.muted + LINE_GAP * 2;
      continue;
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
