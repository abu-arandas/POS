import { CreditCard, DollarSign, Smartphone, Gift, Award } from 'lucide-react';

/**
 * The payment-method glyph, shared by the payment filter chips and the method
 * column of the transaction table so the two can never drift apart.
 */
export function PaymentIcon({ method }: { method: string }) {
  switch (method) {
    case 'card':
      return <CreditCard size={13} className="text-blue-400" />;
    case 'cash':
      return <DollarSign size={13} className="text-emerald-400" />;
    case 'mobile':
      return <Smartphone size={13} className="text-purple-400" />;
    case 'gift':
      return <Gift size={13} className="text-amber-400" />;
    case 'loyalty':
      return <Award size={13} className="text-emerald-400" />;
    default:
      return <CreditCard size={13} className="text-slate-500 dark:text-slate-400" />;
  }
}
