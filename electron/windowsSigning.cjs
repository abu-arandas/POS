// Decides which Windows code-signing path a build should take, from the
// environment alone.
//
// There are two, and they are mutually exclusive in electron-builder — setting
// both `signtoolOptions` and `azureSignOptions` is a configuration error:
//
//   signtool  A .pfx file plus its password, via CSC_LINK / CSC_KEY_PASSWORD.
//             Only usable if you already hold an exportable certificate. Since
//             the CA/Browser Forum raised the key-storage requirement in June
//             2023, public CAs no longer issue code-signing keys you can export
//             to a .pfx — they live on a hardware token or in an HSM. So this
//             path is for existing certificates, not newly bought ones.
//
//   azure     Azure Trusted Signing. Microsoft holds the key; the runner
//             authenticates with a service principal. This is the path that
//             works on a hosted CI runner with a certificate bought today.
//
// The important asymmetry: signtool derives `publisherName` from the
// certificate's subject on its own, and Azure Trusted Signing does not.
// app-builder-lib's WindowsSignAzureManager returns null for the publisher name
// with a TODO next to it, so on Azure it must be supplied explicitly or
// app-update.yml ships without one — and electron/updatePolicy.cjs then refuses
// unattended updates on a build that is, in fact, properly signed.
//
// Kept pure and dependency-free so it unit-tests off-device, like
// updatePolicy.cjs and validation.cjs.

// Azure Trusted Signing needs a service principal (read by the TrustedSigning
// PowerShell module through Azure's EnvironmentCredential) plus the coordinates
// of the certificate profile to sign with.
const AZURE_CREDENTIAL_VARS = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'];
const AZURE_PROFILE_VARS = [
  'AZURE_CODE_SIGNING_ENDPOINT',
  'AZURE_CODE_SIGNING_ACCOUNT_NAME',
  'AZURE_CERT_PROFILE_NAME',
];
const AZURE_VARS = [...AZURE_CREDENTIAL_VARS, ...AZURE_PROFILE_VARS];

const SIGNTOOL_VARS = ['CSC_LINK', 'CSC_KEY_PASSWORD'];

function present(env, name) {
  const value = env[name];
  return typeof value === 'string' && value.trim() !== '';
}

function missingFrom(env, names) {
  return names.filter((name) => !present(env, name));
}

// A half-configured signing setup is an error, never a quiet fall back to an
// unsigned build: one mistyped secret name would otherwise ship an unsigned
// installer that looks exactly like a successful signed one.
function resolveWindowsSigning(env = {}) {
  const azureSet = AZURE_VARS.filter((name) => present(env, name));
  const signtoolSet = SIGNTOOL_VARS.filter((name) => present(env, name));
  const publisherName = present(env, 'WINDOWS_PUBLISHER_NAME')
    ? env.WINDOWS_PUBLISHER_NAME.trim()
    : null;

  if (azureSet.length > 0 && signtoolSet.length > 0) {
    throw new Error(
      'Both Azure Trusted Signing and .pfx signtool variables are set. electron-builder ' +
        'accepts only one: unset either the AZURE_* variables or CSC_LINK/CSC_KEY_PASSWORD.',
    );
  }

  if (azureSet.length > 0) {
    const missing = missingFrom(env, AZURE_VARS);
    if (missing.length > 0) {
      throw new Error(
        `Azure Trusted Signing is partially configured — missing: ${missing.join(', ')}. ` +
          'Set every variable or none, so a typo cannot silently produce an unsigned build.',
      );
    }
    if (!publisherName) {
      // Not a nicety. Without it the build is signed but app-update.yml carries
      // no publisherName, so updatePolicy.cjs downgrades to operator-confirmed
      // updates and nothing explains why.
      throw new Error(
        'WINDOWS_PUBLISHER_NAME is required with Azure Trusted Signing: unlike signtool, it ' +
          'cannot derive the publisher from the certificate, and without it electron-updater ' +
          "never verifies an update signature. Use the certificate profile's subject exactly, " +
          'e.g. "CN=Example Ltd, O=Example Ltd, L=…, C=…".',
      );
    }
    return {
      mode: 'azure',
      publisherName,
      winOverrides: {
        publisherName,
        azureSignOptions: {
          publisherName,
          endpoint: env.AZURE_CODE_SIGNING_ENDPOINT.trim(),
          codeSigningAccountName: env.AZURE_CODE_SIGNING_ACCOUNT_NAME.trim(),
          certificateProfileName: env.AZURE_CERT_PROFILE_NAME.trim(),
        },
      },
    };
  }

  if (signtoolSet.length > 0) {
    const missing = missingFrom(env, SIGNTOOL_VARS);
    if (missing.length > 0) {
      throw new Error(
        `.pfx signing is partially configured — missing: ${missing.join(', ')}. ` +
          'Set both CSC_LINK and CSC_KEY_PASSWORD, or neither.',
      );
    }
    // electron-builder reads CSC_LINK / CSC_KEY_PASSWORD from the environment
    // itself, and derives publisherName from the certificate subject, so the
    // only thing worth overriding is an explicitly supplied publisher name.
    return {
      mode: 'signtool',
      publisherName,
      winOverrides: publisherName ? { publisherName } : {},
    };
  }

  // Unsigned. publisherName is deliberately NOT carried over even when the
  // variable is set: app-update.yml is what updatePolicy.cjs reads to decide
  // whether signature verification is genuinely in force, and an unsigned build
  // claiming a publisher would re-enable unattended updates with nothing
  // actually checking who built the installer.
  return { mode: 'none', publisherName: null, winOverrides: {} };
}

module.exports = { resolveWindowsSigning, AZURE_VARS, SIGNTOOL_VARS };
