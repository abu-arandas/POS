# EA POS

A modern, high-performance Point of Sale (POS) system built with **React 19**, **Vite**, **Tailwind CSS v4**, and packaged as a standalone Windows desktop application using **Electron**.

![EA POS Screenshot](https://ai.google.dev/static/site-assets/images/share-ais-513315318.png)

## ✨ Features

- **Premium UI/UX:** Built with Tailwind CSS v4, featuring glassmorphism, micro-animations, and a highly polished dark/light mode integration.
- **Register & Cart:** Seamless product checkout, cart management, and manual/percentage-based discounts.
- **Customer Loyalty System:** Select customers to award or deduct loyalty points directly at checkout.
- **Live Metrics Dashboard:** Real-time synchronized KPIs, transaction history, and revenue charting.
- **Thermal Receipts:** Generates beautiful on-screen digital receipts for completed transactions.
- **Cross-Platform & Standalone:** Runs perfectly in the browser (via Vite) or as a native downloadable `.exe` via Electron.

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- `npm`

### Installation

1. Clone or download the repository.
2. Install the dependencies:
   ```bash
   npm install
   ```

### Running Locally (Web)

To run the application in a standard web browser during development:
```bash
npm run dev
```
The application will be available at `http://localhost:3000`.

### Running Locally (Electron Desktop App)

To run the application natively in an Electron desktop window during development:
```bash
npm run electron:dev
```

## 📦 Building the Application

### Build for Windows (.exe)

You can package the application into a standalone Windows installer using `electron-builder`.

```bash
npm run electron:build
```

Once completed, your setup executable will be located in the `POS-dist` folder outside the workspace:
`../POS-dist/EA POS Setup 0.0.0.exe`

### Build for Web

If you only want to generate static web files for hosting on Vercel, Netlify, or an Nginx server:
```bash
npm run build
```
The static files will be located in the `dist` directory.

## 🛠️ Tech Stack

- **Framework:** React 19 + Vite
- **Styling:** Tailwind CSS v4
- **Animations:** Motion (Framer Motion)
- **Icons:** Lucide React
- **Desktop Packaging:** Electron & electron-builder
- **Charting:** Recharts

## 📄 License
This project is for demonstration purposes. Use, modify, and distribute freely.
