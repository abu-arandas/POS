import { Plus, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import type { TFunction } from 'i18next';
import type { Category, Product } from '../../types';
import { askConfirmation } from '../../lib/utils/ui';

export interface InventoryCategoriesTabProps {
  t: TFunction;
  products: Product[];
  categories: Category[];
  onAddCategory(): void;
  onDeleteCategory(id: string): void;
}

export function InventoryCategoriesTab({
  t,
  products,
  categories,
  onAddCategory,
  onDeleteCategory,
}: InventoryCategoriesTabProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      id="categories-tab-content"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 overflow-y-auto pb-6"
    >
      {/* Inline Add Category Card */}
      <button
        type="button"
        className="surface border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-lg flex flex-col justify-center items-center gap-4 cursor-pointer hover:border-emerald-500/50 transition-colors group"
        onClick={() => onAddCategory()}
      >
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
          <Plus size={24} />
        </div>
        <span className="font-bold text-slate-600 dark:text-slate-300">
          {t('inventory.addCategory')}
        </span>
      </button>

      {categories.map((cat) => {
        const productCount = products.filter((p) => p.category === cat.id).length;
        return (
          <div
            key={cat.id}
            id={`cat-card-${cat.id}`}
            className="surface rounded-2xl p-6 shadow-lg flex flex-col justify-between card-hover"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className={cat.color}>{cat.name}</span>
                <button
                  id={`del-cat-${cat.id}`}
                  disabled={productCount > 0}
                  onClick={async () => {
                    if (
                      await askConfirmation(
                        t('inventory.deleteCategoryConfirm', { name: cat.name }),
                      )
                    )
                      onDeleteCategory(cat.id);
                  }}
                  aria-label={
                    productCount > 0
                      ? t('inventory.cannotDeleteCategory')
                      : t('inventory.deleteCategory')
                  }
                  className="text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-rose-500 disabled:opacity-30 disabled:hover:text-slate-500 disabled:hover:bg-transparent p-2 rounded-xl transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <p className="text-xs text-slate-500 font-mono">ID: {cat.id}</p>
            </div>

            <div className="flex justify-between items-center pt-4 mt-4 border-t border-slate-200 dark:border-white/10">
              <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                {t('inventory.linkedProducts')}
              </span>
              <span className="font-mono text-slate-900 dark:text-white font-bold text-sm bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg">
                {productCount}
              </span>
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}
