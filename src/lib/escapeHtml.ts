// Escapes a value for safe interpolation into HTML markup (element content or
// double-quoted attributes). Product/customer/store names are operator input —
// and with cloud sync they may come from another terminal — so anything
// injected into generated HTML (print receipts, QR menu) must pass through here.
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
