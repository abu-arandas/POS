import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// Build-time CommonJS, loaded the way electron-builder loads it.
const require = createRequire(import.meta.url);
const { resolveWindowsSigning } = require('../../electron/windowsSigning.cjs');

const AZURE = {
  AZURE_TENANT_ID: 'tenant',
  AZURE_CLIENT_ID: 'client',
  AZURE_CLIENT_SECRET: 'secret',
  AZURE_CODE_SIGNING_ENDPOINT: 'https://eus.codesigning.azure.net/',
  AZURE_CODE_SIGNING_ACCOUNT_NAME: 'ea-pos-signing',
  AZURE_CERT_PROFILE_NAME: 'ea-pos-public',
  WINDOWS_PUBLISHER_NAME: 'CN=Example Ltd, O=Example Ltd, C=JO',
};

const SIGNTOOL = { CSC_LINK: 'base64-pfx', CSC_KEY_PASSWORD: 'pw' };

const without = (env: Record<string, string>, key: string): Record<string, string> =>
  Object.fromEntries(Object.entries(env).filter(([name]) => name !== key));

describe('resolveWindowsSigning', () => {
  it('falls back to an unsigned build when nothing is configured', () => {
    const resolved = resolveWindowsSigning({});
    expect(resolved.mode).toBe('none');
    expect(resolved.winOverrides).toEqual({});
  });

  it('never carries a publisher name into an unsigned build', () => {
    // app-update.yml is what updatePolicy.cjs reads to decide whether signature
    // verification is genuinely in force. An unsigned build claiming a
    // publisher would re-enable unattended updates with nothing checking who
    // built the installer — the exact hole updatePolicy.cjs exists to close.
    const resolved = resolveWindowsSigning({ WINDOWS_PUBLISHER_NAME: 'CN=Example Ltd' });
    expect(resolved.mode).toBe('none');
    expect(resolved.publisherName).toBeNull();
    expect(resolved.winOverrides).toEqual({});
  });

  it('uses signtool when a .pfx and its password are present', () => {
    const resolved = resolveWindowsSigning(SIGNTOOL);
    expect(resolved.mode).toBe('signtool');
    // electron-builder reads CSC_LINK itself and derives the publisher from the
    // certificate subject, so there is nothing to override.
    expect(resolved.winOverrides).toEqual({});
    expect(resolved.winOverrides).not.toHaveProperty('azureSignOptions');
  });

  it('honours an explicit publisher name on the signtool path', () => {
    const resolved = resolveWindowsSigning({ ...SIGNTOOL, WINDOWS_PUBLISHER_NAME: 'CN=Example' });
    expect(resolved.winOverrides).toEqual({ publisherName: 'CN=Example' });
  });

  it('configures Azure Trusted Signing from the service-principal variables', () => {
    const resolved = resolveWindowsSigning(AZURE);
    expect(resolved.mode).toBe('azure');
    expect(resolved.winOverrides.publisherName).toBe(AZURE.WINDOWS_PUBLISHER_NAME);
    expect(resolved.winOverrides.azureSignOptions).toEqual({
      publisherName: AZURE.WINDOWS_PUBLISHER_NAME,
      endpoint: AZURE.AZURE_CODE_SIGNING_ENDPOINT,
      codeSigningAccountName: AZURE.AZURE_CODE_SIGNING_ACCOUNT_NAME,
      certificateProfileName: AZURE.AZURE_CERT_PROFILE_NAME,
    });
  });

  it('requires an explicit publisher name on Azure, which cannot derive one', () => {
    // app-builder-lib's WindowsSignAzureManager returns null for the publisher
    // name (there is a TODO next to it). Without this guard the build is signed
    // but app-update.yml ships no publisherName, so electron-updater never
    // verifies an update signature and nothing says why.
    expect(() => resolveWindowsSigning(without(AZURE, 'WINDOWS_PUBLISHER_NAME'))).toThrow(
      /WINDOWS_PUBLISHER_NAME/,
    );
  });

  it('rejects a half-configured setup instead of quietly building unsigned', () => {
    // One mistyped secret name would otherwise produce an unsigned installer
    // indistinguishable, in the build log, from a successful signed one.
    expect(() => resolveWindowsSigning(without(AZURE, 'AZURE_CLIENT_SECRET'))).toThrow(
      /AZURE_CLIENT_SECRET/,
    );

    expect(() => resolveWindowsSigning({ CSC_LINK: 'base64-pfx' })).toThrow(/CSC_KEY_PASSWORD/);
  });

  it('refuses both signing paths at once, which electron-builder rejects', () => {
    expect(() => resolveWindowsSigning({ ...AZURE, ...SIGNTOOL })).toThrow(/only one/);
  });

  it('treats blank and whitespace-only values as unset', () => {
    expect(resolveWindowsSigning({ CSC_LINK: '   ', CSC_KEY_PASSWORD: '' }).mode).toBe('none');
  });

  it('trims surrounding whitespace off values that reach the config', () => {
    const padded = Object.fromEntries(Object.entries(AZURE).map(([k, v]) => [k, `  ${v}  `]));
    const resolved = resolveWindowsSigning(padded);
    expect(resolved.winOverrides.azureSignOptions.endpoint).toBe(AZURE.AZURE_CODE_SIGNING_ENDPOINT);
    expect(resolved.publisherName).toBe(AZURE.WINDOWS_PUBLISHER_NAME);
  });
});
