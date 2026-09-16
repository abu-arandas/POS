import React, { useState, useMemo } from 'react';
import {
  LayoutGrid,
  Users,
  Clock,
  DollarSign,
  Plus,
  ChevronRight,
  Trash2,
  Receipt,
  X,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { DiningTable, TableStatus } from '../types';
import { useTableStore } from '../stores/tableStore';
import { useSettingsStore } from '../stores/settingsStore';
import { notify, askConfirmation } from '../lib/utils/ui';

interface TableManagementProps {
  onSelectTableForRegister?: (table: DiningTable) => void;
}

export function TableManagement({ onSelectTableForRegister }: TableManagementProps) {
  const { t } = useTranslation();
  const tables = useTableStore((s) => s.tables);
  const occupyTable = useTableStore((s) => s.occupyTable);
  const releaseTable = useTableStore((s) => s.releaseTable);
  const requestBill = useTableStore((s) => s.requestBill);
  const reserveTable = useTableStore((s) => s.reserveTable);
  const addTable = useTableStore((s) => s.addTable);
  const deleteTable = useTableStore((s) => s.deleteTable);
  const settings = useSettingsStore((s) => s.settings);

  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [tableName, setTableName] = useState('');
  const [tableSeats, setTableSeats] = useState('4');
  const [tableSection, setTableSection] = useState('Main Hall');

  const sections = useMemo(() => {
    const list = Array.from(new Set(tables.map((t) => t.section || 'Main Hall')));
    return ['all', ...list];
  }, [tables]);

  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      if (selectedSection === 'all') return true;
      return (t.section || 'Main Hall') === selectedSection;
    });
  }, [tables, selectedSection]);

  const stats = useMemo(() => {
    const available = tables.filter((t) => t.status === 'available').length;
    const occupied = tables.filter((t) => t.status === 'occupied').length;
    const billRequested = tables.filter((t) => t.status === 'bill_requested').length;
    const reserved = tables.filter((t) => t.status === 'reserved').length;
    return { available, occupied, billRequested, reserved, total: tables.length };
  }, [tables]);

  const handleAddTableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableName.trim()) return;
    addTable({
      name: tableName.trim(),
      seats: parseInt(tableSeats, 10) || 2,
      section: tableSection.trim() || 'Main Hall',
    });
    setTableName('');
    setTableSeats('4');
    setModalOpen(false);
    notify(t('tables.tableAdded', { defaultValue: 'Table added successfully' }));
  };

  const getStatusColor = (status: TableStatus) => {
    switch (status) {
      case 'available':
        return {
          badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          dot: 'bg-emerald-500',
          card: 'border-border hover:border-emerald-500/40',
        };
      case 'occupied':
        return {
          badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
          dot: 'bg-blue-500',
          card: 'border-blue-500/30 bg-blue-500/[0.02]',
        };
      case 'bill_requested':
        return {
          badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 animate-pulse',
          dot: 'bg-amber-500',
          card: 'border-amber-500/40 bg-amber-500/[0.02]',
        };
      case 'reserved':
        return {
          badge: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
          dot: 'bg-purple-500',
          card: 'border-purple-500/30 bg-purple-500/[0.02]',
        };
    }
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      {/* Top Header */}
      <header className="px-6 py-3.5 border-b border-border bg-card/60 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <LayoutGrid size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-base tracking-tight">
                {t('tables.title', { defaultValue: 'Floor Plan & Dining Rooms' })}
              </h1>
              <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-secondary text-muted-foreground border border-border">
                {stats.total} tables
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t('tables.subtitle', { defaultValue: 'Real-time table occupancy, guest counts, and dining checks' })}
            </p>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="flex items-center gap-2 bg-secondary/70 p-1 rounded-xl border border-border">
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground">Available:</span>
            <span className="font-mono font-semibold text-foreground">{stats.available}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs">
            <span className="size-2 rounded-full bg-blue-500" />
            <span className="text-muted-foreground">Occupied:</span>
            <span className="font-mono font-semibold text-foreground">{stats.occupied}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs">
            <span className="size-2 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">Bill Req:</span>
            <span className="font-mono font-semibold text-foreground">{stats.billRequested}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs">
            <span className="size-2 rounded-full bg-purple-500" />
            <span className="text-muted-foreground">Reserved:</span>
            <span className="font-mono font-semibold text-foreground">{stats.reserved}</span>
          </div>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="btn-primary h-9 px-3.5 text-xs rounded-xl flex items-center gap-1.5 active:scale-[0.98]"
        >
          <Plus size={14} />
          <span>{t('tables.addTable', { defaultValue: 'Add Table' })}</span>
        </button>
      </header>

      {/* Sections bar */}
      <div className="px-6 py-2.5 border-b border-border/70 bg-card/30 flex items-center gap-2 overflow-x-auto">
        <span className="text-[11px] font-mono uppercase text-muted-foreground me-1">
          {t('tables.section', { defaultValue: 'Section' })}:
        </span>
        {sections.map((sec) => (
          <button
            key={sec}
            onClick={() => setSelectedSection(sec)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              selectedSection === sec
                ? 'bg-foreground text-background shadow-xs'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {sec === 'all' ? t('tables.allSections', { defaultValue: 'All Rooms' }) : sec}
          </button>
        ))}
      </div>

      {/* Tables Grid */}
      <div className="flex-1 overflow-y-auto p-6 bg-muted/10">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredTables.map((table) => {
            const colors = getStatusColor(table.status);
            return (
              <motion.div
                key={table.id}
                layout
                className={`rounded-2xl border bg-card p-4 flex flex-col justify-between shadow-xs transition-all duration-200 hover:shadow-sm ${colors.card}`}
              >
                <div>
                  {/* Card top */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
                        {table.section || 'Main Hall'}
                      </span>
                      <h3 className="font-semibold text-base text-foreground leading-snug">
                        {table.name}
                      </h3>
                    </div>

                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${colors.badge}`}>
                      <span className={`size-1.5 rounded-full ${colors.dot}`} />
                      {table.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>

                  {/* Seat icons & metadata */}
                  <div className="space-y-2 py-2 border-y border-border/60">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Users size={13} />
                        <span>Capacity:</span>
                      </span>
                      <span className="font-mono font-medium text-foreground">
                        {table.seats} seats
                      </span>
                    </div>

                    {table.activeSince && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Clock size={13} />
                          <span>Seated:</span>
                        </span>
                        <span className="font-mono font-medium text-foreground">
                          {Math.floor((Date.now() - new Date(table.activeSince).getTime()) / 60000)}m ago
                        </span>
                      </div>
                    )}

                    {table.totalAmount !== undefined && table.totalAmount > 0 && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <DollarSign size={13} />
                          <span>Open Bill:</span>
                        </span>
                        <span className="font-mono font-bold text-foreground text-sm num">
                          {settings.currency}
                          {table.totalAmount.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="mt-4 pt-2 flex items-center gap-1.5">
                  {table.status === 'available' && (
                    <button
                      onClick={() => {
                        occupyTable(table.id);
                        if (onSelectTableForRegister) onSelectTableForRegister(table);
                      }}
                      className="flex-1 btn-primary h-8 rounded-lg text-xs font-medium flex items-center justify-center gap-1"
                    >
                      <span>Seat & Order</span>
                      <ChevronRight size={12} />
                    </button>
                  )}

                  {table.status === 'occupied' && (
                    <>
                      <button
                        onClick={() => {
                          if (onSelectTableForRegister) onSelectTableForRegister(table);
                        }}
                        className="flex-1 btn-secondary h-8 rounded-lg text-xs font-medium flex items-center justify-center gap-1"
                      >
                        <Receipt size={12} />
                        <span>View / Add Items</span>
                      </button>
                      <button
                        onClick={() => requestBill(table.id)}
                        className="px-2.5 h-8 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 text-xs font-medium"
                      >
                        Bill
                      </button>
                    </>
                  )}

                  {table.status === 'bill_requested' && (
                    <>
                      <button
                        onClick={() => {
                          if (onSelectTableForRegister) onSelectTableForRegister(table);
                        }}
                        className="flex-1 btn-primary h-8 rounded-lg text-xs font-medium flex items-center justify-center gap-1"
                      >
                        <Receipt size={12} />
                        <span>Pay Check</span>
                      </button>
                      <button
                        onClick={() => releaseTable(table.id)}
                        className="px-2.5 h-8 rounded-lg border border-border hover:bg-secondary text-xs"
                      >
                        Clear
                      </button>
                    </>
                  )}

                  {table.status === 'available' && (
                    <button
                      onClick={() => reserveTable(table.id)}
                      className="px-2.5 h-8 rounded-lg border border-border hover:bg-secondary text-xs"
                    >
                      {t('tables.reserve')}
                    </button>
                  )}

                  {table.status === 'reserved' && (
                    <button
                      onClick={() => occupyTable(table.id)}
                      className="flex-1 btn-primary h-8 rounded-lg text-xs font-medium"
                    >
                      Seat Reservation
                    </button>
                  )}

                  <button
                    onClick={async () => {
                      if (await askConfirmation(`Delete ${table.name}?`)) {
                        deleteTable(table.id);
                      }
                    }}
                    title="Delete table"
                    className="size-8 inline-flex items-center justify-center rounded-lg border border-transparent hover:border-border text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Modal: Add Table */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                  <Plus size={15} />
                  {t('tables.newTable', { defaultValue: 'Add New Dining Table' })}
                </h3>
                <button
                  onClick={() => setModalOpen(false)}
                  className="size-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground rounded-md"
                >
                  <X size={14} />
                </button>
              </div>

              <form onSubmit={handleAddTableSubmit} className="space-y-3.5 pt-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Table Identifier / Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Table 12 or Patio 4"
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-foreground"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                      Seats / Chairs
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={tableSeats}
                      onChange={(e) => setTableSeats(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground font-mono focus:outline-none focus:border-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                      Room / Section
                    </label>
                    <input
                      type="text"
                      placeholder="Main Hall"
                      value={tableSection}
                      onChange={(e) => setTableSection(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-foreground"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="btn-secondary h-8 px-3 rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary h-8 px-4 rounded-lg text-xs flex items-center gap-1.5"
                  >
                    <Check size={13} />
                    <span>Create Table</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
