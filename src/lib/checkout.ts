import {
  SaleTransaction,
  OrderItem,
  Payment,
  PaymentMethod,
  StoreSettings,
  UserAccount,
} from '../types';
import { summarizeTenders } from './payments';
import { shortId } from './ids';

export interface CheckoutRequest {
  cartItems: Omit<OrderItem, 'total'>[];
  subtotal: number;
  discountType: 'none' | 'fixed' | 'percentage' | 'loyalty';
  discountValue: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;

  paymentMethod: PaymentMethod;
  splitMode: boolean;
  splitPayments: Payment[];
  cashPaidText: string;
  cashChangeDue: number;

  selectedCustomerId: string | null;
  activeCustomerName: string | null;
  currentUser: UserAccount | null;
  currentShiftId: string | null;

  settings: StoreSettings;
}

export type CheckoutOutcome =
  | { success: true; transaction: SaleTransaction; pointsDelta: number }
  | { success: false; error: 'split-incomplete' | 'split-non-cash-overpay' | 'insufficient-cash' };

export function buildSaleTransaction(req: CheckoutRequest): CheckoutOutcome {
  let saleMethod: PaymentMethod;
  let payments: Payment[] | undefined;
  let paidValue: number | undefined;
  let changeDue: number | undefined;

  if (req.splitMode) {
    const clean = req.splitPayments.filter((p) => (p.amount || 0) > 0);
    const tenders = summarizeTenders(clean, req.totalAmount);
    if (clean.length === 0 || !tenders.coversTotal) {
      return { success: false, error: 'split-incomplete' };
    }
    // Only cash can overpay (for change). Non-cash tenders exceeding the
    // total would record phantom money with no way to return it.
    const nonCashTotal = clean
      .filter((p) => p.method !== 'cash')
      .reduce((s, p) => s + p.amount, 0);
    if (nonCashTotal > req.totalAmount + 0.005) {
      return { success: false, error: 'split-non-cash-overpay' };
    }
    payments = clean;
    saleMethod = tenders.dominantMethod;
    paidValue = tenders.cashTendered > 0 ? tenders.cashTendered : undefined;
    changeDue = tenders.cashTendered > 0 ? tenders.cashChange : undefined;
  } else {
    paidValue = req.paymentMethod === 'cash' ? parseFloat(req.cashPaidText) || 0 : undefined;
    // A fully-discounted ($0) sale needs no tendered cash.
    if (req.paymentMethod === 'cash' && req.totalAmount > 0 && (paidValue ?? 0) < req.totalAmount) {
      return { success: false, error: 'insufficient-cash' };
    }
    // A sale fully covered by redeemed points is a points redemption, not a $0
    // card charge. Any other $0 total (e.g. a 100% promo) keeps its chosen method.
    saleMethod =
      req.totalAmount <= 0 && req.discountType === 'loyalty' ? 'loyalty' : req.paymentMethod;
    changeDue = saleMethod === 'cash' ? req.cashChangeDue : undefined;
  }

  const nextId = `TX-${shortId().toUpperCase()}`;

  const pointsEarned = req.selectedCustomerId
    ? Math.floor(req.totalAmount * req.settings.loyaltyPointsRate)
    : undefined;

  const transaction: SaleTransaction = {
    id: nextId,
    date: new Date().toISOString(),
    items: req.cartItems.map((item) => ({
      ...item,
      total: Number((item.price * item.quantity).toFixed(2)),
    })),
    subtotal: req.subtotal,
    discount: req.discountAmount,
    discountType: req.discountType,
    discountValue: req.discountValue,
    tax: req.taxAmount,
    total: req.totalAmount,
    paymentMethod: saleMethod,
    payments: payments && payments.length > 1 ? payments : undefined,
    cashPaid: paidValue,
    cashChange: changeDue,
    customerId: req.selectedCustomerId,
    customerName: req.activeCustomerName,
    operatorId: req.currentUser?.id ?? null,
    operatorName: req.currentUser?.name ?? null,
    pointsEarned,
    status: 'completed',
    shiftId: req.currentShiftId,
  };

  let pointsDelta = pointsEarned ?? 0;
  if (req.selectedCustomerId && req.discountType === 'loyalty') {
    const clampedPoints =
      req.settings.loyaltyPointValue > 0
        ? Math.round(req.discountAmount / req.settings.loyaltyPointValue)
        : 0;
    pointsDelta -= clampedPoints;
  }

  return { success: true, transaction, pointsDelta };
}
