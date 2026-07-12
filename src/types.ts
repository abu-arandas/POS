export interface Product {
  id: string;
  name: string;
  price: number;
  cost: number;
  category: string;
  sku: string;
  stock: number;
  minStock: number;
  image: string; // Tailwind bg-color or direct URL
}

export interface Category {
  id: string;
  name: string;
  color: string; // Tailwind background color class
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  points: number; // Loyalty points earned (e.g., 1 point per $1 spent)
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  price: number; // Purchase price
  cost: number; // Product cost at purchase time
  quantity: number;
  total: number;
}

export interface SaleTransaction {
  id: string; // Receipt number (e.g., TX-10001)
  date: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  discountType: 'none' | 'percentage' | 'fixed' | 'loyalty';
  discountValue: number;
  tax: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'mobile' | 'gift';
  cashPaid?: number;
  cashChange?: number;
  customerId: string | null;
  customerName?: string | null;
  status: 'completed' | 'refunded';
  refundDate?: string | null;
}

export interface StoreSettings {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeLogo?: string;
  taxRate: number; // e.g., 8 for 8%
  currency: string; // e.g., "$"
  loyaltyPointsRate: number; // points earned per unit of currency (e.g. 1 point per $1)
  loyaltyPointValue: number; // discount value per point (e.g. $0.05 per point)
}

export interface UserAccount {
  id: string;
  name: string;
  role: 'admin' | 'manager' | 'cashier';
  pin: string; // 4-digit entry passcode
  active: boolean;
  createdAt: string;
}

export interface PrinterConfig {
  type: 'system' | 'serial' | 'bluetooth' | 'network';
  paperSize: '58mm' | '80mm';
  ipAddress?: string;
  baudRate?: number;
  showBarcode: boolean;
  footerMessage: string;
  autoPrintOnCheckout: boolean;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  enabled: boolean;
  status: 'disconnected' | 'connected' | 'error';
}

