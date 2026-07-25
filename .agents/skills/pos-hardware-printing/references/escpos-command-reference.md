# ESC/POS Thermal Printing & Hardware Command Reference

This reference documents the binary command sequences, code pages, and hardware troubleshooting steps for thermal receipt printers in EA POS.

## 🖨️ ESC/POS Command Table (`src/lib/escpos.ts`)

Commands are encoded into `Uint8Array` binary byte buffers.

| ESC/POS Hex Bytes | Constant | Command Name | Description |
| :--- | :--- | :--- | :--- |
| `0x1B, 0x40` | `ESC_INIT` | Initialize | Resets printer hardware buffer |
| `0x1B, 0x61, 0x00` | `ALIGN_LEFT` | Align Left | Standard left margin alignment |
| `0x1B, 0x61, 0x01` | `ALIGN_CENTER` | Align Center | Centered text for logo & headers |
| `0x1B, 0x61, 0x02` | `ALIGN_RIGHT` | Align Right | Right-aligned totals and numbers |
| `0x1B, 0x45, 0x01` | `BOLD_ON` | Bold On | Emphasizes item names or totals |
| `0x1B, 0x45, 0x00` | `BOLD_OFF` | Bold Off | Normal font weight |
| `0x1D, 0x21, 0x11` | `TXT_DOUBLE` | Double Size | Double width + double height font |
| `0x1D, 0x21, 0x00` | `TXT_NORMAL` | Normal Size | Resets font scaling |
| `0x1B, 0x74, 0x16` | `CODEPAGE_ARABIC` | Code Page CP864 | Enables Arabic text encoding |
| `0x1D, 0x56, 0x41, 0x00` | `PAPER_CUT` | Full Cut | Triggers mechanical paper cutter |
| `0x10, 0x14, 0x00, 0x01, 0x05` | `DRAWER_PULSE` | Open Cash Drawer | Sends 24V pulse to drawer solenoid |

---

## ⚡ Thermal Paper Dimensions

- **80mm Standard**: 48 characters per line (font size A) or 64 characters (font size B).
- **58mm Compact**: 32 characters per line (font size A).

---

## 🔌 Troubleshooting Hardware Interfaces

### Web Serial API (`navigator.serial`)
- **Permission Denied**: Chromium requires explicit user gesture (button click) to request serial port authorization.
- **Baud Rate**: Thermal printers default to `9600` or `115200` baud.

### Raw TCP Socket (Port 9100)
- **Host / IP**: Connects over LAN via Electron main process IPC.
- **Timeout**: Set connection timeout to 3000ms to prevent UI blocking when printer is powered off.
