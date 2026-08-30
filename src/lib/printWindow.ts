/**
 * Opens a same-origin print document and removes its opener reference before
 * generated HTML is written. Passing `noopener` to window.open can return a
 * null handle in some browsers, so detaching the reference after opening keeps
 * the existing document.write/print flow intact without reverse-tabnabbing.
 */
export function openDetachedPrintWindow(): Window | null {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return null;

  try {
    printWindow.opener = null;
  } catch {
    // Some embedded browser implementations expose opener as read-only.
    // The window is still a generated same-origin print document in that case.
  }

  return printWindow;
}
