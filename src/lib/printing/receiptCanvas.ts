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
import { code128Modules, code128ModuleWidth } from './barcode';
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
// Gap kept between a pair's label and its value when they share a line.
const PAIR_GAP = 12;

/**
 * When a pair's value claims more than this share of the line, the label moves
 * to its own line above it instead of being squeezed beside it.
 *
 * The old code took `Math.max(1, inner - valueWidth - 12)` and wrapped the
 * label into whatever came out. For the receipt id — 39 characters, and the
 * widest value on the receipt — that left 1.1 dot of room on an 80mm roll
 * against a 17.3 dot character, so wrapText broke "RECEIPT:" one letter per
 * line into a vertical column, and its first letter collided with the id drawn
 * across it. The clamp is the bug: a width of one dot is not a width, it is the
 * function refusing to admit the two do not fit. (barcode.ts makes the same
 * point about clamping a module width.)
 */
const PAIR_STACK_RATIO = 0.55;

/**
 * How one pair row resolves: its wrapped label, its wrapped value, whether the
 * two stack, and the extra lines that costs. Computed once in the measure pass
 * and reused when drawing, so the height reserved and the height used cannot
 * drift apart.
 */
interface PairLayout {
  labelLines: string[];
  valueLines: string[];
  stacked: boolean;
  extraLines: number;
}

/**
 * Resolves one pair row against the available width. Exported so the rule can
 * be asserted without a canvas — jsdom has no 2D context, so a test that went
 * through renderReceiptRaster would prove nothing about it.
 */
export function layoutPair(
  measure: (text: string) => number,
  wrap: (text: string, maxWidth: number) => string[],
  label: string,
  value: string,
  available: number,
): PairLayout {
  const stacked = measure(value) > available * PAIR_STACK_RATIO;
  const labelLines = wrap(
    label,
    stacked ? available : Math.max(1, available - measure(value) - PAIR_GAP),
  );
  // A stacked value gets the full width and wraps like any other text: on a
  // 58mm roll the receipt id is wider than the paper on its own, so leaving it
  // unwrapped would simply run it off the edge.
  const valueLines = stacked ? wrap(value, available) : [value];
  return {
    labelLines,
    valueLines,
    stacked,
    extraLines: labelLines.length - 1 + (stacked ? valueLines.length : 0),
  };
}

// Any strong right-to-left character: Hebrew, Arabic and their supplements and
// presentation forms.
const RTL_CHAR =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

/**
 * The base direction a run of text should be laid out with, taken from the text
 * itself rather than from the receipt.
 *
 * The receipt's own direction is the wrong answer for operator free text. An
 * English footer on an Arabic receipt inherited RTL and had its trailing
 * punctuation dragged to the front — "Thank you for shopping with us!" printed
 * as "!Thank you for shopping with us". This mirrors `unicode-bidi: plaintext`,
 * which the HTML receipt uses for the same rows.
 */
export function textDirection(text: string, fallback: CanvasDirection): CanvasDirection {
  for (const ch of text) {
    if (RTL_CHAR.test(ch)) return 'rtl';
    // A strong LTR character settles it the other way.
    if (/[A-Za-z\u00C0-\u024F]/.test(ch)) return 'ltr';
  }
  return fallback;
}

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
      const broken = breakOversizedWord(ctx, word, maxWidth);
      lines.push(...broken.full);
      line = broken.rest;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Splits a single word that cannot fit on a line of its own — a SKU, a URL —
 * into character-wide chunks. Returns the chunks that are already full plus the
 * trailing partial, which the caller carries on filling with whatever follows.
 */
function breakOversizedWord(
  ctx: CanvasRenderingContext2D,
  word: string,
  maxWidth: number,
): { full: string[]; rest: string } {
  const full: string[] = [];
  let chunk = '';
  for (const ch of word) {
    if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
      full.push(chunk);
      chunk = ch;
    } else chunk += ch;
  }
  return { full, rest: chunk };
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
 * The fit rule itself lives in barcode.ts, because the ESC/POS text path has to
 * answer the same question about the same symbol and the two must not disagree
 * — a receipt that refuses the barcode on one path and clips it on the other is
 * the bug this replaced, wearing a different hat.
 *
 * The raster path draws its own bars, so it can use a one-dot module and has no
 * upper bound to respect. Quiet zones are measured against the full head width
 * rather than the padded area: white paper beside the symbol is quiet zone
 * whether or not the layout calls it a margin.
 */
export function barcodeBox(
  value: string,
  paperWidth: number,
): { x: number; module: number; width: number } | null {
  const module = code128ModuleWidth(value, paperWidth, 1);
  if (module === null) return null;

  const width = code128Modules(value).reduce((sum, w) => sum + w, 0) * module;
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
  const pairs = new Map<DocRow, PairLayout>();
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
      const layout = layoutPair(
        (text) => ctx.measureText(text).width,
        (text, max) => wrapText(ctx, text, max),
        row.label,
        row.value,
        inner - boxInset,
      );
      pairs.set(row, layout);
      height += rowHeight(row) + layout.extraLines * (SIZE[row.style ?? 'normal'] ?? SIZE.normal);
    } else if (row.kind === 'barcode') {
      // Resolved here and reused when drawing, so the height reserved and the
      // height used cannot drift apart — the same reason wrapping is cached.
      const box = barcodeBox(row.value, width);
      barcodes.set(row, box);
      // The readable id is wrapped like any other text. It is the only carrier
      // of the value when the bars are refused, so letting it run off the edge
      // would leave the receipt with no legible id at all — which is worse than
      // the clipped barcode this all replaced.
      ctx.font = fontFor('muted', family);
      const lines = wrapText(ctx, row.value, inner);
      wrapped.set(row, lines);
      const readable = SIZE.muted * lines.length + LINE_GAP * 2;
      // Without bars only the readable line prints, so reserving the full
      // barcode height would leave a band of blank paper above it.
      height += box ? rowHeight(row) + SIZE.muted * (lines.length - 1) : readable;
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
        // Centered rows carry the operator's own words — the header, the footer,
        // the status line — so each is laid out in its own language's direction.
        ctx.direction = textDirection(row.text, rtl ? 'rtl' : 'ltr');
        const step = SIZE[row.style ?? 'normal'] ?? SIZE.normal;
        (wrapped.get(row) ?? [row.text]).forEach((ln, i) => {
          ctx.fillText(ln, width / 2, y + i * step);
        });
        ctx.direction = rtl ? 'rtl' : 'ltr';
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
        const step = SIZE[row.style ?? 'normal'] ?? SIZE.normal;
        const layout = pairs.get(row) ?? {
          labelLines: [row.label],
          valueLines: [row.value],
          stacked: false,
          extraLines: 0,
        };
        const textY = row.boxed ? y + BOX_PAD + 2 : y;
        if (row.boxed) {
          // Sized from the resolved line count, so a box never crops its own
          // contents if the row turns out to need more than one line.
          const h = step * (layout.extraLines + 1) + BOX_PAD * 2;
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#000';
          ctx.strokeRect(PAD, y, width - PAD * 2, h);
        }
        const inset = row.boxed ? PAD + BOX_PAD : 0;
        // Side by side, the value holds the first line and a long label wraps
        // beneath it. Stacked, the label comes first and the value follows on
        // its own line(s) — still on the trailing edge, so the two read as one
        // pair rather than as two unrelated rows.
        ctx.textAlign = leadAlign;
        layout.labelLines.forEach((ln, i) => {
          ctx.fillText(ln, rtl ? lead - inset : lead + inset, textY + i * step);
        });
        ctx.textAlign = trailAlign;
        const valueTop = layout.stacked ? textY + layout.labelLines.length * step : textY;
        layout.valueLines.forEach((ln, i) => {
          ctx.fillText(ln, rtl ? trail + inset : trail - inset, valueTop + i * step);
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
          let { x } = box;
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
        const lines = wrapped.get(row) ?? [row.value];
        const firstLine = top + (box ? BARCODE_HEIGHT + LINE_GAP : SIZE.muted);
        lines.forEach((ln, i) => ctx.fillText(ln, width / 2, firstLine + i * SIZE.muted));
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
      const extraLines = (wrapped.get(row)?.length ?? 1) - 1;
      y += barcodes.get(row)
        ? rowHeight(row) + SIZE.muted * extraLines
        : SIZE.muted * (extraLines + 1) + LINE_GAP * 2;
      continue;
    }
    // Off the same resolved layout the measure pass reserved space from.
    const extra =
      row.kind === 'pair' ? (pairs.get(row)?.extraLines ?? 0) : (wrapped.get(row)?.length ?? 1) - 1;
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
    const { fonts } = document as Document & { fonts?: FontFaceSet };
    if (!fonts) return;
    await Promise.all([fonts.load('400 24px Cairo'), fonts.load('700 38px Cairo')]);
  } catch {
    /* fall back to the system stack */
  }
}
