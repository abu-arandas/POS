import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  UserPlus,
  Edit2,
  Trash2,
  Calendar,
  Phone,
  Mail,
  X,
  Check,
  ShoppingBag,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Customer } from '../types';

import { useCustomerStore } from '../stores/customerStore';
import { useTransactionStore } from '../stores/transactionStore';
import { useSettingsStore } from '../stores/settingsStore';
import { syncToCloudIfEnabled } from '../lib/sync';
import { useTranslation } from 'react-i18next';

export default function Customers() {
  const { t } = useTranslation();
  const { customers, handleAddCustomer, handleUpdateCustomer, handleDeleteCustomer } =
    useCustomerStore();
  const { transactions } = useTransactionStore();
  const { settings } = useSettingsStore();
  // Search and sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'points' | 'date'>('name');

  // Active Selected Customer for detail panel
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Customer Form Modal State
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Customer Form Fields
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPoints, setCustPoints] = useState('0');

  const activeCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  // Selected customer purchase history
  const activeCustomerTransactions = useMemo(() => {
    if (!selectedCustomerId) return [];
    return transactions.filter((tx) => tx.customerId === selectedCustomerId);
  }, [transactions, selectedCustomerId]);

  // Customer metrics
  const activeCustomerStats = useMemo(() => {
    if (activeCustomerTransactions.length === 0) {
      return { totalSpent: 0, averageSpent: 0, totalVisits: 0 };
    }
    // Partially-refunded sales count net of the refund; only fully-refunded
    // sales drop out (matching the Dashboard and History totals).
    const completedTx = activeCustomerTransactions.filter((t) => t.status !== 'refunded');
    const totalSpent = completedTx.reduce(
      (sum, tx) => sum + tx.total - (tx.refundedAmount ?? 0),
      0,
    );
    const totalVisits = completedTx.length;
    const averageSpent = totalVisits > 0 ? totalSpent / totalVisits : 0;

    return {
      totalSpent: Number(totalSpent.toFixed(2)),
      averageSpent: Number(averageSpent.toFixed(2)),
      totalVisits,
    };
  }, [activeCustomerTransactions]);

  // Filtering & sorting customer list
  const sortedAndFilteredCustomers = useMemo(() => {
    const list = customers.filter((c) => {
      return (
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery)
      );
    });

    list.sort((a, b) => {
      if (sortBy === 'points') {
        return b.points - a.points; // Descending
      }
      if (sortBy === 'date') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // Newest first
      }
      return a.name.localeCompare(b.name); // Ascending Name
    });

    return list;
  }, [customers, searchQuery, sortBy]);

  // Add / Edit actions
  const handleOpenAddCustomer = () => {
    setEditingCustomer(null);
    setCustName('');
    setCustPhone('');
    setCustEmail('');
    setCustPoints('0');
    setCustomerModalOpen(true);
  };

  const handleOpenEditCustomer = (cust: Customer) => {
    setEditingCustomer(cust);
    setCustName(cust.name);
    setCustPhone(cust.phone);
    setCustEmail(cust.email);
    setCustPoints(cust.points.toString());
    setCustomerModalOpen(true);
  };

  const handleSubmitCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) return;

    const payload = {
      name: custName.trim(),
      phone: custPhone.trim(),
      email: custEmail.trim(),
      points: parseInt(custPoints) || 0,
    };

    if (editingCustomer) {
      const updated = {
        ...editingCustomer,
        ...payload,
      };
      handleUpdateCustomer(updated);
      syncToCloudIfEnabled(undefined, undefined, [updated]);
    } else {
      const added = handleAddCustomer(payload.name, payload.phone, payload.email);
      syncToCloudIfEnabled(undefined, undefined, [added]);
    }
    setCustomerModalOpen(false);
  };

  // Customer Loyalty Tier helper
  const getCustomerTier = (points: number) => {
    if (points >= 200)
      return { name: t('customers.tierPlatinum'), style: 'bg-indigo-500 text-white' };
    if (points >= 100)
      return { name: t('customers.tierGold'), style: 'bg-amber-500 text-slate-900' };
    return { name: t('customers.tierSilver'), style: 'bg-slate-200 text-slate-700' };
  };

  return (
    <div
      id="customers-root"
      className="flex-1 flex h-screen overflow-hidden bg-transparent p-6 text-slate-800 dark:text-slate-100"
    >
      {/* LEFT COLUMN: Customer Directory (2/3 width) */}
      <div
        id="customer-directory-section"
        className="flex-1 flex flex-col min-w-0 pe-6 overflow-hidden"
      >
        {/* Header */}
        <div id="customers-header" className="mb-6 shrink-0 flex items-center justify-between">
          <div>
            <h2 className="font-sans font-extrabold tracking-tight text-slate-900 dark:text-white text-xl sm:text-2xl flex items-center gap-2">
              <Users className="text-emerald-500" /> {t('customers.customerLoyaltyCrm')}
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              {t('customers.manageCustomerAccounts')}
            </p>
          </div>

          <button
            id="add-customer-trigger-btn"
            onClick={handleOpenAddCustomer}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-sans font-bold text-xs sm:text-sm px-4 py-2 rounded-xl flex items-center space-x-1.5 shadow-lg shadow-emerald-600/10"
          >
            <UserPlus size={16} />
            <span>{t('customers.newCustomer')}</span>
          </button>
        </div>

        {/* Filters */}
        <div
          id="customers-filters"
          className="glass dark:glass-dark p-4 rounded-2xl border border-white/20 dark:border-white/10 shadow-lg space-y-4 mb-6 shrink-0 backdrop-blur-md"
        >
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 flex items-center space-x-2 bg-slate-100 dark:bg-slate-800/60 px-3 py-2 rounded-xl border border-slate-200/40 dark:border-slate-700/40">
              <Search size={16} className="text-slate-400" />
              <input
                id="customer-search-input"
                type="text"
                placeholder={t('customers.searchCrm')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent border-none text-slate-800 dark:text-slate-100 text-xs focus:outline-none placeholder-slate-400"
              />
            </div>

            {/* Sorting buttons */}
            <div className="flex bg-slate-100 dark:bg-slate-800/60 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
              {(
                [
                  { id: 'name', label: t('customers.alphabetical') },
                  { id: 'points', label: t('customers.loyaltyPoints') },
                  { id: 'date', label: t('customers.joinDate') },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setSortBy(opt.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all shrink-0 ${
                    sortBy === opt.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Directory Grid */}
        <div id="crm-grid-container" className="flex-1 overflow-y-auto pe-1">
          {sortedAndFilteredCustomers.length === 0 ? (
            <div className="bg-white dark:bg-slate-900/60 rounded-2xl p-12 text-center text-slate-400 font-mono text-xs border border-slate-200 dark:border-slate-700">
              {t('customers.noCustomersMatching')}
            </div>
          ) : (
            <div id="crm-grid" className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sortedAndFilteredCustomers.map((cust) => {
                const tier = getCustomerTier(cust.points);
                const isSelected = cust.id === selectedCustomerId;

                return (
                  <motion.div
                    key={cust.id}
                    layoutId={`crm-card-${cust.id}`}
                    id={`crm-card-${cust.id}`}
                    onClick={() => setSelectedCustomerId(cust.id)}
                    className={`glass dark:glass-dark rounded-2xl border p-4 shadow-lg hover:shadow-xl transition-all cursor-pointer flex items-start justify-between card-hover backdrop-blur-md ${
                      isSelected
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                        : 'border-white/20 dark:border-white/10 hover:border-white/40 dark:hover:border-white/20'
                    }`}
                  >
                    <div className="space-y-3 min-w-0 flex-1 pe-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-sans font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight truncate max-w-[150px]">
                          {cust.name}
                        </h4>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase font-mono tracking-wider ${tier.style}`}
                        >
                          {tier.name}
                        </span>
                      </div>

                      <div className="space-y-1 font-sans text-[11px] text-slate-500 dark:text-slate-400">
                        <p className="flex items-center gap-1.5 truncate">
                          <Mail size={12} /> {cust.email || t('customers.noEmail')}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Phone size={12} /> {cust.phone || t('customers.noPhone')}
                        </p>
                        <p className="flex items-center gap-1.5 font-mono text-[10px]">
                          <Calendar size={12} /> {t('customers.registered')} {cust.createdAt}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end justify-between h-full space-y-4 shrink-0">
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-1.5 text-center shadow-inner">
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block uppercase tracking-wider font-mono">
                          {t('customers.points')}
                        </span>
                        <span className="font-mono font-extrabold text-sm text-emerald-700 dark:text-emerald-300">
                          {cust.points}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditCustomer(cust);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          title={t('customers.editCustomerDetails')}
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          id={`del-cust-${cust.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(t('customers.deleteConfirm', { name: cust.name }))) {
                              handleDeleteCustomer(cust.id);
                              if (selectedCustomerId === cust.id) setSelectedCustomerId(null);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100/50 dark:hover:bg-rose-500/20 rounded-lg transition-colors"
                          title={t('customers.deleteCustomerRecord')}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Customer Shopping Analytics & Order Log (1/3 width) */}
      <div
        id="crm-profile-section"
        className="w-80 glass dark:glass-dark border border-white/20 dark:border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden shrink-0 backdrop-blur-md"
      >
        {activeCustomer ? (
          <>
            {/* Header Profiler */}
            <div className="p-5 border-b border-slate-200/50 dark:border-slate-700/50 bg-white/40 dark:bg-slate-900/40 flex items-center justify-between">
              <div>
                <h3 className="font-sans font-bold text-slate-800 dark:text-white text-sm">
                  {activeCustomer.name}
                </h3>
                <span className="text-[10px] font-mono text-slate-400">
                  {t('customers.account')} {activeCustomer.id}
                </span>
              </div>
              <button
                onClick={() => setSelectedCustomerId(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm"
              >
                <X size={14} />
              </button>
            </div>

            {/* Profile body scroll */}
            <div className="flex-1 p-5 overflow-y-auto space-y-5">
              {/* Stats KPI Card */}
              <div id="crm-stats-block" className="grid grid-cols-2 gap-3">
                <div className="bg-white/40 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl p-3 text-center shadow-inner">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider font-mono">
                    {t('customers.totalSpent')}
                  </span>
                  <p className="font-mono font-extrabold text-sm text-slate-800 dark:text-slate-100 mt-1">
                    {settings.currency}
                    {activeCustomerStats.totalSpent.toFixed(2)}
                  </p>
                </div>
                <div className="bg-white/40 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl p-3 text-center shadow-inner">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider font-mono">
                    {t('customers.orderCount')}
                  </span>
                  <p className="font-mono font-extrabold text-sm text-slate-800 dark:text-slate-100 mt-1">
                    {activeCustomerStats.totalVisits} {t('customers.visits')}
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-3 text-center shadow-xs col-span-2">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider font-mono">
                    {t('customers.averageTicketValue')}
                  </span>
                  <p className="font-mono font-extrabold text-sm text-emerald-600 mt-1">
                    {settings.currency}
                    {activeCustomerStats.averageSpent.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Purchase history log list */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <ShoppingBag size={12} /> {t('customers.purchaseHistoryLog')}
                </h4>

                {activeCustomerTransactions.length === 0 ? (
                  <p className="text-[10px] font-mono text-slate-400 text-center py-6 bg-white dark:bg-slate-900/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                    {t('customers.noLinkedSales')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeCustomerTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="bg-white/60 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50 rounded-xl p-2.5 flex items-center justify-between shadow-sm text-[11px]"
                      >
                        <div>
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-100 block">
                            {tx.id}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {new Date(tx.date).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-extrabold block text-slate-900 dark:text-white">
                            {settings.currency}
                            {tx.total.toFixed(2)}
                          </span>
                          <span
                            className={`text-[9px] font-bold ${
                              tx.status === 'refunded'
                                ? 'text-rose-500'
                                : tx.status === 'partial'
                                  ? 'text-amber-500'
                                  : 'text-slate-400'
                            }`}
                          >
                            {tx.status === 'refunded'
                              ? t('customers.refunded')
                              : tx.status === 'partial'
                                ? t('history.partial')
                                : t('customers.completed')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 bg-slate-50/20">
            <span className="text-4xl mb-2">🏅</span>
            <h4 className="font-sans font-bold text-slate-700 dark:text-slate-200 text-sm">
              {t('customers.crmProfileOffline')}
            </h4>
            <p className="text-xs text-slate-400 max-w-[200px] mt-1">
              {t('customers.selectClientCard')}
            </p>
          </div>
        )}
      </div>

      {/* MODAL: Customer Form */}
      <AnimatePresence>
        {customerModalOpen && (
          <div
            id="crm-form-modal"
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="font-sans font-bold text-slate-800 text-base">
                  {editingCustomer
                    ? t('customers.editCustomerRecord')
                    : t('customers.registerNewCustomer')}
                </h3>
                <button
                  onClick={() => setCustomerModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 bg-white border border-slate-200 rounded-lg shadow-sm"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmitCustomer}>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      {t('customers.customerFullName')}
                    </label>
                    <input
                      id="form-cust-name"
                      type="text"
                      required
                      placeholder="e.g. Eleanor Vance"
                      value={custName}
                      onChange={(e) => setCustName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      {t('customers.phoneNumber')}
                    </label>
                    <input
                      id="form-cust-phone"
                      type="tel"
                      placeholder="e.g. 555-1234"
                      value={custPhone}
                      onChange={(e) => setCustPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      {t('customers.emailAddress')}
                    </label>
                    <input
                      id="form-cust-email"
                      type="email"
                      placeholder="e.g. eleanor@example.com"
                      value={custEmail}
                      onChange={(e) => setCustEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {editingCustomer && (
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        {t('customers.adjustLoyaltyPoints')}
                      </label>
                      <input
                        id="form-cust-points"
                        type="number"
                        min="0"
                        value={custPoints}
                        onChange={(e) => setCustPoints(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                      />
                    </div>
                  )}
                </div>

                <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setCustomerModalOpen(false)}
                    className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"
                  >
                    {t('customers.cancel')}
                  </button>
                  <button
                    type="submit"
                    id="form-submit-cust-btn"
                    className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-sans font-bold text-xs sm:text-sm rounded-xl flex items-center shadow-lg shadow-slate-900/10"
                  >
                    <Check size={16} className="me-1" />
                    <span>{t('customers.saveCustomer')}</span>
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
