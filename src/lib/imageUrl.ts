const MAX_IMAGE_URL_LENGTH = 4096;

// Every value this function returns is assigned to an <img src>, and nowhere
// else — the eight call sites are all <img> tags. That is what makes the SVG
// case safe: a browser loads SVG referenced from <img> in a restricted mode
// where scripts do not execute and external resources are not fetched. What
// stays rejected is everything that is not an image at all: javascript:,
// data:text/html, and any scheme we do not recognise.
//
// SVG has to be allowed because the app generates its own product thumbnails
// in that form — see productThumb() in src/data/seedData.ts, which emits
// `data:image/svg+xml,<url-encoded>` so the catalogue renders offline with no
// image host. Rejecting it blanked all 74 seeded thumbnails.
const RASTER_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);(?:charset=[^;,]+;)?base64,[a-z0-9+/=\s]+$/i;

const SVG_DATA_URL_PATTERN =
  /^data:image\/svg\+xml(?:;charset=[\w-]+)?(?:;base64)?,[a-z0-9%+/=._~!*'()\s-]*$/i;

function isImageDataUrl(raw: string): boolean {
  return RASTER_DATA_URL_PATTERN.test(raw) || SVG_DATA_URL_PATTERN.test(raw);
}

function encodeImageDataUrl(raw: string): string {
  // Encode raw delimiters and whitespace while preserving valid percent escapes
  // already present in the app-generated URL-encoded SVG thumbnails.
  return encodeURI(raw).replace(/%25(?=[0-9a-f]{2})/gi, '%');
}

export function safeImageUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw || raw.length > MAX_IMAGE_URL_LENGTH) return '';
  if (isImageDataUrl(raw)) return encodeImageDataUrl(raw);
  if (!/^https?:\/\//i.test(raw) && !(raw.startsWith('/') && !raw.startsWith('//'))) return '';

  try {
    const url = new URL(raw, window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? encodeURI(url.href) : '';
  } catch {
    return '';
  }
}
