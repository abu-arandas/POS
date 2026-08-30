import { SupabaseClient } from '@supabase/supabase-js';
import { OrderItem, SaleTransaction } from '../../types';
import { fetchAllPages, keyset, stampStoreId } from './sync-utils';

/**
 * Push local transactions
 */
export async function pushTransactions(
  client: SupabaseClient,
  transactions: SaleTransaction[],
  storeId?: string,
): Promise<boolean> {
  if (transactions.length === 0) return true;
  try {
    const records = stampStoreId(
      transactions.map((t) => ({
        id: t.id,
        date: t.date,
        items: t.items, // JSONB structure
        subtotal: t.subtotal,
        discount: t.discount,
        discount_type: t.discountType,
        discount_value: t.discountValue,
        tax: t.tax,
        total: t.total,
        payment_method: t.paymentMethod,
        payments: t.payments ?? null,
        cash_paid: t.cashPaid ?? null,
        cash_change: t.cashChange ?? null,
        customer_id: t.customerId || null,
        customer_name: t.customerName || null,
        operator_id: t.operatorId || null,
        operator_name: t.operatorName || null,
        points_earned: t.pointsEarned ?? null,
        status: t.status,
        refunded_items: t.refundedItems ?? null,
        refunded_amount: t.refundedAmount ?? null,
        refund_date: t.refundDate || null,
        refund_authorized_by: t.refundAuthorizedBy || null,
        shift_id: t.shiftId || null,
      })),
      storeId,
    );
    const { error } = await client.from('transactions').upsert(records);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Failed pushing transactions:', err);
    return false;
  }
}

/**
 * Pull transactions
 */
export async function pullTransactions(
  client: SupabaseClient,
  storeId?: string,
): Promise<SaleTransaction[] | null> {
  try {
    // Walked by id so the cursor is stable, then sorted newest-first here.
    // Ordering by date server-side would need the cursor to be the (date, id)
    // pair, which PostgREST cannot express as a single filter; sorting the
    // finished set costs nothing next to the round trips and keeps this
    // function's contract — newest first — exactly as it was.
    const data = await fetchAllPages((afterId, limit) => {
      let query = keyset(client.from('transactions').select('*'), afterId, limit);
      if (storeId) query = query.eq('store_id', storeId);
      return query;
    });
    data.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return (data || []).map((r) => ({
      id: r.id,
      date: r.date,
      items: r.items as OrderItem[],
      subtotal: Number(r.subtotal),
      discount: Number(r.discount),
      discountType: r.discount_type as SaleTransaction['discountType'],
      discountValue: Number(r.discount_value),
      tax: Number(r.tax),
      total: Number(r.total),
      paymentMethod: r.payment_method as SaleTransaction['paymentMethod'],
      payments: (r.payments as SaleTransaction['payments']) ?? undefined,
      cashPaid: r.cash_paid != null ? Number(r.cash_paid) : undefined,
      cashChange: r.cash_change != null ? Number(r.cash_change) : undefined,
      customerId: r.customer_id,
      customerName: r.customer_name,
      operatorId: r.operator_id ?? null,
      operatorName: r.operator_name ?? null,
      pointsEarned: r.points_earned != null ? Number(r.points_earned) : undefined,
      status: r.status as SaleTransaction['status'],
      refundedItems: (r.refunded_items as SaleTransaction['refundedItems']) ?? undefined,
      refundedAmount: r.refunded_amount != null ? Number(r.refunded_amount) : undefined,
      refundDate: r.refund_date,
      refundAuthorizedBy: r.refund_authorized_by ?? null,
      shiftId: r.shift_id ?? null,
    }));
  } catch (err) {
    console.error('Failed pulling transactions:', err);
    return null;
  }
}
