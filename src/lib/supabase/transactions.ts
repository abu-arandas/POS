import { SupabaseClient } from '@supabase/supabase-js';
import { OrderItem, SaleTransaction } from '../../types';
import { fetchAllPages, isUnknownColumn, keyset, stampStoreId } from './sync-utils';

/**
 * Reads an optional numeric column: a column the row omits, or stores as SQL
 * NULL, stays `undefined` rather than becoming `Number(null)` — that is, 0.
 */
function optionalNumber(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : Number(value);
}

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
        tax_rate: t.taxRate ?? null,
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
    if (!error) return true;

    // The app updates itself; the schema does not. Between an install picking
    // up tax_rate and an operator running src/db/schema.sql, PostgREST rejects
    // the whole row for the one column it does not know — so every sale would
    // stop syncing, silently, over a field that is only a receipt label.
    // Dropping it and retrying keeps the money flowing and leaves a warning
    // pointing at the migration.
    if (!isUnknownColumn(error, 'tax_rate')) throw error;
    console.warn(
      'transactions.tax_rate is missing in Supabase — pushing without it. ' +
        'Run the ALTER TABLE in src/db/schema.sql so reprinted receipts can ' +
        'show the rate each sale was charged at.',
    );
    const withoutRate = records.map(({ tax_rate: _rate, ...rest }) => rest);
    const retry = await client.from('transactions').upsert(withoutRate);
    if (retry.error) throw retry.error;
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
      taxRate: optionalNumber(r.tax_rate),
      total: Number(r.total),
      paymentMethod: r.payment_method as SaleTransaction['paymentMethod'],
      payments: (r.payments as SaleTransaction['payments']) ?? undefined,
      cashPaid: optionalNumber(r.cash_paid),
      cashChange: optionalNumber(r.cash_change),
      customerId: r.customer_id,
      customerName: r.customer_name,
      operatorId: r.operator_id ?? null,
      operatorName: r.operator_name ?? null,
      pointsEarned: optionalNumber(r.points_earned),
      status: r.status as SaleTransaction['status'],
      refundedItems: (r.refunded_items as SaleTransaction['refundedItems']) ?? undefined,
      refundedAmount: optionalNumber(r.refunded_amount),
      refundDate: r.refund_date,
      refundAuthorizedBy: r.refund_authorized_by ?? null,
      shiftId: r.shift_id ?? null,
    }));
  } catch (err) {
    console.error('Failed pulling transactions:', err);
    return null;
  }
}
