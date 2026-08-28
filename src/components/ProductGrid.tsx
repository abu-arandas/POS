import React, { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { Search, X, LayoutGrid, GripHorizontal, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, StoreSettings } from '../types';
import { useProductStore } from '../stores/productStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { safeImageUrl } from '../lib/imageUrl';
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
  categoryName: string;
  settings: StoreSettings;
  index: number;
}

const SortableProductCard = memo(function SortableProductCard({
  prod,
  isEditMode,
  addToCart,
  cartQty,
  categoryName,
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
  const isOutOfStock = prod.stock <= 0;
  // Every unit is already in the cart, so addToCart would no-op. Treat it like
  // out-of-stock for interaction purposes (no dead taps, correct a11y state)
  // while keeping the out-of-stock badge/greyscale styling to itself.
  const isLimitReached = cartQty >= prod.stock;
  const isUnavailable = isOutOfStock || isLimitReached;
  const [imgError, setImgError] = useState(false);
  const imageUrl = safeImageUrl(prod.image);
  const { t } = useTranslation();

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
      onClick={() => {
        if (!isEditMode && !isUnavailable) addToCart(prod);
      }}
      whileHover={!isEditMode && !isUnavailable ? { y: -4, scale: 1.02 } : {}}
      whileTap={!isEditMode && !isUnavailable ? { scale: 0.96 } : {}}
      className={`product-card relative rounded-2xl overflow-hidden flex flex-col transition-all duration-200 select-none group ${
        isDragging ? 'is-dragging' : ''
      } ${
        isEditMode
          ? 'cursor-grab active:cursor-grabbing'
          : isUnavailable
            ? 'cursor-not-allowed opacity-50 grayscale'
            : 'cursor-pointer'
      }`}
      // dnd-kit rewrites transform (and transition) on every animation frame
      // while a card is being dragged. That is a per-frame value from the
      // library, not styling this project owns, so it is the one thing here
      // that legitimately stays on the element. Everything the app decides —
      // the lifted z-index and the ghosting — is in .product-card.is-dragging.
      style={{
        transform: style?.transform,
        transition: isEditMode ? style?.transition : undefined,
      }}
      {...(isEditMode ? attributes : {})}
      {...(isEditMode ? listeners : {})}
      {...(!isEditMode
        ? {
            // dnd-kit supplies role/tabIndex/keyboard handling in edit mode;
            // outside it the card must be a keyboard-operable button itself.
            role: 'button' as const,
            // Tab order tracks stock only. Keying it to isUnavailable would pull
            // the card out from under a keyboard user the moment their last add
            // hit the limit, dropping focus mid-interaction; aria-disabled
            // communicates the state without moving the focus target.
            tabIndex: isOutOfStock ? -1 : 0,
            'aria-disabled': isUnavailable || undefined,
            'aria-label': `${prod.name}, ${settings.currency}${prod.price.toFixed(2)}${
              isOutOfStock ? ` — ${t('register.outOfStock')}` : ''
            }`,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!isUnavailable) addToCart(prod);
              }
            },
          }
        : {})}
    >
      {/* Status overlays */}
      <div className="absolute top-2 inset-s-2 z-20 flex flex-col gap-1.5">
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
            <Check size={9} className="stroke-3" />
            {cartQty}
          </motion.span>
        )}
      </div>

      {/* Edit mode drag handle */}
      {isEditMode && (
        <div className="absolute top-2 inset-e-2 z-20 bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm text-slate-500 dark:text-slate-400 p-1.5 rounded-lg">
          <GripHorizontal size={13} />
        </div>
      )}

      {/* Product image */}
      <div className="relative aspect-4/3 w-full overflow-hidden bg-slate-100 dark:bg-slate-800/50 pointer-events-none">
        {imageUrl && !imgError ? (
          <img
            src={imageUrl}
            alt={prod.name}
            className={`w-full h-full object-cover transition-transform duration-500 ${isUnavailable ? '' : 'group-hover:scale-110'}`}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-linear-to-br from-slate-800/40 to-slate-900/40">
            <span
              className={`text-4xl transition-transform duration-400 opacity-70 ${isUnavailable ? '' : 'group-hover:scale-110 group-hover:rotate-6'}`}
            >
              {getCategoryEmoji(categoryName)}
            </span>
          </div>
        )}
        {/* Bottom gradient overlay */}
        <div
          className={`absolute inset-0 bg-linear-to-t from-black/50 via-transparent to-transparent transition-opacity duration-300 ${isUnavailable ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}
        />
      </div>

      {/* Info */}
      <div className="px-3 pt-2.5 pb-3 flex-1 flex flex-col justify-between pointer-events-none">
        <div>
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-emerald-400 block mb-1">
            {t(`categories.${categoryName.toLowerCase()}`, { defaultValue: categoryName })}
          </span>
          <h3 className="font-sans font-semibold text-slate-800 dark:text-slate-100 text-[13px] tracking-tight line-clamp-2 leading-snug min-h-[2.4em]">
            {prod.name}
          </h3>
        </div>
        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800/60">
          <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
            {settings.currency}
            {prod.price.toFixed(2)}
          </span>
          <span className="text-[9px] font-mono text-slate-600 uppercase tracking-wider">
            {prod.sku.split('-').slice(-1)[0]}
          </span>
        </div>
      </div>
    </motion.div>
  );
});

const ProductGrid = ({
  selectedCategory,
  setSelectedCategory,
  cart,
  addToCart,
}: ProductGridProps) => {
  const products = useProductStore((s) => s.products);
  const categories = useProductStore((s) => s.categories);
  const reorderProducts = useProductStore((s) => s.reorderProducts);
  const settings = useSettingsStore((s) => s.settings);
  const currentUser = useAuthStore((s) => s.currentUser);
  const isAdmin = currentUser?.role === 'admin';
  const { t } = useTranslation();

  const cartQuantityMap = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach((item) => map.set(item.product.id, item.quantity));
    return map;
  }, [cart]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

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
      const matchesSearch =
        q === '' || prod.name.toLowerCase().includes(q) || prod.sku.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, search]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        reorderProducts(active.id as string, over.id as string);
      }
    },
    [reorderProducts],
  );

  const sortableIds = useMemo(() => filteredProducts.map((p) => p.id), [filteredProducts]);

  return (
    <div id="catalog-section" className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Controls bar */}
      <div id="catalog-controls" className="shrink-0 px-4 pt-4 pb-3">
        <div className="field-shell flex items-center gap-3 p-3 rounded-2xl">
          {/* Search */}
          <div className="relative shrink-0">
            <Search
              size={13}
              className="absolute inset-s-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
            />
            <input
              id="register-search-input"
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('register.searchProducts')}
              placeholder={`${t('register.searchProducts')} (Ctrl+K)`}
              className="input-shell w-36 sm:w-48 ps-8 pe-7 py-1.5 rounded-xl text-xs transition-all"
            />
            <AnimatePresence>
              {search && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => setSearch('')}
                  aria-label={t('register.clearSearch')}
                  className="absolute inset-e-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
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
            {/* Built as an object array rather than mapping ids and calling
                .find() per pill, which was an O(N²) lookup inside the render
                loop. */}
            {[{ id: 'all', name: null }, ...categories].map((cat) => {
              const catId = cat.id;
              const label =
                catId === 'all'
                  ? t('register.allProducts')
                  : t(`categories.${cat.name?.toLowerCase() ?? ''}`, {
                      defaultValue: cat.name ?? '',
                    });
              const isActive = selectedCategory === catId;
              return (
                <button
                  key={catId}
                  onClick={() => setSelectedCategory(catId)}
                  aria-pressed={isActive}
                  className={`toggle-pill px-3.5 py-1.5 rounded-xl text-[11px] font-semibold shrink-0 duration-200 ${
                    isActive ? 'is-selected' : ''
                  }`}
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
              aria-pressed={isEditMode}
              aria-label={isEditMode ? t('register.doneEditing') : t('register.editLayout')}
              className={`toggle-pill flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold shrink-0 ${
                isEditMode ? 'is-danger' : ''
              }`}
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
              <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold">
                {t('register.noProducts')}
              </p>
              <p className="text-slate-600 text-xs mt-1">{t('register.tryDifferentSearch')}</p>
            </motion.div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
                <div
                  id="products-grid"
                  className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
                >
                  {filteredProducts.map((prod, index) => {
                    return (
                      <SortableProductCard
                        key={prod.id}
                        prod={prod}
                        isEditMode={isEditMode}
                        addToCart={addToCart}
                        cartQty={cartQuantityMap.get(prod.id) ?? 0}
                        categoryName={categoryMap.get(prod.category) ?? ''}
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
};

export default memo(ProductGrid);
