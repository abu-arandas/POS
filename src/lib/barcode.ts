// Pure Code 128 (code set B) barcode → SVG generator for the HTML (system-print)
// receipt. Thermal printers get a native barcode command instead (see escpos.ts).
// No DOM, so it's unit-testable.

// Canonical Code 128 module-width patterns for symbol values 0–106. Each string
// is the run-length of alternating bar/space (starting with a bar); values
// 0–105 are 6 runs (11 modules), 106 (stop) is 7 runs (13 modules).
const PATTERNS = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
];

const START_B = 104;
const STOP = 106;

/**
 * Code-set-B symbol values (start, data, checksum, stop) for the payload.
 * Characters outside the printable-ASCII range Code B covers are dropped.
 */
export function code128BValues(data: string): number[] {
  const values: number[] = [];
  for (const ch of data) {
    const code = ch.charCodeAt(0);
    if (code >= 32 && code <= 126) values.push(code - 32);
  }
  let sum = START_B;
  values.forEach((v, i) => {
    sum += v * (i + 1);
  });
  const checksum = sum % 103;
  return [START_B, ...values, checksum, STOP];
}

/**
 * Flattened bar/space module-width sequence (alternating, starting with a bar).
 */
export function code128Modules(data: string): number[] {
  const widths: number[] = [];
  for (const sym of code128BValues(data)) {
    for (const d of PATTERNS[sym]) widths.push(Number(d));
  }
  return widths;
}

/**
 * Quiet zone either side of a Code 128 symbol, in modules.
 *
 * The spec requires at least 10, and a scanner uses it to find where the symbol
 * begins. Bars that fit the paper with no quiet zone still fail to read, which
 * is the same failure this whole module is trying to stop, so the fit test
 * below counts it as part of the symbol rather than as optional margin.
 */
export const CODE128_QUIET_MODULES = 10;

/**
 * The widest whole-dot module width that fits `availableDots`, or null when the
 * symbol cannot be printed on that paper at all.
 *
 * A module is the narrowest bar and can only be a whole number of dots — no
 * print head has a finer unit — so this floors, and a floor below `minModule`
 * means there is no width that works. Returning null for that is the point: the
 * alternative is to clamp to the minimum, which does not make an oversized
 * barcode fit, it makes it overrun the paper and get clipped at both ends.
 * What a head clips is the start and stop patterns, which is exactly what a
 * scanner needs, so a clamped barcode looks right and never reads.
 *
 * Both renderers ask this same question. The raster path can draw a one-dot
 * module and has no upper bound; the printer's native engine takes `GS w n`,
 * which is documented for n of 2 to 6. Hence the bounds are the caller's.
 */
export function code128ModuleWidth(
  value: string,
  availableDots: number,
  minModule = 1,
  maxModule?: number,
): number | null {
  const symbol = code128Modules(value).reduce((sum, w) => sum + w, 0);
  if (symbol <= 0 || availableDots <= 0) return null;

  const module = Math.floor(availableDots / (symbol + CODE128_QUIET_MODULES * 2));
  if (module < minModule) return null;
  return maxModule === undefined ? module : Math.min(module, maxModule);
}

/**
 * Bar geometry for renderBarcodeSvg. Both values are in CSS pixels.
 */
export interface BarcodeSvgOptions {
  height?: number; // px
  moduleWidth?: number; // px per narrow module
}

/**
 * Renders the payload as a self-contained black-bars SVG string. crispEdges +
 * integer-ish coordinates keep the bars sharp on a thermal roll.
 */
export function code128Svg(data: string, opts: BarcodeSvgOptions = {}): string {
  const height = opts.height ?? 44;
  const mw = opts.moduleWidth ?? 1.6;
  const widths = code128Modules(data);
  const totalModules = widths.reduce((a, b) => a + b, 0);
  const w = totalModules * mw;

  const rects: string[] = [];
  let x = 0;
  let bar = true; // sequence starts with a bar
  for (const width of widths) {
    if (bar) {
      rects.push(
        `<rect x="${(x * mw).toFixed(2)}" y="0" width="${(width * mw).toFixed(2)}" height="${height}"/>`,
      );
    }
    x += width;
    bar = !bar;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${height}" viewBox="0 0 ${w.toFixed(1)} ${height}" fill="#000" shape-rendering="crispEdges">${rects.join('')}</svg>`;
}
