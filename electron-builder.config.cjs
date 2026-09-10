// electron-builder configuration.
//
// This lives here rather than under `build` in package.json because the Windows
// signing block has to be conditional: `signtoolOptions` and `azureSignOptions`
// are mutually exclusive, and `publisherName` must be absent entirely on an
// unsigned build (see electron/windowsSigning.cjs for why). Static JSON cannot
// express that.

const { resolveWindowsSigning } = require('./electron/windowsSigning.cjs');

const signing = resolveWindowsSigning(process.env);

// One line in the build log saying which path was taken, so an unsigned build
// is never mistaken for a signed one when reading CI output.
const description = {
  azure: 'Azure Trusted Signing',
  signtool: '.pfx certificate via signtool',
  none: 'UNSIGNED — Windows will warn on download and on first run',
}[signing.mode];
console.log(`[electron-builder] Windows code signing: ${description}`);

module.exports = {
  appId: 'com.eapos.app',
  productName: 'EA POS',
  copyright: 'Copyright © 2026 abu-arandas',
  artifactName: 'EA-POS-Setup-${version}.${ext}',
  directories: {
    output: 'release',
    buildResources: 'buildResources',
  },
  publish: [
    {
      provider: 'github',
      owner: 'abu-arandas',
      repo: 'POS',
    },
  ],
  win: {
    target: ['nsis'],
    requestedExecutionLevel: 'asInvoker',
    verifyUpdateCodeSignature: true,
    icon: 'buildResources/icon.ico',
    ...signing.winOverrides,
  },
  nsis: {
    oneClick: false,
    perMachine: true,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    runAfterFinish: true,
    shortcutName: 'EA POS',
  },
  files: ['dist/**/*', 'electron/**/*'],
};
