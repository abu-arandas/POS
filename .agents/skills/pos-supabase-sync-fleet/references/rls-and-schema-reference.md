# Supabase Database Schema & RLS Policy Reference

This reference documents the cloud database schema, Row Level Security (RLS) policies, multi-store tenant isolation, and realtime sync configuration for EA POS.

## 🗄️ Core Database Tables (`scripts/schema.sql`)

### 1. `products`
Stores centralized product catalog definitions across terminals.
- Primary Key: `id` (text)
- Columns: `name`, `price`, `cost`, `category`, `sku`, `stock`, `min_stock`, `image`, `updated_at`, `store_id`

### 2. `transactions`
Sales transaction receipts.
- Primary Key: `id` (text, e.g. `TX-10001`)
- Columns: `date`, `items` (JSONB), `subtotal`, `discount`, `tax`, `total`, `payment_method`, `payments` (JSONB), `customer_id`, `operator_name`, `status`, `refunded_items` (JSONB), `store_id`

### 3. `shifts`
Register sessions per cash drawer.
- Primary Key: `id` (text)
- Columns: `opened_at`, `opened_by`, `opening_float`, `closed_at`, `closed_by`, `counted_cash`, `note`, `store_id`

### 4. `stock_adjustments`
Immutable inventory movement log.
- Primary Key: `id` (text)
- Columns: `product_id`, `delta`, `new_stock`, `reason`, `note`, `operator_name`, `created_at`, `store_id`

---

## 🔒 Row Level Security Policies (`scripts/multi-store-rls-enforce.sql`)

RLS is enabled on all tables. Public anonymous access is prohibited.

```sql
-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Multi-store isolation policy
CREATE POLICY "Store isolation read policy" ON products
  FOR SELECT USING (store_id = current_setting('app.current_store_id', true));

CREATE POLICY "Store isolation write policy" ON products
  FOR ALL USING (store_id = current_setting('app.current_store_id', true));
```

---

## 📡 Realtime Sync Publication

Realtime subscriptions are powered by Postgres Logical Replication:

```sql
-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE shifts;
```
