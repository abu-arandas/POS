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
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Customer } from '../types';

import { useCustomerStore } from '../stores/customerStore';
import { useTransactionStore } from '../stores/transactionStore';
import { customerStats, filterAndSortCustomers } from '../lib/customerStats';
import { useSettingsStore } from '../stores/settingsStore';
import { syncToCloudIfEnabled } from '../lib/sync';
import { useModalA11y } from '../lib/useModalA11y';
import { useTranslation } from 'react-i18next';

/**
 * Customer book screen: search, add, edit and delete customers, and review
 * loyalty balances.
 */
export default function Customers() {
  const { t } = useTranslation();
  const { customers, handleAddCustomer, handleUpdateCustomer, handleDeleteCustomer } =
    useCustomerStore();
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

  const activeCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId],
  );

  const activeCustomerTransactions = useMemo(
    () =>
      selectedCustomerId ? transactions.filter((tx) => tx.customerId === selectedCustomerId) : [],
    [transactions, selectedCustomerId],
  );

  const activeCustomerStats = useMemo(
    () => customerStats(activeCustomerTransactions),
    [activeCustomerTransactions],
  );

  const sortedAndFilteredCustomers = useMemo(
    () => filterAndSortCustomers(customers, searchQuery, sortBy),
    [customers, searchQuery, sortBy],
  );

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

  /**
   * Saves the customer form, creating a new record or updating the one being
   * edited. A blank name is rejected without a message: the field is required
   * and empty, which the form already shows.
   */
  const handleSubmitCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) return;

    const payload = {
      name: custName.trim(),
      phone: custPhone.trim(),
      email: custEmail.trim(),
      points: parseInt(custPoints, 10) || 0,
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
    if (points >= 200)
      return {
        name: t('customers.tierPlatinum'),
        badge: 'bg-foreground/10 text-foreground border-foreground/20',
      };
    if (points >= 100)
      return {
        name: t('customers.tierGold'),
        badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
      };
    return {
      name: t('customers.tierSilver'),
      badge: 'bg-secondary text-muted-foreground border-border',
    };
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <div
      id="customers-root"
      className="flex-1 flex h-screen overflow-hidden bg-background p-6 text-foreground"
    >
      <div
        id="customer-directory-section"
        className="flex-1 flex flex-col min-w-0 pe-6 overflow-hidden"
      >
        {/* Header */}
        <div id="customers-header" className="mb-6 shrink-0 flex items-center justify-between">
          <div>
            <h2 className="font-semibold tracking-tight text-foreground text-xl sm:text-2xl flex items-center gap-2">
              <Users className="size-5 text-muted-foreground" /> {t('customers.customerLoyaltyCrm')}
            </h2>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
              {t('customers.manageCustomerAccounts')}
            </p>
          </div>
          <button
            id="add-customer-trigger-btn"
            onClick={handleOpenAddCustomer}
            className="btn-primary h-9 px-4 text-xs font-medium gap-1.5"
          >
            <UserPlus size={15} />
            <span>{t('customers.newCustomer')}</span>
          </button>
        </div>

        {/* Filter / Search Bar */}
        <div
          id="customers-filters"
          className="bg-card border border-border rounded-xl p-3 shadow-2xs mb-5 shrink-0"
        >
          <div className="flex flex-col md:flex-row gap-2.5">
            <div className="flex-1 flex items-center gap-2 bg-secondary/50 border border-border px-3 py-1.5 rounded-lg focus-within:border-foreground/40 transition-colors">
              <Search size={15} className="text-muted-foreground shrink-0" />
              <input
                id="customer-search-input"
                type="text"
                aria-label={t('customers.searchCrm')}
                placeholder={t('customers.searchCrm')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent border-none text-foreground text-xs sm:text-sm focus:outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex bg-secondary/40 border border-border p-0.5 rounded-lg shrink-0">
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
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all shrink-0 ${
                    sortBy === opt.id
                      ? 'bg-background text-foreground shadow-2xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Customer Cards Grid */}
        <div id="crm-grid-container" className="flex-1 overflow-y-auto pe-1 scrollbar-none">
          {sortedAndFilteredCustomers.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-xl p-12 flex flex-col items-center justify-center text-center">
              <div className="size-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground mb-3">
                <Users size={18} />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">
                {t('customers.noCustomersMatching')}
              </h3>
              <p className="text-muted-foreground text-xs mb-5 max-w-sm">
                {t('customers.noMatchHint')}
              </p>
              <button onClick={handleOpenAddCustomer} className="btn-secondary h-8 px-3 text-xs">
                + {t('customers.newCustomer')}
              </button>
            </div>
          ) : (
            <div
              id="crm-grid"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pb-4"
            >
              {sortedAndFilteredCustomers.map((cust) => {
                const tier = getCustomerTier(cust.points);
                const isSelected = cust.id === selectedCustomerId;
                const initials = getInitials(cust.name);

                return (
                  <div
                    key={cust.id}
                    id={`crm-card-${cust.id}`}
                    onClick={() => setSelectedCustomerId(cust.id)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedCustomerId(cust.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    className={`bg-card border rounded-xl p-4 shadow-2xs transition-all cursor-pointer flex flex-col justify-between group ${
                      isSelected
                        ? 'border-foreground ring-1 ring-foreground/20 bg-secondary/30'
                        : 'border-border hover:border-foreground/30 hover:bg-secondary/15'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="size-10 rounded-full bg-secondary border border-border flex items-center justify-center font-mono font-medium text-xs text-foreground shrink-0">
                        {initials}
                      </div>
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <h4 className="font-semibold text-foreground text-xs sm:text-sm truncate">
                          {cust.name}
                        </h4>
                        <div className="flex flex-col space-y-0.5 text-[11px] text-muted-foreground">
                          {cust.email && (
                            <span className="flex items-center gap-1 truncate">
                              <Mail size={11} className="text-muted-foreground shrink-0" />
                              <span className="truncate">{cust.email}</span>
                            </span>
                          )}
                          {cust.phone && (
                            <span className="flex items-center gap-1 font-mono">
                              <Phone size={11} className="text-muted-foreground shrink-0" />{' '}
                              {cust.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-border">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${tier.badge}`}
                        >
                          {tier.name}
                        </span>
                        <div className="flex items-center gap-1 bg-secondary border border-border rounded px-1.5 py-0.5">
                          <span className="font-mono num font-semibold text-xs text-foreground">
                            {cust.points}
                          </span>
                          <span className="text-[9px] text-muted-foreground font-mono uppercase">
                            {t('customers.pointsShort')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditCustomer(cust);
                          }}
                          className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                          aria-label={t('customers.editCustomerDetails')}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          id={`del-cust-${cust.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmDelete(cust);
                          }}
                          className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          aria-label={t('customers.deleteCustomerRecord')}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* CRM Profile Sidebar */}
      <div
        id="crm-profile-section"
        className="w-80 bg-card border border-border rounded-xl shadow-xs flex flex-col overflow-hidden shrink-0"
      >
        {activeCustomer ? (
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-border bg-secondary/20 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-full bg-secondary border border-border flex items-center justify-center font-mono font-semibold text-sm text-foreground">
                  {getInitials(activeCustomer.name)}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm leading-tight">
                    {activeCustomer.name}
                  </h3>
                  <span className="text-[11px] font-mono text-muted-foreground mt-0.5 block">
                    ID: {activeCustomer.id.substring(0, 8)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedCustomerId(null)}
                className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                aria-label={t('register.close', 'Close')}
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-5 scrollbar-none">
              <div id="crm-stats-block" className="grid grid-cols-2 gap-2">
                <div className="bg-secondary/40 border border-border rounded-lg p-3 text-center">
                  <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider block mb-1">
                    {t('customers.totalSpent')}
                  </span>
                  <p className="font-mono num font-semibold text-sm sm:text-base text-foreground">
                    {settings.currency}
                    {activeCustomerStats.totalSpent.toFixed(2)}
                  </p>
                </div>
                <div className="bg-secondary/40 border border-border rounded-lg p-3 text-center">
                  <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider block mb-1">
                    {t('customers.orderCount')}
                  </span>
                  <p className="font-mono num font-semibold text-sm sm:text-base text-foreground">
                    {activeCustomerStats.totalVisits}
                  </p>
                </div>
                <div className="bg-secondary/60 border border-border rounded-lg p-3 text-center col-span-2">
                  <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider block mb-1">
                    {t('customers.averageTicketValue')}
                  </span>
                  <p className="font-mono num font-semibold text-base sm:text-lg text-foreground">
                    {settings.currency}
                    {activeCustomerStats.averageSpent.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider font-mono flex items-center gap-1.5 pb-2 border-b border-border">
                  <ShoppingBag size={13} /> {t('customers.purchaseHistoryLog')}
                </h4>
                {activeCustomerTransactions.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6 bg-secondary/30 rounded-lg border border-dashed border-border">
                    {t('customers.noLinkedSales')}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {activeCustomerTransactions
                      .slice()
                      .reverse()
                      .map((tx) => (
                        <div
                          key={tx.id}
                          className="bg-secondary/30 hover:bg-secondary/60 border border-border rounded-lg p-2.5 flex items-center justify-between transition-colors"
                        >
                          <div>
                            <span className="font-mono num font-medium text-foreground text-xs block">
                              #{tx.id.substring(0, 8)}
                            </span>
                            <span className="text-[10px] text-muted-foreground mt-0.5 block font-mono">
                              {new Date(tx.date).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="text-end">
                            <span className="font-mono num font-semibold text-xs text-foreground block">
                              {settings.currency}
                              {tx.total.toFixed(2)}
                            </span>
                            <span
                              className={`text-[9px] uppercase font-semibold px-1 py-0.2 rounded border ${
                                tx.status === 'refunded'
                                  ? 'bg-destructive/10 text-destructive border-destructive/20'
                                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              }`}
                            >
                              {tx.status === 'refunded'
                                ? t('customers.refunded')
                                : t('customers.completed')}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <div className="size-12 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground mb-3">
              <Users size={20} />
            </div>
            <h4 className="font-semibold text-foreground text-sm mb-1">
              {t('customers.crmProfileOffline')}
            </h4>
            <p className="text-xs text-muted-foreground max-w-[180px] leading-relaxed">
              {t('customers.selectClientCard')}
            </p>
          </div>
        )}
      </div>

      {/* Customer Create/Edit Modal */}
      <AnimatePresence>
        {customerModalOpen && (
          <div
            id="crm-form-modal"
            className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4"
          >
            <motion.div
              ref={customerModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="crm-form-title"
              tabIndex={-1}
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              className="bg-card border border-border rounded-xl shadow-xl max-w-sm w-full overflow-hidden"
            >
              <div className="p-4 border-b border-border flex justify-between items-center bg-secondary/20">
                <h3 id="crm-form-title" className="font-semibold text-foreground text-sm">
                  {editingCustomer
                    ? t('customers.editCustomerRecord')
                    : t('customers.registerNewCustomer')}
                </h3>
                <button
                  type="button"
                  onClick={() => setCustomerModalOpen(false)}
                  className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  aria-label={t('register.close', 'Close')}
                >
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleSubmitCustomer}>
                <div className="p-4 space-y-3.5">
                  <div className="space-y-1">
                    <label
                      htmlFor="form-cust-name"
                      className="text-xs font-medium text-muted-foreground block"
                    >
                      {t('customers.customerFullName')}
                    </label>
                    <input
                      id="form-cust-name"
                      type="text"
                      required
                      placeholder="e.g. Eleanor Vance"
                      value={custName}
                      onChange={(e) => setCustName(e.target.value)}
                      className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground focus:outline-none focus:border-foreground/50 transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="form-cust-phone"
                      className="text-xs font-medium text-muted-foreground block"
                    >
                      {t('customers.phoneNumber')}
                    </label>
                    <input
                      id="form-cust-phone"
                      type="tel"
                      placeholder="e.g. 555-1234"
                      value={custPhone}
                      onChange={(e) => setCustPhone(e.target.value)}
                      className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground font-mono focus:outline-none focus:border-foreground/50 transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="form-cust-email"
                      className="text-xs font-medium text-muted-foreground block"
                    >
                      {t('customers.emailAddress')}
                    </label>
                    <input
                      id="form-cust-email"
                      type="email"
                      placeholder="e.g. eleanor@example.com"
                      value={custEmail}
                      onChange={(e) => setCustEmail(e.target.value)}
                      className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground focus:outline-none focus:border-foreground/50 transition-colors"
                    />
                  </div>

                  {editingCustomer && (
                    <div className="space-y-1 pt-2 border-t border-border">
                      <label className="text-xs font-medium text-muted-foreground block">
                        {t('customers.adjustLoyaltyPoints')}
                      </label>
                      <input
                        id="form-cust-points"
                        type="number"
                        min="0"
                        value={custPoints}
                        onChange={(e) => setCustPoints(e.target.value)}
                        className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground font-mono num font-semibold focus:outline-none focus:border-foreground/50 transition-colors"
                      />
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-border bg-secondary/20 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomerModalOpen(false)}
                    className="btn-secondary h-8 px-3 text-xs"
                  >
                    {t('customers.cancel')}
                  </button>
                  <button
                    type="submit"
                    id="form-submit-cust-btn"
                    className="btn-primary h-8 px-3 text-xs font-medium gap-1.5"
                  >
                    <Check size={14} />
                    <span>{t('customers.saveCustomer')}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteModalOpen && customerToDelete && (
          <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
            <motion.div
              ref={deleteModalRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="crm-delete-title"
              tabIndex={-1}
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              className="bg-card border border-border rounded-xl shadow-xl max-w-sm w-full overflow-hidden"
            >
              <div className="p-5 flex flex-col items-center text-center">
                <div className="size-11 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-3">
                  <AlertTriangle size={22} />
                </div>
                <h3 id="crm-delete-title" className="text-base font-semibold text-foreground mb-1">
                  {t('customers.deleteConfirm', { name: customerToDelete.name })}
                </h3>
                <p className="text-xs text-muted-foreground mb-5">
                  {t('customers.deleteIrreversible')}
                </p>
                <div className="flex w-full gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteModalOpen(false);
                      setCustomerToDelete(null);
                    }}
                    className="btn-secondary flex-1 h-9 text-xs"
                  >
                    {t('customers.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteConfirm}
                    className="btn-destructive flex-1 h-9 text-xs font-medium"
                  >
                    {t('customers.delete')}
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
