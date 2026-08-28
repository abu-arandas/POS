import { describe, expect, it } from 'vitest';
import { safeImageUrl } from '../../src/lib/imageUrl';

describe('safeImageUrl', () => {
  it('allows HTTP and HTTPS image URLs', () => {
    expect(safeImageUrl('https://images.example.test/item.png')).toBe(
      'https://images.example.test/item.png',
    );
    expect(safeImageUrl('/images/item.png')).toBe('http://localhost:3000/images/item.png');
  });

  it('allows image data URLs, raster and SVG alike', () => {
    expect(safeImageUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(safeImageUrl('data:image/svg+xml;base64,PHN2Zy8+')).toBe(
      'data:image/svg+xml;base64,PHN2Zy8+',
    );
  });

  // The app mints its own product thumbnails in this exact shape (productThumb
  // in src/data/seedData.ts) so the catalogue renders with no image host.
  // Rejecting it blanked all 74 seeded thumbnails in the register grid, the
  // cart, the inventory table and the LAN QR menu.
  it('accepts the url-encoded SVG thumbnails the app generates itself', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"></svg>';
    const thumb = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    expect(safeImageUrl(thumb)).toBe(thumb);
  });

  it('encodes accepted data URLs before returning them to an image sink', () => {
    expect(safeImageUrl('data:image/svg+xml,svg thumbnail')).toBe(
      'data:image/svg+xml,svg%20thumbnail',
    );
  });

  // SVG is allowed only because every consumer assigns the result to an
  // <img src>, where SVG cannot run script or fetch anything. A payload that
  // is not an image at all stays rejected regardless of how it is dressed up.
  it('still rejects non-image data URLs and trailing junk after the payload', () => {
    expect(safeImageUrl('data:text/html;base64,PGgxPmhpPC9oMT4=')).toBe('');
    expect(safeImageUrl('data:image/svg+xml;base64,PHN2Zy8+;charset=x')).toBe('');
    expect(safeImageUrl('data:image/png;base64,AAAA"onerror=alert(1)')).toBe('');
  });

  it('rejects executable schemes, malformed values, and oversized input', () => {
    expect(safeImageUrl('javascript:alert(1)')).toBe('');
    expect(safeImageUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeImageUrl('not a valid url')).toBe('');
    expect(safeImageUrl('x'.repeat(4097))).toBe('');
    expect(safeImageUrl(null)).toBe('');
  });
});
