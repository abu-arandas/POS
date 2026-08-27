// `crypto.randomUUID` only exists in secure contexts (https / localhost /
// Electron); on a plain-http LAN deploy it is undefined and would crash every
// checkout / add-product action. `getRandomValues` is available everywhere,
// with Math.random as a last resort. Always return a full 128-bit identifier so
// primary-key collisions remain negligible as the terminal grows.
export function shortId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Keep the fallback URL-safe and preserve the UUID-sized entropy budget.
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
