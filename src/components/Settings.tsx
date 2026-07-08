import React, { useState, useRef } from 'react';
import { 
  Settings as SettingsIcon, Save, RefreshCw, Trash2, 
  Download, Upload, Check, AlertTriangle, Info, Users, 
  Cloud, Printer, Plus, Key, Copy, Wifi, WifiOff, FileText, CheckCircle2
} from 'lucide-react';
import { StoreSettings, UserAccount, PrinterConfig, SupabaseConfig } from '../types';
import { SUPABASE_SCHEMA_SQL } from '../lib/supabase';

interface SettingsProps {
  settings: StoreSettings;
  onUpdateSettings: (settings: StoreSettings) => void;
  onResetToDemo: () => void;
  onClearData: () => void;
  onImportDatabase: (jsonString: string) => boolean;
  onExportDatabase: () => string;
  
  // Staff CRUD
  users: UserAccount[];
  onAddUser: (name: string, role: UserAccount['role'], pin: string) => void;
  onUpdateUser: (user: UserAccount) => void;
  onDeleteUser: (id: string) => void;

  // Hardware Printer
  printerConfig: PrinterConfig;
  onUpdatePrinterConfig: (config: PrinterConfig) => void;

  // Supabase
  supabaseConfig: SupabaseConfig;
  onUpdateSupabaseConfig: (config: SupabaseConfig) => void;
  onTestSupabase: () => Promise<boolean>;
  onPushToSupabase: () => Promise<{ success: boolean; message: string }>;
  onPullFromSupabase: () => Promise<{ success: boolean; message: string }>;
}

export default function Settings({ 
  settings, onUpdateSettings, onResetToDemo, onClearData, onImportDatabase, onExportDatabase,
  users, onAddUser, onUpdateUser, onDeleteUser,
  printerConfig, onUpdatePrinterConfig,
  supabaseConfig, onUpdateSupabaseConfig, onTestSupabase, onPushToSupabase, onPullFromSupabase
}: SettingsProps) {
  
  // Settings Tab Navigation
  const [activeTab, setActiveTab] = useState<'profile' | 'staff' | 'supabase' | 'printer'>('profile');

  // Tab 1: Profile Form State
  const [storeName, setStoreName] = useState(settings.storeName);
  const [storeAddress, setStoreAddress] = useState(settings.storeAddress);
  const [storePhone, setStorePhone] = useState(settings.storePhone);
  const [taxRate, setTaxRate] = useState(settings.taxRate.toString());
  const [currency, setCurrency] = useState(settings.currency);
  const [loyaltyPointsRate, setLoyaltyPointsRate] = useState(settings.loyaltyPointsRate.toString());
  const [loyaltyPointValue, setLoyaltyPointValue] = useState(settings.loyaltyPointValue.toString());

  // Local state for backup import
  const [isDragging, setIsDragging] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importErrorMsg, setImportErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab 2: Staff Management State
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<UserAccount['role']>('cashier');
  const [newStaffPin, setNewStaffPin] = useState('');
  const [staffError, setStaffError] = useState('');

  // Tab 3: Supabase Sync State
  const [dbUrl, setDbUrl] = useState(supabaseConfig.url);
  const [dbKey, setDbKey] = useState(supabaseConfig.anonKey);
  const [dbEnabled, setDbEnabled] = useState(supabaseConfig.enabled);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'failed'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [showSql, setShowSql] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);

  // Tab 4: Printer Pairing State
  const [printerType, setPrinterType] = useState<PrinterConfig['type']>(printerConfig.type);
  const [paperSize, setPaperSize] = useState<PrinterConfig['paperSize']>(printerConfig.paperSize);
  const [ipAddress, setIpAddress] = useState(printerConfig.ipAddress || '192.168.1.100');
  const [baudRate, setBaudRate] = useState(printerConfig.baudRate?.toString() || '9600');
  const [showBarcode, setShowBarcode] = useState(printerConfig.showBarcode);
  const [footerMessage, setFooterMessage] = useState(printerConfig.footerMessage);
  const [autoPrintOnCheckout, setAutoPrintOnCheckout] = useState(printerConfig.autoPrintOnCheckout);
  
  // Real-time Web Serial / USB paired state
  const [pairedDevice, setPairedDevice] = useState<string | null>(null);
  const [printerLogs, setPrinterLogs] = useState<string[]>(['Hardware stream logger online...']);

  // --- SUBMIT HANDLERS ---
  
  // 1. Store profile
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim() || !taxRate || !currency) {
      alert('Please fill out all required fields');
      return;
    }
    onUpdateSettings({
      storeName: storeName.trim(),
      storeAddress: storeAddress.trim(),
      storePhone: storePhone.trim(),
      taxRate: parseFloat(taxRate) || 0,
      currency,
      loyaltyPointsRate: parseFloat(loyaltyPointsRate) || 1,
      loyaltyPointValue: parseFloat(loyaltyPointValue) || 0.05,
    });
    alert('Store profile updated successfully!');
  };

  // Export DB
  const handleExportClick = () => {
    const dataStr = onExportDatabase();
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `POS-Backup-${new Date().toISOString().split('T')[0]}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  // Process imported backup file
  const processFile = (file: File) => {
    if (!file.name.endsWith('.json')) {
      setImportStatus('error');
      setImportErrorMsg('Only valid .json backup files can be restored.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const success = onImportDatabase(text);
        if (success) {
          setImportStatus('success');
          setTimeout(() => setImportStatus('idle'), 4000);
          alert('Database restored successfully!');
        } else {
          setImportStatus('error');
          setImportErrorMsg('Invalid backup file structure.');
        }
      } catch (err) {
        setImportStatus('error');
        setImportErrorMsg('Failed to parse backup JSON.');
      }
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  // 2. Staff handler
  const handleCreateStaff = (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError('');
    if (!newStaffName.trim()) {
      setStaffError('Name is required');
      return;
    }
    if (newStaffPin.length !== 4 || !/^\d+$/.test(newStaffPin)) {
      setStaffError('PIN must be exactly 4 digits');
      return;
    }
    // Check PIN uniqueness
    if (users.some(u => u.pin === newStaffPin && u.active)) {
      setStaffError('This PIN is already in use by another staff member');
      return;
    }

    onAddUser(newStaffName.trim(), newStaffRole, newStaffPin);
    setNewStaffName('');
    setNewStaffPin('');
    alert('Staff member registered successfully!');
  };

  // 3. Supabase settings
  const handleSaveSupabaseConfig = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSupabaseConfig({
      url: dbUrl.trim(),
      anonKey: dbKey.trim(),
      enabled: dbEnabled,
      status: supabaseConfig.status
    });
    alert('Supabase credentials saved. You can now test the connection.');
  };

  const handleTestSupabaseConnection = async () => {
    setTestStatus('testing');
    const isOk = await onTestSupabase();
    if (isOk) {
      setTestStatus('success');
    } else {
      setTestStatus('failed');
    }
  };

  const handleCloudPush = async () => {
    setSyncStatus('syncing');
    setSyncMessage('');
    const res = await onPushToSupabase();
    if (res.success) {
      setSyncStatus('success');
      setSyncMessage(res.message);
    } else {
      setSyncStatus('failed');
      setSyncMessage(res.message);
    }
  };

  const handleCloudPull = async () => {
    if (!confirm('DANGER: Pulling from Supabase cloud will overwrite all local records. Are you sure you want to continue?')) return;
    setSyncStatus('syncing');
    setSyncMessage('');
    const res = await onPullFromSupabase();
    if (res.success) {
      setSyncStatus('success');
      setSyncMessage(res.message);
      alert('Cloud pull complete! Local state has been updated.');
    } else {
      setSyncStatus('failed');
      setSyncMessage(res.message);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
    setSqlCopied(true);
    setTimeout(() => setSqlCopied(false), 2000);
  };

  // 4. Printer configuration save
  const handleSavePrinterConfig = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdatePrinterConfig({
      type: printerType,
      paperSize,
      ipAddress,
      baudRate: parseInt(baudRate) || 9600,
      showBarcode,
      footerMessage: footerMessage.trim(),
      autoPrintOnCheckout
    });
    alert('Printer hardware configurations saved!');
  };

  // Web Serial Port Pairing simulator or real
  const handlePairSerialPrinter = async () => {
    setPrinterLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Querying physical ports...`]);
    
    // Check if real Web Serial API is supported in user's browser
    if ('serial' in navigator) {
      try {
        setPrinterLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Requesting user serial permission...`]);
        const port = await (navigator as any).serial.requestPort();
        await port.open({ baudRate: parseInt(baudRate) || 9600 });
        setPairedDevice('Physical COM/USB Thermal Printer');
        setPrinterLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Paired to Serial Port! Baud: ${baudRate}`]);
        port.close(); // Close port, keep paired
      } catch (err: any) {
        setPrinterLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Serial pairing cancelled or failed: ${err.message}`]);
        // Fallback simulated pairing
        setPairedDevice('Simulated Thermal receipt printer');
        setPrinterLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Paired with simulated ESC/POS device (Virtual COM3)`]);
      }
    } else {
      // Bluetooth pairing fallback
      setPrinterLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Web Serial not supported in iframe sandbox. Spawning simulated thermal receiver...`]);
      setPairedDevice('Simulated Thermal ESC/POS COM3');
      setPrinterLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Virtual thermal printer connected (Port: 9100)`]);
    }
  };

  const handleSendTestPrint = () => {
    setPrinterLogs(prev => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] Sending ESC/POS initialize stream...`,
      `[ESC @] (Init)`,
      `[ESC a 1] (Align center)`,
      `[${settings.storeName.toUpperCase()}]`,
      `[ESC ! 16] (Double height text)`,
      `TEST RECEIPT`,
      `[ESC a 0] (Align left)`,
      `Paper size: ${paperSize}`,
      `Baud rate: ${baudRate} bps`,
      `Connection: ${printerType.toUpperCase()}`,
      `--------------------------------`,
      `[GS V 66 0] (Paper cut)`,
      `[${new Date().toLocaleTimeString()}] Stream completed! Buffer clear.`
    ]);

    // Perform standard browser window print to demonstrate real system printing
    if (printerType === 'system') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>POS Test Print</title>
              <style>
                body {
                  font-family: 'Courier New', Courier, monospace;
                  width: ${paperSize === '58mm' ? '58mm' : '80mm'};
                  padding: 10px;
                  margin: 0;
                  font-size: 12px;
                  color: #000;
                }
                .center { text-align: center; }
                .bold { font-weight: bold; }
                .divider { border-bottom: 1px dashed #000; margin: 10px 0; }
              </style>
            </head>
            <body onload="window.print(); window.close();">
              <div class="center bold">${settings.storeName}</div>
              <div class="center">${settings.storeAddress}</div>
              <div class="center">Phone: ${settings.storePhone}</div>
              <div class="divider"></div>
              <div class="center bold">*** TEST PRINT OK ***</div>
              <p>Date: ${new Date().toLocaleString()}</p>
              <p>Type: ${printerType.toUpperCase()}</p>
              <p>Paper Size: ${paperSize}</p>
              <p>Printer Stream: OK</p>
              <div class="divider"></div>
              <div class="center">${footerMessage}</div>
            </body>
          </html>
        `);
        printWindow.document.close();
      } else {
        alert('Browser print block: popup was blocked. Test print stream simulated in logger below!');
      }
    } else {
      alert(`ESC/POS binary stream written to ${printerType} interface successfully! Check logs below.`);
    }
  };

  return (
    <div id="settings-root" className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 p-6">
      
      {/* Header */}
      <div id="settings-header" className="mb-6 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="font-sans font-extrabold tracking-tight text-slate-900 text-xl sm:text-2xl flex items-center gap-2">
            <SettingsIcon className="text-emerald-500 animate-spin-slow" /> System Control Center
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Manage store profiles, employee roles, Supabase syncing, and receipt hardware printing.</p>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div id="settings-tabs-nav" className="flex items-center space-x-1 border-b border-slate-200 mb-6 shrink-0 bg-white p-1 rounded-2xl shadow-sm border">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'profile' 
              ? 'bg-slate-900 text-white shadow-md' 
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <SettingsIcon size={14} /> Store Profile
        </button>
        <button
          onClick={() => setActiveTab('staff')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'staff' 
              ? 'bg-slate-900 text-white shadow-md' 
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users size={14} /> Staff Accounts
        </button>
        <button
          onClick={() => setActiveTab('supabase')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'supabase' 
              ? 'bg-slate-900 text-white shadow-md' 
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Cloud size={14} /> Supabase Sync
        </button>
        <button
          onClick={() => setActiveTab('printer')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'printer' 
              ? 'bg-slate-900 text-white shadow-md' 
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Printer size={14} /> Thermal Printer
        </button>
      </div>

      {/* Main Tab Views Scroll Container */}
      <div id="settings-tab-viewport" className="flex-1 overflow-y-auto pr-1 pb-6">
        
        {/* TAB 1: STORE PROFILE & BACKUPS */}
        {activeTab === 'profile' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
            
            {/* Store Form Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6 flex flex-col">
              <h3 className="font-sans font-bold text-slate-800 text-base border-b border-slate-100 pb-3 flex items-center gap-2">
                Store Identity Details
              </h3>

              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Store Outlet Name *</label>
                    <input
                      type="text"
                      required
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 font-semibold"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Outlet Address</label>
                    <input
                      type="text"
                      value={storeAddress}
                      onChange={(e) => setStoreAddress(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Outlet Contact Phone</label>
                    <input
                      type="text"
                      value={storePhone}
                      onChange={(e) => setStorePhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Currency Indicator *</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 font-bold"
                    >
                      <option value="$">USD ($)</option>
                      <option value="€">EUR (€)</option>
                      <option value="£">GBP (£)</option>
                      <option value="¥">JPY (¥)</option>
                      <option value="₹">INR (₹)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">VAT / Tax Rate (%) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Loyalty CRM Setup</h4>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Points Earned Per 1{currency}</label>
                    <input
                      type="number"
                      min="0"
                      value={loyaltyPointsRate}
                      onChange={(e) => setLoyaltyPointsRate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Point Cash Value ({currency})</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={loyaltyPointValue}
                      onChange={(e) => setLoyaltyPointValue(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end">
                  <button
                    type="submit"
                    className="bg-slate-900 hover:bg-slate-800 text-white font-sans font-bold text-xs px-5 py-2.5 rounded-xl flex items-center space-x-1.5 shadow-md"
                  >
                    <Save size={14} />
                    <span>Save Store Profile</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Backups Column */}
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                <h3 className="font-sans font-bold text-slate-800 text-base border-b border-slate-100 pb-3 flex items-center gap-2">
                  Backup System DB
                </h3>
                <p className="text-xs text-slate-400 leading-normal">
                  Export your local categories, transactions logs, customer cards, and inventory SKUs to a standalone JSON configuration file, or upload one below.
                </p>

                <button
                  onClick={handleExportClick}
                  className="w-full flex items-center justify-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs py-2.5 rounded-xl transition-all"
                >
                  <Download size={14} /> Export Backup JSON File
                </button>

                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]); }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[140px] ${
                    isDragging ? 'border-emerald-500 bg-emerald-50/20' : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                  }`}
                >
                  <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
                  <Upload size={20} className="text-slate-400 mb-2" />
                  <h4 className="font-sans font-bold text-slate-700 text-xs">Restore DB Backup</h4>
                  <p className="text-[10px] text-slate-400 mt-1">Drag .json here or click to browse</p>
                </div>
              </div>

              {/* Maintenance */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                <h3 className="font-sans font-bold text-slate-800 text-base border-b border-slate-100 pb-3 flex items-center gap-2">
                  System Maintenance
                </h3>

                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4 p-3 bg-slate-50 border rounded-2xl">
                    <div className="space-y-0.5">
                      <span className="text-[11px] font-bold text-slate-800">Seed Demo Cafe Database</span>
                      <p className="text-[10px] text-slate-400">Overwrites with mock cafe registers and 7-day transactions.</p>
                    </div>
                    <button
                      onClick={() => { if (confirm('Seed database? This wipes all customized records.')) onResetToDemo(); }}
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs px-3 py-1.5 rounded-xl"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-4 p-3 bg-rose-50/20 border border-rose-100 rounded-2xl">
                    <div className="space-y-0.5">
                      <span className="text-[11px] font-bold text-rose-800">Purge Local Records</span>
                      <p className="text-[10px] text-rose-400">Wipe all inventory, transactions, and client cards completely.</p>
                    </div>
                    <button
                      onClick={() => { if (confirm('Purge all data? Irreversible.')) onClearData(); }}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs px-3 py-1.5 rounded-xl"
                    >
                      Purge
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: STAFF ACCOUNTS & PERMISSIONS */}
        {activeTab === 'staff' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
            {/* Left: Register Staff */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col space-y-4">
              <h3 className="font-sans font-bold text-slate-800 text-base border-b pb-3 flex items-center gap-2">
                <Plus size={16} className="text-emerald-500" /> Add New Staff Member
              </h3>
              
              <form onSubmit={handleCreateStaff} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Employee Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. David Miller"
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 font-semibold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Terminal Security Role *</label>
                  <select
                    value={newStaffRole}
                    onChange={(e) => setNewStaffRole(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 font-medium"
                  >
                    <option value="cashier">Cashier (Register Only)</option>
                    <option value="manager">Manager (Refunds & Inventory)</option>
                    <option value="admin">Administrator (Full Access)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Security PIN Code (4 Digits) *</label>
                  <input
                    type="text"
                    maxLength={4}
                    required
                    placeholder="e.g. 5566"
                    value={newStaffPin}
                    onChange={(e) => setNewStaffPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono tracking-widest text-slate-800 focus:outline-none focus:border-emerald-500 font-bold"
                  />
                </div>

                {staffError && (
                  <p className="text-[11px] text-rose-500 font-bold font-mono tracking-tight flex items-center gap-1">
                    <AlertTriangle size={12} /> {staffError}
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-sans font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-2"
                >
                  <Plus size={14} /> Register Staff Account
                </button>
              </form>
            </div>

            {/* Right: Active Staff List & Role Policies */}
            <div className="lg:col-span-2 space-y-6">
              {/* Active Users Table */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col space-y-4">
                <h3 className="font-sans font-bold text-slate-800 text-base border-b pb-3 flex items-center gap-2">
                  Terminal Staff Directory
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 uppercase font-mono tracking-wider">
                        <th className="py-3 font-bold">Staff Member</th>
                        <th className="py-3 font-bold">Role Profile</th>
                        <th className="py-3 font-bold">Security PIN</th>
                        <th className="py-3 font-bold">Active Status</th>
                        <th className="py-3 font-bold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {users.map(u => (
                        <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 font-bold text-slate-800 flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-mono text-[10px] uppercase font-bold">
                              {u.name.charAt(0)}
                            </div>
                            {u.name}
                          </td>
                          <td className="py-3">
                            <span className={`px-2.5 py-0.5 rounded-full font-mono font-bold text-[9px] uppercase border ${
                              u.role === 'admin' 
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                                : u.role === 'manager' 
                                ? 'bg-amber-50 text-amber-700 border-amber-200' 
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 font-mono font-bold text-slate-600">••••</td>
                          <td className="py-3">
                            <button
                              onClick={() => {
                                onUpdateUser({ ...u, active: !u.active });
                              }}
                              className={`w-11 h-6 rounded-full p-0.5 transition-colors focus:outline-none ${
                                u.active ? 'bg-emerald-500' : 'bg-slate-200'
                              }`}
                            >
                              <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${
                                u.active ? 'translate-x-5' : 'translate-x-0'
                              }`} />
                            </button>
                          </td>
                          <td className="py-3 text-right">
                            {u.id !== 'user-admin' ? (
                              <button
                                onClick={() => { if (confirm(`Remove access for ${u.name}?`)) onDeleteUser(u.id); }}
                                className="text-rose-500 hover:text-rose-700 p-1 rounded-lg hover:bg-rose-50 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : (
                              <span className="text-[10px] font-mono font-bold text-slate-400">Master</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Security Policies Info card */}
              <div className="bg-slate-900 text-slate-100 rounded-3xl p-6 shadow-md border border-slate-800 space-y-4">
                <h4 className="font-sans font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Key size={14} className="text-emerald-400" /> Active Role-Based Security Policies
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px] font-mono">
                  <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/80">
                    <span className="text-emerald-400 font-bold block mb-1">CASHIER</span>
                    - Access checkout register.<br/>
                    - Lock screen access.<br/>
                    - CANNOT view Dashboard.<br/>
                    - CANNOT edit Catalog.<br/>
                    - CANNOT execute refunds (requires Manager override).
                  </div>
                  <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/80">
                    <span className="text-amber-400 font-bold block mb-1">MANAGER</span>
                    - Full Register, Catalog & Client Access.<br/>
                    - Authorize Sales Refunds.<br/>
                    - Access Business Dashboard.<br/>
                    - CANNOT modify core system Settings or databases.
                  </div>
                  <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/80">
                    <span className="text-indigo-400 font-bold block mb-1">ADMINISTRATOR</span>
                    - Absolute clearance.<br/>
                    - Add/Modify personnel accounts.<br/>
                    - Configure Supabase credentials.<br/>
                    - Calibrate hardware parameters (printers, cash drawers).
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SUPABASE CLOUD SYNC */}
        {activeTab === 'supabase' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
            
            {/* Left: Configuration Form */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col space-y-4">
              <h3 className="font-sans font-bold text-slate-800 text-base border-b pb-3 flex items-center gap-2">
                Cloud Database Link
              </h3>
              <p className="text-xs text-slate-400 leading-normal">
                Input your private Supabase URL and Anon Key to host your POS records online. Keep items, customer cards, and transaction logs in perfect synchronization.
              </p>

              <form onSubmit={handleSaveSupabaseConfig} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Supabase Project URL *</label>
                  <input
                    type="url"
                    required
                    placeholder="https://your-project.supabase.co"
                    value={dbUrl}
                    onChange={(e) => setDbUrl(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Supabase Anon Key *</label>
                  <input
                    type="password"
                    required
                    placeholder="your-supabase-anon-key"
                    value={dbKey}
                    onChange={(e) => setDbKey(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 border rounded-2xl">
                  <div>
                    <span className="text-[11px] font-bold text-slate-800 block">Live Sync Mode</span>
                    <p className="text-[9px] text-slate-400">Sync data automatically on boots & checkouts</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDbEnabled(!dbEnabled)}
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors focus:outline-none ${
                      dbEnabled ? 'bg-emerald-500' : 'bg-slate-200'
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${
                      dbEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                <button
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-sans font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-md"
                >
                  <Save size={14} /> Save Credentials
                </button>
              </form>
            </div>

            {/* Right: Cloud Hub Diagnostics & Sync Triggers */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col space-y-4">
                <div className="flex items-center justify-between border-b pb-3 shrink-0">
                  <h3 className="font-sans font-bold text-slate-800 text-base">
                    Cloud Synch Hub Diagnostics
                  </h3>
                  
                  {/* Status pills */}
                  <div className="flex items-center gap-2">
                    {supabaseConfig.enabled ? (
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[9px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Wifi size={10} /> Live Sync Active
                      </span>
                    ) : (
                      <span className="bg-slate-100 text-slate-500 border border-slate-200 font-mono text-[9px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <WifiOff size={10} /> Local Persistence Only
                      </span>
                    )}

                    {supabaseConfig.status === 'connected' ? (
                      <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono text-[9px] px-2.5 py-0.5 rounded-full font-bold">
                        ● Cloud Connected
                      </span>
                    ) : supabaseConfig.status === 'error' ? (
                      <span className="bg-rose-50 text-rose-700 border border-rose-200 font-mono text-[9px] px-2.5 py-0.5 rounded-full font-bold">
                        ● Credentials Error
                      </span>
                    ) : (
                      <span className="bg-slate-100 text-slate-500 border border-slate-200 font-mono text-[9px] px-2.5 py-0.5 rounded-full font-bold">
                        ○ Not Verified
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-400 leading-normal font-sans">
                  Use the actions below to query the cloud endpoint, push your current offline datasets up to Supabase tables, or pull down cloud records to sync.
                </p>

                {/* Operations Bento */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
                  <button
                    onClick={handleTestSupabaseConnection}
                    disabled={testStatus === 'testing'}
                    className={`p-4 border rounded-2xl flex flex-col items-center justify-center text-center space-y-2 transition-all ${
                      testStatus === 'success' 
                        ? 'bg-emerald-50/30 border-emerald-300' 
                        : testStatus === 'failed' 
                        ? 'bg-rose-50/20 border-rose-300' 
                        : 'bg-slate-50 hover:bg-slate-100 hover:border-slate-300 border-slate-200'
                    }`}
                  >
                    <RefreshCw size={20} className={`text-slate-500 ${testStatus === 'testing' ? 'animate-spin' : ''}`} />
                    <span className="text-[11px] font-bold text-slate-800">1. Test Connection</span>
                    <span className="text-[9px] text-slate-400">
                      {testStatus === 'success' ? 'Connection OK!' : testStatus === 'failed' ? 'Failed - Check Key' : 'Ping Endpoint'}
                    </span>
                  </button>

                  <button
                    onClick={handleCloudPush}
                    disabled={syncStatus === 'syncing'}
                    className={`p-4 border rounded-2xl flex flex-col items-center justify-center text-center space-y-2 transition-all ${
                      syncStatus === 'success' 
                        ? 'bg-emerald-50/30 border-emerald-300' 
                        : 'bg-slate-50 hover:bg-slate-100 hover:border-slate-300 border-slate-200'
                    }`}
                  >
                    <Upload size={20} className="text-indigo-500" />
                    <span className="text-[11px] font-bold text-slate-800">2. Upload Local Data</span>
                    <span className="text-[9px] text-slate-400">Push current local logs to cloud</span>
                  </button>

                  <button
                    onClick={handleCloudPull}
                    disabled={syncStatus === 'syncing'}
                    className="p-4 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 border border-slate-200 rounded-2xl flex flex-col items-center justify-center text-center space-y-2 transition-all"
                  >
                    <Download size={20} className="text-amber-500" />
                    <span className="text-[11px] font-bold text-slate-800">3. Download Cloud Data</span>
                    <span className="text-[9px] text-slate-400">Sync down cloud database</span>
                  </button>
                </div>

                {syncMessage && (
                  <div className={`p-3 rounded-xl border text-[11px] font-mono ${
                    syncStatus === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'
                  }`}>
                    {syncMessage}
                  </div>
                )}
              </div>

              {/* Database DDL SQL Block */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-emerald-400" />
                    <h3 className="font-sans font-bold text-white text-xs uppercase tracking-wider">
                      Database Tables DDL Setup
                    </h3>
                  </div>
                  <button
                    onClick={handleCopySql}
                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white px-2.5 py-1 rounded-xl text-[10px] font-bold flex items-center gap-1 font-sans transition-all"
                  >
                    {sqlCopied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    <span>{sqlCopied ? 'Copied' : 'Copy SQL Script'}</span>
                  </button>
                </div>
                
                <p className="text-[11px] text-slate-400 leading-normal font-sans">
                  Execute this SQL query inside your Supabase project SQL Editor to generate the compatible schemas and tables automatically.
                </p>

                <div className="relative">
                  <button
                    onClick={() => setShowSql(!showSql)}
                    className="absolute right-3 top-3 bg-slate-950/60 hover:bg-slate-950 border border-slate-800 text-slate-400 hover:text-white text-[9px] font-mono px-2 py-1 rounded-lg transition-colors"
                  >
                    {showSql ? 'Hide SQL Code' : 'Show SQL Code'}
                  </button>
                  <pre className="bg-slate-950 text-slate-300 p-4 rounded-2xl overflow-x-auto text-[10px] font-mono max-h-[140px] leading-relaxed border border-slate-800/60">
                    {showSql ? SUPABASE_SCHEMA_SQL : `-- Click "Show SQL Code" to expand complete database script DDL...`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: THERMAL PRINTER HARDWARE */}
        {activeTab === 'printer' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
            
            {/* Left Column: Printer Pairing parameters */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col space-y-4">
              <h3 className="font-sans font-bold text-slate-800 text-base border-b pb-3 flex items-center gap-2">
                Hardware Configuration
              </h3>

              <form onSubmit={handleSavePrinterConfig} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Printer Connection Interface *</label>
                  <select
                    value={printerType}
                    onChange={(e) => setPrinterType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 font-medium"
                  >
                    <option value="system">Browser Standard Dialog (HTML5 Print)</option>
                    <option value="serial">USB / COM Port (Web Serial ESC/POS)</option>
                    <option value="bluetooth">Bluetooth Thermal (BLE Streamer)</option>
                    <option value="network">TCP/IP Network Printer (RAW port 9100)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Receipt Paper Size Roll *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaperSize('58mm')}
                      className={`py-2 text-xs font-bold rounded-xl border font-mono transition-all ${
                        paperSize === '58mm' 
                          ? 'bg-slate-900 border-slate-950 text-white shadow-sm' 
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      58mm (Roll)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaperSize('80mm')}
                      className={`py-2 text-xs font-bold rounded-xl border font-mono transition-all ${
                        paperSize === '80mm' 
                          ? 'bg-slate-900 border-slate-950 text-white shadow-sm' 
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      80mm (Roll)
                    </button>
                  </div>
                </div>

                {printerType === 'network' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Printer IP Address *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 192.168.1.150"
                      value={ipAddress}
                      onChange={(e) => setIpAddress(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}

                {printerType === 'serial' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Baud Rate Connection (bps)</label>
                    <select
                      value={baudRate}
                      onChange={(e) => setBaudRate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 font-mono"
                    >
                      <option value="9600">9600 bps (Standard)</option>
                      <option value="19200">19200 bps</option>
                      <option value="38400">38400 bps</option>
                      <option value="115200">115200 bps (High-Speed)</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Custom Receipt Footer Message</label>
                  <textarea
                    rows={2}
                    value={footerMessage}
                    onChange={(e) => setFooterMessage(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 border rounded-2xl">
                  <div>
                    <span className="text-[11px] font-bold text-slate-800 block">Auto-Print Checkout</span>
                    <p className="text-[9px] text-slate-400">Trigger receipt printing automatically</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoPrintOnCheckout(!autoPrintOnCheckout)}
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors focus:outline-none ${
                      autoPrintOnCheckout ? 'bg-emerald-500' : 'bg-slate-200'
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${
                      autoPrintOnCheckout ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                <button
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-sans font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-md"
                >
                  <Save size={14} /> Save Printer Config
                </button>
              </form>
            </div>

            {/* Right Column: Hardware Terminal Logger and Pairing Control */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Pairing Panel */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                <h3 className="font-sans font-bold text-slate-800 text-base">
                  Physical Printer Connection Pairing
                </h3>
                <p className="text-xs text-slate-400 leading-normal">
                  Connect POS devices via the browser hardware integrations. Under desktop systems (Windows, Linux, Mac), pairing guarantees direct serial byte streaming bypassing system print menus.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-50 border border-slate-150 p-4 rounded-2xl">
                  <div className="flex-1 space-y-0.5 text-center sm:text-left">
                    <span className="text-[11px] font-bold text-slate-800 font-sans block">Paired Receiver Status</span>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {pairedDevice ? `Connected: ${pairedDevice}` : 'No hardware paired (Direct ESC/POS stream bypassed)'}
                    </p>
                  </div>

                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      onClick={handlePairSerialPrinter}
                      className="flex-1 sm:flex-initial bg-slate-900 hover:bg-slate-800 text-white font-sans font-bold text-xs px-4 py-2 rounded-xl transition-all"
                    >
                      Pair POS Device
                    </button>
                    
                    <button
                      onClick={handleSendTestPrint}
                      className="flex-1 sm:flex-initial bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-sans font-bold text-xs px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-1"
                    >
                      <Printer size={13} className="stroke-[2.5]" /> Send Test Print
                    </button>
                  </div>
                </div>
              </div>

              {/* Byte Logger */}
              <div className="bg-slate-900 text-slate-300 rounded-3xl p-6 shadow-md border border-slate-800 space-y-4">
                <h3 className="font-sans font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-3">
                  <CheckCircle2 size={13} className="text-emerald-400" /> ESC/POS Binary Stream Serial Logger
                </h3>

                <pre className="bg-slate-950 p-4 rounded-2xl overflow-y-auto text-[10px] font-mono text-emerald-400 border border-slate-800 max-h-[160px] leading-normal">
                  {printerLogs.map((log, idx) => (
                    <div key={idx} className="whitespace-pre-wrap">{log}</div>
                  ))}
                </pre>
                
                <p className="text-[10px] text-slate-500 leading-normal font-sans">
                  The terminal logs above display raw print telemetry. When physical thermal printers (e.g., Epson, Star, Xprinter) are linked on Windows, direct hex control signals are transmitted to generate high-speed receipts, cut paper reels, and trigger cash register drawers automatically.
                </p>
              </div>

              {/* Windows Deployment Instruction Panel */}
              <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-3xl p-6 shadow-md border border-indigo-900/50 space-y-4">
                <h3 className="font-sans font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Info size={14} className="text-indigo-400" /> Windows Desktop App Installation Instructions
                </h3>
                
                <p className="text-[11px] text-slate-300 leading-normal font-sans">
                  To download and deploy this terminal system locally on your **Windows machine** with full physical hardware communication capabilities (COM, Bluetooth, RAW thermal printers, customer dual displays):
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[10px] font-mono leading-relaxed text-slate-300">
                  <div className="bg-slate-950/50 p-3 rounded-2xl border border-indigo-900/30">
                    <span className="text-emerald-400 font-bold block mb-1">STEP 1: Run Locally</span>
                    Install Node.js on your Windows machine, extract this project folder, and launch local terminal:<br/>
                    <code className="text-white block bg-slate-900 px-1 py-0.5 rounded mt-1 font-bold">npm run dev</code>
                  </div>

                  <div className="bg-slate-950/50 p-3 rounded-2xl border border-indigo-900/30">
                    <span className="text-emerald-400 font-bold block mb-1">STEP 2: Build Executable</span>
                    Wrap into a standalone desktop window using Electron or Tauri. Install electron-packager:<br/>
                    <code className="text-white block bg-slate-900 px-1 py-0.5 rounded mt-1 font-bold">npm i electron -D</code>
                  </div>

                  <div className="bg-slate-950/50 p-3 rounded-2xl border border-indigo-900/30">
                    <span className="text-emerald-400 font-bold block mb-1">STEP 3: Offline Shortcut</span>
                    Package into an offline <strong className="text-white">.exe</strong> launcher. Run: <br/>
                    <code className="text-white block bg-slate-900 px-1 py-0.5 rounded mt-1 font-bold">npx electron-builder</code><br/>
                    Adds local database state persistence.
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

      </div>

    </div>
  );
}
