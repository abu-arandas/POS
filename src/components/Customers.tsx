import React, { useState, useMemo } from 'react';
import { 
  Users, Search, UserPlus, Edit2, Trash2, Award, 
  Calendar, Phone, Mail, ChevronRight, X, Check, ShoppingBag, Plus, Minus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Customer, SaleTransaction, StoreSettings } from '../types';

interface CustomersProps {
  customers: Customer[];
  transactions: SaleTransaction[];
  settings: StoreSettings;
  onAddCustomer: (name: string, phone: string, email: string) => Customer;
  onUpdateCustomer: (customer: Customer) => void;
  onDeleteCustomer: (id: string) => void;
}

export default function Customers({ 
  customers, transactions, settings, 
  onAddCustomer, onUpdateCustomer, onDeleteCustomer 
}: CustomersProps) {
  
  // Search and sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'points' | 'date'>('name');

  // Active Selected Customer for detail panel
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Customer Form Modal State
  const [customerModalOpen, setProductModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Customer Form Fields
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPoints, setCustPoints] = useState('0');

  const activeCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  // Selected customer purchase history
  const activeCustomerTransactions = useMemo(() => {
    if (!selectedCustomerId) return [];
    return transactions.filter(tx => tx.customerId === selectedCustomerId);
  }, [transactions, selectedCustomerId]);

  // Customer metrics
  const activeCustomerStats = useMemo(() => {
    if (activeCustomerTransactions.length === 0) {
      return { totalSpent: 0, averageSpent: 0, totalVisits: 0 };
    }
    const completedTx = activeCustomerTransactions.filter(t => t.status === 'completed');
    const totalSpent = completedTx.reduce((sum, tx) => sum + tx.total, 0);
    const totalVisits = completedTx.length;
    const averageSpent = totalVisits > 0 ? totalSpent / totalVisits : 0;
    
    return {
      totalSpent: Number(totalSpent.toFixed(2)),
      averageSpent: Number(averageSpent.toFixed(2)),
      totalVisits
    };
  }, [activeCustomerTransactions]);

  // Filtering & sorting customer list
  const sortedAndFilteredCustomers = useMemo(() => {
    let list = customers.filter(c => {
      return c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
             c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
             c.phone.includes(searchQuery);
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
    setProductModalOpen(true);
  };

  const handleOpenEditCustomer = (cust: Customer) => {
    setEditingCustomer(cust);
    setCustName(cust.name);
    setCustPhone(cust.phone);
    setCustEmail(cust.email);
    setCustPoints(cust.points.toString());
    setProductModalOpen(true);
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
      onUpdateCustomer({
        ...editingCustomer,
        ...payload,
      });
    } else {
      onAddCustomer(payload.name, payload.phone, payload.email);
    }
    setProductModalOpen(false);
  };

  // Customer Loyalty Tier helper
  const getCustomerTier = (points: number) => {
    if (points >= 200) return { name: 'Platinum VIP', style: 'bg-indigo-500 text-white' };
    if (points >= 100) return { name: 'Gold Club', style: 'bg-amber-500 text-slate-900' };
    return { name: 'Silver Member', style: 'bg-slate-200 text-slate-700' };
  };

  return (
    <div id="customers-root" className="flex-1 flex h-screen overflow-hidden bg-slate-50 p-6">
      
      {/* LEFT COLUMN: Customer Directory (2/3 width) */}
      <div id="customer-directory-section" className="flex-1 flex flex-col min-w-0 pr-6 overflow-hidden">
        
        {/* Header */}
        <div id="customers-header" className="mb-6 shrink-0 flex items-center justify-between">
          <div>
            <h2 className="font-sans font-extrabold tracking-tight text-slate-900 text-xl sm:text-2xl flex items-center gap-2">
              <Users className="text-emerald-500" /> Customer Loyalty CRM
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Manage customer accounts, verify loyalty metrics, and reward returning patrons.</p>
          </div>

          <button
            id="add-customer-trigger-btn"
            onClick={handleOpenAddCustomer}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-sans font-bold text-xs sm:text-sm px-4 py-2 rounded-xl flex items-center space-x-1.5 shadow-lg shadow-emerald-600/10"
          >
            <UserPlus size={16} />
            <span>New Customer</span>
          </button>
        </div>

        {/* Filters */}
        <div id="customers-filters" className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 mb-6 shrink-0">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 flex items-center space-x-2 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200/40">
              <Search size={16} className="text-slate-400" />
              <input
                id="customer-search-input"
                type="text"
                placeholder="Search CRM by full name, phone number, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent border-none text-slate-800 text-xs focus:outline-none placeholder-slate-400"
              />
            </div>

            {/* Sorting buttons */}
            <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 shrink-0">
              {[
                { id: 'name', label: 'Alphabetical' },
                { id: 'points', label: 'Loyalty Points' },
                { id: 'date', label: 'Join Date' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setSortBy(opt.id as any)}
                  className={`px-3.5 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all shrink-0 ${
                    sortBy === opt.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Directory Grid */}
        <div id="crm-grid-container" className="flex-1 overflow-y-auto pr-1">
          {sortedAndFilteredCustomers.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center text-slate-400 font-mono text-xs border border-slate-200">
              NO CUSTOMERS MATCHING YOUR CRITERIA
            </div>
          ) : (
            <div id="crm-grid" className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sortedAndFilteredCustomers.map(cust => {
                const tier = getCustomerTier(cust.points);
                const isSelected = cust.id === selectedCustomerId;

                return (
                  <motion.div
                    key={cust.id}
                    layoutId={`crm-card-${cust.id}`}
                    id={`crm-card-${cust.id}`}
                    onClick={() => setSelectedCustomerId(cust.id)}
                    className={`bg-white rounded-2xl border p-4 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-start justify-between ${
                      isSelected 
                        ? 'border-slate-900 ring-2 ring-slate-900/5' 
                        : 'border-slate-200/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="space-y-3 min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-sans font-bold text-slate-800 text-sm leading-tight truncate max-w-[150px]">{cust.name}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase font-mono tracking-wider ${tier.style}`}>
                          {tier.name}
                        </span>
                      </div>

                      <div className="space-y-1 font-sans text-[11px] text-slate-500">
                        <p className="flex items-center gap-1.5 truncate"><Mail size={12} /> {cust.email || 'No email'}</p>
                        <p className="flex items-center gap-1.5"><Phone size={12} /> {cust.phone || 'No phone'}</p>
                        <p className="flex items-center gap-1.5 font-mono text-[10px]"><Calendar size={12} /> Registered: {cust.createdAt}</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end justify-between h-full space-y-4 shrink-0">
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-1.5 text-center shadow-xs">
                        <span className="text-[10px] text-emerald-600 font-bold block uppercase tracking-wider font-mono">Points</span>
                        <span className="font-mono font-extrabold text-sm text-emerald-700">{cust.points}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenEditCustomer(cust); }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200/60 rounded-lg transition-colors"
                          title="Edit Customer Details"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          id={`del-cust-${cust.id}`}
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            if (confirm(`Delete CRM account for ${cust.name}? points history will be cleared.`)) {
                              onDeleteCustomer(cust.id);
                              if (selectedCustomerId === cust.id) setSelectedCustomerId(null);
                            } 
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 bg-rose-50 hover:bg-rose-100/50 rounded-lg transition-colors"
                          title="Delete Customer CRM record"
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
      <div id="crm-profile-section" className="w-80 border border-slate-200 rounded-3xl bg-white shadow-xl flex flex-col overflow-hidden shrink-0">
        
        {activeCustomer ? (
          <>
            {/* Header Profiler */}
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-sans font-bold text-slate-800 text-sm">{activeCustomer.name}</h3>
                <span className="text-[10px] font-mono text-slate-400">Account: {activeCustomer.id}</span>
              </div>
              <button 
                onClick={() => setSelectedCustomerId(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm"
              >
                <X size={14} />
              </button>
            </div>

            {/* Profile body scroll */}
            <div className="flex-1 p-5 overflow-y-auto space-y-5 bg-slate-50/50">
              
              {/* Stats KPI Card */}
              <div id="crm-stats-block" className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded-2xl p-3 text-center shadow-xs">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider font-mono">Total Spent</span>
                  <p className="font-mono font-extrabold text-sm text-slate-800 mt-1">{settings.currency}{activeCustomerStats.totalSpent.toFixed(2)}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-3 text-center shadow-xs">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider font-mono">Order Count</span>
                  <p className="font-mono font-extrabold text-sm text-slate-800 mt-1">{activeCustomerStats.totalVisits} visits</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-3 text-center shadow-xs col-span-2">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider font-mono">Average Ticket Value</span>
                  <p className="font-mono font-extrabold text-sm text-emerald-600 mt-1">{settings.currency}{activeCustomerStats.averageSpent.toFixed(2)}</p>
                </div>
              </div>

              {/* Purchase history log list */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <ShoppingBag size={12} /> Purchase History Log
                </h4>
                
                {activeCustomerTransactions.length === 0 ? (
                  <p className="text-[10px] font-mono text-slate-400 text-center py-6 bg-white rounded-xl border border-dashed border-slate-200">
                    NO LINKED SALES ON FILE
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeCustomerTransactions.map(tx => (
                      <div
                        key={tx.id}
                        className="bg-white border border-slate-100 rounded-xl p-2.5 flex items-center justify-between shadow-xs text-[11px]"
                      >
                        <div>
                          <span className="font-mono font-bold text-slate-800 block">{tx.id}</span>
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5">{new Date(tx.date).toLocaleDateString()}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-extrabold block text-slate-900">{settings.currency}{tx.total.toFixed(2)}</span>
                          <span className={`text-[9px] font-bold ${tx.status === 'refunded' ? 'text-rose-500' : 'text-slate-400'}`}>
                            {tx.status === 'refunded' ? 'Refunded' : 'Completed'}
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
            <h4 className="font-sans font-bold text-slate-700 text-sm">CRM Profile Offline</h4>
            <p className="text-xs text-slate-400 max-w-[200px] mt-1">Select any client card from the CRM directory list to audit loyalty logs and transaction logs.</p>
          </div>
        )}

      </div>

      {/* MODAL: Customer Form */}
      <AnimatePresence>
        {customerModalOpen && (
          <div id="crm-form-modal" className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="font-sans font-bold text-slate-800 text-base">
                  {editingCustomer ? 'Edit Customer Record' : 'Register New Customer'}
                </h3>
                <button
                  onClick={() => setProductModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 bg-white border border-slate-200 rounded-lg shadow-sm"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmitCustomer}>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Customer Full Name *</label>
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
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Phone Number</label>
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
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Email Address</label>
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
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Adjust Loyalty Points</label>
                      <input
                        id="form-cust-points"
                        type="number"
                        min="0"
                        value={custPoints}
                        onChange={(e) => setCustPoints(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 font-mono font-bold text-emerald-700"
                      />
                    </div>
                  )}
                </div>

                <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setProductModalOpen(false)}
                    className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="form-submit-cust-btn"
                    className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-sans font-bold text-xs sm:text-sm rounded-xl flex items-center shadow-lg shadow-slate-900/10"
                  >
                    <Check size={16} className="mr-1" />
                    <span>Save Customer</span>
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
