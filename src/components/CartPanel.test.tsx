import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CartPanel from './CartPanel';
import { Product, Customer } from '../types';

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Flat White',
  price: 4.5,
  cost: 1.2,
  category: 'cat-coffee',
  sku: 'BEV-FW-01',
  stock: 10,
  minStock: 3,
  image: '',
  ...overrides,
});

const makeCustomer = (overrides: Partial<Customer> = {}): Customer => ({
  id: 'c1',
  name: 'Eleanor Vance',
  email: 'eleanor@example.com',
  phone: '555-1234',
  points: 120,
  createdAt: new Date().toISOString(),
  ...overrides,
});

type Props = React.ComponentProps<typeof CartPanel>;

const defaultProps = (overrides: Partial<Props> = {}): Props => ({
  cart: [],
  updateCartQty: vi.fn(),
  removeFromCart: vi.fn(),
  clearCart: vi.fn(),
  activeCustomer: null,
  selectedCustomerId: null,
  setSelectedCustomerId: vi.fn(),
  setAddCustomerOpen: vi.fn(),
  discountType: 'none',
  setDiscountType: vi.fn(),
  discountInput: '',
  setDiscountInput: vi.fn(),
  loyaltyPointsToUse: 0,
  setLoyaltyPointsToUse: vi.fn(),
  showPromoInput: false,
  setShowPromoInput: vi.fn(),
  subtotal: 0,
  discountAmount: 0,
  taxAmount: 0,
  totalAmount: 0,
  handleCheckoutClick: vi.fn(),
  onHoldOrder: vi.fn(),
  heldCount: 0,
  onOpenHeldOrders: vi.fn(),
  ...overrides,
});

describe('CartPanel', () => {
  it('shows the empty state and disables actions when the cart is empty', () => {
    render(<CartPanel {...defaultProps()} />);
    expect(screen.getByText('CART IS EMPTY')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /checkout/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear entire cart' })).toBeDisabled();
  });

  it('renders cart lines with per-product labeled quantity controls', () => {
    const updateCartQty = vi.fn();
    const product = makeProduct();
    render(
      <CartPanel
        {...defaultProps({
          cart: [{ product, quantity: 2 }],
          subtotal: 9,
          totalAmount: 9,
          updateCartQty,
        })}
      />,
    );

    expect(screen.getByText('Flat White')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Increase quantity — Flat White/ }));
    expect(updateCartQty).toHaveBeenCalledWith('p1', 1);

    fireEvent.click(screen.getByRole('button', { name: /Decrease quantity — Flat White/ }));
    expect(updateCartQty).toHaveBeenCalledWith('p1', -1);
  });

  it('disables the increase button once quantity reaches available stock', () => {
    const product = makeProduct({ stock: 2 });
    render(
      <CartPanel {...defaultProps({ cart: [{ product, quantity: 2 }], subtotal: 9, totalAmount: 9 })} />,
    );
    expect(screen.getByRole('button', { name: /Increase quantity — Flat White/ })).toBeDisabled();
  });

  it('removes a line via its labeled remove button', () => {
    const removeFromCart = vi.fn();
    const product = makeProduct();
    render(
      <CartPanel
        {...defaultProps({ cart: [{ product, quantity: 1 }], subtotal: 4.5, totalAmount: 4.5, removeFromCart })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Remove from cart — Flat White/ }));
    expect(removeFromCart).toHaveBeenCalledWith('p1');
  });

  it('triggers checkout when the cart has items', () => {
    const handleCheckoutClick = vi.fn();
    const product = makeProduct();
    render(
      <CartPanel
        {...defaultProps({ cart: [{ product, quantity: 1 }], subtotal: 4.5, totalAmount: 4.5, handleCheckoutClick })}
      />,
    );
    const checkout = screen.getByRole('button', { name: /checkout/i });
    expect(checkout).toBeEnabled();
    fireEvent.click(checkout);
    expect(handleCheckoutClick).toHaveBeenCalledTimes(1);
  });

  it('offers loyalty points when a customer with points is linked', () => {
    const customer = makeCustomer({ points: 120 });
    render(
      <CartPanel
        {...defaultProps({
          activeCustomer: customer,
          selectedCustomerId: customer.id,
          cart: [{ product: makeProduct(), quantity: 1 }],
          subtotal: 4.5,
          totalAmount: 4.5,
        })}
      />,
    );
    expect(screen.getByText('Eleanor Vance')).toBeInTheDocument();
    expect(screen.getByText('Loyalty Points Available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove customer' })).toBeInTheDocument();
  });

  it('shows the resume-held-orders shortcut only when orders are held', () => {
    const onOpenHeldOrders = vi.fn();
    const { rerender } = render(<CartPanel {...defaultProps({ heldCount: 0 })} />);
    expect(document.getElementById('open-held-orders-btn')).toBeNull();

    rerender(<CartPanel {...defaultProps({ heldCount: 2, onOpenHeldOrders })} />);
    const resumeBtn = document.getElementById('open-held-orders-btn');
    expect(resumeBtn).not.toBeNull();
    fireEvent.click(resumeBtn!);
    expect(onOpenHeldOrders).toHaveBeenCalledTimes(1);
  });
});
