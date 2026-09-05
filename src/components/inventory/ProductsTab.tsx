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
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 flex flex-col overflow-hidden"
    >
      {/* Filter Bar */}
      <div
        id="inventory-filters"
        className="surface p-4 rounded-2xl shadow-lg mb-6 shrink-0 flex flex-wrap gap-4 items-center"
      >
        {/* Search */}
        <div className="flex-1 min-w-50 flex items-center space-x-2 bg-white/80 dark:bg-slate-900/50 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 focus-within:border-emerald-500/50 transition-colors">
          <Search size={18} className="text-slate-500 dark:text-slate-400" />
          <input
            id="inventory-search-input"
            type="text"
            aria-label={t('inventory.searchProducts')}
            placeholder={t('inventory.searchProducts')}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="flex-1 bg-transparent border-none text-slate-700 dark:text-slate-200 text-sm focus:outline-none placeholder:text-slate-500 glass-input"
          />
        </div>

        {/* Select Category */}
        <div className="flex items-center gap-3">
          <label
            htmlFor="filter-category-select"
            className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono"
          >
            {t('inventory.category')}
          </label>
          <select
            id="filter-category-select"
            value={selectedCategory}
            onChange={(e) => onSelectedCategoryChange(e.target.value)}
            className="bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-semibold px-4 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
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
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
            {t('inventory.stockLevel')}
          </span>
          <div className="flex bg-white/80 dark:bg-slate-900/50 p-1 rounded-xl border border-slate-200 dark:border-white/10">
            <button
              onClick={() => onStockFilterChange('all')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                stockFilter === 'all'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {t('inventory.all')}
            </button>
            <button
              onClick={() => onStockFilterChange('low')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                stockFilter === 'low'
                  ? 'bg-amber-500/20 text-amber-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {t('inventory.low')}
            </button>
            <button
              onClick={() => onStockFilterChange('out')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                stockFilter === 'out'
                  ? 'bg-rose-500/20 text-rose-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
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
        className="flex-1 surface rounded-2xl shadow-lg overflow-hidden flex flex-col"
      >
        <div className="flex-1 overflow-auto">
          <table
            id="inventory-table"
            className="w-full min-w-[880px] text-start border-collapse table-fixed"
          >
            <thead>
              <tr className="bg-white/90 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider font-mono border-b border-slate-200 dark:border-white/5 sticky top-0 z-10 backdrop-blur-md">
                <th className="py-4 px-6 w-1/4">{t('inventory.productDetails')}</th>
                <th
                  className="py-4 px-4 w-1/8"
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
                    className="flex items-center gap-2 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    {t('inventory.sku')} <ArrowUpDown size={12} />
                  </button>
                </th>
                <th className="py-4 px-4 w-1/6">{t('inventory.category').replace(':', '')}</th>
                <th
                  className="py-4 px-4 w-1/8 text-end"
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
                    className="flex items-center gap-2 hover:text-slate-900 dark:hover:text-white transition-colors justify-end w-full"
                  >
                    {t('inventory.price')} <ArrowUpDown size={12} />
                  </button>
                </th>
                <th className="py-4 px-4 w-1/8 text-end">{t('inventory.cost')}</th>
                <th className="py-4 px-4 w-1/8 text-end">{t('inventory.margin')}</th>
                <th
                  className="py-4 px-6 w-1/6 text-center"
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
                    className="flex items-center gap-2 hover:text-slate-900 dark:hover:text-white transition-colors justify-center w-full"
                  >
                    {t('inventory.stock')} <ArrowUpDown size={12} />
                  </button>
                </th>
                <th className="py-4 px-4 w-25 text-center">{t('inventory.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm text-slate-700 dark:text-slate-200">
              {sortedAndFilteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="py-20 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 gap-3">
                      <Layers size={48} className="opacity-20" />
                      <p className="font-medium font-mono">{t('inventory.noProductsRegistered')}</p>
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
                      className={`hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors group ${isOut ? 'bg-rose-500/5' : isLow ? 'bg-amber-500/5' : ''}`}
                    >
                      <td className="py-4 px-6 flex items-center gap-4 truncate">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 overflow-hidden shrink-0 flex items-center justify-center text-xl">
                          {safeImageUrl(prod.image) ? (
                            <img
                              src={safeImageUrl(prod.image)}
                              alt={prod.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <ImageIcon className="text-slate-500" size={20} />
                          )}
                        </div>
                        <div className="truncate">
                          <span className="font-bold block truncate text-slate-800 dark:text-slate-100">
                            {prod.name}
                          </span>
                          <span className="text-xs font-mono font-medium text-slate-500 block mt-0.5">
                            {t('inventory.thresholdAlert')}: {prod.minStock}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-mono text-xs truncate text-slate-500 dark:text-slate-400">
                        {prod.sku}
                      </td>
                      <td className="py-4 px-4">
                        <span className={getProductCategoryColor(prod.category)}>
                          {getProductCategoryName(prod.category)}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-mono font-bold text-slate-900 dark:text-white text-end">
                        {settings.currency}
                        {prod.price.toFixed(2)}
                      </td>
                      <td className="py-4 px-4 font-mono text-slate-500 dark:text-slate-400 text-end">
                        {settings.currency}
                        {prod.cost.toFixed(2)}
                      </td>
                      <td className="py-4 px-4 text-end font-mono font-medium">
                        <span
                          className={
                            margin >= 50 ? 'text-emerald-400' : 'text-slate-500 dark:text-slate-400'
                          }
                        >
                          {margin.toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <div
                            className={`px-3 py-1 rounded-lg font-mono font-bold text-sm flex items-center gap-2 ${
                              isOut
                                ? 'bg-rose-500/20 text-rose-400'
                                : isLow
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-emerald-500/20 text-emerald-400'
                            }`}
                          >
                            {isOut || isLow ? <AlertTriangle size={14} /> : null}
                            {prod.stock}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                          <button
                            onClick={() => onEditProduct(prod)}
                            aria-label={t('inventory.editCatalogProduct')}
                            className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
                          >
                            <Edit2 size={16} />
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
                            className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-rose-500/10 hover:bg-rose-500 rounded-xl transition-colors"
                          >
                            <Trash2 size={16} />
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
        <div className="px-6 py-4 border-t border-slate-200 dark:border-white/5 bg-white/80 dark:bg-slate-900/50 text-xs text-slate-500 dark:text-slate-400 font-mono flex justify-between items-center">
          <span>
            {t('inventory.activeSkus')}:{' '}
            <strong className="text-slate-900 dark:text-white ms-1">{products.length}</strong>
          </span>
          <span className="flex items-center gap-6">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              {t('inventory.lowStock')}:{' '}
              <strong className="text-amber-400 ms-1">
                {products.filter((p) => p.stock <= p.minStock && p.stock > 0).length}
              </strong>
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              {t('inventory.outOfStock')}:{' '}
              <strong className="text-rose-400 ms-1">
                {products.filter((p) => p.stock <= 0).length}
              </strong>
            </span>
          </span>
        </div>
      </div>
    </motion.div>
  );
}
