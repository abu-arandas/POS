import React, { useState, useEffect } from 'react';
import { QrCode, Smartphone, Wifi, Printer, Copy, Check, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';

export default function QRMenu() {
  const { t } = useTranslation();
  const [menuHost, setMenuHost] = useState<{ ip: string; port: number }>(() => ({
    ip: typeof window !== 'undefined' ? window.location.hostname : 'localhost',
    port: 3001,
  }));
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchMenuInfo = async () => {
    setIsRefreshing(true);
    try {
      if (window.electronAPI?.getMenuInfo) {
        const info = await window.electronAPI.getMenuInfo();
        setMenuHost(info);
      }
    } catch (err) {
      console.error('Failed to get menu server info:', err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500); // Visual delay
    }
  };

  useEffect(() => {
    fetchMenuInfo();
  }, []);

  const menuUrl = `http://${menuHost.ip}:${menuHost.port}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(menuUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const printQR = () => {
    window.print();
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full flex flex-col bg-transparent overflow-y-auto p-6"
    >
      <div className="shrink-0 flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <QrCode className="text-emerald-500" />
            {t('qrmenu.title')}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('qrmenu.subtitle')}</p>
        </div>
        
        <button
          onClick={fetchMenuInfo}
          disabled={isRefreshing}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-sans font-bold text-xs sm:text-sm px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
        >
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          {t('common.refresh', 'Refresh')}
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto w-full">
        
        {/* Main QR Card */}
        <motion.div 
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          id="print-area"
          className="surface rounded-3xl p-10 flex flex-col items-center text-center w-full relative overflow-hidden shadow-2xl mb-8"
        >
          <div className="absolute top-0 inset-x-0 w-full h-32 bg-gradient-to-b from-emerald-500/10 to-transparent"></div>

          <h3 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white mb-2 relative z-10">
            {t('qrmenu.scanToOrder')}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base mb-8 font-medium relative z-10">
            Customers can scan this code to browse your menu
          </p>

          <div className="bg-white p-6 rounded-[2rem] shadow-xl border-4 border-slate-100 dark:border-slate-800 mb-8 relative z-10 transition-transform hover:scale-105">
            <QRCodeSVG
              value={menuUrl}
              size={256}
              level="H"
              includeMargin={false}
              fgColor="#0f172a"
            />
          </div>

          <div className="flex flex-col items-center gap-4 w-full relative z-10">
            {/* Pill Badge for URL */}
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-full pl-5 pr-2 py-1.5 shadow-inner w-full max-w-sm">
              <span className="flex-1 font-mono text-sm text-slate-700 dark:text-slate-300 truncate text-left">
                {menuUrl}
              </span>
              <button
                onClick={copyToClipboard}
                aria-label={t('qrmenu.copyLink')}
                className={`p-2 rounded-full transition-all ${
                  copied 
                    ? 'bg-emerald-500 text-white' 
                    : 'bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 shadow-sm'
                }`}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            
            {/* Network Info */}
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500 font-bold text-sm bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2 rounded-xl">
              <Wifi size={16} />
              <span>{menuHost.ip}:{menuHost.port}</span>
            </div>
          </div>
        </motion.div>

        {/* Print Button */}
        <button
          onClick={printQR}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 px-8 rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center gap-3 transition-all hover:-translate-y-1 active:translate-y-0 w-full max-w-sm justify-center text-lg"
        >
          <Printer size={24} />
          {t('qrmenu.printDisplay')}
        </button>

      </div>
      
      {/* Print styles - only visible when printing */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { 
            position: absolute; 
            left: 50%; 
            top: 50%; 
            transform: translate(-50%, -50%); 
            width: 100%; 
            max-width: 600px;
            box-shadow: none; 
            border: none;
            background: white !important;
          }
          #print-area h3, #print-area p { color: black !important; }
        }
      `,
        }}
      />
    </motion.div>
  );
}
