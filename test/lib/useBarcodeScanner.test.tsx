import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBarcodeScanner } from '../../src/lib/useBarcodeScanner';

// This hook is a global keydown listener that can swallow Enter app-wide, so its
// two thresholds (burst speed, minimum length) and its editable-field bail-out
// are worth pinning down.

// Types a burst of characters `gapMs` apart, then Enter. Timers are faked so the
// inter-key gap is exact rather than dependent on how fast the test machine is.
function type(text: string, gapMs: number, { enter = true } = {}) {
  for (const ch of text) {
    vi.advanceTimersByTime(gapMs);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ch, cancelable: true }));
  }
  if (enter) {
    vi.advanceTimersByTime(gapMs);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
  }
}

describe('useBarcodeScanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Date.now() drives the gap measurement, so it has to move with the timers.
    vi.setSystemTime(new Date('2026-07-25T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('reports a fast burst terminated by Enter as a scan', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minLength: 3, maxInterKeyMs: 50 }));
    type('BEV-ESP-01', 10);
    expect(onScan).toHaveBeenCalledWith('BEV-ESP-01');
  });

  it('ignores human-speed typing', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minLength: 3, maxInterKeyMs: 50 }));
    type('LATTE', 200); // every gap exceeds the threshold, so the buffer resets
    expect(onScan).not.toHaveBeenCalled();
  });

  it('ignores a burst shorter than minLength', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minLength: 5, maxInterKeyMs: 50 }));
    type('AB', 10);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('does not fire while an input is focused, so search and PIN entry are safe', () => {
    const onScan = vi.fn();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    renderHook(() => useBarcodeScanner({ onScan, minLength: 3, maxInterKeyMs: 50 }));
    type('BEV-ESP-01', 10);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('does nothing at all when disabled', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, enabled: false, minLength: 3 }));
    type('BEV-ESP-01', 10);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('only buffers printable single characters', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minLength: 3, maxInterKeyMs: 50 }));
    vi.advanceTimersByTime(10);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', cancelable: true }));
    vi.advanceTimersByTime(10);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', cancelable: true }));
    vi.advanceTimersByTime(10);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', cancelable: true }));
    vi.advanceTimersByTime(10);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'C', cancelable: true }));
    vi.advanceTimersByTime(10);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    expect(onScan).toHaveBeenCalledWith('ABC'); // 'Shift' contributed nothing
  });

  it('starts a fresh buffer after a slow keystroke mid-burst', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minLength: 3, maxInterKeyMs: 50 }));
    // Stray fast keystrokes, then a gap well over the threshold before the real
    // scan begins. The first key of the scan is the "slow" one, which is what
    // clears the leftover buffer.
    type('XX', 10, { enter: false });
    vi.advanceTimersByTime(500);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', cancelable: true }));
    type('EV-01', 10);
    expect(onScan).toHaveBeenCalledWith('BEV-01');
  });

  it('stops listening once unmounted', () => {
    const onScan = vi.fn();
    const { unmount } = renderHook(() => useBarcodeScanner({ onScan, minLength: 3 }));
    unmount();
    type('BEV-ESP-01', 10);
    expect(onScan).not.toHaveBeenCalled();
  });
});
