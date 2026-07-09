import { useState, useEffect, useMemo } from 'react';
import { Product, Category, Customer, SaleTransaction, StoreSettings, UserAccount, PrinterConfig, SupabaseConfig } from '../types';
import { 
  INITIAL_PRODUCTS, INITIAL_CATEGORIES, INITIAL_CUSTOMERS, INITIAL_SETTINGS, INITIAL_USER_ACCOUNTS, generatePastTransactions 
} from '../data/seedData';
import { 
  getSupabaseClient, testSupabaseConnection, 
  pushProducts, pullProducts, 
  pushCategories, pullCategories, 
  pushCustomers, pullCustomers, 
  pushTransactions, pullTransactions, 
  pushUserAccounts, pullUserAccounts 
} from '../lib/supabase';

export function usePOSState() {
  const [settings, setSettings] = useState<StoreSettings>(() => {
    const saved = localStorage.getItem('pos_settings');
    return saved ? JSON.parse(saved) : INITIAL_SETTINGS;
  });

  const [categories, setCategories] = useState<Category[]>(() => {
    const saved = localStorage.getItem('pos_categories');
    return saved ? JSON.parse(saved) : INITIAL_CATEGORIES;
  });

  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('pos_products');
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    const saved = localStorage.getItem('pos_customers');
    return saved ? JSON.parse(saved) : INITIAL_CUSTOMERS;
  });

  const [transactions, setTransactions] = useState<SaleTransaction[]>(() => {
    const saved = localStorage.getItem('pos_transactions');
    if (saved) {
      return JSON.parse(saved);
    } else {
      const defaultTx = generatePastTransactions();
      localStorage.setItem('pos_transactions', JSON.stringify(defaultTx));
      return defaultTx;
    }
  });

  const [users, setUsers] = useState<UserAccount[]>(() => {
    const saved = localStorage.getItem('pos_users');
    return saved ? JSON.parse(saved) : INITIAL_USER_ACCOUNTS;
  });

  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    const saved = localStorage.getItem('pos_current_user');
    if (saved) return JSON.parse(saved);
    return { id: 'admin', name: 'Admin', role: 'admin', pin: '1234', active: true, createdAt: new Date().toISOString() };
  });

  const [printerConfig, setPrinterConfig] = useState<PrinterConfig>(() => {
    const saved = localStorage.getItem('pos_printer_config');
    return saved ? JSON.parse(saved) : {
      type: 'system',
      paperSize: '80mm',
      showBarcode: true,
      footerMessage: 'Thank you for shopping with us!',
      autoPrintOnCheckout: true
    };
  });

  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseConfig>(() => {
    const saved = localStorage.getItem('pos_supabase_config');
    return saved ? JSON.parse(saved) : {
      url: '',
      anonKey: '',
      enabled: false,
      status: 'disconnected'
    };
  });

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('pos_dark_mode');
    if (saved !== null) return JSON.parse(saved);
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    localStorage.setItem('pos_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('pos_categories', JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem('pos_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('pos_customers', JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    localStorage.setItem('pos_transactions', JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem('pos_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('pos_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('pos_current_user');
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('pos_printer_config', JSON.stringify(printerConfig));
  }, [printerConfig]);

  useEffect(() => {
    localStorage.setItem('pos_supabase_config', JSON.stringify(supabaseConfig));
  }, [supabaseConfig]);

  useEffect(() => {
    localStorage.setItem('pos_dark_mode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const lowStockCount = useMemo(() => {
    return products.filter(p => p.stock <= p.minStock).length;
  }, [products]);

  const syncToCloudIfEnabled = async (
    prods?: Product[], 
    cats?: Category[], 
    custs?: Customer[], 
    txs?: SaleTransaction[],
    accts?: UserAccount[]
  ) => {
    if (!supabaseConfig.enabled || !supabaseConfig.url || !supabaseConfig.anonKey) return;
    const client = getSupabaseClient(supabaseConfig.url, supabaseConfig.anonKey);
    if (!client) return;

    try {
      if (prods) await pushProducts(client, prods);
      if (cats) await pushCategories(client, cats);
      if (custs) await pushCustomers(client, custs);
      if (txs) await pushTransactions(client, txs);
      if (accts) await pushUserAccounts(client, accts);
    } catch (err) {
      console.warn('Background live sync push postponed:', err);
    }
  };

  const handlePrintReceiptFromApp = (tx: SaleTransaction) => {
    if (printerConfig.type === 'system') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const rollWidth = printerConfig.paperSize === '58mm' ? '58mm' : '80mm';
        printWindow.document.write(`
          <html>
            <head>
              <title>POS Receipt ${tx.id}</title>
              <style>
                body {
                  font-family: 'Courier New', Courier, monospace;
                  width: ${rollWidth};
                  padding: 8px;
                  margin: 0;
                  font-size: 11px;
                  color: #000;
                  line-height: 1.3;
                }
                .center { text-align: center; }
                .bold { font-weight: bold; }
                .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
                .flex-row { display: flex; justify-content: space-between; }
                .mt-1 { margin-top: 4px; }
              </style>
            </head>
            <body onload="window.print(); window.close();">
              <div class="center bold">${settings.storeName}</div>
              <div class="center">${settings.storeAddress}</div>
              <div class="center">Phone: ${settings.storePhone}</div>
              <div class="divider"></div>
              
              <div class="flex-row">
                <span>DATE:</span>
                <span>${new Date(tx.date).toLocaleString()}</span>
              </div>
              <div class="flex-row">
                <span>RECEIPT:</span>
                <span class="bold">${tx.id}</span>
              </div>
              ${tx.customerName ? `
              <div class="flex-row bold">
                <span>MEMBER:</span>
                <span>${tx.customerName}</span>
              </div>
              ` : ''}
              
              <div class="divider"></div>
              
              <div class="bold">ITEMS:</div>
              ${tx.items.map(item => `
                <div class="flex-row">
                  <span>${item.quantity}x ${item.productName}</span>
                  <span>${settings.currency}${item.total.toFixed(2)}</span>
                </div>
              `).join('')}
              
              <div class="divider"></div>
              
              <div class="flex-row">
                <span>SUBTOTAL:</span>
                <span>${settings.currency}${tx.subtotal.toFixed(2)}</span>
              </div>
              ${tx.discount > 0 ? `
              <div class="flex-row">
                <span>DISCOUNT:</span>
                <span>-${settings.currency}${tx.discount.toFixed(2)}</span>
              </div>
              ` : ''}
              <div class="flex-row">
                <span>TAX (${settings.taxRate}%):</span>
                <span>${settings.currency}${tx.tax.toFixed(2)}</span>
              </div>
              <div class="flex-row bold" style="font-size: 13px; margin-top: 4px;">
                <span>TOTAL:</span>
                <span>${settings.currency}${tx.total.toFixed(2)}</span>
              </div>
              
              <div class="divider"></div>
              
              <div class="flex-row">
                <span>METHOD:</span>
                <span class="bold uppercase">${tx.paymentMethod}</span>
              </div>
              ${tx.paymentMethod === 'cash' ? `
              <div class="flex-row">
                <span>CASH PAID:</span>
                <span>${settings.currency}${tx.cashPaid?.toFixed(2)}</span>
              </div>
              <div class="flex-row bold">
                <span>CHANGE:</span>
                <span>${settings.currency}${tx.cashChange?.toFixed(2)}</span>
              </div>
              ` : ''}
              
              <div class="divider"></div>
              <div class="center">${printerConfig.footerMessage || 'Thank you for your business!'}</div>
              <div class="center mt-1" style="font-size: 8px; letter-spacing: 2px; color: #444;">
                ||||| ||| ||| |||| | | |||| |||
              </div>
              <div class="center" style="font-size: 8px;">* AUTH-${tx.id} *</div>
            </body>
          </html>
        `);
        printWindow.document.close();
      }
    } else {
      console.log(`Receipt stream sent to thermal ${printerConfig.type}:`, tx);
    }
  };

  const handleCheckout = (
    items: Array<{ productId: string; productName: string; price: number; cost: number; quantity: number }>,
    customerId: string | null,
    discountType: 'none' | 'percentage' | 'fixed' | 'loyalty',
    discountValue: number,
    paymentMethod: 'cash' | 'card' | 'mobile' | 'gift',
    cashPaid?: number,
    cashChange?: number
  ): SaleTransaction | null => {
    const subtotal = Number(items.reduce((sum, i) => sum + (i.price * i.quantity), 0).toFixed(2));
    
    let discount = 0;
    if (discountType === 'percentage') {
      discount = Number(((subtotal * discountValue) / 100).toFixed(2));
    } else if (discountType === 'fixed') {
      discount = Math.min(discountValue, subtotal);
    } else if (discountType === 'loyalty') {
      discount = Number((discountValue * settings.loyaltyPointValue).toFixed(2));
    }
    
    const taxable = Math.max(0, subtotal - discount);
    const tax = Number((taxable * (settings.taxRate / 100)).toFixed(2));
    const total = Number((taxable + tax).toFixed(2));

    let nextId = 'TX-10001';
    if (transactions.length > 0) {
      const ids = transactions.map(t => parseInt(t.id.split('-').pop() || '10000'));
      const maxId = Math.max(...ids);
      nextId = `TX-${maxId + 1}`;
    }

    const transaction: SaleTransaction = {
      id: nextId,
      date: new Date().toISOString(),
      items: items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        price: item.price,
        cost: item.cost,
        quantity: item.quantity,
        total: Number((item.price * item.quantity).toFixed(2))
      })),
      subtotal,
      discount,
      discountType,
      discountValue,
      tax,
      total,
      paymentMethod,
      cashPaid,
      cashChange,
      customerId,
      customerName: customerId ? customers.find(c => c.id === customerId)?.name : null,
      status: 'completed'
    };

    const updatedProducts = products.map(prod => {
      const itemInCart = items.find(i => i.productId === prod.id);
      if (itemInCart) {
        return {
          ...prod,
          stock: Math.max(0, prod.stock - itemInCart.quantity)
        };
      }
      return prod;
    });
    setProducts(updatedProducts);

    let updatedCustomers = [...customers];
    if (customerId) {
      updatedCustomers = customers.map(cust => {
        if (cust.id === customerId) {
          let ptsBalance = cust.points;
          
          if (discountType === 'loyalty') {
            ptsBalance = Math.max(0, ptsBalance - discountValue);
          }
          
          const pointsGained = Math.floor(total * settings.loyaltyPointsRate);
          
          return {
            ...cust,
            points: ptsBalance + pointsGained
          };
        }
        return cust;
      });
      setCustomers(updatedCustomers);
    }

    const updatedTransactions = [transaction, ...transactions];
    setTransactions(updatedTransactions);

    if (printerConfig.autoPrintOnCheckout) {
      setTimeout(() => {
        handlePrintReceiptFromApp(transaction);
      }, 300);
    }

    syncToCloudIfEnabled(updatedProducts, undefined, updatedCustomers, updatedTransactions);

    return transaction;
  };

  const handleRefundTransaction = (id: string) => {
    const tx = transactions.find(t => t.id === id);
    if (!tx || tx.status === 'refunded') return;

    const updatedProducts = products.map(prod => {
      const returnedItem = tx.items.find(i => i.productId === prod.id);
      if (returnedItem) {
        return {
          ...prod,
          stock: prod.stock + returnedItem.quantity
        };
      }
      return prod;
    });
    setProducts(updatedProducts);

    let updatedCustomers = [...customers];
    if (tx.customerId) {
      updatedCustomers = customers.map(cust => {
        if (cust.id === tx.customerId) {
          let ptsBalance = cust.points;

          const pointsEarned = Math.floor(tx.total * settings.loyaltyPointsRate);
          ptsBalance = Math.max(0, ptsBalance - pointsEarned);

          if (tx.discountType === 'loyalty') {
            ptsBalance += tx.discountValue;
          }

          return {
            ...cust,
            points: ptsBalance
          };
        }
        return cust;
      });
      setCustomers(updatedCustomers);
    }

    const updatedTransactions = transactions.map(t => 
      t.id === id 
        ? { ...t, status: 'refunded', refundDate: new Date().toISOString() } 
        : t
    );
    setTransactions(updatedTransactions);

    syncToCloudIfEnabled(updatedProducts, undefined, updatedCustomers, updatedTransactions);
  };

  const handleAddProduct = (payload: Omit<Product, 'id'>): Product => {
    const newProduct: Product = {
      ...payload,
      id: `prod-${Math.floor(1000 + Math.random() * 9000)}`
    };
    setProducts(prev => [...prev, newProduct]);
    return newProduct;
  };

  const handleUpdateProduct = (updated: Product) => {
    setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  const handleDeleteProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const handleAddCategory = (name: string, color: string): Category => {
    const newCat: Category = {
      id: `cat-${name.toLowerCase().replace(/\s+/g, '-').slice(0, 8)}-${Math.floor(10 + Math.random() * 90)}`,
      name,
      color
    };
    setCategories(prev => [...prev, newCat]);
    return newCat;
  };

  const handleDeleteCategory = (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));
  };

  const handleAddCustomer = (name: string, phone: string, email: string): Customer => {
    const newCustomer: Customer = {
      id: `cust-${Math.floor(100 + Math.random() * 900)}`,
      name,
      phone,
      email,
      points: 0,
      createdAt: new Date().toISOString().split('T')[0]
    };
    setCustomers(prev => [...prev, newCustomer]);
    return newCustomer;
  };

  const handleUpdateCustomer = (updated: Customer) => {
    setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
  };

  const handleDeleteCustomer = (id: string) => {
    const updated = customers.filter(c => c.id !== id);
    setCustomers(updated);
    syncToCloudIfEnabled(undefined, undefined, updated);
  };

  const handleAddUser = (name: string, role: UserAccount['role'], pin: string) => {
    const newUser: UserAccount = {
      id: `user-${Math.floor(1000 + Math.random() * 9000)}`,
      name,
      role,
      pin,
      active: true,
      createdAt: new Date().toISOString()
    };
    const updated = [...users, newUser];
    setUsers(updated);
    syncToCloudIfEnabled(undefined, undefined, undefined, undefined, updated);
  };

  const handleUpdateUser = (updatedUser: UserAccount) => {
    const updated = users.map(u => u.id === updatedUser.id ? updatedUser : u);
    setUsers(updated);
    syncToCloudIfEnabled(undefined, undefined, undefined, undefined, updated);
  };

  const handleDeleteUser = (id: string) => {
    const updated = users.filter(u => u.id !== id);
    setUsers(updated);
    syncToCloudIfEnabled(undefined, undefined, undefined, undefined, updated);
  };

  const handleTestSupabase = async (): Promise<boolean> => {
    const isOk = await testSupabaseConnection(supabaseConfig.url, supabaseConfig.anonKey);
    const updatedStatus = isOk ? 'connected' : 'error';
    setSupabaseConfig(prev => ({ ...prev, status: updatedStatus }));
    return isOk;
  };

  const handlePushToSupabase = async (): Promise<{ success: boolean; message: string }> => {
    const client = getSupabaseClient(supabaseConfig.url, supabaseConfig.anonKey);
    if (!client) {
      return { success: false, message: 'Invalid Supabase client initialization. Check URL and Key.' };
    }

    try {
      const p1 = await pushCategories(client, categories);
      const p2 = await pushProducts(client, products);
      const p3 = await pushCustomers(client, customers);
      const p4 = await pushTransactions(client, transactions);
      const p5 = await pushUserAccounts(client, users);

      if (p1 && p2 && p3 && p4 && p5) {
        setSupabaseConfig(prev => ({ ...prev, status: 'connected' }));
        return { success: true, message: 'Local datasets successfully uploaded and merged to cloud tables!' };
      }
      return { success: false, message: 'Partial synchronization completed. Check database schemas.' };
    } catch (err: any) {
      return { success: false, message: `Sync failed: ${err.message || err}` };
    }
  };

  const handlePullFromSupabase = async (): Promise<{ success: boolean; message: string }> => {
    const client = getSupabaseClient(supabaseConfig.url, supabaseConfig.anonKey);
    if (!client) {
      return { success: false, message: 'Invalid Supabase client initialization. Check URL and Key.' };
    }

    try {
      const cloudCats = await pullCategories(client);
      const cloudProds = await pullProducts(client);
      const cloudCusts = await pullCustomers(client);
      const cloudTxs = await pullTransactions(client);
      const cloudUsers = await pullUserAccounts(client);

      if (cloudCats !== null) setCategories(cloudCats);
      if (cloudProds !== null) setProducts(cloudProds);
      if (cloudCusts !== null) setCustomers(cloudCusts);
      if (cloudTxs !== null) setTransactions(cloudTxs);
      if (cloudUsers !== null) setUsers(cloudUsers);

      setSupabaseConfig(prev => ({ ...prev, status: 'connected' }));
      return { success: true, message: 'All cloud schemas fetched and successfully loaded into local cache.' };
    } catch (err: any) {
      return { success: false, message: `Cloud query pull failed: ${err.message || err}` };
    }
  };

  useEffect(() => {
    if (supabaseConfig.enabled && supabaseConfig.url && supabaseConfig.anonKey) {
      const client = getSupabaseClient(supabaseConfig.url, supabaseConfig.anonKey);
      if (client) {
        pullCategories(client).then(res => { if (res) setCategories(res); });
        pullProducts(client).then(res => { if (res) setProducts(res); });
        pullCustomers(client).then(res => { if (res) setCustomers(res); });
        pullTransactions(client).then(res => { if (res) setTransactions(res); });
        pullUserAccounts(client).then(res => { if (res) setUsers(res); });
        setSupabaseConfig(prev => ({ ...prev, status: 'connected' }));
      }
    }
  }, [supabaseConfig.enabled, supabaseConfig.url, supabaseConfig.anonKey]);

  const handleResetToDemo = () => {
    setSettings(INITIAL_SETTINGS);
    setCategories(INITIAL_CATEGORIES);
    setProducts(INITIAL_PRODUCTS);
    setCustomers(INITIAL_CUSTOMERS);
    
    const demoTx = generatePastTransactions();
    setTransactions(demoTx);

    localStorage.setItem('pos_settings', JSON.stringify(INITIAL_SETTINGS));
    localStorage.setItem('pos_categories', JSON.stringify(INITIAL_CATEGORIES));
    localStorage.setItem('pos_products', JSON.stringify(INITIAL_PRODUCTS));
    localStorage.setItem('pos_customers', JSON.stringify(INITIAL_CUSTOMERS));
    localStorage.setItem('pos_transactions', JSON.stringify(demoTx));
  };

  const handleClearData = () => {
    setSettings(INITIAL_SETTINGS);
    setCategories([]);
    setProducts([]);
    setCustomers([]);
    setTransactions([]);

    localStorage.removeItem('pos_settings');
    localStorage.removeItem('pos_categories');
    localStorage.removeItem('pos_products');
    localStorage.removeItem('pos_customers');
    localStorage.removeItem('pos_transactions');
  };

  const handleExportDatabase = (): string => {
    const dbExport = {
      settings,
      categories,
      products,
      customers,
      transactions
    };
    return JSON.stringify(dbExport, null, 2);
  };

  const handleImportDatabase = (jsonString: string): boolean => {
    try {
      const data = JSON.parse(jsonString);
      if (data.settings && data.categories && data.products && data.customers && data.transactions) {
        setSettings(data.settings);
        setCategories(data.categories);
        setProducts(data.products);
        setCustomers(data.customers);
        setTransactions(data.transactions);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  return {
    settings, setSettings,
    categories, setCategories,
    products, setProducts,
    customers, setCustomers,
    transactions, setTransactions,
    users, setUsers,
    currentUser, setCurrentUser,
    printerConfig, setPrinterConfig,
    supabaseConfig, setSupabaseConfig,
    darkMode, setDarkMode,
    lowStockCount,
    handleCheckout,
    handleRefundTransaction,
    handleAddProduct,
    handleUpdateProduct,
    handleDeleteProduct,
    handleAddCategory,
    handleDeleteCategory,
    handleAddCustomer,
    handleUpdateCustomer,
    handleDeleteCustomer,
    handleAddUser,
    handleUpdateUser,
    handleDeleteUser,
    handleTestSupabase,
    handlePushToSupabase,
    handlePullFromSupabase,
    handleResetToDemo,
    handleClearData,
    handleExportDatabase,
    handleImportDatabase
  };
}
