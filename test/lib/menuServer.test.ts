import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// The Electron main process is CommonJS and never goes through Vite.
const require = createRequire(import.meta.url);
const {
  selectLocalIp,
  pickListenHost,
  shouldRebindMenuServer,
  isPhysicalAdapter,
} = require('../../electron/menuServer.cjs');

// Shapes match os.networkInterfaces().
const v4 = (address: string, extra: Record<string, unknown> = {}) => ({
  address,
  family: 'IPv4',
  internal: false,
  ...extra,
});

describe('selectLocalIp', () => {
  it('picks the private address of a physical adapter', () => {
    expect(
      selectLocalIp({
        lo: [v4('127.0.0.1', { internal: true })],
        eth0: [v4('192.168.1.50')],
      }),
    ).toBe('192.168.1.50');
  });

  it('recognises the real adapter families on each platform', () => {
    expect(selectLocalIp({ enp3s0: [v4('10.0.0.5')] })).toBe('10.0.0.5');
    expect(selectLocalIp({ wlp2s0: [v4('10.0.0.6')] })).toBe('10.0.0.6');
    expect(selectLocalIp({ en0: [v4('172.16.0.9')] })).toBe('172.16.0.9');
    expect(selectLocalIp({ Ethernet: [v4('192.168.0.2')] })).toBe('192.168.0.2');
    expect(selectLocalIp({ 'Wi-Fi': [v4('192.168.0.3')] })).toBe('192.168.0.3');
  });

  it('does not mistake a VPN adapter for the shop LAN', () => {
    // The regression this module exists for. The old test was
    // `name.includes('en')`, and "OpenVPN" contains those two letters, so a
    // terminal on a VPN advertised its VPN address as the menu host and every
    // customer on the shop's wifi got nothing — silently, in packaged builds.
    expect(
      selectLocalIp({
        OpenVPN: [v4('10.8.0.6')],
        'Wi-Fi': [v4('192.168.1.20')],
      }),
    ).toBe('192.168.1.20');
    expect(isPhysicalAdapter('OpenVPN')).toBe(false);
  });

  it('skips virtual, container and mesh adapters', () => {
    for (const name of [
      'vEthernet (Default Switch)',
      'VMware Network Adapter VMnet1',
      'Hyper-V Virtual Ethernet Adapter',
      'docker0',
      'tailscale0',
      'zerotier-abc',
      'wg0',
      'tun0',
    ]) {
      expect(isPhysicalAdapter(name), name).toBe(false);
    }
  });

  it('never advertises a public address to the shop floor', () => {
    // The menu is for phones on the local network. A public address here would
    // be inviting the open internet to a till.
    expect(selectLocalIp({ eth0: [v4('8.8.8.8')] })).toBe('localhost');
  });

  it('ignores loopback and non-IPv4 entries', () => {
    expect(
      selectLocalIp({
        lo: [v4('127.0.0.1', { internal: true })],
        eth0: [{ address: 'fe80::1', family: 'IPv6', internal: false }],
      }),
    ).toBe('localhost');
  });

  it('accepts the numeric family older Node releases report', () => {
    expect(selectLocalIp({ eth0: [{ address: '192.168.5.5', family: 4, internal: false }] })).toBe(
      '192.168.5.5',
    );
  });

  it('falls back to an unrecognised adapter name, but still not a virtual one', () => {
    expect(selectLocalIp({ 'Local Area Connection': [v4('192.168.9.9')] })).toBe('192.168.9.9');
    expect(selectLocalIp({ tailscale0: [v4('100.64.0.1')] })).toBe('localhost');
  });

  it('returns localhost when there is nothing usable', () => {
    expect(selectLocalIp({})).toBe('localhost');
    expect(selectLocalIp(null)).toBe('localhost');
    expect(selectLocalIp(undefined)).toBe('localhost');
  });
});

describe('pickListenHost', () => {
  it('turns the localhost sentinel into a bindable address', () => {
    expect(pickListenHost('localhost')).toBe('127.0.0.1');
    expect(pickListenHost('192.168.1.50')).toBe('192.168.1.50');
  });
});

describe('shouldRebindMenuServer', () => {
  it('rebinds when the machine changed address', () => {
    // DHCP renewal, or wifi to ethernet. The server keeps listening on an
    // address the machine no longer has while the QR code is drawn from the
    // new one, so the code resolves to nowhere.
    expect(shouldRebindMenuServer({ boundHost: '192.168.1.50', currentHost: '192.168.1.77' })).toBe(
      true,
    );
  });

  it('stays put when the address is unchanged', () => {
    expect(shouldRebindMenuServer({ boundHost: '192.168.1.50', currentHost: '192.168.1.50' })).toBe(
      false,
    );
  });

  it('does not tear down a working server for a transient disconnect', () => {
    // Cable pulled or wifi dropped: selectLocalIp reports 'localhost'. Rebinding
    // to loopback there would take the menu down for everyone and it would not
    // come back on its own when the link returned.
    expect(shouldRebindMenuServer({ boundHost: '192.168.1.50', currentHost: 'localhost' })).toBe(
      false,
    );
  });

  it('leaves a server that never came up to the startup retry', () => {
    expect(shouldRebindMenuServer({ boundHost: null, currentHost: '192.168.1.50' })).toBe(false);
  });
});
