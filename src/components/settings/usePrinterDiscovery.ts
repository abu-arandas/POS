import { useCallback, useEffect, useState } from 'react';
import {
  detectPrinters,
  networkScanSupported,
  requestSerialPort,
  scanNetworkPrinters,
  type DetectedPrinter,
} from '../../lib/printerDiscovery';

export interface UsePrinterDiscoveryResult {
  detectedPrinters: DetectedPrinter[];
  printersLoading: boolean;
  scanningNetwork: boolean;
  refreshPrinters(): Promise<void>;
  pairSerial(): Promise<void>;
  scanNetwork(): Promise<void>;
}

/**
 * Owns printer discovery state and the asynchronous lifecycle shared by the
 * receipt-printer and kitchen-printer Settings panels.
 *
 * The hook deliberately keeps scan results local to the Settings screen. A
 * late result is ignored after the printer tab is left, and network results
 * replace only earlier network hits so repeated scans cannot accumulate stale
 * entries.
 */
export function usePrinterDiscovery(
  activeTab: string,
  autoScanPrinters: boolean,
): UsePrinterDiscoveryResult {
  const [detectedPrinters, setDetectedPrinters] = useState<DetectedPrinter[]>([]);
  const [printersLoading, setPrintersLoading] = useState(false);
  const [scanningNetwork, setScanningNetwork] = useState(false);

  const refreshPrinters = useCallback(async () => {
    setPrintersLoading(true);
    try {
      setDetectedPrinters(await detectPrinters());
    } finally {
      setPrintersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'printer') return;
    let cancelled = false;
    detectPrinters()
      .then((list) => {
        if (!cancelled) setDetectedPrinters(list);
      })
      .catch((error) => console.error('Printer detection failed:', error));
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const pairSerial = useCallback(async () => {
    if (await requestSerialPort()) await refreshPrinters();
  }, [refreshPrinters]);

  const scanNetwork = useCallback(async () => {
    setScanningNetwork(true);
    try {
      const networkPrinters = await scanNetworkPrinters();
      setDetectedPrinters((previous) => [
        ...previous.filter((printer) => printer.kind !== 'network'),
        ...networkPrinters,
      ]);
    } finally {
      setScanningNetwork(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'printer' || !autoScanPrinters || !networkScanSupported()) return;
    let cancelled = false;
    scanNetworkPrinters()
      .then((list) => {
        if (!cancelled && list.length > 0) {
          setDetectedPrinters((previous) => [
            ...previous.filter((printer) => printer.kind !== 'network'),
            ...list,
          ]);
        }
      })
      .catch((error) => console.error('Auto network-printer scan failed:', error));
    return () => {
      cancelled = true;
    };
  }, [activeTab, autoScanPrinters]);

  return {
    detectedPrinters,
    printersLoading,
    scanningNetwork,
    refreshPrinters,
    pairSerial,
    scanNetwork,
  };
}
