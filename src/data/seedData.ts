import { Product, Category, Customer, SaleTransaction, StoreSettings, UserAccount } from '../types';

export const INITIAL_CATEGORIES: Category[] = [
  { id: 'cat-bev', name: 'Beverages', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { id: 'cat-bak', name: 'Bakery', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'cat-snd', name: 'Sandwiches', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'cat-snk', name: 'Snacks', color: 'bg-purple-100 text-purple-800 border-purple-200' },
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-espresso',
    name: 'Classic Espresso',
    price: 3.25,
    cost: 0.65,
    category: 'cat-bev',
    sku: 'BEV-ESP-01',
    stock: 120,
    minStock: 20,
    image: 'https://images.unsplash.com/photo-1510972527409-cef1903972fa?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
  },
  {
    id: 'prod-latte',
    name: 'Caffe Latte',
    price: 4.50,
    cost: 0.90,
    category: 'cat-bev',
    sku: 'BEV-LAT-02',
    stock: 95,
    minStock: 15,
    image: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
  },
  {
    id: 'prod-greentea',
    name: 'Organic Matcha Tea',
    price: 4.00,
    cost: 0.80,
    category: 'cat-bev',
    sku: 'BEV-MAT-03',
    stock: 6, // Low stock warning!
    minStock: 10,
    image: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
  },
  {
    id: 'prod-croissant',
    name: 'Butter Croissant',
    price: 3.75,
    cost: 1.10,
    category: 'cat-bak',
    sku: 'BAK-CRO-01',
    stock: 45,
    minStock: 10,
    image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
  },
  {
    id: 'prod-muffin',
    name: 'Blueberry Muffin',
    price: 3.50,
    cost: 0.95,
    category: 'cat-bak',
    sku: 'BAK-MUF-02',
    stock: 30,
    minStock: 8,
    image: 'https://images.unsplash.com/photo-1607958996333-41aef7caefaa?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
  },
  {
    id: 'prod-choccake',
    name: 'Fudge Cake Slice',
    price: 5.25,
    cost: 1.50,
    category: 'cat-bak',
    sku: 'BAK-CAK-03',
    stock: 12,
    minStock: 5,
    image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
  },
  {
    id: 'prod-avotoast',
    name: 'Avocado Toast',
    price: 8.50,
    cost: 2.50,
    category: 'cat-snd',
    sku: 'SND-AVO-01',
    stock: 35,
    minStock: 5,
    image: 'https://images.unsplash.com/photo-1541532713592-79a0317b6b77?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
  },
  {
    id: 'prod-caprese',
    name: 'Caprese Panini',
    price: 9.25,
    cost: 3.00,
    category: 'cat-snd',
    sku: 'SND-CAP-02',
    stock: 22,
    minStock: 5,
    image: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
  },
  {
    id: 'prod-turkeyswiss',
    name: 'Turkey Swiss Sandwich',
    price: 8.75,
    cost: 2.75,
    category: 'cat-snd',
    sku: 'SND-TRK-03',
    stock: 4, // Low stock warning!
    minStock: 5,
    image: 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
  },
  {
    id: 'prod-chips',
    name: 'Sea Salt Potato Chips',
    price: 2.00,
    cost: 0.50,
    category: 'cat-snk',
    sku: 'SNK-CHP-01',
    stock: 75,
    minStock: 15,
    image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
  },
  {
    id: 'prod-fruit',
    name: 'Fresh Berry Bowl',
    price: 5.50,
    cost: 1.80,
    category: 'cat-snk',
    sku: 'SNK-FRT-02',
    stock: 18,
    minStock: 5,
    image: 'https://images.unsplash.com/photo-1519996521430-02b798c1d881?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
  },
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cust-1',
    name: 'Sarah Jenkins',
    email: 'sarah.j@gmail.com',
    phone: '555-0192',
    points: 124,
    createdAt: '2026-05-10',
  },
  {
    id: 'cust-2',
    name: 'Marcus Chen',
    email: 'mchen99@yahoo.com',
    phone: '555-0143',
    points: 48,
    createdAt: '2026-06-01',
  },
  {
    id: 'cust-3',
    name: 'Olivia Martinez',
    email: 'olivia.m@outlook.com',
    phone: '555-0177',
    points: 215,
    createdAt: '2026-04-15',
  },
  {
    id: 'cust-4',
    name: 'David Wilson',
    email: 'david.wilson@gmail.com',
    phone: '555-0188',
    points: 10,
    createdAt: '2026-06-25',
  },
];

export const INITIAL_SETTINGS: StoreSettings = {
  storeName: 'EA POS',
  storeAddress: '123 Tech Boulevard, Suite 400, WA 98101',
  storePhone: '206-555-0100',
  taxRate: 8.5, // 8.5% Seattle tax
  currency: '$',
  loyaltyPointsRate: 1, // 1 point per $1
  loyaltyPointValue: 0.05, // Each point is worth $0.05 discount
};

// Generates dynamic, realistic past transactions for the last 7 days
export function generatePastTransactions(): SaleTransaction[] {
  const transactions: SaleTransaction[] = [];
  const paymentMethods: Array<'cash' | 'card' | 'mobile'> = ['card', 'card', 'cash', 'mobile', 'card'];
  
  // Set up mock date loop going back 7 days
  const today = new Date();
  
  let txCounter = 10001;
  
  // Generate a random sample of sales
  for (let d = 7; d >= 0; d--) {
    const saleDate = new Date(today);
    saleDate.setDate(today.getDate() - d);
    
    // Number of sales on this day (weekends have more sales)
    const isWeekend = saleDate.getDay() === 0 || saleDate.getDay() === 6;
    const salesCount = isWeekend ? 15 + Math.floor(Math.random() * 10) : 8 + Math.floor(Math.random() * 8);
    
    for (let s = 0; s < salesCount; s++) {
      // Create random hours of operation (7:30 AM to 6:00 PM)
      const hour = 7 + Math.floor(Math.random() * 11);
      const minute = Math.floor(Math.random() * 60);
      saleDate.setHours(hour, minute, 0, 0);
      
      // Select random products (1 to 4 items)
      const itemCount = 1 + Math.floor(Math.random() * 4);
      const selectedProducts: Set<string> = new Set();
      while (selectedProducts.size < itemCount) {
        const prod = INITIAL_PRODUCTS[Math.floor(Math.random() * INITIAL_PRODUCTS.length)];
        selectedProducts.add(prod.id);
      }
      
      const items = Array.from(selectedProducts).map(prodId => {
        const prod = INITIAL_PRODUCTS.find(p => p.id === prodId)!;
        const qty = 1 + (Math.random() > 0.8 ? 1 : 0); // Mostly quantity 1, occasionally 2
        return {
          productId: prod.id,
          productName: prod.name,
          price: prod.price,
          cost: prod.cost,
          quantity: qty,
          total: Number((prod.price * qty).toFixed(2)),
        };
      });
      
      const subtotal = Number(items.reduce((sum, item) => sum + item.total, 0).toFixed(2));
      
      // Customer linkage (about 40% of sales have a customer linked)
      let customerId: string | null = null;
      let customerName: string | null = null;
      let discountType: SaleTransaction['discountType'] = 'none';
      let discountValue = 0;
      let discount = 0;
      
      if (Math.random() < 0.4) {
        const cust = INITIAL_CUSTOMERS[Math.floor(Math.random() * INITIAL_CUSTOMERS.length)];
        customerId = cust.id;
        customerName = cust.name;
        
        // Randomly apply loyalty points discount or regular promo discount
        const discRand = Math.random();
        if (discRand < 0.3) {
          discountType = 'loyalty';
          discountValue = Math.min(cust.points, 20); // apply up to 20 points
          discount = Number((discountValue * INITIAL_SETTINGS.loyaltyPointValue).toFixed(2));
        } else if (discRand < 0.6) {
          discountType = 'percentage';
          discountValue = 10; // 10% off
          discount = Number((subtotal * 0.1).toFixed(2));
        }
      }
      
      const taxableAmount = Math.max(0, subtotal - discount);
      const tax = Number((taxableAmount * (INITIAL_SETTINGS.taxRate / 100)).toFixed(2));
      const total = Number((taxableAmount + tax).toFixed(2));
      
      const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
      
      let cashPaid: number | undefined;
      let cashChange: number | undefined;
      
      if (paymentMethod === 'cash') {
        const bills = [5, 10, 20, 50, 100];
        const payVal = bills.find(b => b >= total) || Math.ceil(total / 10) * 10;
        cashPaid = payVal;
        cashChange = Number((payVal - total).toFixed(2));
      }
      
      // Randomly mark 3% of past sales as refunded (excluding today's sales for clean demos)
      const isRefunded = d > 0 && Math.random() < 0.03;
      
      transactions.push({
        id: `TX-${txCounter++}`,
        date: saleDate.toISOString(),
        items,
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
        customerName,
        status: isRefunded ? 'refunded' : 'completed',
        refundDate: isRefunded ? new Date(saleDate.getTime() + 4 * 60 * 60 * 1000).toISOString() : null,
      });
    }
  }
  
  // Sort from newest to oldest
  return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export const INITIAL_USER_ACCOUNTS: UserAccount[] = [
  {
    id: 'user-admin',
    name: 'Admin Manager',
    role: 'admin',
    pin: '1234',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'user-manager',
    name: 'Sarah Store Manager',
    role: 'manager',
    pin: '5555',
    active: true,
    createdAt: '2026-01-10T00:00:00.000Z'
  },
  {
    id: 'user-cashier',
    name: 'John Cashier',
    role: 'cashier',
    pin: '0000',
    active: true,
    createdAt: '2026-01-20T00:00:00.000Z'
  }
];

