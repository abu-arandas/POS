import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scanNetworkPrinters, networkScanSupported } from '../../src/lib/printerDiscovery';

describe('printerDiscovery', () => {
  let originalWindow: any;

  beforeEach(() => {
    originalWindow = globalThis.window;
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    vi.clearAllMocks();
  });

  describe('networkScanSupported', () => {
    it('returns true if window.electronAPI.scanNetworkPrinters exists', () => {
      globalThis.window = {
        electronAPI: {
          scanNetworkPrinters: vi.fn(),
        },
      } as any;
      expect(networkScanSupported()).toBe(true);
    });

    it('returns false if window.electronAPI is missing', () => {
      globalThis.window = {} as any;
      expect(networkScanSupported()).toBe(false);
    });

    it('returns false if scanNetworkPrinters is missing', () => {
      globalThis.window = { electronAPI: {} } as any;
      expect(networkScanSupported()).toBe(false);
    });
  });

  describe('scanNetworkPrinters', () => {
    it('returns empty array if not supported', async () => {
      globalThis.window = {} as any;
      const printers = await scanNetworkPrinters();
      expect(printers).toEqual([]);
    });

    it('maps ips from electronAPI to DetectedPrinter objects', async () => {
      const mockScan = vi.fn().mockResolvedValue(['192.168.1.100', '10.0.0.5']);
      globalThis.window = {
        electronAPI: {
          scanNetworkPrinters: mockScan,
        },
      } as any;

      const printers = await scanNetworkPrinters();
      expect(mockScan).toHaveBeenCalled();
      expect(printers).toEqual([
        {
          id: 'net-192.168.1.100',
          name: 'Network printer 192.168.1.100',
          kind: 'network',
          detail: '192.168.1.100:9100',
          ipAddress: '192.168.1.100',
        },
        {
          id: 'net-10.0.0.5',
          name: 'Network printer 10.0.0.5',
          kind: 'network',
          detail: '10.0.0.5:9100',
          ipAddress: '10.0.0.5',
        },
      ]);
    });

    it('returns empty array and logs error on failure', async () => {
      const mockScan = vi.fn().mockRejectedValue(new Error('Scan failed'));
      globalThis.window = {
        electronAPI: {
          scanNetworkPrinters: mockScan,
        },
      } as any;
      const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {});

      const printers = await scanNetworkPrinters();

      expect(mockScan).toHaveBeenCalled();
      expect(consoleErrorMock).toHaveBeenCalledWith(
        'Network printer scan failed:',
        expect.any(Error),
      );
      expect(printers).toEqual([]);

      consoleErrorMock.mockRestore();
    });
  });
});
