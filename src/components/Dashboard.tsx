import { useMemo } from 'react';
import { 
  TrendingUp, ShoppingBag, Landmark, Percent, DollarSign, 
  ArrowUpRight, ArrowDownRight, Package, AlertTriangle, RefreshCw
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts';
import { SaleTransaction, Product, Category, StoreSettings } from '../types';

interface DashboardProps {
  transactions: SaleTransaction[];
  products: Product[];
  categories: Category[];
  settings: StoreSettings;
}

export default function Dashboard({ transactions, products, categories, settings }: DashboardProps) {
  
  // Base completed transactions
  const completedTransactions = useMemo(() => {
    return transactions.filter(t => t.status === 'completed');
  }, [transactions]);

  // Today's Date helpers
  const todayDateString = useMemo(() => new Date().toDateString(), []);

  // Today's Transactions
  const todayTransactions = useMemo(() => {
    return completedTransactions.filter(tx => new Date(tx.date).toDateString() === todayDateString);
  }, [completedTransactions, todayDateString]);

  // KPI calculations
  const kpis = useMemo(() => {
    // 1. Revenue Today
    const revenueToday = todayTransactions.reduce((sum, t) => sum + t.total, 0);
    
    // 2. Orders Count Today
    const ordersToday = todayTransactions.length;

    // 3. Average Order Value Today
    const aovToday = ordersToday > 0 ? revenueToday / ordersToday : 0;

    // 4. Total Profit Today
    const profitToday = todayTransactions.reduce((sum, tx) => {
      const transactionCost = tx.items.reduce((cSum, item) => cSum + (item.cost * item.quantity), 0);
      const transactionRevenue = tx.subtotal - tx.discount; // exclude tax from gross revenue for pure profit calculation
      return sum + (transactionRevenue - transactionCost);
    }, 0);

    // Historical comparative averages (e.g. average revenue per day)
    const uniqueDays = new Set(completedTransactions.map(tx => new Date(tx.date).toDateString()));
    const daysCount = Math.max(1, uniqueDays.size);
    const totalHistoricalRevenue = completedTransactions.reduce((sum, t) => sum + t.total, 0);
    const avgDailyRevenue = totalHistoricalRevenue / daysCount;

    // Low stock warnings
    const lowStockItems = products.filter(p => p.stock <= p.minStock).length;

    return {
      revenueToday: Number(revenueToday.toFixed(2)),
      ordersToday,
      aovToday: Number(aovToday.toFixed(2)),
      profitToday: Number(profitToday.toFixed(2)),
      avgDailyRevenue: Number(avgDailyRevenue.toFixed(2)),
      lowStockItems,
    };
  }, [todayTransactions, completedTransactions, products]);

  // 1. Area Chart Data: Daily Revenue Over Last 7 Days
  const salesTrendData = useMemo(() => {
    const datesMap = new Map<string, { label: string; revenue: number; profit: number }>();
    const today = new Date();
    
    // Seed dates for last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toDateString();
      const label = d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
      datesMap.set(key, { label, revenue: 0, profit: 0 });
    }

    // Populate data
    completedTransactions.forEach(tx => {
      const txKey = new Date(tx.date).toDateString();
      if (datesMap.has(txKey)) {
        const entry = datesMap.get(txKey)!;
        entry.revenue += tx.total;
        
        // Profit calculation
        const cost = tx.items.reduce((sum, item) => sum + (item.cost * item.quantity), 0);
        entry.profit += Math.max(0, (tx.subtotal - tx.discount) - cost);
        
        datesMap.set(txKey, entry);
      }
    });

    // Format for chart
    return Array.from(datesMap.values()).map(v => ({
      ...v,
      revenue: Number(v.revenue.toFixed(2)),
      profit: Number(v.profit.toFixed(2)),
    }));
  }, [completedTransactions]);

  // 2. Bar Chart Data: Top 5 Selling Products (by quantity)
  const topProductsData = useMemo(() => {
    const productSalesMap = new Map<string, { name: string; quantity: number; revenue: number }>();

    completedTransactions.forEach(tx => {
      tx.items.forEach(item => {
        const current = productSalesMap.get(item.productId) || { name: item.productName, quantity: 0, revenue: 0 };
        current.quantity += item.quantity;
        current.revenue += item.total;
        productSalesMap.set(item.productId, current);
      });
    });

    return Array.from(productSalesMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)
      .map(v => ({
        ...v,
        revenue: Number(v.revenue.toFixed(2)),
      }));
  }, [completedTransactions]);

  // 3. Pie Chart Data: Category Sales Breakdowns
  const categoryShareData = useMemo(() => {
    const catSalesMap = new Map<string, number>();

    completedTransactions.forEach(tx => {
      tx.items.forEach(item => {
        const prod = products.find(p => p.id === item.productId);
        const catId = prod?.category || 'general';
        const current = catSalesMap.get(catId) || 0;
        catSalesMap.set(catId, current + item.total);
      });
    });

    const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#64748b'];

    return Array.from(catSalesMap.entries()).map(([catId, revenue], idx) => {
      const catName = categories.find(c => c.id === catId)?.name || 'General';
      return {
        name: catName,
        value: Number(revenue.toFixed(2)),
        color: colors[idx % colors.length]
      };
    }).sort((a, b) => b.value - a.value);
  }, [completedTransactions, products, categories]);

  // 4. Payment Methods Share Breakdown
  const paymentMethodsData = useMemo(() => {
    const counts = { cash: 0, card: 0, mobile: 0, gift: 0 };
    completedTransactions.forEach(tx => {
      if (counts[tx.paymentMethod] !== undefined) {
        counts[tx.paymentMethod] += tx.total;
      }
    });

    const colors = { card: '#3b82f6', cash: '#10b981', mobile: '#8b5cf6', gift: '#f59e0b' };

    return Object.entries(counts).map(([method, val]) => ({
      name: method.toUpperCase(),
      value: Number(val.toFixed(2)),
      color: colors[method as keyof typeof colors]
    })).filter(item => item.value > 0);
  }, [completedTransactions]);

  // Total Business Sales values
  const totalSalesVolume = useMemo(() => {
    return completedTransactions.reduce((sum, tx) => sum + tx.total, 0);
  }, [completedTransactions]);

  return (
    <div id="dashboard-root" className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 p-6">
      
      {/* Header */}
      <div id="dashboard-header" className="mb-6 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="font-sans font-extrabold tracking-tight text-slate-900 text-xl sm:text-2xl flex items-center gap-2">
            <TrendingUp className="text-emerald-500" /> Business Analytics
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Real-time point of sale cash metrics, revenue charts, and inventory checks.</p>
        </div>

        {/* Sync Indicator */}
        <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl font-mono text-[10px] font-bold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>LIVE METRICS SYNCED</span>
        </div>
      </div>

      {/* Main dashboard content container */}
      <div id="dashboard-content" className="flex-1 overflow-y-auto space-y-6 pr-1 pb-6">
        
        {/* KPI Row */}
        <div id="kpi-row" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Revenue Today */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider font-mono">Today's Revenue</span>
              <h3 className="font-mono font-extrabold text-slate-900 text-xl md:text-2xl">{settings.currency}{kpis.revenueToday.toFixed(2)}</h3>
              <div className="flex items-center gap-1 text-[11px] font-medium mt-1">
                {kpis.revenueToday >= kpis.avgDailyRevenue ? (
                  <span className="text-emerald-600 flex items-center"><ArrowUpRight size={12} /> Above Avg</span>
                ) : (
                  <span className="text-amber-500 flex items-center"><ArrowDownRight size={12} /> Below Avg</span>
                )}
                <span className="text-slate-400 font-mono">Daily Avg: {settings.currency}{kpis.avgDailyRevenue.toFixed(0)}</span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 text-emerald-400 shadow-md shadow-slate-900/10">
              <DollarSign size={20} className="stroke-[2.5]" />
            </div>
          </div>

          {/* Card 2: Profit Today */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider font-mono">Net Profit Today</span>
              <h3 className="font-mono font-extrabold text-slate-900 text-xl md:text-2xl">{settings.currency}{kpis.profitToday.toFixed(2)}</h3>
              <div className="flex items-center gap-1 text-[11px] font-medium mt-1 text-slate-500 font-mono">
                <span>Margin: {kpis.revenueToday > 0 ? ((kpis.profitToday / kpis.revenueToday) * 100).toFixed(0) : 0}%</span>
                <span>• Excl. tax</span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 text-emerald-400 shadow-md shadow-slate-900/10">
              <Percent size={20} className="stroke-[2.5]" />
            </div>
          </div>

          {/* Card 3: Orders Count Today */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider font-mono">Completed Sales</span>
              <h3 className="font-mono font-extrabold text-slate-900 text-xl md:text-2xl">{kpis.ordersToday}</h3>
              <div className="flex items-center gap-1 text-[11px] font-medium mt-1 text-slate-500">
                <span className="font-mono">Ticket Avg: {settings.currency}{kpis.aovToday}</span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 text-emerald-400 shadow-md shadow-slate-900/10">
              <ShoppingBag size={20} className="stroke-[2.5]" />
            </div>
          </div>

          {/* Card 4: Low Stock Alarms */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider font-mono">Stock Warnings</span>
              <h3 className="font-mono font-extrabold text-slate-900 text-xl md:text-2xl">{kpis.lowStockItems}</h3>
              <div className="flex items-center gap-1 text-[11px] font-semibold mt-1">
                {kpis.lowStockItems > 0 ? (
                  <span className="text-amber-500 flex items-center gap-0.5"><AlertTriangle size={12} /> Low items on shelf</span>
                ) : (
                  <span className="text-emerald-600">● All shelves stocked</span>
                )}
              </div>
            </div>
            <div className={`p-3 rounded-xl shadow-md ${kpis.lowStockItems > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-900 text-emerald-400'}`}>
              <Package size={20} className="stroke-[2.5]" />
            </div>
          </div>

        </div>

        {/* Charts Grid Row 1: Sales Trend Area Chart */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-sans font-bold text-slate-800 text-sm">Sales & Profit Trend</h3>
              <p className="text-xs text-slate-400 font-mono">Historical performance over the past 7 days</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> Revenue</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs bg-blue-500" /> Profit</span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} fontStyle="italic" />
                <YAxis stroke="#94a3b8" fontSize={10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '11px', border: 'none' }}
                  labelStyle={{ fontWeight: 'bold', color: '#10b981', fontStyle: 'italic' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRevenue)" />
                <Area type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Charts Grid Row 2: Secondary breakdowns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Chart A: Top Selling Products (Bar Chart) */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm space-y-4 lg:col-span-2">
            <div>
              <h3 className="font-sans font-bold text-slate-800 text-sm">Best Sellers</h3>
              <p className="text-xs text-slate-400 font-mono">Top menu items ranked by checkout volume</p>
            </div>
            <div className="h-64 w-full">
              {topProductsData.length === 0 ? (
                <div className="h-full flex items-center justify-center font-mono text-xs text-slate-400">
                  NO SALES TO PLOT
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProductsData} layout="vertical" margin={{ top: 5, right: 10, left: 15, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" stroke="#94a3b8" fontSize={10} />
                    <YAxis dataKey="name" type="category" stroke="#475569" fontSize={10} width={100} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '11px', border: 'none' }}
                    />
                    <Bar dataKey="quantity" fill="#10b981" radius={[0, 8, 8, 0]} barSize={20}>
                      {topProductsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Chart B: Payment Methods & Category shares */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm space-y-4">
            <div>
              <h3 className="font-sans font-bold text-slate-800 text-sm">Sales by Category</h3>
              <p className="text-xs text-slate-400 font-mono">Revenue share across departments</p>
            </div>
            <div className="h-44 w-full relative flex items-center justify-center">
              {categoryShareData.length === 0 ? (
                <div className="font-mono text-xs text-slate-400">
                  NO CATEGORY STATS
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryShareData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {categoryShareData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => `${settings.currency}${parseFloat(value as string).toFixed(2)}`}
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '10px', border: 'none' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            {/* Custom Legend */}
            <div className="grid grid-cols-2 gap-2 text-[10px] font-semibold text-slate-600 font-mono">
              {categoryShareData.map((item, idx) => (
                <div key={idx} className="flex items-center space-x-2 truncate">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="truncate">{item.name}:</span>
                  <span className="font-bold text-slate-900">{settings.currency}{item.value.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Payment Type KPI block */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm space-y-4">
          <div>
            <h3 className="font-sans font-bold text-slate-800 text-sm">Payment Methods</h3>
            <p className="text-xs text-slate-400 font-mono">Preferred checkout modes by volume</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['card', 'cash', 'mobile', 'gift'].map(method => {
              const data = paymentMethodsData.find(d => d.name === method.toUpperCase());
              const val = data ? data.value : 0;
              const pct = totalSalesVolume > 0 ? (val / totalSalesVolume) * 100 : 0;

              return (
                <div key={method} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col justify-between shadow-inner">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">{method}</span>
                  <div className="mt-2.5">
                    <span className="font-mono font-extrabold text-base text-slate-800 block">
                      {settings.currency}{val.toFixed(2)}
                    </span>
                    <span className="text-[10px] font-mono text-emerald-600 font-bold mt-1 block">
                      {pct.toFixed(0)}% of sales
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
}
