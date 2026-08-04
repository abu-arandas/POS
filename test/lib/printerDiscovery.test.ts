import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { networkScanSupported } from '../../src/lib/printerDiscovery';

describe('printerDiscovery', () => {
  describe('networkScanSupported', () => {
    let originalElectronAPI: any;

    beforeEach(() => {
      originalElectronAPI = window.electronAPI;
    });

    afterEach(() => {
      window.electronAPI = originalElectronAPI;
    });

    it('returns false when window.electronAPI is undefined', () => {
      delete (window as any).electronAPI;
      expect(networkScanSupported()).toBe(false);
    });

    it('returns false when scanNetworkPrinters is missing from electronAPI', () => {
      window.electronAPI = {} as any;
      expect(networkScanSupported()).toBe(false);
    });

    it('returns true when scanNetworkPrinters is present on electronAPI', () => {
      window.electronAPI = {
        scanNetworkPrinters: async () => [],
      } as any;
      expect(networkScanSupported()).toBe(true);
    });
  });
});
