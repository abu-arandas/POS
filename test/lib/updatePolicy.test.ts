import { describe, it, expect } from 'vitest';
// Main-process CommonJS module; tsconfig allowJs lets it type-check from here.
import { hasPublisherName, resolveUpdatePolicy } from '../../electron/updatePolicy.cjs';

describe('hasPublisherName', () => {
  it('accepts a scalar publisher name', () => {
    expect(hasPublisherName('provider: github\npublisherName: Acme Ltd\n')).toBe(true);
  });

  it('accepts the YAML list form', () => {
    expect(hasPublisherName('publisherName:\n  - Acme Ltd\n  - Acme Inc\n')).toBe(true);
  });

  it('rejects an absent key', () => {
    expect(hasPublisherName('provider: github\nowner: abu-arandas\n')).toBe(false);
  });

  it('rejects empty, null, and empty-list values', () => {
    expect(hasPublisherName('publisherName:\n')).toBe(false);
    expect(hasPublisherName('publisherName: null\n')).toBe(false);
    expect(hasPublisherName('publisherName: ~\n')).toBe(false);
    expect(hasPublisherName('publisherName: []\n')).toBe(false);
  });

  it('rejects an empty list followed by another key', () => {
    expect(hasPublisherName('publisherName:\nprovider: github\n')).toBe(false);
  });

  it('ignores a commented-out publisher name', () => {
    expect(hasPublisherName('# publisherName: Acme Ltd\nprovider: github\n')).toBe(false);
  });

  it('handles CRLF line endings and missing/!string input', () => {
    expect(hasPublisherName('provider: github\r\npublisherName: Acme Ltd\r\n')).toBe(true);
    expect(hasPublisherName('')).toBe(false);
    expect(hasPublisherName(undefined)).toBe(false);
    expect(hasPublisherName(null)).toBe(false);
  });
});

describe('resolveUpdatePolicy', () => {
  it('does nothing in a dev build', () => {
    const p = resolveUpdatePolicy({ signatureVerified: true, isPackaged: false });
    expect(p.enabled).toBe(false);
    expect(p.installSilently).toBe(false);
    expect(p.reason).toBe('dev-build');
  });

  it('installs unattended only when the signature is actually verified', () => {
    const p = resolveUpdatePolicy({ signatureVerified: true, isPackaged: true });
    expect(p.autoDownload).toBe(true);
    expect(p.autoInstallOnAppQuit).toBe(true);
    expect(p.installSilently).toBe(true);
    expect(p.reason).toBe('signature-verified');
  });

  // The security property this module exists for. electron-updater skips
  // signature verification entirely when app-update.yml has no publisherName,
  // and this app runs as administrator — so an unverified artifact must never
  // be executed without a person deciding to.
  it('refuses unattended installation for an unsigned build', () => {
    const p = resolveUpdatePolicy({ signatureVerified: false, isPackaged: true });
    expect(p.installSilently).toBe(false);
    expect(p.autoInstallOnAppQuit).toBe(false);
    expect(p.reason).toBe('unverified-no-publisher-name');
    // Still fetched, so the operator can be told an update exists.
    expect(p.autoDownload).toBe(true);
  });

  it('never installs silently without verification, whatever the packaging', () => {
    for (const isPackaged of [true, false]) {
      expect(resolveUpdatePolicy({ signatureVerified: false, isPackaged }).installSilently).toBe(
        false,
      );
    }
  });
});
