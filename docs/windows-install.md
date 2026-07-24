# Windows install, SmartScreen & silent printing

This covers the two things operators ask about the desktop build: **"Windows
won't let me install it"** and **"I want printing + the cash drawer to be
automatic."**

---

## 1. Why Windows warns, and how to stop it

When you download and run `EA-POS-Setup-*.exe`, Windows **SmartScreen** may show:

> *Windows protected your PC — Microsoft Defender SmartScreen prevented an
> unrecognized app from starting.*

This is **not** a virus warning. It appears for any application whose installer
is **not code-signed** (or is signed by a certificate that hasn't built up
"reputation" yet). The EA POS build is safe — it's plain web code in an Electron
shell — but Windows can't verify *who* published it without a signature.

### Right now (unsigned build)

You can install it — the warning is a speed bump, not a block:

1. Click **More info**.
2. Click **Run anyway**.

That's it. This is the same flow every unsigned app uses.

### To remove the warning permanently — code signing

The only way to make Windows stop warning is to **sign the installer with a
code-signing certificate**. There are two kinds:

| Cert type | Cost (typical) | SmartScreen behavior |
|---|---|---|
| **OV** (Organization Validation) | ~$100–200 / yr | Warning clears **after** the signed app builds download reputation (days–weeks) |
| **EV** (Extended Validation) | ~$250–450 / yr | Warning clears **immediately** (instant reputation), but the cert lives on a hardware token/HSM |

You buy the certificate from a CA (Sectigo, DigiCert, SSL.com, GlobalSign, …).
This is a business purchase — it can't be generated for free, because its whole
purpose is that a trusted authority has verified your identity.

### Wiring the certificate into the automated build

The build is already **signing-ready**. Once you have a certificate exported as
a password-protected `.pfx`:

1. Base64-encode it: `certutil -encode cert.pfx cert.txt` (or `base64 -w0 cert.pfx`).
2. In the GitHub repo: **Settings → Secrets and variables → Actions** and add:
   - `WINDOWS_CSC_LINK` — the base64 string (or an HTTPS URL to the `.pfx`).
   - `WINDOWS_CSC_KEY_PASSWORD` — the `.pfx` password.
3. Re-run the **Build Windows Installer** workflow. electron-builder detects the
   secrets and signs the installer automatically. Nothing else changes.

> For an EV cert on a hardware token, signing must run on a machine with the
> token attached (a self-hosted runner or a cloud HSM signing service), since
> the private key never leaves the token.

### What already helps (done in this repo)

Even unsigned, the build now ships with a proper **app icon**, **publisher name**
(`abu-arandas`), **copyright**, and a descriptive **File description** in the exe
metadata. That doesn't remove the SmartScreen prompt (only signing does) but it
makes the file look legitimate in Windows' *Properties → Details* and avoids the
"blank/unknown" look that some antivirus heuristics treat more harshly.

If a specific antivirus flags the exe, it's almost always a **false positive** on
unsigned Electron apps — signing resolves those too, and you can report the false
positive to the AV vendor.

---

## 2. Automatic (silent) printing + cash drawer

Set this up in **Settings → Printer → Connection type**. Two modes print with
**no dialog and no permission prompt**, and open the cash drawer automatically:

### USB / Windows (recommended for a USB thermal printer, e.g. XP-80C)

- Pick **USB / Windows**, then choose your installed printer (e.g. `XP-80C`).
- EA POS sends **raw ESC/POS** straight to that printer through the Windows
  spooler. The receipt (with barcode) prints silently, and the **cash-drawer
  pulse** is included — the drawer pops on every cash sale, no prompt.
- Requires the desktop app (not a plain browser) on Windows.

### Network (IP) — for a LAN thermal printer (e.g. the kitchen printer)

- Pick **Network (IP)**, enter the printer's IP (port 9100). Use **Scan network**
  to find it.
- Prints silently over TCP and opens a drawer attached to that printer.

### System

- In the **desktop app**, System also prints **silently** to the chosen (or
  default) Windows printer — but the OS print path can't fire a cash drawer.
  Use **USB / Windows** or **Network** if you have a drawer.
- In a plain **browser**, System falls back to the normal print dialog (browsers
  can't print silently).

### Fire it on every sale

- **Settings → Printer**: turn on **Auto-print on checkout** (and **Auto-print
  kitchen ticket** if you route to the kitchen).
- With **USB / Windows** or **Network**, a cash sale then prints the receipt and
  kicks the drawer automatically, hands-free.

The **Receipt Settings** panels (header/footer, font, date/time format, and the
show/hide toggles) apply to every one of these paths.
