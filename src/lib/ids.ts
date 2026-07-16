// Collision-safe 8-hex-char suffix for entity IDs.
//
// `crypto.randomUUID` only exists in secure contexts (https / localhost /
// Electron); on a plain-http LAN deploy it is undefined and would crash every
// checkout / add-product action. `getRandomValues` is available everywhere,
// with Math.random as a last resort.
export function shortId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().split('-')[0];
  const bytes = new Uint8Array(4);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
