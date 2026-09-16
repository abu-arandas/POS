import { useState, useEffect } from 'react';
import { QrCode, Wifi, Printer, Copy, Check, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';

/**
 * QR digital-menu screen: starts and stops the local menu server and shows the
 * QR code customers scan. Desktop app only — the browser build has no server,
 * so it reports as running rather than warning permanently.
 */
export default function QRMenu() {
  const { t } = useTranslation();
  // `running` starts true so the browser build — which has no Electron menu
  // server and never calls getMenuInfo — does not show a permanent warning.
  const [menuHost, setMenuHost] = useState<{ ip: string; port: number; running: boolean }>(() => ({
    ip: typeof window !== 'undefined' ? window.location.hostname : 'localhost',
    port: 3001,
    running: true,
  }));
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Re-reads the menu server's address and running state from the desktop
   * app, with the refresh spinner showing. A plain browser has no server to
   * ask, so it leaves the state as it is.
   */
  const fetchMenuInfo = async () => {
    setIsRefreshing(true);
    try {
      if (window.electronAPI?.getMenuInfo) {
        const info = await window.electronAPI.getMenuInfo();
        setMenuHost({ ...info, running: info.running !== false });
      }
    } catch (err) {
      console.error('Failed to get menu server info:', err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500); // Visual delay
    }
  };

  useEffect(() => {
    // Initial fetch without the refresh spinner: state updates only land
    // after the promise resolves, never synchronously inside the effect.
    let cancelled = false;
    void (async () => {
      try {
        const info = await window.electronAPI?.getMenuInfo?.();
        if (!cancelled && info) setMenuHost({ ...info, running: info.running !== false });
      } catch (err) {
        console.error('Failed to get menu server info:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
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
    <div className="h-full flex flex-col bg-background text-foreground overflow-y-auto p-6">
      <div className="shrink-0 flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <QrCode className="size-5 text-muted-foreground" />
            {t('qrmenu.title')}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('qrmenu.subtitle')}</p>
        </div>

        <button
          onClick={fetchMenuInfo}
          disabled={isRefreshing}
          className="btn-secondary h-8 px-3 text-xs gap-1.5"
        >
          <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
          {t('common.refresh', 'Refresh')}
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full">
        {/* Main QR Card */}
        <div
          id="print-area"
          className="bg-card border border-border rounded-xl p-8 flex flex-col items-center text-center w-full shadow-2xs mb-6 relative"
        >
          <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-1">
            {t('qrmenu.scanToOrder')}
          </h3>
          <p className="text-muted-foreground text-xs mb-6">
            {t('qrmenu.scanHint')}
          </p>

          {!menuHost.running && (
            <p
              role="alert"
              className="text-xs rounded-lg px-3 py-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 max-w-sm mb-6 leading-relaxed text-center"
            >
              {t('qrmenu.serverDown')}
            </p>
          )}

          <div className="bg-white p-5 rounded-2xl shadow-2xs border border-border mb-6">
            <QRCodeSVG
              value={menuUrl}
              size={220}
              level="H"
              includeMargin={false}
              fgColor="#09090b"
            />
          </div>

          <div className="flex flex-col items-center gap-3 w-full">
            {/* Pill Badge for URL */}
            <div className="flex items-center gap-2 bg-secondary/40 border border-border rounded-lg ps-3 pe-1.5 py-1 w-full max-w-xs">
              <span className="flex-1 font-mono text-xs text-foreground truncate text-start">
                {menuUrl}
              </span>
              <button
                onClick={copyToClipboard}
                aria-label={t('qrmenu.copyLink')}
                className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
              >
                {copied ? <Check size={14} className="text-foreground" /> : <Copy size={14} />}
              </button>
            </div>

            {/* Network Info */}
            <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-xs bg-secondary/30 border border-border px-3 py-1 rounded-md">
              <Wifi size={13} className="text-muted-foreground" />
              <span>
                {menuHost.ip}:{menuHost.port}
              </span>
            </div>
          </div>
        </div>

        {/* Print Button */}
        <button
          onClick={printQR}
          className="btn-primary h-10 px-6 text-xs font-medium w-full max-w-xs justify-center gap-2"
        >
          <Printer size={15} />
          {t('qrmenu.printDisplay')}
        </button>
      </div>
    </div>
  );
}
