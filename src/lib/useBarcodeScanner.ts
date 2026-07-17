import { useEffect, useRef } from 'react';

interface BarcodeScannerOptions {
  onScan: (code: string) => void;
  enabled?: boolean;
  // A scan is a burst of characters typed faster than a human, ended by Enter.
  minLength?: number;
  maxInterKeyMs?: number;
}

// Detects hardware barcode scanners, which act as keyboard wedges: they "type"
// the code far faster than a person and finish with Enter. We buffer only
// fast-arriving characters and, on Enter, treat a sufficiently long burst as a
// scan. Manual typing (slow keystrokes) never accumulates into a burst, and we
// ignore input while an editable field is focused so search/PIN entry is safe.
export function useBarcodeScanner({
  onScan,
  enabled = true,
  minLength = 3,
  maxInterKeyMs = 50,
}: BarcodeScannerOptions) {
  const bufferRef = useRef('');
  const lastTimeRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const isEditableTarget = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const handler = (e: KeyboardEvent) => {
      const now = Date.now();
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (e.key === 'Enter') {
        const code = bufferRef.current;
        bufferRef.current = '';
        if (code.length >= minLength && !isEditableTarget()) {
          e.preventDefault();
          onScan(code);
        }
        return;
      }

      // Only printable single characters form part of a barcode.
      if (e.key.length !== 1) return;
      // A slow keystroke means a human is typing — start the buffer over.
      if (delta > maxInterKeyMs) bufferRef.current = '';
      bufferRef.current += e.key;
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onScan, enabled, minLength, maxInterKeyMs]);
}
