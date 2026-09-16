import { describe, expect, it } from 'vitest';
import updatePolicy from './updatePolicy.cjs';

const { hasPublisherName, resolveUpdatePolicy } = updatePolicy;

describe('hasPublisherName', () => {
  it('accepts the scalar form', () => {
    expect(hasPublisherName('provider: github\npublisherName: Acme Ltd\n')).toBe(true);
  });

  it('accepts the YAML list form', () => {
    expect(hasPublisherName('publisherName:\n  - Acme Ltd\n  - Acme Inc\n')).toBe(true);
  });

  // Each of these would otherwise be read as "a publisher is configured", which
  // re-enables unattended installation of an update nothing has verified.
  it.each([
    ['an empty list', 'publisherName:\nprovider: github\n'],
    ['an explicit null', 'publisherName: null\n'],
    ['a tilde null', 'publisherName: ~\n'],
    ['an empty inline list', 'publisherName: []\n'],
    ['a commented-out key', '# publisherName: Acme Ltd\n'],
    ['an absent key', 'provider: github\nowner: someone\n'],
    ['an empty document', ''],
  ])('rejects %s', (_label, yml) => expect(hasPublisherName(yml)).toBe(false));

  it.each([
    ['a non-string', 42],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s without throwing', (_label, value) => expect(hasPublisherName(value)).toBe(false));

  it('handles CRLF line endings', () => {
    expect(hasPublisherName('provider: github\r\npublisherName: Acme Ltd\r\n')).toBe(true);
  });

  it('does not match a key that merely ends in publisherName', () => {
    expect(hasPublisherName('xpublisherName: Acme Ltd\n')).toBe(false);
  });
});

describe('resolveUpdatePolicy', () => {
  it('does nothing at all in a dev build', () => {
    expect(resolveUpdatePolicy({ signatureVerified: true, isPackaged: false })).toMatchObject({
      enabled: false,
      autoDownload: false,
      installSilently: false,
      reason: 'dev-build',
    });
  });

  // The whole point of the module: electron-updater only verifies a signature
  // when app-update.yml carries a publisherName. Without one, downloading is
  // fine but running the installer is handing elevated execution to whoever
  // served the file.
  it('downloads but never self-installs when nothing verified the build', () => {
    const policy = resolveUpdatePolicy({ signatureVerified: false, isPackaged: true });
    expect(policy).toMatchObject({
      enabled: true,
      autoDownload: true,
      autoInstallOnAppQuit: false,
      installSilently: false,
      reason: 'unverified-no-publisher-name',
    });
  });

  it('installs unattended only on a genuinely verified build', () => {
    expect(resolveUpdatePolicy({ signatureVerified: true, isPackaged: true })).toMatchObject({
      enabled: true,
      autoDownload: true,
      autoInstallOnAppQuit: true,
      installSilently: true,
      reason: 'signature-verified',
    });
  });

  it('never installs silently in any unpackaged case', () => {
    for (const signatureVerified of [true, false]) {
      expect(resolveUpdatePolicy({ signatureVerified, isPackaged: false }).installSilently).toBe(
        false,
      );
    }
  });
});
