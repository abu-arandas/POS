# Installing EA POS on Windows

The Windows installer is built by the **Build Windows Installer** workflow
(`.github/workflows/build-windows.yml`) and published two ways:

- as a workflow **artifact** (`EA-POS-Windows-Installer`) on every run, and
- as a **GitHub Release** asset — automatically when the build is signed, or on
  a manual run with `publish_unsigned` ticked (marked as a pre-release).

The file is named `EA-POS-Setup-<version>.exe` (e.g. `EA-POS-Setup-1.0.0.exe`).
Every build also produces `SHA256SUMS.txt`.

## Installing

1. Download `EA-POS-Setup-<version>.exe`.
2. Verify it against the published checksum (see below).
3. Run it. The per-machine installer asks for elevation; the installed app
   itself runs with the current user's privileges.
4. Choose an install directory (or accept the default) and finish.

The app installs per-machine with a desktop and Start Menu shortcut named
**EA POS**.

### Verifying the download

```powershell
Get-FileHash -Algorithm SHA256 .\EA-POS-Setup-1.0.0.exe
```

Compare the result with the matching line in `SHA256SUMS.txt` from the same
release. On a signed build, also check **Properties → Digital Signatures** and
confirm the publisher is who you expect.

A checksum proves the file arrived intact from wherever you downloaded it. It
does **not** prove who built it — only a code signature does that.

## Why Windows warns, and what actually fixes it

Two different things warn about a downloaded `.exe`, and both are answered by
the same fix:

| Where               | What it looks like                                                        |
| ------------------- | ------------------------------------------------------------------------- |
| Chrome / Edge       | The download is blocked or flagged as "not commonly downloaded"           |
| Windows SmartScreen | "Windows protected your PC — prevented an unrecognized app from starting" |

Neither is a bug to work around, and no build setting removes them. They are
both reputation checks on **who signed the file**. An unsigned installer has no
publisher at all, so it can never accumulate reputation, however many people
download it.

**Signing the installer is the only fix.** Once signed, Chrome and Edge stop
blocking the download, and SmartScreen stops warning once the publisher builds
reputation — quickly for a busy publisher, over days or weeks for a brand new
one. Buying a certificate does not switch the warning off the same afternoon.

For an unsigned internal artifact, choose **More info → Run anyway** only when
you have verified the checksum and intended to test that build. Do not tell
customers to do this.

## Setting up code signing

Pick one of the two paths. `electron-builder.config.cjs` detects which from the
environment; setting variables from both, or only some of one, fails the build
rather than quietly producing an unsigned installer.

### Path 1 — Azure Trusted Signing (recommended)

This is the path that works with a certificate bought today, on a hosted CI
runner, with no hardware token. Microsoft holds the key; the runner
authenticates as a service principal. Cost is a small monthly fee plus usage.

You need an Azure subscription, a Trusted Signing account, and an identity
validation. Microsoft validates organisations (which generally requires the
legal entity to have existed for three years) and individuals.

Once the certificate profile exists, add these repository secrets under
**Settings → Secrets and variables → Actions**:

| Secret                            | Value                                                        |
| --------------------------------- | ------------------------------------------------------------ |
| `AZURE_TENANT_ID`                 | Service principal tenant                                     |
| `AZURE_CLIENT_ID`                 | Service principal application (client) ID                    |
| `AZURE_CLIENT_SECRET`             | Service principal secret                                     |
| `AZURE_CODE_SIGNING_ENDPOINT`     | Region endpoint, e.g. `https://eus.codesigning.azure.net/`   |
| `AZURE_CODE_SIGNING_ACCOUNT_NAME` | Trusted Signing account name                                 |
| `AZURE_CERT_PROFILE_NAME`         | Certificate profile name                                     |
| `WINDOWS_PUBLISHER_NAME`          | The certificate subject, **exactly** — see the warning below |

The service principal needs the **Trusted Signing Certificate Profile Signer**
role on the account.

> **`WINDOWS_PUBLISHER_NAME` is required here, and the build fails without it.**
> Unlike signtool, Azure Trusted Signing does not report the publisher back to
> electron-builder — `WindowsSignAzureManager` returns `null` for it. If it were
> left unset the installer would be correctly signed, but `app-update.yml` would
> ship with no `publisherName`, and `electron/updatePolicy.cjs` would downgrade
> to operator-confirmed updates on a build that is in fact verifiable. Use the
> subject exactly as it appears in the certificate profile, e.g.
> `CN=Example Ltd, O=Example Ltd, L=Amman, C=JO`.

### Path 2 — an existing `.pfx` certificate

| Secret                     | Value                                  |
| -------------------------- | -------------------------------------- |
| `WINDOWS_CSC_LINK`         | The `.pfx` certificate, base64-encoded |
| `WINDOWS_CSC_KEY_PASSWORD` | That certificate's password            |

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx")) | Set-Clipboard
```

`WINDOWS_PUBLISHER_NAME` is optional on this path — signtool derives the
publisher from the certificate subject.

> **This path only works with a certificate you already hold.** Since the
> CA/Browser Forum raised the key-storage requirement in June 2023, public CAs
> no longer issue code-signing keys you can export to a `.pfx`; they are
> delivered on a hardware token or held in an HSM. A hardware token cannot be
> plugged into a GitHub-hosted runner, so a newly purchased OV or EV certificate
> needs either Azure Trusted Signing, a cloud-HSM signing service from the CA
> (DigiCert KeyLocker, SSL.com eSigner, Certum and similar), or a self-hosted
> runner with the token attached.

### Verifying it took effect

The build log prints one line naming the path taken:

```
[electron-builder] Windows code signing: Azure Trusted Signing
```

The workflow then verifies the Authenticode signature on the runner and fails
the build if it is not `Valid`, so a signed release can never be published with
a broken or missing signature.

## Publishing

A **signed** build publishes a GitHub Release automatically on pushes to `main`
and on manual runs.

An **unsigned** build does not, by default — that gate is deliberate, so an
installer that will warn every customer is never published by accident. To
produce one anyway for internal testing, run the workflow manually
(**Actions → Build Windows Installer → Run workflow**) and tick
`publish_unsigned`. It is published as a **pre-release**, labelled as unsigned,
so `electron-updater` does not offer it to installed terminals.

Unsigned builds are always available as workflow artifacts regardless, which is
the better channel for internal testing — artifacts are not public.

## Automatic updates from signed GitHub Releases

The packaged application uses `electron-updater` with the GitHub provider
configured in `electron-builder.config.cjs` for `abu-arandas/POS`. Each release
must use a new semantic application version in `package.json`; changing only the
Git tag or workflow run number is not enough, because electron-updater compares
application versions.

The workflow publishes the installer together with `latest.yml` and the
generated blockmap file. Those metadata files are required by electron-updater
to discover the latest version, verify the download hash, and resume large
downloads safely.

At startup the packaged app checks for updates, then repeats the check every 24
hours, downloading an available update automatically.

`electron-updater` only actually **verifies** a downloaded update's signature
when a `publisherName` is baked into `app-update.yml` — see
`NsisUpdater#verifySignature`, which returns `null` (read by the caller as "no
problem") when `publisherName` is unset. `win.verifyUpdateCodeSignature`
defaulting to `true` does _not_ change that.

The installed app uses `requestedExecutionLevel: "asInvoker"`, so silently
running an unverified installer would mean granting elevated code execution to
whoever served the file. So `electron/updatePolicy.cjs` refuses it:

| Build                                 | Update is downloaded | Installed unattended           |
| ------------------------------------- | -------------------- | ------------------------------ |
| Unpackaged (dev)                      | no                   | no                             |
| Packaged, unsigned                    | yes, staged          | **no** — waits for an operator |
| Packaged, signed with `publisherName` | yes                  | yes                            |

On an unsigned build the operator applies a staged update from the app
(`installUpdate()`), which is a person deciding to trust the artifact. Sign the
build to restore unattended updates. The main process logs which mode it is in
at startup, and `check-for-updates` returns `policy` / `installSilently` so the
UI can say so.

Because an unsigned build never carries a publisher name — `resolveWindowsSigning`
drops `WINDOWS_PUBLISHER_NAME` entirely when nothing is signing — an unsigned
installer cannot claim a publisher it does not have and re-enable unattended
updates by accident.

## Cutting a release

```bash
npm version patch --no-git-tag-version
npm ci
npm run lint
npm test
npm run build
```

Commit the version change and push it to `main`. The workflow builds the
installer, verifies its signature, generates checksums, and creates the GitHub
Release tagged `v<version>`. Installed terminals discover the newer version on
their next startup or daily check.

## Installer elevation and application privileges

`electron-builder.config.cjs` sets `requestedExecutionLevel: "asInvoker"` and the
NSIS installer remains `perMachine: true`. Windows may elevate the installer
itself to write the per-machine installation directory, but the running POS
application and its renderer stay at the launching user's privilege level. USB
thermal printers are accessed through the Windows spooler RAW path (see the
`print-raw` handler in `electron/main.cjs`) without requiring the entire
application to run as administrator. Navigation remains locked down and
unattended updates remain gated on a verified signature as defense in depth.

## Building locally

You need Node.js `>=22.22.2`, matching the locked dependency engine floor:

```bash
npm ci
npm run electron:build
```

Output lands in `release/`:

- `release/EA-POS-Setup-<version>.exe` — the installer
- `release/win-unpacked/EA POS.exe` — portable, runs without installing

A local build is unsigned unless you export the signing variables into your own
shell first.

If the build fails with `EPERM`, close any Explorer window or terminal sitting
inside `release/` — Windows locks files that are being viewed.
