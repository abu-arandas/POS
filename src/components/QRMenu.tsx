import React, { useState, useEffect } from 'react';
import { QrCode, Smartphone, Wifi, Printer, Copy, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';

export default function QRMenu() {
  const { t } = useTranslation();
  const [localIp, setLocalIp] = useState<string>(() => typeof window !== 'undefined' ? window.location.hostname : 'localhost');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      // We fetch the local IP from the Electron main process via IPC
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ipcRenderer = (window as any).require('electron').ipcRenderer;
      ipcRenderer
        .invoke('get-local-ip')
        .then((ip: string) => {
          setLocalIp(ip);
        })
        .catch((err: Error) => {
          console.error('Failed to get local IP:', err);
        });
    } catch (_e) {
      // Not running in Electron, use the default hostname
    }
  }, []);

  const menuUrl = `http://${localIp}:3001`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(menuUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const printQR = () => {
    window.print();
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-6 flex items-center justify-between shadow-xs">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <QrCode className="text-emerald-500" />
            {t('qrmenu.title')}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('qrmenu.subtitle')}</p>
        </div>
      </div>

      <div className="flex-1 p-6 md:p-8 flex items-center justify-center">
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          {/* Instructions Column */}
          <div className="space-y-6">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-400 mb-4 flex items-center gap-2">
                <Wifi size={20} />
                {t('qrmenu.howItWorks')}
              </h3>
              <ul className="space-y-4 text-slate-600 dark:text-slate-300 text-sm">
                <li className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shrink-0">
                    1
                  </div>
                  <p
                    dangerouslySetInnerHTML={{
                      __html: t('qrmenu.step1'),
                    }}
                  />
                </li>
                <li className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shrink-0">
                    2
                  </div>
                  <p>{t('qrmenu.step2')}</p>
                </li>
                <li className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shrink-0">
                    3
                  </div>
                  <p>{t('qrmenu.step3')}</p>
                </li>
              </ul>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                <Smartphone size={16} className="text-slate-400" />
                {t('qrmenu.directLink')}
              </h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={menuUrl}
                  readOnly
                  className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 outline-none font-mono"
                />
                <button
                  onClick={copyToClipboard}
                  className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 rounded-xl flex items-center justify-center transition-colors border border-slate-200 dark:border-slate-700"
                  title="Copy link"
                >
                  {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                </button>
              </div>
            </div>
          </div>

          {/* QR Code Column */}
          <div className="flex flex-col items-center justify-center">
            <div
              id="print-area"
              className="bg-white p-8 rounded-4xl shadow-xl border border-slate-100 dark:border-slate-800 mb-6 flex flex-col items-center text-center max-w-sm w-full relative overflow-hidden"
            >
              <div className="absolute top-0 inset-s-0 w-full h-32 bg-linear-to-b from-emerald-50 to-transparent"></div>

              <h3 className="text-2xl font-black text-slate-900 mb-2 relative z-10">
                {t('qrmenu.scanToOrder')}
              </h3>
              <p className="text-slate-500 text-sm mb-8 font-medium relative z-10">
                {t('qrmenu.viewMenu')}
              </p>

              <div className="bg-white p-4 rounded-2xl shadow-inner border-2 border-slate-100 mb-6 relative z-10">
                <QRCodeSVG
                  value={menuUrl}
                  size={220}
                  level="H"
                  includeMargin={false}
                  fgColor="#0f172a"
                />
              </div>

              <div className="flex items-center gap-2 text-emerald-600 font-bold relative z-10">
                <Smartphone size={20} />
                <span>{t('qrmenu.noApp')}</span>
              </div>
            </div>

            <button
              onClick={printQR}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 px-8 rounded-xl shadow-lg shadow-emerald-500/30 flex items-center gap-2 transition-all hover:-translate-y-0.5 active:translate-y-0 w-full max-w-sm justify-center"
            >
              <Printer size={20} />
              {t('qrmenu.printDisplay')}
            </button>

            {/* Print styles - only visible when printing */}
            <style
              dangerouslySetInnerHTML={{
                __html: `
              @media print {
                body * { visibility: hidden; }
                #print-area, #print-area * { visibility: visible; }
                #print-area { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none; border: none; }
              }
            `,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
