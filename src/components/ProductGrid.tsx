import React, { useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { motion } from 'motion/react';
import { Product } from '../types';
import { useProductStore } from '../stores/productStore';
import { useSettingsStore } from '../stores/settingsStore';

interface ProductGridProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCategory: string;
  setSelectedCategory: (c: string) => void;
  cart: Array<{ product: Product; quantity: number }>;
  addToCart: (product: Product) => void;
}

export default function ProductGrid({
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  cart,
  addToCart,
}: ProductGridProps) {
  const { products, categories } = useProductStore();
  const { settings } = useSettingsStore();

  const filteredProducts = useMemo(() => {
    return products.filter(prod => {
      const matchesCategory = selectedCategory === 'all' || prod.category === selectedCategory;
      const matchesSearch = prod.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            prod.sku.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  return (
    <div id="catalog-section" className="flex-1 flex flex-col min-w-0 p-6 overflow-hidden">
      
      {/* Header Search & Category pills */}
      <div id="catalog-controls" className="glass dark:glass-dark p-4 rounded-2xl shadow-sm space-y-4 mb-6 transition-all duration-300">
        <div className="flex items-center space-x-3 bg-white/50 dark:bg-slate-900/50 px-3 py-2.5 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
          <Search size={18} className="text-slate-400 dark:text-slate-500" />
          <input
            id="product-search-input"
            type="text"
            placeholder="Search products by name or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none text-slate-800 dark:text-slate-200 text-sm focus:outline-none placeholder-slate-400 dark:placeholder-slate-500"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div id="category-pills" className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200 shrink-0 ${
              selectedCategory === 'all'
                ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20'
                : 'bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-transparent hover:bg-white dark:hover:bg-slate-700'
            }`}
          >
            All Products
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200 shrink-0 ${
                selectedCategory === cat.id
                  ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20'
                  : 'bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-transparent hover:bg-white dark:hover:bg-slate-700'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      <div id="products-grid-container" className="flex-1 overflow-y-auto pr-1">
        {filteredProducts.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center animate-fade-in">
            <span className="text-4xl animate-float-slow">☕</span>
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400 font-medium">No products match your search</p>
          </div>
        ) : (
          <div id="products-grid" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredProducts.map((prod, index) => {
              const isLowStock = prod.stock <= prod.minStock && prod.stock > 0;
              const isOutOfStock = prod.stock === 0;
              const cartQty = cart.find(item => item.product.id === prod.id)?.quantity || 0;
              const isLimitReached = cartQty >= prod.stock;

              return (
                <motion.div
                  key={prod.id}
                  layoutId={`prod-card-${prod.id}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  onClick={() => !isOutOfStock && addToCart(prod)}
                  whileHover={{ scale: isOutOfStock ? 1 : 1.03, y: isOutOfStock ? 0 : -4 }}
                  whileTap={{ scale: isOutOfStock ? 1 : 0.96 }}
                  className={`relative glass dark:glass-dark rounded-2xl transition-all duration-200 cursor-pointer overflow-hidden flex flex-col justify-between group ${
                    isOutOfStock
                      ? 'border-slate-200/50 dark:border-slate-700/50 opacity-50 cursor-not-allowed grayscale'
                      : isLimitReached
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                      : 'border-slate-200/50 dark:border-slate-700/50 hover:shadow-xl hover:shadow-emerald-500/10'
                  }`}
                >
                  <div className="absolute top-2 left-2 z-10 flex flex-col gap-1.5">
                    {isOutOfStock && (
                      <span className="bg-rose-500/90 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                        Out of Stock
                      </span>
                    )}
                    {!isOutOfStock && isLowStock && (
                      <span className="bg-amber-500/90 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm shimmer">
                        Only {prod.stock} Left
                      </span>
                    )}
                    {cartQty > 0 && (
                      <span className="bg-emerald-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-md shadow-emerald-500/30 animate-pop-in">
                        {cartQty} in Cart
                      </span>
                    )}
                  </div>

                  <div className="relative aspect-square w-full bg-slate-100/50 dark:bg-slate-800/50 flex items-center justify-center overflow-hidden">
                    {prod.image ? (
                      <img
                        src={prod.image}
                        alt={prod.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-4xl transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6">☕</span>
                    )}
                    <div className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>

                  <div className="p-3.5 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md flex-1 flex flex-col justify-between">
                    <div>
                      <span className="text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400 block uppercase tracking-wider mb-1">
                        {categories.find(c => c.id === prod.category)?.name || 'General'}
                      </span>
                      <h3 className="font-sans font-semibold text-slate-800 dark:text-slate-100 text-sm tracking-tight line-clamp-2 h-10 leading-snug">
                        {prod.name}
                      </h3>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                      <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                        {settings.currency}{prod.price.toFixed(2)}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                        SKU: {prod.sku.split('-').pop()}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
