// Pure helpers for the LAN QR-menu server.
//
// Extracted from main.cjs for the same reason validation.cjs and
// updatePolicy.cjs were: main.cjs is only ever checked by `node --check`, which
// parses and nothing more. The address-selection logic below decides which
// interface customers are told to point their phones at, and when it picks
// wrong the menu is simply unreachable — silently, and only once packaged.
// That is precisely the failure mode the `\\d` bug in isIPv4 had.

const { isPrivateIPv4 } = require('./validation.cjs');

// Adapters that are never the shop's LAN. Matched as substrings because
// vendors pad these with their own words ("Hyper-V Virtual Ethernet Adapter").
const VIRTUAL_ADAPTER_HINTS = [
  'veth',
  'virtual',
  'vmware',
  'vbox',
  'virtualbox',
  'hyper-v',
  'docker',
  'tailscale',
  'zerotier',
  'hamachi',
  'wg', // wireguard
  'tun',
  'tap',
  'vpn',
  'loopback',
  'bluetooth',
];

// Real wired/wireless adapters, anchored at the start of the name.
//
// The anchor is the point. This test used to be `name.includes('en')`, which is
// satisfied by any name containing those two letters anywhere — "OpenVPN" among
// them. A terminal on a VPN would advertise its VPN address as the menu host,
// and every customer on the shop's wifi would get nothing. Anchoring matches
// the real families (eth0, en0, enp3s0, wlan0, wlp2s0, "Ethernet", "Wi-Fi")
// without matching a vendor's product name that happens to contain them.
const PHYSICAL_ADAPTER_PATTERNS = [
  /^(?:eth|en|enp|ens|eno|wl|wlan|wlp|wlo)\d/i, // linux / bsd style
  /^ethernet\b/i, // windows
  /^wi-?fi\b/i, // windows
  /^en\d/i, // macOS
];

function isVirtualAdapter(name) {
  const lower = String(name).toLowerCase();
  return VIRTUAL_ADAPTER_HINTS.some((hint) => lower.includes(hint));
}

function isPhysicalAdapter(name) {
  if (isVirtualAdapter(name)) return false;
  return PHYSICAL_ADAPTER_PATTERNS.some((pattern) => pattern.test(String(name)));
}

// Picks the address to advertise from an os.networkInterfaces() map. Takes the
// map as an argument rather than calling os itself, so the selection can be
// tested against real-world adapter layouts off-device.
//
// Only RFC 1918 addresses qualify: the menu is served to phones on the shop's
// own network, and advertising a public address would invite the open internet
// at a till.
function selectLocalIp(interfaces) {
  if (!interfaces || typeof interfaces !== 'object') return 'localhost';

  const usable = (entry) =>
    entry &&
    // Node reports family as 'IPv4' (string) on current releases and 4 on some
    // older ones; accept either rather than silently matching nothing.
    (entry.family === 'IPv4' || entry.family === 4) &&
    !entry.internal &&
    isPrivateIPv4(entry.address);

  // 1. A named physical adapter wins.
  for (const name of Object.keys(interfaces)) {
    if (!isPhysicalAdapter(name)) continue;
    for (const entry of interfaces[name] || []) {
      if (usable(entry)) return entry.address;
    }
  }

  // 2. Otherwise any non-virtual adapter with a private address. Virtual ones
  //    stay excluded here too — falling back to a VPN or container bridge is
  //    the same unreachable menu, just arrived at differently.
  for (const name of Object.keys(interfaces)) {
    if (isVirtualAdapter(name)) continue;
    for (const entry of interfaces[name] || []) {
      if (usable(entry)) return entry.address;
    }
  }

  return 'localhost';
}

// express.listen() wants an address it can bind; 'localhost' is a name.
function pickListenHost(ip) {
  return ip === 'localhost' ? '127.0.0.1' : ip;
}

// The server binds one address, once, at startup. A terminal that renews its
// DHCP lease or moves from wifi to ethernet keeps listening on the address it
// no longer has, while the QR code is regenerated from the *current* address —
// so the code points somewhere nothing is listening and the menu just stops
// working, with nothing logged. Rebinding on drift is what keeps the two in
// step.
function shouldRebindMenuServer({ boundHost, currentHost }) {
  if (!boundHost) return false; // never came up; startup/retry owns that case
  if (!currentHost) return false;
  if (currentHost === 'localhost' && boundHost !== 'localhost') {
    // Transiently between addresses (cable out, wifi dropped). Keep the
    // existing binding rather than tearing the server down to bind loopback.
    return false;
  }
  return currentHost !== boundHost;
}

module.exports = {
  selectLocalIp,
  pickListenHost,
  shouldRebindMenuServer,
  isPhysicalAdapter,
  isVirtualAdapter,
};
