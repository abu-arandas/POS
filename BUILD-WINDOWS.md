# Building the EA POS Windows Installer (`.exe`)

EA POS ships in three forms:

| Form | What it is | How to get it |
| --- | --- | --- |
| **Portable HTML** | One self-contained `EA POS.html` you double-click. No install. | `npm run portable` → `portable/index.html` |
| **Windows installer** | Native `EA-POS-Setup-<version>.exe` with Start-menu/desktop shortcuts. Adds the Wi-Fi QR-menu server and direct TCP thermal-printer support. | GitHub Actions (below) or a local build |
| **Unpacked app** | `EA POS.exe` you can run without installing. | `release/win-unpacked/` after a local build |

The installer needs the Electron Windows runtime and electron-builder's
NSIS/winCodeSign toolchain, which are downloaded from GitHub at build time.
That download is blocked inside the Claude Code cloud sandbox (its network
policy only reaches the npm/PyPI/crates registries and this one repo), so the
installer is built on a real Windows environment instead — either GitHub's
runners or your own PC.

---

## Option A — Build on GitHub Actions (no local setup)

A workflow at `.github/workflows/build-windows.yml` builds the installer on a
`windows-latest` runner every time the `claude/portable-build-delivery-hgp418`
branch is pushed (and via **Actions → Build Windows Installer → Run workflow**
once the workflow is on the default branch).

Each run:

1. Installs dependencies (`npm ci`) and builds the renderer (`npm run build`).
2. Packages the installer with `electron-builder --win`.
3. Uploads `EA-POS-Setup-<version>.exe` as a workflow **artifact**.
4. Publishes it as a **GitHub Release** asset (`win-build-<run number>` tag)
   when the workflow token has write access.

**To download the finished `.exe`:**

- **Release:** repo → **Releases** → newest `EA POS Windows Installer` →
  download `EA-POS-Setup-<version>.exe`, or
- **Artifact:** repo → **Actions** → the latest *Build Windows Installer* run →
  **Artifacts** → `EA-POS-Windows-Installer`.

Because the binary is unsigned, Windows SmartScreen shows a
"Windows protected your PC" prompt on first launch — click **More info →
Run anyway**. (Code signing needs a paid certificate; see below.)

---

## Option B — Build on your own Windows PC

Requirements: **Windows 10/11**, **Node 18+** (`node -v`), and Git. No Visual
Studio Build Tools are needed — all native dependencies are prebuilt.

```powershell
git clone https://github.com/abu-arandas/POS.git
cd POS
git checkout claude/portable-build-delivery-hgp418
npm install
npm run electron:build
```

Output in `release\`:

- `EA-POS-Setup-1.0.0.exe` — the installer (double-click to install).
- `win-unpacked\EA POS.exe` — a no-install portable copy.

The first build downloads ~150–200 MB of Electron + toolchain into a
per-user cache (`%LOCALAPPDATA%\electron` and `...\electron-builder\Cache`);
later builds reuse it.

### Troubleshooting

- **White screen after launch** — the renderer must use relative asset paths.
  Already configured (`base: './'` in `vite.config.ts`); don't change it.
- **`Cannot find module 'express'`** — `express`/`cors` must stay in
  `dependencies` (not `devDependencies`) so electron-builder bundles them.
- **Download failures / corporate proxy** — set `ELECTRON_MIRROR` and
  `ELECTRON_BUILDER_BINARIES_MIRROR` to a reachable mirror, or build on a
  network without egress restrictions.
- **Custom app icon** — drop a multi-resolution `electron/icon.ico` and add
  `"icon": "electron/icon.ico"` under `build.win` in `package.json`. Without
  it the app uses Electron's default icon.

---

## Code signing — and what it means for auto-updates

Unsigned installers trigger SmartScreen. Less obviously, **signing is what makes
the auto-updater safe**, so this is not merely cosmetic.

### Why it matters here

`electron-updater` only verifies a downloaded update's Authenticode signature
when a **`publisherName`** is baked into `app-update.yml`. Read
`NsisUpdater#verifySignature`: when `publisherName` is null it returns `null`,
which the caller treats as "nothing wrong", and the installer is executed.
Setting `win.verifyUpdateCodeSignature: true` (the default, and set explicitly
in `package.json`) does **not** change that — the publisher name is the gate.

This app runs `requestedExecutionLevel: requireAdministrator`. So an unsigned
build that auto-installed updates would grant anyone able to serve a release
artifact — a compromised repo or release token — silent **administrator-level**
code execution on every terminal.

### How the app behaves

`electron/updatePolicy.cjs` therefore fails closed:

| Build | Updates downloaded | Installed unattended |
| --- | --- | --- |
| Signed (`publisherName` present) | yes | yes, as before |
| Unsigned | yes, and the operator is notified | **no** — applied only via `installUpdate()` |

An unsigned deployment still learns that an update exists and can apply it
deliberately; it just never runs unverified elevated code on its own. The main
process logs a warning at startup when it is in this state.

### Signing the build

1. Obtain an Authenticode certificate (OV or EV; EV avoids SmartScreen warm-up).
2. Provide it to electron-builder — either environment variables:
   ```powershell
   $env:CSC_LINK="C:\path\to\cert.pfx"      # or a base64 blob
   $env:CSC_KEY_PASSWORD="…"
   ```
   or `build.win.signtoolOptions.certificateFile` / `certificatePassword`.
3. **Set the publisher name**, exactly as it appears in the certificate's
   subject — this is the part that actually enables update verification:
   ```jsonc
   "win": {
     "verifyUpdateCodeSignature": true,
     "signtoolOptions": {
       "publisherName": "Your Company Ltd"
     }
   }
   ```
   Note that in electron-builder 26 `publisherName` lives under
   `signtoolOptions`, not directly on `win`.
4. Rebuild. Confirm `publisherName` appears in the generated
   `release/win-unpacked/resources/app-update.yml` — if it is missing, updates
   are still unverified and the app will keep refusing to self-install.

See <https://www.electron.build/code-signing>.
