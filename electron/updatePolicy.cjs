// Decides how much the auto-updater is allowed to do on its own.
//
// Why this exists: electron-updater only actually verifies an update's code
// signature when a `publisherName` is baked into app-update.yml. Look at
// NsisUpdater#verifySignature — when publisherName is null it returns null,
// which the caller reads as "no problem", and the downloaded installer is run.
// `win.verifyUpdateCodeSignature` defaulting to true does NOT change that; the
// publisher name is the thing that gates it.
//
// So an unsigned build with autoDownload + quitAndInstall gives anyone who can
// serve a release artifact silent code execution — and this app ships with
// requestedExecutionLevel "requireAdministrator", so that execution is elevated.
// Unless signature verification is genuinely in force, updates are downloaded
// and staged but never installed without a person deciding to.
//
// Pure and dependency-free so it can be unit-tested off-device.

// True when app-update.yml carries a usable publisherName — scalar
// (`publisherName: Acme Ltd`) or YAML list form. A commented-out, empty, or
// explicitly null value does not count.
function hasPublisherName(appUpdateYml) {
  if (typeof appUpdateYml !== 'string' || appUpdateYml.length === 0) return false;
  const lines = appUpdateYml.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const match = /^publisherName:(.*)$/.exec(lines[i]);
    if (!match) continue;

    const inline = match[1].trim();
    if (inline && inline !== 'null' && inline !== '~' && inline !== '[]') {
      return true; // scalar form
    }
    // List form: the entries follow on subsequent indented `- item` lines.
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (/^\s*$/.test(next)) continue;
      if (/^\s+-\s*\S/.test(next)) return true;
      break; // a new top-level key — the list was empty
    }
    return false;
  }
  return false;
}

// `signatureVerified` should come from hasPublisherName() on the real
// app-update.yml. Returns the flags to apply to electron-updater plus whether
// a downloaded update may be installed without asking.
function resolveUpdatePolicy({ signatureVerified, isPackaged }) {
  if (!isPackaged) {
    return {
      enabled: false,
      autoDownload: false,
      autoInstallOnAppQuit: false,
      installSilently: false,
      reason: 'dev-build',
    };
  }
  if (!signatureVerified) {
    return {
      enabled: true,
      // Still fetch, so the operator is told an update exists — but nothing is
      // executed on its own, because nothing checked who built it.
      autoDownload: true,
      autoInstallOnAppQuit: false,
      installSilently: false,
      reason: 'unverified-no-publisher-name',
    };
  }
  return {
    enabled: true,
    autoDownload: true,
    autoInstallOnAppQuit: true,
    installSilently: true,
    reason: 'signature-verified',
  };
}

module.exports = { hasPublisherName, resolveUpdatePolicy };
