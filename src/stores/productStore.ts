import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Product, Category } from '../types';
import { INITIAL_PRODUCTS, INITIAL_CATEGORIES } from '../data/seedData';
import { idbStorage } from '../lib/idbStorage';
import { deleteProductsCloudIfEnabled, deleteCategoriesCloudIfEnabled } from '../lib/sync';

interface ProductState {
  products: Product[];
  categories: Category[];

  // Actions
  setProducts: (products: Product[]) => void;
  setCategories: (categories: Category[]) => void;

  handleAddProduct: (payload: Omit<Product, 'id'>) => Product;
  handleUpdateProduct: (updated: Product) => void;
  handleDeleteProduct: (id: string) => void;
  reorderProducts: (activeId: string, overId: string) => void;

  handleAddCategory: (name: string, color: string) => Category;
  handleDeleteCategory: (id: string) => void;
}

export const useProductStore = create<ProductState>()(
  persist(
    (set, get) => ({
      products: INITIAL_PRODUCTS,
      categories: INITIAL_CATEGORIES,

      setProducts: (products) => set({ products }),
      setCategories: (categories) => set({ categories }),

      handleAddProduct: (payload) => {
        const newProduct: Product = {
          ...payload,
          id: `prod-${Math.floor(1000 + Math.random() * 9000)}`,
        };
        set({ products: [...get().products, newProduct] });
        return newProduct;
      },

      handleUpdateProduct: (updated) => {
        set({
          products: get().products.map((p) => (p.id === updated.id ? updated : p)),
        });
      },

      handleDeleteProduct: (id) => {
        set({
          products: get().products.filter((p) => p.id !== id),
        });
        deleteProductsCloudIfEnabled([id]);
      },

      reorderProducts: (activeId, overId) => {
        const { products } = get();
        const oldIndex = products.findIndex((p) => p.id === activeId);
        const newIndex = products.findIndex((p) => p.id === overId);
        if (oldIndex !== -1 && newIndex !== -1) {
          const newProducts = [...products];
          const [movedItem] = newProducts.splice(oldIndex, 1);
          newProducts.splice(newIndex, 0, movedItem);
          set({ products: newProducts });
        }
      },

      handleAddCategory: (name, color) => {
        const newCat: Category = {
          id: `cat-${name.toLowerCase().replace(/\s+/g, '-').slice(0, 8)}-${Math.floor(10 + Math.random() * 90)}`,
          name,
          color,
        };
        set({ categories: [...get().categories, newCat] });
        return newCat;
      },

      handleDeleteCategory: (id) => {
        set({
          categories: get().categories.filter((c) => c.id !== id),
        });
        deleteCategoriesCloudIfEnabled([id]);
      },
    }),
    {
      name: 'pos-product-storage',
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
