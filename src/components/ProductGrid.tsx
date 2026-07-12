import React, { useState, useMemo } from 'react';
import { Search, X, LayoutGrid, GripHorizontal } from 'lucide-react';
import { motion } from 'motion/react';
import { Product } from '../types';
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

interface ProductGridProps {
  selectedCategory: string;
  setSelectedCategory: (c: string) => void;
  cart: Array<{ product: Product; quantity: number }>;
  addToCart: (product: Product) => void;
}

function SortableProductCard({ 
  prod, 
  isEditMode, 
  addToCart, 
  cartQty, 
  categories, 
  settings 
}: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: prod.id, disabled: !isEditMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const isLowStock = prod.stock <= prod.minStock && prod.stock > 0;
  const isOutOfStock = prod.stock === 0;
  const isLimitReached = cartQty >= prod.stock;

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layoutId={isEditMode ? undefined : `prod-card-${prod.id}`}
      onClick={() => {
        if (!isEditMode && !isOutOfStock) {
          addToCart(prod);
        }
      }}
      whileHover={!isEditMode ? { scale: isOutOfStock ? 1 : 1.03, y: isOutOfStock ? 0 : -4 } : {}}
      whileTap={!isEditMode ? { scale: isOutOfStock ? 1 : 0.96 } : {}}
      className={`relative glass dark:glass-dark rounded-2xl transition-all duration-200 overflow-hidden flex flex-col justify-between group ${
        isEditMode ? 'cursor-grab active:cursor-grabbing border-slate-300 dark:border-slate-600 hover:ring-2 ring-slate-400/50' : 'cursor-pointer'
      } ${
        isOutOfStock && !isEditMode
          ? 'border-slate-200/50 dark:border-slate-700/50 opacity-50 cursor-not-allowed grayscale'
          : isLimitReached && !isEditMode
          ? 'border-emerald-500 ring-2 ring-emerald-500/20'
          : !isEditMode ? 'border-slate-200/50 dark:border-slate-700/50 hover:shadow-xl hover:shadow-emerald-500/10' : ''
      }`}
      {...attributes}
      {...listeners}
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
        {cartQty > 0 && !isEditMode && (
          <span className="bg-emerald-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-md shadow-emerald-500/30 animate-pop-in">
            {cartQty} in Cart
          </span>
        )}
      </div>

      {isEditMode && (
        <div className="absolute top-2 right-2 z-20 bg-slate-900/50 text-white p-1 rounded-lg backdrop-blur-md">
          <GripHorizontal size={14} />
        </div>
      )}

      <div className="relative aspect-square w-full bg-slate-100/50 dark:bg-slate-800/50 flex items-center justify-center overflow-hidden pointer-events-none">
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

      <div className="p-3.5 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md flex-1 flex flex-col justify-between pointer-events-none">
        <div>
          <span className="text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400 block uppercase tracking-wider mb-1">
            {categories.find((c: any) => c.id === prod.category)?.name || 'General'}
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

  const [isEditMode, setIsEditMode] = useState(false);

  const filteredProducts = useMemo(() => {
    return products.filter(prod => {
      return selectedCategory === 'all' || prod.category === selectedCategory;
    });
  }, [products, selectedCategory]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderProducts(active.id as string, over.id as string);
    }
  };

  return (
    <div id="catalog-section" className="flex-1 flex flex-col min-w-0 p-6 overflow-hidden">
      
      {/* Header Category pills & Edit Toggle */}
      <div id="catalog-controls" className="glass dark:glass-dark p-4 rounded-2xl shadow-sm flex items-center justify-between mb-6 transition-all duration-300">
        
        {/* Category Tabs */}
        <div id="category-pills" className="flex items-center space-x-2 overflow-x-auto scrollbar-none flex-1">
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

        {isAdmin && (
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`ml-4 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all shadow-sm shrink-0 ${
              isEditMode 
                ? 'bg-rose-500 text-white border-rose-500 shadow-rose-500/20' 
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <LayoutGrid size={14} />
            {isEditMode ? 'Done Editing' : 'Edit Layout'}
          </button>
        )}
      </div>

      {/* Products Grid */}
      <div id="products-grid-container" className="flex-1 overflow-y-auto pr-1">
        {filteredProducts.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center animate-fade-in">
            <span className="text-4xl animate-float-slow">☕</span>
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400 font-medium">No products</p>
          </div>
        ) : (
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={filteredProducts.map(p => p.id)}
              strategy={rectSortingStrategy}
            >
              <div id="products-grid" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {filteredProducts.map((prod) => {
                  const cartQty = cart.find(item => item.product.id === prod.id)?.quantity || 0;
                  return (
                    <SortableProductCard
                      key={prod.id}
                      prod={prod}
                      isEditMode={isEditMode}
                      addToCart={addToCart}
                      cartQty={cartQty}
                      categories={categories}
                      settings={settings}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
