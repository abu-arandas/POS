/**
 * Opens a same-origin print document and removes its opener reference before
 * generated HTML is written.
 */
export function openDetachedPrintWindow(): Window | null {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return null;
  try {
    printWindow.opener = null;
  } catch {
    // Some embedded browser implementations expose opener as read-only.
  }
  return printWindow;
}
