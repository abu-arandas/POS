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

/**
 * Inventory's categories tab: every category with the number of products
 * filed under it, and the controls to add or delete one.
 */
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
        className="border border-dashed border-border rounded-xl p-5 bg-card/40 flex flex-col justify-center items-center gap-3 cursor-pointer hover:border-foreground/40 hover:bg-muted/30 transition-colors group min-h-[140px]"
        onClick={() => onAddCategory()}
      >
        <div className="size-10 rounded-xl bg-muted text-foreground flex items-center justify-center group-hover:scale-105 transition-transform">
          <Plus size={20} />
        </div>
        <span className="font-medium text-xs text-foreground">
          {t('inventory.addCategory')}
        </span>
      </button>

      {categories.map((cat) => {
        const productCount = products.filter((p) => p.category === cat.id).length;
        return (
          <div
            key={cat.id}
            id={`cat-card-${cat.id}`}
            className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between hover:border-foreground/20 transition-colors shadow-2xs min-h-[140px]"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium px-2 py-0.5 rounded-md border border-border bg-muted/60 text-foreground">
                  {cat.name}
                </span>
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
                  className="text-muted-foreground hover:text-destructive hover:bg-muted disabled:opacity-25 p-1.5 rounded-lg transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">ID: {cat.id}</p>
            </div>

            <div className="flex justify-between items-center pt-3 mt-3 border-t border-border">
              <span className="text-xs text-muted-foreground font-normal">
                {t('inventory.linkedProducts')}
              </span>
              <span className="font-mono text-foreground font-medium text-xs bg-muted px-2 py-0.5 rounded">
                {productCount}
              </span>
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}
