import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printReceipt } from '../../src/lib/hardwarePrint';
import { SaleTransaction, StoreSettings, PrinterConfig } from '../../src/types';

const baseSettings: StoreSettings = {
  storeName: 'Test Store',
  storeAddress: '1 Main St',
  storePhone: '555-0100',
  taxRate: 8.5,
  currency: '$',
  loyaltyPointsRate: 1,
  loyaltyPointValue: 0.05,
};

const baseTx: SaleTransaction = {
  id: 'TX-ABCD1234',
  date: '2026-07-16T10:00:00.000Z',
  items: [{ productId: 'p1', productName: 'Latte', price: 4.5, cost: 0.9, quantity: 2, total: 9 }],
  subtotal: 9,
  discount: 0,
  discountType: 'none',
  discountValue: 0,
  tax: 0.77,
  total: 9.77,
  paymentMethod: 'card',
  customerId: null,
  status: 'completed',
};

const basePrinter: PrinterConfig = {
  type: 'system',
  paperSize: '80mm',
  showBarcode: false,
  footerMessage: '',
  autoPrintOnCheckout: false,
};

// Global mocks for Electron and Web Serial APIs
let originalElectronAPI: any;
let originalNavigatorSerial: any;
let originalWindowOpen: any;

beforeEach(() => {
  originalElectronAPI = (window as any).electronAPI;
  originalNavigatorSerial = (navigator as any).serial;
  originalWindowOpen = window.open;

  (window as any).electronAPI = undefined;
  (navigator as any).serial = undefined;
  window.open = vi.fn();
});

afterEach(() => {
  (window as any).electronAPI = originalElectronAPI;
  (navigator as any).serial = originalNavigatorSerial;
  window.open = originalWindowOpen;
  vi.restoreAllMocks();
});

describe('printReceipt', () => {
  describe('Windows Spooler (windows)', () => {
    it('returns no-device if printerName is missing', async () => {
      const printer: PrinterConfig = { ...basePrinter, type: 'windows' };
      const outcome = await printReceipt(baseTx, baseSettings, printer);
      expect(outcome).toBe('no-device');
    });

    it('returns unsupported if electronAPI.printRaw is missing', async () => {
      const printer: PrinterConfig = { ...basePrinter, type: 'windows', printerName: 'MyPrinter' };
      const outcome = await printReceipt(baseTx, baseSettings, printer);
      expect(outcome).toBe('unsupported');
    });

    it('calls printRaw and returns printed on success', async () => {
      const printRawMock = vi.fn().mockResolvedValue(true);
      (window as any).electronAPI = { printRaw: printRawMock };
      const printer: PrinterConfig = { ...basePrinter, type: 'windows', printerName: 'MyPrinter' };

      const outcome = await printReceipt(baseTx, baseSettings, printer);
      expect(outcome).toBe('printed');
      expect(printRawMock).toHaveBeenCalled();
      expect(printRawMock.mock.calls[0][0].printerName).toBe('MyPrinter');
      expect(printRawMock.mock.calls[0][0].data).toBeInstanceOf(Array);
    });

    it('returns error if printRaw fails', async () => {
      const printRawMock = vi.fn().mockRejectedValue(new Error('fail'));
      (window as any).electronAPI = { printRaw: printRawMock };
      const printer: PrinterConfig = { ...basePrinter, type: 'windows', printerName: 'MyPrinter' };

      const outcome = await printReceipt(baseTx, baseSettings, printer);
      expect(outcome).toBe('error');
    });
  });

  describe('System Print (system)', () => {
    it('uses printHtml silent print if available in electronAPI', async () => {
      const printHtmlMock = vi.fn().mockResolvedValue(true);
      (window as any).electronAPI = { printHtml: printHtmlMock };
      const printer: PrinterConfig = { ...basePrinter, type: 'system', printerName: 'MyPrinter' };

      const outcome = await printReceipt(baseTx, baseSettings, printer);
      expect(outcome).toBe('printed');
      expect(printHtmlMock).toHaveBeenCalled();
      expect(printHtmlMock.mock.calls[0][0].deviceName).toBe('MyPrinter');
      expect(printHtmlMock.mock.calls[0][0].html).toContain('TX-ABCD1234');
    });

    it('falls back to window.open if printHtml is missing', async () => {
      const documentWriteMock = vi.fn();
      const documentCloseMock = vi.fn();
      const mockWindow = { document: { write: documentWriteMock, close: documentCloseMock } };
      (window as any).open = vi.fn().mockReturnValue(mockWindow);
      const printer: PrinterConfig = { ...basePrinter, type: 'system' };

      const outcome = await printReceipt(baseTx, baseSettings, printer);
      expect(outcome).toBe('printed');
      expect(window.open).toHaveBeenCalled();
      expect(documentWriteMock).toHaveBeenCalled();
      expect(documentCloseMock).toHaveBeenCalled();
    });

    it('returns popup-blocked if window.open returns null', async () => {
      (window as any).open = vi.fn().mockReturnValue(null);
      const printer: PrinterConfig = { ...basePrinter, type: 'system' };

      const outcome = await printReceipt(baseTx, baseSettings, printer);
      expect(outcome).toBe('popup-blocked');
    });
  });

  describe('Web Serial API (serial)', () => {
    it('returns unsupported if navigator.serial is missing', async () => {
      const printer: PrinterConfig = { ...basePrinter, type: 'serial', baudRate: 9600 };
      const outcome = await printReceipt(baseTx, baseSettings, printer);
      expect(outcome).toBe('unsupported');
    });

    it('writes to the serial port and returns printed on success', async () => {
      const writeMock = vi.fn().mockResolvedValue(undefined);
      const releaseLockMock = vi.fn();
      const getWriterMock = vi
        .fn()
        .mockReturnValue({ write: writeMock, releaseLock: releaseLockMock });
      const openMock = vi.fn().mockResolvedValue(undefined);
      const closeMock = vi.fn().mockResolvedValue(undefined);
      const portMock = { open: openMock, close: closeMock, writable: { getWriter: getWriterMock } };
      const requestPortMock = vi.fn().mockResolvedValue(portMock);

      (navigator as any).serial = { requestPort: requestPortMock };
      const printer: PrinterConfig = { ...basePrinter, type: 'serial', baudRate: 9600 };

      const outcome = await printReceipt(baseTx, baseSettings, printer);
      expect(outcome).toBe('printed');
      expect(requestPortMock).toHaveBeenCalled();
      expect(openMock).toHaveBeenCalledWith({ baudRate: 9600 });
      expect(writeMock).toHaveBeenCalled();
      expect(releaseLockMock).toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalled();
    });

    it('returns error if serial print fails before a port is selected', async () => {
      const requestPortMock = vi.fn().mockRejectedValue(new Error('fail'));
      (navigator as any).serial = { requestPort: requestPortMock };
      const printer: PrinterConfig = { ...basePrinter, type: 'serial', baudRate: 9600 };

      const outcome = await printReceipt(baseTx, baseSettings, printer);
      expect(outcome).toBe('error');
    });

    it('cleans up the writer and port when writing fails', async () => {
      const writeMock = vi.fn().mockRejectedValue(new Error('write failed'));
      const releaseLockMock = vi.fn();
      const getWriterMock = vi
        .fn()
        .mockReturnValue({ write: writeMock, releaseLock: releaseLockMock });
      const openMock = vi.fn().mockResolvedValue(undefined);
      const closeMock = vi.fn().mockResolvedValue(undefined);
      const portMock = { open: openMock, close: closeMock, writable: { getWriter: getWriterMock } };
      (navigator as any).serial = { requestPort: vi.fn().mockResolvedValue(portMock) };
      const printer: PrinterConfig = { ...basePrinter, type: 'serial', baudRate: 9600 };

      const outcome = await printReceipt(baseTx, baseSettings, printer);
      expect(outcome).toBe('error');
      expect(releaseLockMock).toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalled();
    });
  });

  describe('Network Print (network)', () => {
    it('returns no-device if ipAddress is missing', async () => {
      const printer: PrinterConfig = { ...basePrinter, type: 'network' };
      const outcome = await printReceipt(baseTx, baseSettings, printer);
      expect(outcome).toBe('no-device');
    });

    it('returns unsupported if electronAPI.printEscpos is missing', async () => {
      const printer: PrinterConfig = {
        ...basePrinter,
        type: 'network',
        ipAddress: '192.168.1.100',
      };
      const outcome = await printReceipt(baseTx, baseSettings, printer);
      expect(outcome).toBe('unsupported');
    });

    it('calls printEscpos and returns printed on success', async () => {
      const printEscposMock = vi.fn().mockResolvedValue(true);
      (window as any).electronAPI = { printEscpos: printEscposMock };
      const printer: PrinterConfig = {
        ...basePrinter,
        type: 'network',
        ipAddress: '192.168.1.100',
      };

      const outcome = await printReceipt(baseTx, baseSettings, printer);
      expect(outcome).toBe('printed');
      expect(printEscposMock).toHaveBeenCalled();
      expect(printEscposMock.mock.calls[0][0].ip).toBe('192.168.1.100');
      expect(printEscposMock.mock.calls[0][0].port).toBe(9100);
      expect(printEscposMock.mock.calls[0][0].data).toBeInstanceOf(Array);
    });

    it('returns error if printEscpos fails', async () => {
      const printEscposMock = vi.fn().mockRejectedValue(new Error('fail'));
      (window as any).electronAPI = { printEscpos: printEscposMock };
      const printer: PrinterConfig = {
        ...basePrinter,
        type: 'network',
        ipAddress: '192.168.1.100',
      };

      const outcome = await printReceipt(baseTx, baseSettings, printer);
      expect(outcome).toBe('error');
    });
  });

  describe('Unsupported types', () => {
    it('returns unsupported for bluetooth', async () => {
      const printer: PrinterConfig = { ...basePrinter, type: 'bluetooth' };
      const outcome = await printReceipt(baseTx, baseSettings, printer);
      expect(outcome).toBe('unsupported');
    });
  });
});
