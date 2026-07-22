import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  UserPlus,
  Edit2,
  Trash2,
  Phone,
  Mail,
  X,
  Check,
  ShoppingBag,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Customer } from '../types';

import { useCustomerStore } from '../stores/customerStore';
import { useTransactionStore } from '../stores/transactionStore';
import { useSettingsStore } from '../stores/settingsStore';
import { syncToCloudIfEnabled } from '../lib/sync';
import { useModalA11y } from '../lib/useModalA11y';
import { useTranslation } from 'react-i18next';

export default function Customers() {
  const { t } = useTranslation();
  const { customers, handleAddCustomer, handleUpdateCustomer, handleDeleteCustomer } = useCustomerStore();
  const { transactions } = useTransactionStore();
  const { settings } = useSettingsStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'points' | 'date'>('name');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPoints, setCustPoints] = useState('0');

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  const customerModalRef = useModalA11y(customerModalOpen, () => setCustomerModalOpen(false));
  const deleteModalRef = useModalA11y(deleteModalOpen, () => {
    setDeleteModalOpen(false);
    setCustomerToDelete(null);
  });

  const activeCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  const activeCustomerTransactions = useMemo(() => {
    if (!selectedCustomerId) return [];
    return transactions.filter((tx) => tx.customerId === selectedCustomerId);
  }, [transactions, selectedCustomerId]);

  const activeCustomerStats = useMemo(() => {
    if (activeCustomerTransactions.length === 0) {
      return { totalSpent: 0, averageSpent: 0, totalVisits: 0 };
    }
    const validTx = activeCustomerTransactions.filter(
      (t) => t.status === 'completed' || t.status === 'partial',
    );
    const totalSpent = validTx.reduce(
      (sum, tx) => sum + tx.total - (tx.refundedAmount ?? 0), 0,
    );
    const totalVisits = validTx.length;
    const averageSpent = totalVisits > 0 ? totalSpent / totalVisits : 0;

    return {
      totalSpent: Number(totalSpent.toFixed(2)),
      averageSpent: Number(averageSpent.toFixed(2)),
      totalVisits,
    };
  }, [activeCustomerTransactions]);

  const sortedAndFilteredCustomers = useMemo(() => {
    const list = customers.filter((c) => {
      return (
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery)
      );
    });

    list.sort((a, b) => {
      if (sortBy === 'points') return b.points - a.points;
      if (sortBy === 'date') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [customers, searchQuery, sortBy]);

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

  const confirmDelete = (cust: Customer) => {
    setCustomerToDelete(cust);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (customerToDelete) {
      handleDeleteCustomer(customerToDelete.id);
      if (selectedCustomerId === customerToDelete.id) setSelectedCustomerId(null);
      setDeleteModalOpen(false);
      setCustomerToDelete(null);
    }
  };

  const getCustomerTier = (points: number) => {
    if (points >= 200) return { name: t('customers.tierPlatinum'), badge: 'badge-purple' };
    if (points >= 100) return { name: t('customers.tierGold'), badge: 'badge-amber' };
    return { name: t('customers.tierSilver'), badge: 'badge-slate' };
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  const getColorByLetter = (letter: string) => {
    const char = letter.toUpperCase();
    if (char < 'H') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (char < 'O') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (char < 'U') return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  };

  return (
    <div id="customers-root" className="flex-1 flex h-screen overflow-hidden bg-transparent p-6 text-slate-100">
      <div id="customer-directory-section" className="flex-1 flex flex-col min-w-0 pe-6 overflow-hidden">
        <div id="customers-header" className="mb-6 shrink-0 flex items-center justify-between">
          <div>
            <h2 className="font-sans font-extrabold tracking-tight text-white text-xl sm:text-2xl flex items-center gap-2">
              <Users className="text-emerald-500" /> {t('customers.customerLoyaltyCrm')}
            </h2>
            <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
              {t('customers.manageCustomerAccounts')}
            </p>
          </div>
          <button
            id="add-customer-trigger-btn"
            onClick={handleOpenAddCustomer}
            className="bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-sans font-bold text-xs sm:text-sm px-4 py-2 rounded-2xl flex items-center space-x-1.5 transition-all shadow-lg shadow-emerald-500/20"
          >
            <UserPlus size={16} />
            <span>{t('customers.newCustomer')}</span>
          </button>
        </div>

        <div id="customers-filters" className="glass-dark p-4 rounded-3xl border border-white/10 shadow-lg space-y-4 mb-6 shrink-0">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 flex items-center space-x-2 glass-input px-4 py-2.5 rounded-2xl">
              <Search size={16} className="text-slate-400" />
              <input
                id="customer-search-input"
                type="text"
                placeholder={t('customers.searchCrm')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent border-none text-slate-200 text-sm focus:outline-none placeholder-slate-500"
              />
            </div>
            <div className="flex glass-input p-1 rounded-2xl shrink-0">
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
                  className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all shrink-0 ${
                    sortBy === opt.id
                      ? 'bg-slate-700 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div id="crm-grid-container" className="flex-1 overflow-y-auto pe-1 scrollbar-none">
          {sortedAndFilteredCustomers.length === 0 ? (
            <div className="glass-dark rounded-3xl p-16 flex flex-col items-center justify-center text-center animate-fade-up">
              <div className="text-6xl mb-4 animate-bounce-in">🕵️‍♂️</div>
              <h3 className="text-xl font-bold text-white mb-2">{t('customers.noCustomersMatching')}</h3>
              <p className="text-slate-400 text-sm mb-6 max-w-sm">
                Try adjusting your search filters or add a new customer to the database.
              </p>
              <button
                onClick={handleOpenAddCustomer}
                className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 rounded-2xl text-sm font-bold transition-all shadow-lg"
              >
                + {t('customers.newCustomer')}
              </button>
            </div>
          ) : (
             <div id="crm-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
              {sortedAndFilteredCustomers.map((cust, idx) => {
                const tier = getCustomerTier(cust.points);
                const isSelected = cust.id === selectedCustomerId;
                const initials = getInitials(cust.name);
                const avatarColor = getColorByLetter(initials[0] || 'A');

                return (
                  <motion.div
                    key={cust.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (idx % 10) * 0.05 }}
                    layoutId={`crm-card-${cust.id}`}
                    id={`crm-card-${cust.id}`}
                    onClick={() => setSelectedCustomerId(cust.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedCustomerId(cust.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    className={`glass-dark rounded-3xl border p-5 shadow-lg hover:shadow-xl transition-all cursor-pointer flex flex-col justify-between card-hover group ${
                      isSelected
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-slate-800/80'
                        : 'border-white/5 hover:border-white/10 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className={`w-12 h-12 rounded-full border flex items-center justify-center font-bold text-lg shrink-0 ${avatarColor}`}>
                        {initials}
                      </div>
                      <div className="space-y-1 min-w-0 flex-1">
                        <h4 className="font-sans font-bold text-white text-base truncate">
                          {cust.name}
                        </h4>
                        <div className="flex flex-col space-y-1 text-xs text-slate-400">
                          {cust.email && (
                            <span className="flex items-center gap-1.5 truncate">
                              <Mail size={12} className="text-slate-500 shrink-0" /> <span className="truncate">{cust.email}</span>
                            </span>
                          )}
                          {cust.phone && (
                            <span className="flex items-center gap-1.5">
                              <Phone size={12} className="text-slate-500 shrink-0" /> {cust.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-2">
                        <span className={`badge ${tier.badge}`}>
                          {tier.name}
                        </span>
                        <div className="flex items-center gap-1 bg-slate-800/80 border border-slate-700 rounded-xl px-2 py-1 shadow-inner">
                          <span className="font-mono font-bold text-xs text-emerald-400">
                            {cust.points}
                          </span>
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                            Pts
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditCustomer(cust);
                          }}
                          className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                          aria-label={t('customers.editCustomerDetails')}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          id={`del-cust-${cust.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmDelete(cust);
                          }}
                          className="p-2 text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-500 rounded-xl transition-colors"
                          aria-label={t('customers.deleteCustomerRecord')}
                        >
                          <Trash2 size={14} />
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

      <div
        id="crm-profile-section"
        className="w-80 glass-dark border border-white/10 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden shrink-0"
      >
        {activeCustomer ? (
          <motion.div 
            key={activeCustomer.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col h-full"
          >
            <div className="p-6 border-b border-white/10 bg-slate-900/40 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />
              <div className="flex items-start justify-between relative z-10">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-full border flex items-center justify-center font-bold text-xl ${getColorByLetter(getInitials(activeCustomer.name)[0])}`}>
                    {getInitials(activeCustomer.name)}
                  </div>
                  <div>
                    <h3 className="font-sans font-bold text-white text-lg leading-tight">
                      {activeCustomer.name}
                    </h3>
                    <span className="text-xs font-mono text-slate-400 mt-1 block">
                      ID: {activeCustomer.id.substring(0, 8)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCustomerId(null)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-colors shadow-sm"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto space-y-6 scrollbar-none">
              <div id="crm-stats-block" className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 text-center">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider font-mono mb-1">
                    {t('customers.totalSpent')}
                  </span>
                  <p className="font-mono font-extrabold text-lg text-white">
                    {settings.currency}{activeCustomerStats.totalSpent.toFixed(2)}
                  </p>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 text-center">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider font-mono mb-1">
                    {t('customers.orderCount')}
                  </span>
                  <p className="font-mono font-extrabold text-lg text-white">
                    {activeCustomerStats.totalVisits}
                  </p>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center col-span-2">
                  <span className="text-[10px] text-emerald-500 font-bold block uppercase tracking-wider font-mono mb-1">
                    {t('customers.averageTicketValue')}
                  </span>
                  <p className="font-mono font-extrabold text-xl text-emerald-400">
                    {settings.currency}{activeCustomerStats.averageSpent.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-2 pb-2 border-b border-white/5">
                  <ShoppingBag size={14} /> {t('customers.purchaseHistoryLog')}
                </h4>
                {activeCustomerTransactions.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8 bg-slate-800/30 rounded-2xl border border-dashed border-slate-700/50">
                    {t('customers.noLinkedSales')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeCustomerTransactions.slice().reverse().map((tx) => (
                      <div
                        key={tx.id}
                        className="bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/50 rounded-2xl p-3 flex items-center justify-between transition-colors cursor-default"
                      >
                        <div>
                          <span className="font-mono font-bold text-slate-200 text-xs block">{tx.id.substring(0,8)}</span>
                          <span className="text-[10px] text-slate-400 mt-1 block">
                            {new Date(tx.date).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-sm text-white block">
                            {settings.currency}{tx.total.toFixed(2)}
                          </span>
                          <span className={`badge mt-1 ${tx.status === 'refunded' ? 'badge-rose' : 'badge-emerald'}`}>
                            {tx.status === 'refunded' ? t('customers.refunded') : t('customers.completed')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="w-24 h-24 bg-slate-800/50 rounded-full flex items-center justify-center mb-6 border border-slate-700/50 shadow-inner">
              <span className="text-4xl">🏅</span>
            </div>
            <h4 className="font-sans font-bold text-white text-lg mb-2">
              {t('customers.crmProfileOffline')}
            </h4>
            <p className="text-sm text-slate-400 max-w-[200px] leading-relaxed">
              {t('customers.selectClientCard')}
            </p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {customerModalOpen && (
          <div id="crm-form-modal" className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
            <motion.div
              ref={customerModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="crm-form-title"
              tabIndex={-1}
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: -20 }}
              className="modal-card max-w-sm w-full overflow-hidden"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-slate-800/30">
                <h3 id="crm-form-title" className="font-sans font-bold text-white text-lg">
                  {editingCustomer ? t('customers.editCustomerRecord') : t('customers.registerNewCustomer')}
                </h3>
                <button
                  type="button"
                  onClick={() => setCustomerModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl transition-colors"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitCustomer}>
                <div className="p-6 space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                      {t('customers.customerFullName')}
                    </label>
                    <input
                      id="form-cust-name"
                      type="text"
                      required
                      placeholder="e.g. Eleanor Vance"
                      value={custName}
                      onChange={(e) => setCustName(e.target.value)}
                      className="w-full glass-input rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                      {t('customers.phoneNumber')}
                    </label>
                    <input
                      id="form-cust-phone"
                      type="tel"
                      placeholder="e.g. 555-1234"
                      value={custPhone}
                      onChange={(e) => setCustPhone(e.target.value)}
                      className="w-full glass-input rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                      {t('customers.emailAddress')}
                    </label>
                    <input
                      id="form-cust-email"
                      type="email"
                      placeholder="e.g. eleanor@example.com"
                      value={custEmail}
                      onChange={(e) => setCustEmail(e.target.value)}
                      className="w-full glass-input rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>

                  {editingCustomer && (
                    <div className="space-y-1.5 pt-2 border-t border-white/5">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                        {t('customers.adjustLoyaltyPoints')}
                      </label>
                      <input
                        id="form-cust-points"
                        type="number"
                        min="0"
                        value={custPoints}
                        onChange={(e) => setCustPoints(e.target.value)}
                        className="w-full glass-input rounded-xl px-4 py-3 text-sm text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500 transition-colors bg-slate-900/50"
                      />
                    </div>
                  )}
                </div>

                <div className="p-6 border-t border-white/10 bg-slate-800/30 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setCustomerModalOpen(false)}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-colors"
                  >
                    {t('customers.cancel')}
                  </button>
                  <button
                    type="submit"
                    id="form-submit-cust-btn"
                    className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-sans font-bold text-sm rounded-xl flex items-center shadow-lg shadow-emerald-500/20 transition-all"
                  >
                    <Check size={16} className="me-2" />
                    <span>{t('customers.saveCustomer')}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteModalOpen && customerToDelete && (
          <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
            <motion.div
              ref={deleteModalRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="crm-delete-title"
              tabIndex={-1}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="modal-card max-w-sm w-full overflow-hidden"
            >
              <div className="p-6 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mb-4">
                  <AlertTriangle size={32} />
                </div>
                <h3 id="crm-delete-title" className="text-xl font-bold text-white mb-2">{t('customers.deleteConfirm', { name: customerToDelete.name })}</h3>
                <p className="text-sm text-slate-400 mb-6">
                  This action cannot be undone. All related customer data will be permanently removed.
                </p>
                <div className="flex w-full gap-3">
                  <button
                    type="button"
                    onClick={() => { setDeleteModalOpen(false); setCustomerToDelete(null); }}
                    className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteConfirm}
                    className="flex-1 px-4 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold shadow-lg shadow-rose-500/20 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
