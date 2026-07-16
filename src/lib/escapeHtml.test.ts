import { describe, it, expect } from 'vitest';
import { escapeHtml } from './escapeHtml';

describe('escapeHtml', () => {
  it('escapes markup-significant characters', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
    expect(escapeHtml(`"quoted" & 'single'`)).toBe('&quot;quoted&quot; &amp; &#39;single&#39;');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Caffe Latte 4.50')).toBe('Caffe Latte 4.50');
  });

  it('stringifies non-strings and treats null/undefined as empty', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('escapes ampersands first (no double-escaping)', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});
