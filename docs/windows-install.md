# Installing EA POS on Windows

The Windows installer is built by the **Build Windows Installer** workflow
(`.github/workflows/build-windows.yml`) and published two ways:

- as a workflow **artifact** (`EA-POS-Windows-Installer`) on every run, and
- as a **GitHub Release** asset on pushes to `main` and manual runs.

The file is named `EA-POS-Setup-<version>.exe` (e.g. `EA-POS-Setup-1.0.0.exe`).

## Installing

1. Download `EA-POS-Setup-<version>.exe`.
2. Run it. The per-machine installer asks for elevation; the installed app
   itself runs with the current user's privileges.
3. Choose an install directory (or accept the default) and finish.

The app installs per-machine with a desktop and Start Menu shortcut named
**EA POS**.

## The SmartScreen warning

A public installer should be signed before it is distributed to customers. Windows shows the following warning for an unsigned build or for a signed build whose publisher has not established reputation yet:

> **Windows protected your PC** — Microsoft Defender SmartScreen prevented an
> unrecognized app from starting.

For an unsigned internal artifact, choose **More info → Run anyway** only when you have independently verified the file and intended to test that build. Do not bypass this warning for a customer-facing release.

This warning is expected when no trusted code-signing certificate is configured, and it does not by itself prove that the file is malicious. Verify the release URL, compare the SHA-256 checksum when one is provided, and inspect the publisher in **Properties → Digital Signatures**. Public Releases are now gated on successful Authenticode verification, but SmartScreen reputation can still take time to build for a newly signed publisher.

## Removing the warning permanently (code signing)

Sign the installer with a trusted certificate. This gives Windows a recognized publisher; SmartScreen reputation may still build gradually for a new publisher, even when the signature is valid.

Add two repository secrets (**Settings → Secrets and variables → Actions**):

| Secret                     | Value                                  |
| -------------------------- | -------------------------------------- |
| `WINDOWS_CSC_LINK`         | The `.pfx` certificate, base64-encoded |
| `WINDOWS_CSC_KEY_PASSWORD` | That certificate's password            |

The workflow already passes both to `electron-builder` as `CSC_LINK` / `CSC_KEY_PASSWORD`. It verifies the Authenticode signature on Windows before publishing a public GitHub Release. If either secret is absent, the build remains available as an unsigned workflow artifact for internal testing, but the workflow does not publish an unsigned public Release.

To base64-encode the certificate:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx")) | Set-Clipboard
```

## Signing also gates automatic updates

This matters more than the SmartScreen prompt.

`electron-updater` only actually **verifies** a downloaded update's signature
when a `publisherName` is baked into `app-update.yml` — see
`NsisUpdater#verifySignature`, which returns `null` (read by the caller as "no
problem") when `publisherName` is unset. `win.verifyUpdateCodeSignature`
defaulting to `true` does _not_ change that.

The installed app uses `requestedExecutionLevel: "asInvoker"`, so
silently running an unverified installer would mean granting elevated code
execution to whoever served the file. So `electron/updatePolicy.cjs` refuses it:

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

Signing sets `publisherName` automatically from the certificate's subject; you
can also set it explicitly under `build.win.publisherName` in `package.json`.

## Installer elevation and application privileges

`package.json` sets `requestedExecutionLevel: "asInvoker"` and the NSIS installer
remains `perMachine: true`. Windows may elevate the installer itself to write the
per-machine installation directory, but the running POS application and its
renderer stay at the launching user's privilege level. USB thermal printers are
accessed through the Windows spooler RAW path (see the `print-raw` handler in
`electron/main.cjs`) without requiring the entire application to run as
administrator. Navigation remains locked down and unattended updates remain
gated on a verified signature as defense in depth.

## Building locally

You need Node.js `>=22.22.2`, matching the locked dependency engine floor:

```bash
npm ci
npm run electron:build
```

Output lands in `release/`:

- `release/EA-POS-Setup-<version>.exe` — the installer
- `release/win-unpacked/EA POS.exe` — portable, runs without installing

If the build fails with `EPERM`, close any Explorer window or terminal sitting
inside `release/` — Windows locks files that are being viewed.
