import { describe, expect, it } from 'vitest';
import { safeImageUrl } from '../../src/lib/imageUrl';

describe('safeImageUrl', () => {
  it('allows HTTP and HTTPS image URLs', () => {
    expect(safeImageUrl('https://images.example.test/item.png')).toBe(
      'https://images.example.test/item.png',
    );
    expect(safeImageUrl('/images/item.png')).toBe('http://localhost:3000/images/item.png');
  });

  it('allows raster image data URLs but rejects SVG data URLs', () => {
    expect(safeImageUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(safeImageUrl('data:image/svg+xml;base64,PHN2Zy8+')).toBe('');
  });

  it('rejects executable schemes, malformed values, and oversized input', () => {
    expect(safeImageUrl('javascript:alert(1)')).toBe('');
    expect(safeImageUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeImageUrl('not a valid url')).toBe('');
    expect(safeImageUrl('x'.repeat(4097))).toBe('');
    expect(safeImageUrl(null)).toBe('');
  });
});
