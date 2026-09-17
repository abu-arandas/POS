import { describe, expect, it } from 'vitest';
import menuServer from './menuServer.cjs';

const {
  selectLocalIp,
  pickListenHost,
  shouldRebindMenuServer,
  isPhysicalAdapter,
  isVirtualAdapter,
} = menuServer;

/** One os.networkInterfaces() entry. */
const iface = (address, overrides = {}) => ({
  address,
  family: 'IPv4',
  internal: false,
  ...overrides,
});

describe('isVirtualAdapter', () => {
  it.each([
    'vEthernet (Default Switch)',
    'Hyper-V Virtual Ethernet Adapter',
    'VMware Network Adapter VMnet1',
    'VirtualBox Host-Only Network',
    'docker0',
    'tailscale0',
    'wg0',
    'tun0',
    'Loopback Pseudo-Interface 1',
    'Bluetooth Network Connection',
  ])('recognises %s as virtual', (name) => expect(isVirtualAdapter(name)).toBe(true));

  it.each(['eth0', 'wlan0', 'Ethernet', 'Wi-Fi', 'en0'])('does not flag %s', (name) =>
    expect(isVirtualAdapter(name)).toBe(false),
  );
});

describe('isPhysicalAdapter', () => {
  it.each([
    'eth0',
    'en0',
    'enp3s0',
    'ens33',
    'eno1',
    'wlan0',
    'wlp2s0',
    'Ethernet',
    'Wi-Fi',
    'WiFi',
  ])('recognises %s', (name) => expect(isPhysicalAdapter(name)).toBe(true));

  // The anchor is the point. This test used to be satisfied by `includes('en')`,
  // which "OpenVPN" also satisfies — so a terminal on a VPN advertised its VPN
  // address as the menu host and every customer on the shop wifi got nothing.
  it.each(['OpenVPN TAP-Windows6', 'ZeroTier One', 'Hyper-V Virtual Ethernet Adapter'])(
    'does not mistake %s for a physical adapter',
    (name) => expect(isPhysicalAdapter(name)).toBe(false),
  );
});

describe('selectLocalIp', () => {
  it('prefers a named physical adapter', () => {
    const address = selectLocalIp({
      'VMware Network Adapter VMnet1': [iface('192.168.56.1')],
      'Wi-Fi': [iface('192.168.1.42')],
    });
    expect(address).toBe('192.168.1.42');
  });

  it('falls back to any non-virtual adapter with a private address', () => {
    expect(selectLocalIp({ 'Some OEM Adapter': [iface('10.0.0.5')] })).toBe('10.0.0.5');
  });

  it('never falls back to a virtual adapter', () => {
    expect(selectLocalIp({ docker0: [iface('172.17.0.1')] })).toBe('localhost');
  });

  it('accepts the numeric family older Node releases report', () => {
    expect(selectLocalIp({ eth0: [iface('192.168.1.7', { family: 4 })] })).toBe('192.168.1.7');
  });

  it('skips internal and non-IPv4 entries', () => {
    const address = selectLocalIp({
      lo: [iface('127.0.0.1', { internal: true })],
      eth0: [iface('fe80::1', { family: 'IPv6' }), iface('192.168.1.9')],
    });
    expect(address).toBe('192.168.1.9');
  });

  // A public address at a till would invite the open internet to the menu.
  it('refuses a public address', () => {
    expect(selectLocalIp({ eth0: [iface('8.8.8.8')] })).toBe('localhost');
  });

  it.each([
    ['no interfaces', {}],
    ['null', null],
    ['a non-object', 'nope'],
  ])('falls back to localhost given %s', (_label, interfaces) =>
    expect(selectLocalIp(interfaces)).toBe('localhost'),
  );
});

describe('pickListenHost', () => {
  it('turns the localhost name into an address listen() can bind', () => {
    expect(pickListenHost('localhost')).toBe('127.0.0.1');
  });

  it('passes a real address through', () => {
    expect(pickListenHost('192.168.1.5')).toBe('192.168.1.5');
  });
});

describe('shouldRebindMenuServer', () => {
  it('rebinds when the machine has moved to a different address', () => {
    expect(shouldRebindMenuServer({ boundHost: '192.168.1.5', currentHost: '192.168.1.9' })).toBe(
      true,
    );
  });

  it('stays put when the address is unchanged', () => {
    expect(shouldRebindMenuServer({ boundHost: '192.168.1.5', currentHost: '192.168.1.5' })).toBe(
      false,
    );
  });

  it('leaves startup and the retry walk alone', () => {
    expect(shouldRebindMenuServer({ boundHost: null, currentHost: '192.168.1.5' })).toBe(false);
  });

  // Transiently between addresses — cable out, wifi dropped. Tearing the server
  // down to bind loopback would take the menu offline for a blip.
  it('does not fall back to loopback mid-flap', () => {
    expect(shouldRebindMenuServer({ boundHost: '192.168.1.5', currentHost: 'localhost' })).toBe(
      false,
    );
  });

  it('does rebind when loopback is what was bound', () => {
    expect(shouldRebindMenuServer({ boundHost: 'localhost', currentHost: '192.168.1.5' })).toBe(
      true,
    );
  });
});
