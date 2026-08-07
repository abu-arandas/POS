import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pullProducts } from '../../src/lib/supabase';
import { SupabaseClient } from '@supabase/supabase-js';

describe('pullProducts', () => {
  let mockClient: any;
  let mockSelect: any;
  let mockEq: any;

  beforeEach(() => {
    mockEq = vi.fn();
    mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    mockClient = {
      from: vi.fn().mockReturnValue({ select: mockSelect }),
    };
  });

  it('should return mapped products on success without storeId', async () => {
    const mockData = [
      { id: '1', name: 'Product 1', price: '10', cost: '5', category: 'Cat 1', sku: 'SKU1', stock: '100', min_stock: '10', image: 'img1.png' }
    ];
    mockSelect.mockResolvedValue({ data: mockData, error: null });

    const result = await pullProducts(mockClient as unknown as SupabaseClient);

    expect(mockClient.from).toHaveBeenCalledWith('products');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).not.toHaveBeenCalled();
    expect(result).toEqual([{
      id: '1',
      name: 'Product 1',
      price: 10,
      cost: 5,
      category: 'Cat 1',
      sku: 'SKU1',
      stock: 100,
      minStock: 10,
      image: 'img1.png'
    }]);
  });

  it('should filter by storeId if provided', async () => {
    const mockData: any[] = [];
    const mockPromise = Promise.resolve({ data: mockData, error: null });
    mockEq.mockReturnValue(mockPromise);
    mockSelect.mockReturnValue({ eq: mockEq });

    const result = await pullProducts(mockClient as unknown as SupabaseClient, 'store-123');

    expect(mockClient.from).toHaveBeenCalledWith('products');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).toHaveBeenCalledWith('store_id', 'store-123');
    expect(result).toEqual([]);
  });

  it('should handle null data', async () => {
    mockSelect.mockResolvedValue({ data: null, error: null });

    const result = await pullProducts(mockClient as unknown as SupabaseClient);

    expect(result).toEqual([]);
  });

  it('should handle errors and return null', async () => {
    const mockError = new Error('Database error');
    mockSelect.mockResolvedValue({ data: null, error: mockError });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await pullProducts(mockClient as unknown as SupabaseClient);

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith('Failed pulling products:', mockError);

    consoleSpy.mockRestore();
  });
});
