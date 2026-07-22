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

export type PaymentMethod = 'cash' | 'card' | 'mobile' | 'gift' | 'loyalty';

export interface OrderItem {
  productId: string;
  productName: string;
  price: number; // Purchase price
  cost: number; // Product cost at purchase time
  quantity: number;
  total: number;
}

// One tender line of a sale. A single-method sale has one entry; a split sale
// has several whose amounts sum to the total (cash may overpay for change).
export interface Payment {
  method: PaymentMethod;
  amount: number;
}

// Cumulative quantity of a line returned across one or more partial refunds.
export interface RefundedItem {
  productId: string;
  quantity: number;
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
  paymentMethod: PaymentMethod; // dominant method (largest tender)
  payments?: Payment[]; // full breakdown; present (length > 1) only for split sales
  cashPaid?: number;
  cashChange?: number;
  customerId: string | null;
  customerName?: string | null;
  operatorId?: string | null; // staff member who rang up the sale
  operatorName?: string | null;
  // Loyalty points awarded at sale time. Stored so a refund reverses exactly
  // what was earned even if the points rate changed since the sale.
  pointsEarned?: number;
  // 'completed' = no refund, 'partial' = some items returned, 'refunded' = fully returned.
  status: 'completed' | 'partial' | 'refunded';
  refundedItems?: RefundedItem[]; // cumulative returned quantities (partial refunds)
  refundedAmount?: number; // cumulative currency refunded
  refundDate?: string | null;
  refundAuthorizedBy?: string | null; // staff member who authorized the refund
  shiftId?: string | null; // the register shift this sale belongs to
}

export interface Supplier {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  createdAt: string;
}

// One product line on a purchase order. unitCost is the agreed buy price at
// order time — a snapshot, deliberately not a live reference to product.cost.
export interface PurchaseOrderLine {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
}

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'received' | 'cancelled';

// A lightweight purchase order: drafted, marked as ordered with the supplier,
// then received (which applies stock and writes audit-log entries) or
// cancelled. Terminal-local like suppliers and the stock log.
export interface PurchaseOrder {
  id: string;
  supplierId: string | null;
  supplierName: string | null;
  status: PurchaseOrderStatus;
  lines: PurchaseOrderLine[];
  note?: string | null;
  createdBy?: string | null;
  createdAt: string;
  orderedAt?: string | null;
  receivedAt?: string | null;
}

// One entry in the stock audit log. Every stock change — receiving a shipment,
// a manual correction, waste — is recorded with who/why for traceability.
export interface StockAdjustment {
  id: string;
  productId: string;
  productName: string;
  delta: number; // +received, -waste/correction
  newStock: number;
  reason: 'received' | 'correction' | 'waste' | 'other';
  note?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  operatorName?: string | null;
  createdAt: string;
}

// A register/drawer session between an open (starting float) and close (counted
// cash → variance). Shifts are terminal-local: they describe one physical drawer.
export interface Shift {
  id: string;
  openedAt: string;
  openedBy: string; // operator name
  openingFloat: number; // starting cash in the drawer
  closedAt?: string | null;
  closedBy?: string | null;
  countedCash?: number | null; // physically counted at close
  note?: string | null;
}

// A cart parked for later (the "hold order" workflow). Product snapshots mirror
// the live cart; stock is re-validated from the catalog when the sale completes.
export interface HeldOrderItem {
  productId: string;
  productName: string;
  price: number;
  cost: number;
  quantity: number;
}

export interface HeldOrder {
  id: string;
  label: string; // operator-supplied name, e.g. "Table 4" (defaults to a time)
  createdAt: string;
  items: HeldOrderItem[];
  customerId: string | null;
  discountType: 'none' | 'percentage' | 'fixed' | 'loyalty';
  discountInput: string;
  loyaltyPointsToUse: number;
  operatorName?: string | null;
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
  // Also print a kitchen ticket (big-type items, no prices) at checkout.
  // Optional so configs persisted before this field existed stay valid.
  kitchenTicketOnCheckout?: boolean;
}

// Keyboard-wedge barcode scanner tuning. Wedge scanners "type" the code as a
// fast keystroke burst ending in Enter; these thresholds separate a scan from
// human typing.
export interface ScannerConfig {
  enabled: boolean;
  minLength: number; // shortest keystroke burst treated as a scan
  maxInterKeyMs: number; // a keystroke gap above this resets the burst
}

// Placeholder-based template for the pre-filled receipt email. Supported
// placeholders (single braces, so they can't collide with i18next syntax):
// {storeName}, {receiptId}, {date}, {total}, {customerName} — customerName
// falls back to a generic greeting when the sale has none.
export interface ReceiptEmailTemplate {
  subject: string;
  header: string; // body text above the receipt
  footer: string; // body text below the receipt
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  // Optional Supabase Auth "device" account. When set, the sync client signs in
  // with it so the terminal operates as an authenticated role — required once
  // RLS is enabled (see scripts/schema.sql). Left blank = anonymous (demo mode).
  authEmail?: string;
  authPassword?: string;
  enabled: boolean;
  status: 'disconnected' | 'connected' | 'error';
}
