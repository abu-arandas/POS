# Split Tender & Line-Item Refund Calculation Matrix

This reference provides exact mathematical formulas, edge cases, and step-by-step examples for the checkout pricing engine, split tender settlement, and partial line-item refunds.

## 🧮 1. Checkout Pricing & Discount Sequence

### Standard Math Pipeline (`src/lib/pricing.ts`)

Given:
- Cart items $I_1, I_2, \dots, I_n$ with quantity $q_i$ and unit price $p_i$.
- Discount type $D_{\text{type}} \in \{\text{'none'}, \text{'percentage'}, \text{'fixed'}, \text{'loyalty'}\}$.
- Tax rate $T\%$ (e.g. 8 for 8%).

$$\text{Subtotal} = \sum_{i=1}^{n} (q_i \times p_i)$$

$$\text{Discount Amount} = \begin{cases} 
0 & \text{if } D_{\text{type}} = \text{'none'} \\
\text{Subtotal} \times \frac{D_{\text{value}}}{100} & \text{if } D_{\text{type}} = \text{'percentage'} \\
\min(D_{\text{value}}, \text{Subtotal}) & \text{if } D_{\text{type}} = \text{'fixed'} \\
\min(L_{\text{pts}} \times L_{\text{val}}, \text{Subtotal}) & \text{if } D_{\text{type}} = \text{'loyalty'}
\end{cases}$$

$$\text{Discounted Subtotal} = \max(0, \text{Subtotal} - \text{Discount Amount})$$

$$\text{Tax Amount} = \text{Discounted Subtotal} \times \frac{T}{100}$$

$$\text{Total Payable} = \text{Discounted Subtotal} + \text{Tax Amount}$$

---

## 💳 2. Split Tender Settlement Rules (`src/lib/payments.ts`)

When settling across multiple payment tenders (e.g. $20 Cash + $34.00 Card):

1. **Validation**: $\sum \text{Tender Amounts} \ge \text{Total Payable}$.
2. **Dominant Tender**: The method with the largest individual tender amount is set as `paymentMethod` on the transaction object for top-level breakdown charts.
3. **Cash Change**:
   $$\text{Cash Change} = \max(0, \text{Total Cash Tender} - \text{Remaining Balance Unpaid})$$

---

## 🔄 3. Partial Line-Item Refund Allocation (`src/lib/refunds.ts`)

When returning $k$ units of item $I_j$ from a completed sale:

1. **Item Price Portion**: $\text{Base Item Return} = k \times p_j$.
2. **Prorated Discount Reversal**:
   $$\text{Line Discount Ratio} = \frac{\text{Discount Amount}}{\text{Original Subtotal}}$$
   $$\text{Prorated Discount Deduction} = \text{Base Item Return} \times \text{Line Discount Ratio}$$
3. **Prorated Tax Reversal**:
   $$\text{Net Item Value} = \text{Base Item Return} - \text{Prorated Discount Deduction}$$
   $$\text{Prorated Tax Refund} = \text{Net Item Value} \times \frac{T}{100}$$
4. **Total Currency Refunded**:
   $$\text{Refund Amount} = \text{Net Item Value} + \text{Prorated Tax Refund}$$
