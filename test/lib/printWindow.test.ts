import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDetachedPrintWindow } from '../../src/lib/printWindow';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('openDetachedPrintWindow', () => {
  it('detaches the opener from a writable print window', () => {
    const printWindow = { opener: window } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(printWindow);

    expect(openDetachedPrintWindow()).toBe(printWindow);
    expect(printWindow.opener).toBeNull();
    expect(window.open).toHaveBeenCalledWith('', '_blank');
  });

  it('returns null when the browser blocks the popup', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);

    expect(openDetachedPrintWindow()).toBeNull();
  });
});
