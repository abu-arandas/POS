import {
  AlertTriangle,
  ArrowUpDown,
  Edit2,
  Image as ImageIcon,
  Layers,
  Search,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { TFunction } from 'i18next';
import type { Category, Product, StoreSettings } from '../../types';
import { askConfirmation } from '../../lib/utils/ui';
import { safeImageUrl } from '../../lib/imageUrl';
import { useSettingsStore } from '../../stores/settingsStore';

type ProductSortField = 'name' | 'stock' | 'price' | 'sku';
type StockFilter = 'all' | 'low' | 'out';

export interface InventoryProductsTabProps {
  t: TFunction;
  products: Product[];
  categories: Category[];
  settings: StoreSettings;
  searchQuery: string;
  onSearchQueryChange(value: string): void;
  selectedCategory: string;
  onSelectedCategoryChange(value: string): void;
  stockFilter: StockFilter;
  onStockFilterChange(value: StockFilter): void;
  sortBy: ProductSortField;
  sortOrder: 'asc' | 'desc';
  sortedAndFilteredProducts: Product[];
  onToggleSort(field: ProductSortField): void;
  getProductCategoryName(catId: string): string;
  getProductCategoryColor(catId: string): string;
  onEditProduct(product: Product): void;
  onDeleteProduct(id: string): void;
}

/**
 * Inventory's products tab: the searchable, filterable catalog table with
 * its stock summary.
 */
export function InventoryProductsTab({
  t,
  products,
  categories,
  settings,
  searchQuery,
  onSearchQueryChange,
  selectedCategory,
  onSelectedCategoryChange,
  stockFilter,
  onStockFilterChange,
  sortBy,
  sortOrder,
  sortedAndFilteredProducts,
  onToggleSort,
  getProductCategoryName,
  getProductCategoryColor,
  onEditProduct,
  onDeleteProduct,
}: InventoryProductsTabProps) {
  const showProductImages = useSettingsStore((s) => s.showProductImages);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 flex flex-col overflow-hidden"
    >
      {/* Filter Bar */}
      <div
        id="inventory-filters"
        className="p-3 rounded-xl border border-border bg-card mb-4 shrink-0 flex flex-wrap gap-3 items-center"
      >
        {/* Search */}
        <div className="flex-1 min-w-48 relative flex items-center">
          <Search size={14} className="absolute inset-s-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            id="inventory-search-input"
            type="text"
            aria-label={t('inventory.searchProducts')}
            placeholder={t('inventory.searchProducts')}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="input-shell w-full ps-8 pe-3 py-1.5 rounded-lg text-xs"
          />
        </div>

        {/* Select Category */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="filter-category-select"
            className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider font-mono"
          >
            {t('inventory.category')}
          </label>
          <select
            id="filter-category-select"
            value={selectedCategory}
            onChange={(e) => onSelectedCategoryChange(e.target.value)}
            className="input-shell rounded-lg text-xs font-medium px-3 py-1.5 cursor-pointer"
          >
            <option value="all">{t('inventory.allCategories')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Stock status filter */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider font-mono">
            {t('inventory.stockLevel')}
          </span>
          <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border">
            <button
              onClick={() => onStockFilterChange('all')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                stockFilter === 'all'
                  ? 'bg-card text-foreground font-semibold shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('inventory.all')}
            </button>
            <button
              onClick={() => onStockFilterChange('low')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                stockFilter === 'low'
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('inventory.low')}
            </button>
            <button
              onClick={() => onStockFilterChange('out')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                stockFilter === 'out'
                  ? 'bg-destructive/15 text-destructive font-semibold shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('inventory.out')}
            </button>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div
        id="inventory-table-container"
        className="flex-1 bg-card rounded-xl border border-border shadow-2xs overflow-hidden flex flex-col"
      >
        <div className="flex-1 overflow-y-auto">
          <table id="inventory-table" className="w-full text-start border-collapse table-fixed">
            <thead>
              <tr className="bg-muted/70 text-muted-foreground text-[11px] font-medium uppercase tracking-wider font-mono border-b border-border sticky top-0 z-10 backdrop-blur-xs">
                <th className="py-3 px-4 w-1/4">{t('inventory.productDetails')}</th>
                <th
                  className="p-3 w-1/8"
                  aria-sort={
                    sortBy === 'sku'
                      ? sortOrder === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  <button
                    onClick={() => onToggleSort('sku')}
                    className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                  >
                    {t('inventory.sku')} <ArrowUpDown size={11} />
                  </button>
                </th>
                <th className="p-3 w-1/6">{t('inventory.category').replace(':', '')}</th>
                <th
                  className="p-3 w-1/8 text-end"
                  aria-sort={
                    sortBy === 'price'
                      ? sortOrder === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  <button
                    onClick={() => onToggleSort('price')}
                    className="flex items-center gap-1.5 hover:text-foreground transition-colors justify-end w-full"
                  >
                    {t('inventory.price')} <ArrowUpDown size={11} />
                  </button>
                </th>
                <th className="p-3 w-1/8 text-end">{t('inventory.cost')}</th>
                <th className="p-3 w-1/8 text-end">{t('inventory.margin')}</th>
                <th
                  className="py-3 px-4 w-1/6 text-center"
                  aria-sort={
                    sortBy === 'stock'
                      ? sortOrder === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  <button
                    onClick={() => onToggleSort('stock')}
                    className="flex items-center gap-1.5 hover:text-foreground transition-colors justify-center w-full"
                  >
                    {t('inventory.stock')} <ArrowUpDown size={11} />
                  </button>
                </th>
                <th className="p-3 w-20 text-center">{t('inventory.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs text-foreground">
              {sortedAndFilteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="py-16 flex flex-col items-center justify-center text-muted-foreground gap-2">
                      <Layers size={36} className="opacity-25" />
                      <p className="font-mono text-xs">{t('inventory.noProductsRegistered')}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedAndFilteredProducts.map((prod) => {
                  const isLow = prod.stock <= prod.minStock && prod.stock > 0;
                  const isOut = prod.stock <= 0;
                  const margin = prod.price > 0 ? ((prod.price - prod.cost) / prod.price) * 100 : 0;

                  return (
                    <tr
                      key={prod.id}
                      id={`inventory-row-${prod.id}`}
                      className={`hover:bg-muted/40 transition-colors group ${isOut ? 'bg-destructive/5' : isLow ? 'bg-amber-500/5' : ''}`}
                    >
                      <td className="py-2.5 px-4 flex items-center gap-3 truncate">
                        {showProductImages && (
                          <div className="size-8 rounded-lg bg-muted border border-border/50 overflow-hidden shrink-0 flex items-center justify-center">
                            {safeImageUrl(prod.image) ? (
                              <img
                                src={safeImageUrl(prod.image)}
                                alt={prod.name}
                                className="size-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <ImageIcon className="text-muted-foreground" size={16} />
                            )}
                          </div>
                        )}
                        <div className="truncate">
                          <span className="font-medium block truncate text-foreground text-xs">
                            {prod.name}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground block mt-0.5">
                            {t('inventory.thresholdAlert')}: {prod.minStock}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 font-mono text-xs truncate text-muted-foreground">
                        {prod.sku}
                      </td>
                      <td className="p-3">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded border border-border bg-muted/60 text-foreground">
                          {getProductCategoryName(prod.category)}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-semibold text-foreground text-end num">
                        {settings.currency}
                        {prod.price.toFixed(2)}
                      </td>
                      <td className="p-3 font-mono text-muted-foreground text-end num">
                        {settings.currency}
                        {prod.cost.toFixed(2)}
                      </td>
                      <td className="p-3 text-end font-mono font-medium">
                        <span
                          className={
                            margin >= 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                          }
                        >
                          {margin.toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <div
                            className={`px-2 py-0.5 rounded-full font-mono text-xs inline-flex items-center gap-1 border ${
                              isOut
                                ? 'bg-destructive/10 text-destructive border-destructive/20'
                                : isLow
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                  : 'bg-muted text-foreground border-border'
                            }`}
                          >
                            {isOut || isLow ? <AlertTriangle size={11} /> : null}
                            {prod.stock}
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                          <button
                            onClick={() => onEditProduct(prod)}
                            aria-label={t('inventory.editCatalogProduct')}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            id={`del-prod-${prod.id}`}
                            onClick={async () => {
                              if (
                                await askConfirmation(
                                  t('inventory.deleteConfirm', { name: prod.name }),
                                )
                              )
                                onDeleteProduct(prod.id);
                            }}
                            aria-label={t('inventory.deleteProduct')}
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded-lg transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {/* Table Footer Stats */}
        <div className="px-4 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground font-mono flex justify-between items-center">
          <span>
            {t('inventory.activeSkus')}:{' '}
            <strong className="text-foreground ms-1">{products.length}</strong>
          </span>
          <span className="flex items-center gap-5">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-amber-500"></span>
              {t('inventory.lowStock')}:{' '}
              <strong className="text-foreground ms-1">
                {products.filter((p) => p.stock <= p.minStock && p.stock > 0).length}
              </strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-destructive"></span>
              {t('inventory.outOfStock')}:{' '}
              <strong className="text-foreground ms-1">
                {products.filter((p) => p.stock <= 0).length}
              </strong>
            </span>
          </span>
        </div>
      </div>
    </motion.div>
  );
}
