import { openDetachedPrintWindow } from '../../utils/dom';
import { receiptDocHtml } from '../../receipt/document';
import type { PrintOutcome } from '../types';

/**
 * Writes a complete receipt document to a browser/Electron print window and
 * triggers the OS print dialog. Receipt content generation stays independent of
 * this environment-specific transport.
 */
export function openSystemPrintWindow(
  bodyHtml: string,
  rollWidth: string,
  fontFamily = 'monospace',
  fontSizePx = 12,
): PrintOutcome {
  const printWindow = openDetachedPrintWindow();
  if (!printWindow) return 'popup-blocked';

  printWindow.document.write(receiptDocHtml(bodyHtml, rollWidth, fontFamily, fontSizePx, true));
  printWindow.document.close();
  return 'printed';
}
