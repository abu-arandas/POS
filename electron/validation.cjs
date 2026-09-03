// Pure input validators for the Electron main process.
//
// These guard the privileged IPC surface: what the renderer may put on the
// LAN-exposed menu endpoint, which hosts the app will open a socket to, and
// how many bytes it will stream to a printer. They used to live inline in
// main.cjs, where nothing could reach them — CI checks that file with
// `node --check`, a parse and nothing more.
//
// That gap was not theoretical. `isIPv4` shipped with `\\d` inside a regex
// literal, which is an escaped backslash followed by a literal `d`, not a
// digit class. The pattern matched only "0", so every real address was
// rejected: the QR menu server bound loopback and advertised `localhost`,
// network ESC/POS printing refused every payload, and the subnet scan bailed
// at its own guard. All three failed silently, in packaged builds only.
//
// Kept dependency-free so it unit-tests off-device, exactly like
// updatePolicy.cjs.

const MAX_MENU_DATA_BYTES = 5 * 1024 * 1024;
const MAX_MENU_RECORDS = 5_000;
// Two bounds, because the fields are not alike. Everything on a menu except
// the pictures is a label — a name, a category, a CSS class — and a 16 KB
// "name" is an attack, not a product. Images and the store logo, on the other
// hand, arrive as data: URLs from FileReader.readAsDataURL, and an ordinary
// uploaded logo clears 16 KB easily; bounding them that tightly rejected the
// whole payload and froze the QR menu with nothing but a main-process log to
// say why. The aggregate budget in isSafeMenuData is what actually caps the
// payload, so the per-image bound only has to stop one field from eating it.
const MAX_MENU_LABEL_LENGTH = 512;
const MAX_MENU_IMAGE_LENGTH = 512 * 1024;
const MAX_RAW_PRINT_BYTES = 1_000_000;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isBoundedString(value, max = MAX_MENU_LABEL_LENGTH) {
  return typeof value === 'string' && value.length <= max;
}

// Rejects leading zeros ("01") and out-of-range octets, so only one spelling
// of an address ever passes.
function isIPv4(ip) {
  const parts = String(ip).split('.');
  return (
    parts.length === 4 &&
    parts.every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)
  );
}

// RFC 1918 space only. Printer discovery and raw printing are deliberately
// confined to the terminal's own network — never turn either into a
// general-purpose outbound socket.
function isPrivateIPv4(ip) {
  if (!isIPv4(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function isValidRawBytes(data) {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    data.length <= MAX_RAW_PRINT_BYTES &&
    data.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  );
}

function isValidPrinterPayload(payload) {
  return (
    isPlainObject(payload) &&
    isPrivateIPv4(payload.ip) &&
    payload.port === 9100 &&
    isValidRawBytes(payload.data)
  );
}

// The menu endpoint is served over the LAN to anyone who scans the QR code, so
// the main process accepts only the documented customer-safe shape — never
// cost, stock counts, or the rest of the store settings.
//
// Order matters here. The cheap gates — object shape, array-ness, record counts
// — run first so a hostile payload is thrown out before anything walks it. Then
// the walk carries a running byte budget, because per-field bounds alone still
// admit 5,000 records x half a megabyte of image data, which main.cjs would
// only reject after JSON.stringify had already built the whole string. A JS
// string's `length` is never greater than its UTF-8 byte length, so blowing the
// budget in characters proves the payload blows it in bytes — nothing that
// would have been accepted downstream is rejected here.
function isSafeMenuData(data) {
  if (!isPlainObject(data)) return false;
  const { products, categories, settings } = data;
  if (!Array.isArray(products) || products.length > MAX_MENU_RECORDS) return false;
  if (!Array.isArray(categories) || categories.length > MAX_MENU_RECORDS) return false;
  if (!isPlainObject(settings)) return false;

  let budget = MAX_MENU_DATA_BYTES;
  // Charges a string against the budget once its own length bound passes.
  const spend = (value, max) => {
    if (!isBoundedString(value, max)) return false;
    budget -= value.length;
    return budget >= 0;
  };

  if (!spend(settings.storeName, MAX_MENU_LABEL_LENGTH)) return false;
  if (!spend(settings.currency, MAX_MENU_LABEL_LENGTH)) return false;
  if (settings.storeLogo !== undefined && !spend(settings.storeLogo, MAX_MENU_IMAGE_LENGTH)) {
    return false;
  }

  return (
    products.every(
      (product) =>
        isPlainObject(product) &&
        typeof product.price === 'number' &&
        Number.isFinite(product.price) &&
        typeof product.inStock === 'boolean' &&
        spend(product.id, MAX_MENU_LABEL_LENGTH) &&
        spend(product.name, MAX_MENU_LABEL_LENGTH) &&
        spend(product.category, MAX_MENU_LABEL_LENGTH) &&
        spend(product.image, MAX_MENU_IMAGE_LENGTH),
    ) &&
    categories.every(
      (category) =>
        isPlainObject(category) &&
        spend(category.id, MAX_MENU_LABEL_LENGTH) &&
        spend(category.name, MAX_MENU_LABEL_LENGTH) &&
        spend(category.color, MAX_MENU_LABEL_LENGTH),
    )
  );
}

module.exports = {
  MAX_MENU_DATA_BYTES,
  MAX_MENU_RECORDS,
  MAX_MENU_LABEL_LENGTH,
  MAX_MENU_IMAGE_LENGTH,
  MAX_RAW_PRINT_BYTES,
  isPlainObject,
  isBoundedString,
  isIPv4,
  isPrivateIPv4,
  isValidRawBytes,
  isValidPrinterPayload,
  isSafeMenuData,
};
