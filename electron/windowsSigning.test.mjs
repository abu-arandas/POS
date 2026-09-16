import { describe, expect, it } from 'vitest';
import windowsSigning from './windowsSigning.cjs';

const { resolveWindowsSigning, AZURE_VARS, SIGNTOOL_VARS } = windowsSigning;

const AZURE_ENV = {
  AZURE_TENANT_ID: 'tenant',
  AZURE_CLIENT_ID: 'client',
  AZURE_CLIENT_SECRET: 'secret',
  AZURE_CODE_SIGNING_ENDPOINT: 'https://eus.codesigning.azure.net',
  AZURE_CODE_SIGNING_ACCOUNT_NAME: 'account',
  AZURE_CERT_PROFILE_NAME: 'profile',
  WINDOWS_PUBLISHER_NAME: 'CN=Example Ltd',
};

const SIGNTOOL_ENV = { CSC_LINK: 'cert.pfx', CSC_KEY_PASSWORD: 'hunter2' };

describe('resolveWindowsSigning', () => {
  describe('unsigned', () => {
    it('falls back to unsigned with nothing configured', () => {
      expect(resolveWindowsSigning({})).toEqual({
        mode: 'none',
        publisherName: null,
        winOverrides: {},
      });
    });

    it('treats blank and whitespace-only values as absent', () => {
      expect(resolveWindowsSigning({ CSC_LINK: '   ', AZURE_TENANT_ID: '' }).mode).toBe('none');
    });

    // An unsigned build claiming a publisher would put a publisherName into
    // app-update.yml, and updatePolicy.cjs reads exactly that to decide whether
    // to install updates unattended — re-enabling it with nothing verifying who
    // built the installer.
    it('refuses to carry a publisher name into an unsigned build', () => {
      const signing = resolveWindowsSigning({ WINDOWS_PUBLISHER_NAME: 'CN=Example Ltd' });
      expect(signing.mode).toBe('none');
      expect(signing.publisherName).toBeNull();
      expect(signing.winOverrides).toEqual({});
    });
  });

  describe('azure', () => {
    it('produces the azureSignOptions block with a publisher name', () => {
      const signing = resolveWindowsSigning(AZURE_ENV);
      expect(signing.mode).toBe('azure');
      expect(signing.publisherName).toBe('CN=Example Ltd');
      expect(signing.winOverrides.publisherName).toBe('CN=Example Ltd');
      expect(signing.winOverrides.azureSignOptions).toMatchObject({
        endpoint: 'https://eus.codesigning.azure.net',
        codeSigningAccountName: 'account',
        certificateProfileName: 'profile',
      });
    });

    it('trims surrounding whitespace out of the values', () => {
      const signing = resolveWindowsSigning({
        ...AZURE_ENV,
        AZURE_CERT_PROFILE_NAME: '  profile  ',
        WINDOWS_PUBLISHER_NAME: '  CN=Example Ltd  ',
      });
      expect(signing.winOverrides.azureSignOptions.certificateProfileName).toBe('profile');
      expect(signing.publisherName).toBe('CN=Example Ltd');
    });

    // A half-configured setup is an error, never a quiet unsigned build: one
    // mistyped secret name would otherwise ship an installer that looks exactly
    // like a successful signed one.
    it.each(AZURE_VARS.filter((name) => name !== 'WINDOWS_PUBLISHER_NAME'))(
      'throws when %s is missing',
      (missing) => {
        const env = { ...AZURE_ENV };
        delete env[missing];
        expect(() => resolveWindowsSigning(env)).toThrow(/partially configured/);
      },
    );

    // Azure cannot derive the publisher from the certificate the way signtool
    // can, so without this the build is signed but updates are never verified.
    it('throws when the publisher name is missing', () => {
      const env = { ...AZURE_ENV };
      delete env.WINDOWS_PUBLISHER_NAME;
      expect(() => resolveWindowsSigning(env)).toThrow(/WINDOWS_PUBLISHER_NAME is required/);
    });
  });

  describe('signtool', () => {
    it('leaves electron-builder to read CSC_* itself', () => {
      expect(resolveWindowsSigning(SIGNTOOL_ENV)).toEqual({
        mode: 'signtool',
        publisherName: null,
        winOverrides: {},
      });
    });

    it('passes an explicit publisher name through when one is given', () => {
      const signing = resolveWindowsSigning({
        ...SIGNTOOL_ENV,
        WINDOWS_PUBLISHER_NAME: 'CN=Example Ltd',
      });
      expect(signing.winOverrides).toEqual({ publisherName: 'CN=Example Ltd' });
    });

    it.each(SIGNTOOL_VARS)('throws when %s is missing', (missing) => {
      const env = { ...SIGNTOOL_ENV };
      delete env[missing];
      expect(() => resolveWindowsSigning(env)).toThrow(/partially configured/);
    });
  });

  it('refuses both signing paths at once, which electron-builder cannot express', () => {
    expect(() => resolveWindowsSigning({ ...AZURE_ENV, ...SIGNTOOL_ENV })).toThrow(
      /accepts only one/,
    );
  });
});
