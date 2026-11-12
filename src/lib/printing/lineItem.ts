import type { OrderItem } from '../../types';

/**
 * How a sold line is named on paper.
 *
 * Shared because there are three renderers — the HTML receipt
 * (receipt/templates/), the printer-independent DocRow model (receiptDoc.ts,
 * which feeds both ESC/POS text and the canvas raster), and the HTML kitchen
 * ticket — and they used to disagree. receiptDoc named the variant; the two
 * HTML templates printed the bare product name, so the SAME sale printed
 * "Latte — Large / Oat" on a network thermal printer and "Latte" on the
 * default `system` printer. None of the three printed modifiers at all,
 * although every sale carries them.
 *
 * Everything here reads off the transaction and never looks anything up in the
 * catalogue: a receipt reprinted after the variant was renamed, or the modifier
 * group deleted, has to show what the customer actually bought.
 */

/**
 * The line's name — "Latte — Large / Oat", or just "Latte" on a plain product.
 *
 * The variant belongs in the name rather than on a line of its own: two sizes
 * of one drink are two different things to make, to charge for and to return,
 * and a receipt that calls them both "Latte" tells neither the customer nor the
 * returns desk which one was sold.
 */
export function itemLabel(item: Pick<OrderItem, 'productName' | 'variantName'>): string {
  return item.variantName ? `${item.productName} — ${item.variantName}` : item.productName;
}

/**
 * The chosen modifiers, as the option names alone — ["Extra Shot", "No Onions"].
 *
 * Names only, without the price delta: the delta is already inside the line's
 * price and its total, so printing it again beside the modifier reads as a
 * second charge. The customer's arithmetic has to work from the column on the
 * right, and it does.
 *
 * Empty for a line with no modifiers, so a caller can skip the block with a
 * length check rather than testing for undefined.
 */
export function itemModifierNames(item: Pick<OrderItem, 'modifiers'>): string[] {
  return (item.modifiers ?? []).map((modifier) => modifier.optionName);
}
