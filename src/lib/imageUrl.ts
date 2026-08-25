const MAX_IMAGE_URL_LENGTH = 4096;

const IMAGE_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);(?:charset=[^;,]+;)?base64,[a-z0-9+/=\s]+$/i;

export function safeImageUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw || raw.length > MAX_IMAGE_URL_LENGTH) return '';
  if (IMAGE_DATA_URL_PATTERN.test(raw)) return raw;
  if (!/^https?:\/\//i.test(raw) && !(raw.startsWith('/') && !raw.startsWith('//'))) return '';

  try {
    const url = new URL(raw, window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}
