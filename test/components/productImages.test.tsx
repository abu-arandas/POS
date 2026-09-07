import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProductGrid from '../../src/components/ProductGrid';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useProductStore } from '../../src/stores/productStore';
import type { Category, Product } from '../../src/types';

// Product pictures are off by default and switchable on. The switch has to
// reach every surface that shows one, or it becomes a setting that half works —
// the operator turns images off and they are still on the cart, or the till goes
// quiet while the customer's phone still shows them off the QR menu.

vi.mock('../../src/lib/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/sync')>()),
  deleteProductsCloudIfEnabled: vi.fn(),
  deleteCategoriesCloudIfEnabled: vi.fn(),
}));

const product: Product = {
  id: 'prod-1',
  name: 'Latte',
  price: 4.5,
  cost: 1,
  category: 'cat-1',
  sku: 'SKU-1',
  stock: 10,
  minStock: 2,
  image: 'https://example.test/latte.png',
};
const categories: Category[] = [{ id: 'cat-1', name: 'Coffee', color: 'bg-amber-500' }];

// The grid reads the catalogue from the store rather than taking it as a prop.
const renderGrid = () =>
  render(
    <ProductGrid
      selectedCategory="all"
      setSelectedCategory={() => {}}
      cart={[]}
      addToCart={() => {}}
    />,
  );

beforeEach(() => {
  useSettingsStore.setState({ showProductImages: false });
  useProductStore.setState({ products: [product], categories });
});

describe('product images setting', () => {
  it('is off for a fresh install', () => {
    // The chosen default: a till reads faster as text, and a catalogue with no
    // real photography is the common case.
    expect(useSettingsStore.getInitialState().showProductImages).toBe(false);
  });

  it('renders no product image on the register when off', () => {
    renderGrid();

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // The product itself is still there — this hides pictures, not the catalogue.
    expect(screen.getByText('Latte')).toBeInTheDocument();
  });

  it('renders the product image when switched on', () => {
    useSettingsStore.setState({ showProductImages: true });
    renderGrid();

    const image = screen.getByRole('img', { name: 'Latte' });
    expect(image).toHaveAttribute('src', product.image);
  });

  it('leaves Product.image untouched, so switching back restores it', () => {
    // The setting governs display only. Nothing clears the field, so an operator
    // who turns images off has not lost the pictures they uploaded.
    useSettingsStore.setState({ showProductImages: false });
    renderGrid();

    expect(product.image).toBe('https://example.test/latte.png');
  });
});
