# Installing EA POS on Windows

The Windows installer is built by the **Build Windows Installer** workflow
(`.github/workflows/build-windows.yml`) and published two ways:

- as a workflow **artifact** (`EA-POS-Windows-Installer`) on every run, and
- as a **GitHub Release** asset on pushes to `main` and manual runs.

The file is named `EA-POS-Setup-<version>.exe` (e.g. `EA-POS-Setup-1.0.0.exe`).

## Installing

1. Download `EA-POS-Setup-<version>.exe`.
2. Run it. The installer asks for elevation — see [Why it needs
   administrator](#why-it-needs-administrator) below.
3. Choose an install directory (or accept the default) and finish.

The app installs per-machine with a desktop and Start Menu shortcut named
**EA POS**.

## The SmartScreen warning

On an unsigned build, Windows shows:

> **Windows protected your PC** — Microsoft Defender SmartScreen prevented an
> unrecognized app from starting.

Choose **More info → Run anyway**.

This is expected when no code-signing certificate is configured, and it is not a
sign that anything is wrong with the download — SmartScreen warns about any
binary whose publisher it does not recognise. To verify you have the right file,
compare it against the artifact attached to the workflow run that built it.

## Removing the warning permanently (code signing)

Sign the installer and the warning goes away — immediately with an EV
certificate, or gradually as reputation accrues with an OV certificate.

Add two repository secrets (**Settings → Secrets and variables → Actions**):

| Secret                     | Value                                  |
| -------------------------- | -------------------------------------- |
| `WINDOWS_CSC_LINK`         | The `.pfx` certificate, base64-encoded |
| `WINDOWS_CSC_KEY_PASSWORD` | That certificate's password            |

The workflow already passes both to `electron-builder` as `CSC_LINK` /
`CSC_KEY_PASSWORD`. With the secrets absent the build simply produces an
unsigned installer; nothing else about the build changes.

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

Because the app ships with `requestedExecutionLevel: "requireAdministrator"`,
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

## Why it needs administrator

`package.json` sets `requestedExecutionLevel: "requireAdministrator"` and
`perMachine: true`. Elevation is needed for the per-machine install location and
for driving USB thermal printers through the Windows spooler's RAW datatype (see
the `print-raw` handler in `electron/main.cjs`). Keep this in mind when
deploying: everything the renderer can reach runs on an elevated process, which
is why navigation is locked down and unattended updates are gated on a verified
signature.

## Building locally

You need Node 22+ (Electron 43 requires `>= 22.12.0`):

```bash
npm ci
npm run electron:build
```

Output lands in `release/`:

- `release/EA-POS-Setup-<version>.exe` — the installer
- `release/win-unpacked/EA POS.exe` — portable, runs without installing

If the build fails with `EPERM`, close any Explorer window or terminal sitting
inside `release/` — Windows locks files that are being viewed.
