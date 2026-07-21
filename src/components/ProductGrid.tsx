import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, LayoutGrid, GripHorizontal, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Category, StoreSettings } from '../types';
import { useProductStore } from '../stores/productStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';

interface ProductGridProps {
  selectedCategory: string;
  setSelectedCategory: (c: string) => void;
  cart: Array<{ product: Product; quantity: number }>;
  addToCart: (product: Product) => void;
}

interface SortableProductCardProps {
  prod: Product;
  isEditMode: boolean;
  addToCart: (product: Product) => void;
  cartQty: number;
  categories: Category[];
  settings: StoreSettings;
  index: number;
}

function SortableProductCard({
  prod,
  isEditMode,
  addToCart,
  cartQty,
  categories,
  settings,
  index,
}: SortableProductCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: prod.id,
    disabled: !isEditMode,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isEditMode ? transition : undefined,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.4 : 1,
  };

  const isLowStock = prod.stock <= prod.minStock && prod.stock > 0;
  const isOutOfStock = prod.stock === 0;
  const isLimitReached = cartQty >= prod.stock;
  const [imgError, setImgError] = useState(false);
  const { t } = useTranslation();

  const categoryName = categories.find((c) => c.id === prod.category)?.name || '';

  const getCategoryEmoji = (catName: string) => {
    const n = catName.toLowerCase();
    if (n.includes('coffee') || n.includes('drink') || n.includes('beverage')) return '☕';
    if (n.includes('bak') || n.includes('bread') || n.includes('cake')) return '🥐';
    if (n.includes('sandwich') || n.includes('food') || n.includes('burger')) return '🥪';
    if (n.includes('snack') || n.includes('chip')) return '🍿';
    if (n.includes('tech') || n.includes('electronic')) return '📱';
    if (n.includes('apparel') || n.includes('shirt')) return '👕';
    return '📦';
  };

  return (
    <motion.div
      ref={setNodeRef}
      layoutId={isEditMode ? undefined : `prod-card-${prod.id}`}
      initial={!isEditMode ? { opacity: 0, y: 18, scale: 0.96 } : false}
      animate={!isEditMode ? { opacity: 1, y: 0, scale: 1 } : false}
      transition={!isEditMode ? { duration: 0.28, delay: index * 0.04 } : {}}
      onClick={() => { if (!isEditMode && !isOutOfStock) addToCart(prod); }}
      whileHover={!isEditMode && !isOutOfStock ? { y: -4, scale: 1.02 } : {}}
      whileTap={!isEditMode && !isOutOfStock ? { scale: 0.96 } : {}}
      className={`relative rounded-2xl overflow-hidden flex flex-col transition-all duration-200 select-none group ${
        isEditMode
          ? 'cursor-grab active:cursor-grabbing'
          : isOutOfStock
          ? 'cursor-not-allowed opacity-50 grayscale'
          : 'cursor-pointer'
      }`}
      style={{
        transform: style?.transform,
        transition: isEditMode ? style?.transition : undefined,
        zIndex: isDragging ? 50 : 1,
        opacity: isDragging ? 0.4 : 1,
        background: 'rgba(255,255,255,0.04)',
        border: isLimitReached && !isEditMode
          ? '1.5px solid rgba(16,185,129,0.5)'
          : isOutOfStock
          ? '1.5px solid rgba(255,255,255,0.04)'
          : '1.5px solid rgba(255,255,255,0.07)',
        boxShadow: isLimitReached && !isEditMode
          ? '0 0 18px rgba(16,185,129,0.15)'
          : '0 2px 12px rgba(0,0,0,0.25)',
      }}
      {...(isEditMode ? attributes : {})}
      {...(isEditMode ? listeners : {})}
    >
      {/* Status overlays */}
      <div className="absolute top-2 start-2 z-20 flex flex-col gap-1.5">
        {isOutOfStock && (
          <span className="bg-rose-500/90 backdrop-blur-sm text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
            {t('register.outOfStock')}
          </span>
        )}
        {!isOutOfStock && isLowStock && (
          <span className="bg-amber-500 text-slate-950 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">
            {t('register.onlyLeft', { count: prod.stock })}
          </span>
        )}
        {cartQty > 0 && !isEditMode && (
          <motion.span
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            className="flex items-center gap-1 bg-emerald-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-lg shadow-emerald-500/30"
          >
            <Check size={9} className="stroke-[3]" />
            {cartQty}
          </motion.span>
        )}
      </div>

      {/* Edit mode drag handle */}
      {isEditMode && (
        <div className="absolute top-2 end-2 z-20 bg-slate-900/70 backdrop-blur-sm text-slate-400 p-1.5 rounded-lg">
          <GripHorizontal size={13} />
        </div>
      )}

      {/* Product image */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-800/50 pointer-events-none">
        {prod.image && !imgError ? (
          <img
            src={prod.image}
            alt={prod.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))' }}>
            <span className="text-4xl transition-transform duration-400 group-hover:scale-110 group-hover:rotate-6 opacity-70">
              {getCategoryEmoji(categoryName)}
            </span>
          </div>
        )}
        {/* Bottom gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* Info */}
      <div className="px-3 pt-2.5 pb-3 flex-1 flex flex-col justify-between pointer-events-none">
        <div>
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-emerald-400 block mb-1">
            {t(`categories.${categoryName.toLowerCase()}`, { defaultValue: categoryName })}
          </span>
          <h3 className="font-sans font-semibold text-slate-100 text-[13px] tracking-tight line-clamp-2 leading-snug"
            style={{ minHeight: '2.4em' }}>
            {prod.name}
          </h3>
        </div>
        <div className="flex items-center justify-between mt-2.5 pt-2"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="font-mono font-bold text-white text-sm">
            {settings.currency}{prod.price.toFixed(2)}
          </span>
          <span className="text-[9px] font-mono text-slate-600 uppercase tracking-wider">
            {prod.sku.split('-').slice(-1)[0]}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export default function ProductGrid({
  selectedCategory,
  setSelectedCategory,
  cart,
  addToCart,
}: ProductGridProps) {
  const { products, categories, reorderProducts } = useProductStore();
  const { settings } = useSettingsStore();
  const { currentUser } = useAuthStore();
  const isAdmin = currentUser?.role === 'admin';
  const { t } = useTranslation();

  const [isEditMode, setIsEditMode] = useState(false);
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((prod) => {
      const matchesCategory = selectedCategory === 'all' || prod.category === selectedCategory;
      const matchesSearch = q === '' || prod.name.toLowerCase().includes(q) || prod.sku.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, search]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderProducts(active.id as string, over.id as string);
    }
  };

  return (
    <div id="catalog-section" className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Controls bar */}
      <div
        id="catalog-controls"
        className="shrink-0 px-4 pt-4 pb-3"
      >
        <div
          className="flex items-center gap-3 p-3 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Search */}
          <div className="relative shrink-0">
            <Search
              size={13}
              className="absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
            />
            <input
              id="register-search-input"
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`${t('register.searchProducts')} (Ctrl+K)`}
              className="w-36 sm:w-48 ps-8 pe-7 py-1.5 rounded-xl text-xs transition-all"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0',
                outline: 'none',
              }}
              onFocus={(e) => {
                (e.target as HTMLInputElement).style.borderColor = '#10b981';
                (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(16,185,129,0.12)';
              }}
              onBlur={(e) => {
                (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.08)';
                (e.target as HTMLInputElement).style.boxShadow = 'none';
              }}
            />
            <AnimatePresence>
              {search && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => setSearch('')}
                  aria-label={t('register.clearSearch')}
                  className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <X size={12} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Category pills */}
          <div
            id="category-pills"
            className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-1"
          >
            {['all', ...categories.map((c) => c.id)].map((catId) => {
              const cat = categories.find((c) => c.id === catId);
              const label = catId === 'all'
                ? t('register.allProducts')
                : t(`categories.${cat?.name.toLowerCase() ?? ''}`, { defaultValue: cat?.name ?? '' });
              const isActive = selectedCategory === catId;
              return (
                <button
                  key={catId}
                  onClick={() => setSelectedCategory(catId)}
                  className="px-3.5 py-1.5 rounded-xl text-[11px] font-semibold shrink-0 transition-all duration-200 focus-visible:outline-none"
                  style={{
                    background: isActive
                      ? 'linear-gradient(135deg, #059669, #10b981)'
                      : 'rgba(255,255,255,0.05)',
                    border: isActive
                      ? '1px solid rgba(16,185,129,0.4)'
                      : '1px solid rgba(255,255,255,0.07)',
                    color: isActive ? '#fff' : '#64748b',
                    boxShadow: isActive ? '0 4px 14px rgba(16,185,129,0.25)' : 'none',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Edit layout toggle */}
          {isAdmin && (
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold shrink-0 transition-all focus-visible:outline-none"
              style={{
                background: isEditMode ? 'rgba(244,63,94,0.12)' : 'rgba(255,255,255,0.06)',
                border: isEditMode ? '1px solid rgba(244,63,94,0.3)' : '1px solid rgba(255,255,255,0.08)',
                color: isEditMode ? '#fb7185' : '#64748b',
              }}
            >
              <LayoutGrid size={13} />
              <span className="hidden sm:inline">
                {isEditMode ? t('register.doneEditing') : t('register.editLayout')}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Products Grid */}
      <div id="products-grid-container" className="flex-1 overflow-y-auto px-4 pb-4">
        <AnimatePresence mode="wait">
          {filteredProducts.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-64 flex flex-col items-center justify-center text-center"
            >
              <span className="text-5xl mb-4 animate-float-slow">🔍</span>
              <p className="text-slate-400 text-sm font-semibold">{t('register.noProducts')}</p>
              <p className="text-slate-600 text-xs mt-1">Try a different category or search term</p>
            </motion.div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={filteredProducts.map((p) => p.id)}
                strategy={rectSortingStrategy}
              >
                <div
                  id="products-grid"
                  className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
                >
                  {filteredProducts.map((prod, index) => {
                    const cartQty = cart.find((item) => item.product.id === prod.id)?.quantity || 0;
                    return (
                      <SortableProductCard
                        key={prod.id}
                        prod={prod}
                        isEditMode={isEditMode}
                        addToCart={addToCart}
                        cartQty={cartQty}
                        categories={categories}
                        settings={settings}
                        index={index}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
