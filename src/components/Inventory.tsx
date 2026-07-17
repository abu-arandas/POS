import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  ArrowUpDown,
  AlertTriangle,
  FolderPlus,
  Check,
  X,
  Layers,
  Truck,
  PackagePlus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product } from '../types';

import { useProductStore } from '../stores/productStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useSupplyStore } from '../stores/supplyStore';
import { useAuthStore } from '../stores/authStore';
import { syncToCloudIfEnabled } from '../lib/sync';
import { useTranslation } from 'react-i18next';

export default function Inventory() {
  const { t } = useTranslation();
  const {
    products,
    categories,
    handleAddProduct,
    handleUpdateProduct,
    handleDeleteProduct,
    handleAddCategory,
    handleDeleteCategory,
  } = useProductStore();
  const { settings } = useSettingsStore();
  const { suppliers, adjustments, addSupplier, removeSupplier, logAdjustment } = useSupplyStore();
  const currentUser = useAuthStore((s) => s.currentUser);

  // Tab control
  const [activeTab, setActiveTab] = useState<'products' | 'categories' | 'suppliers' | 'log'>(
    'products',
  );

  // Receive-stock (lightweight purchase order) modal
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [recvProductId, setRecvProductId] = useState('');
  const [recvQty, setRecvQty] = useState('');
  const [recvSupplierId, setRecvSupplierId] = useState('');
  const [recvNote, setRecvNote] = useState('');

  // Supplier form
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supEmail, setSupEmail] = useState('');

  const handleReceiveStock = () => {
    const product = products.find((p) => p.id === recvProductId);
    const qty = parseInt(recvQty);
    if (!product || !qty || qty <= 0) return;
    const updated = { ...product, stock: product.stock + qty };
    handleUpdateProduct(updated);
    syncToCloudIfEnabled([updated]);
    const supplier = suppliers.find((s) => s.id === recvSupplierId);
    logAdjustment({
      productId: product.id,
      productName: product.name,
      delta: qty,
      newStock: updated.stock,
      reason: 'received',
      note: recvNote || null,
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? null,
      operatorName: currentUser?.name ?? null,
    });
    setReceiveOpen(false);
    setRecvProductId('');
    setRecvQty('');
    setRecvSupplierId('');
    setRecvNote('');
  };

  const handleAddSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supName.trim()) return;
    addSupplier({
      name: supName.trim(),
      contact: supContact.trim(),
      phone: supPhone.trim(),
      email: supEmail.trim(),
    });
    setSupName('');
    setSupContact('');
    setSupPhone('');
    setSupEmail('');
    setSupplierModalOpen(false);
  };

  // Products Table / List State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'price' | 'sku'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Product Add/Edit Modal State
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Category Add State
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('bg-blue-100 text-blue-800 border-blue-200');

  // Product Form Fields
  const [prodName, setProdName] = useState('');
  const [prodSku, setProdSku] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodCost, setProdCost] = useState('');
  const [prodStock, setProdStock] = useState('');
  const [prodMinStock, setProdMinStock] = useState('');
  const [prodImage, setProdImage] = useState('');

  // Colors available for categories
  const categoryColors = [
    { class: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Blue' },
    { class: 'bg-amber-100 text-amber-800 border-amber-200', label: 'Amber' },
    { class: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'Emerald' },
    { class: 'bg-purple-100 text-purple-800 border-purple-200', label: 'Purple' },
    { class: 'bg-rose-100 text-rose-800 border-rose-200', label: 'Rose' },
    { class: 'bg-indigo-100 text-indigo-800 border-indigo-200', label: 'Indigo' },
    { class: 'bg-slate-100 text-slate-800 border-slate-200', label: 'Slate' },
  ];

  // Open Add Product Dialog
  const handleOpenAddProduct = () => {
    setEditingProduct(null);
    setProdName('');
    setProdSku(`SKU-${Math.floor(100000 + Math.random() * 900000)}`);
    setProdCategory(categories[0]?.id || '');
    setProdPrice('');
    setProdCost('');
    setProdStock('');
    setProdMinStock('5');
    setProdImage('');
    setProductModalOpen(true);
  };

  // Open Edit Product Dialog
  const handleOpenEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setProdName(prod.name);
    setProdSku(prod.sku);
    setProdCategory(prod.category);
    setProdPrice(prod.price.toString());
    setProdCost(prod.cost.toString());
    setProdStock(prod.stock.toString());
    setProdMinStock(prod.minStock.toString());
    setProdImage(prod.image);
    setProductModalOpen(true);
  };

  // Submit Product Form
  const handleSubmitProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim() || !prodCategory || !prodPrice || !prodCost || !prodStock) {
      alert(t('inventory.pleaseFillRequired'));
      return;
    }

    const productPayload = {
      name: prodName,
      sku: prodSku,
      category: prodCategory,
      price: parseFloat(prodPrice),
      cost: parseFloat(prodCost),
      stock: parseInt(prodStock),
      minStock: parseInt(prodMinStock) || 0,
      image:
        prodImage ||
        'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
    };

    if (editingProduct) {
      const updated = { ...productPayload, id: editingProduct.id };
      handleUpdateProduct(updated);
      syncToCloudIfEnabled([updated]);
      // Record a manual stock correction in the audit log when it changed.
      if (updated.stock !== editingProduct.stock) {
        logAdjustment({
          productId: updated.id,
          productName: updated.name,
          delta: updated.stock - editingProduct.stock,
          newStock: updated.stock,
          reason: 'correction',
          operatorName: currentUser?.name ?? null,
        });
      }
    } else {
      const added = handleAddProduct(productPayload);
      syncToCloudIfEnabled([added]);
    }
    setProductModalOpen(false);
  };

  // Submit Category Form
  const handleSubmitCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const added = handleAddCategory(newCatName.trim(), newCatColor);
    syncToCloudIfEnabled(undefined, [added]);
    setNewCatName('');
    setCategoryModalOpen(false);
  };

  // Sort & Filter logic
  const sortedAndFilteredProducts = useMemo(() => {
    const list = products.filter((prod) => {
      const matchesSearch =
        prod.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prod.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || prod.category === selectedCategory;
      const matchesStock =
        stockFilter === 'all'
          ? true
          : stockFilter === 'low'
            ? prod.stock <= prod.minStock && prod.stock > 0
            : prod.stock === 0;

      return matchesSearch && matchesCategory && matchesStock;
    });

    list.sort((a, b) => {
      const dir = sortOrder === 'asc' ? 1 : -1;
      const valA = a[sortBy];
      const valB = b[sortBy];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.toLowerCase().localeCompare(valB.toLowerCase()) * dir;
      }
      return ((valA as number) - (valB as number)) * dir;
    });

    return list;
  }, [products, searchQuery, selectedCategory, sortBy, sortOrder, stockFilter]);

  const toggleSort = (field: 'name' | 'stock' | 'price' | 'sku') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Helpers
  const getProductCategoryName = (catId: string) => {
    return categories.find((c) => c.id === catId)?.name || 'General';
  };

  const getProductCategoryColor = (catId: string) => {
    return (
      categories.find((c) => c.id === catId)?.color ||
      'bg-slate-100 text-slate-800 border-slate-200'
    );
  };

  return (
    <div
      id="inventory-root"
      className="flex-1 flex flex-col h-screen overflow-hidden bg-transparent p-6 text-slate-800 dark:text-slate-100"
    >
      {/* Header Panel */}
      <div id="inventory-header" className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-sans font-extrabold tracking-tight text-slate-900 text-xl sm:text-2xl flex items-center gap-2">
            <Layers className="text-emerald-500" /> {t('inventory.catalogInventory')}
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
            {t('inventory.manageStoreItems')}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Subscreen Tabs */}
          <div className="bg-slate-200/60 p-1 rounded-xl flex">
            {(
              [
                { id: 'products', label: t('inventory.products') },
                { id: 'categories', label: t('inventory.categories') },
                { id: 'suppliers', label: t('inventory.suppliers') },
                { id: 'log', label: t('inventory.stockLog') },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'products' && (
            <button
              id="receive-stock-btn"
              onClick={() => {
                setRecvProductId(products[0]?.id || '');
                setReceiveOpen(true);
              }}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-sans font-bold text-xs sm:text-sm px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm"
            >
              <PackagePlus size={16} />{' '}
              <span className="hidden sm:inline">{t('inventory.receiveStock')}</span>
            </button>
          )}

          {activeTab !== 'log' && (
            <button
              id="add-item-trigger-btn"
              onClick={
                activeTab === 'products'
                  ? handleOpenAddProduct
                  : activeTab === 'categories'
                    ? () => setCategoryModalOpen(true)
                    : () => setSupplierModalOpen(true)
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-sans font-bold text-xs sm:text-sm px-4 py-2 rounded-xl flex items-center space-x-1.5 shadow-lg shadow-emerald-600/10"
            >
              <Plus size={16} />
              <span>
                {activeTab === 'products'
                  ? t('inventory.addProduct')
                  : activeTab === 'categories'
                    ? t('inventory.addCategory')
                    : t('inventory.addSupplier')}
              </span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'products' && (
        /* PRODUCTS TAB */
        <>
          {/* Filter Bar */}
          <div
            id="inventory-filters"
            className="glass dark:glass-dark p-4 rounded-2xl border border-white/20 dark:border-white/10 shadow-lg space-y-4 mb-6 shrink-0 backdrop-blur-md"
          >
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="flex-1 flex items-center space-x-2 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200/40">
                <Search size={16} className="text-slate-400" />
                <input
                  id="inventory-search-input"
                  type="text"
                  placeholder={t('inventory.searchProducts')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent border-none text-slate-800 text-xs focus:outline-none placeholder-slate-400"
                />
              </div>

              {/* Select Category */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  {t('inventory.category')}
                </span>
                <select
                  id="filter-category-select"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold px-3 py-1.5 text-slate-600 focus:outline-none focus:border-emerald-500"
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
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  {t('inventory.stockLevel')}
                </span>
                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    onClick={() => setStockFilter('all')}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${
                      stockFilter === 'all'
                        ? 'bg-white text-slate-800 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {t('inventory.all')}
                  </button>
                  <button
                    onClick={() => setStockFilter('low')}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${
                      stockFilter === 'low'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {t('inventory.low')}
                  </button>
                  <button
                    onClick={() => setStockFilter('out')}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${
                      stockFilter === 'out'
                        ? 'bg-rose-500 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {t('inventory.out')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div
            id="inventory-table-container"
            className="flex-1 glass dark:glass-dark border border-white/20 dark:border-white/10 rounded-2xl shadow-lg overflow-hidden flex flex-col backdrop-blur-md"
          >
            <div className="flex-1 overflow-y-auto">
              <table id="inventory-table" className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-white/40 dark:bg-slate-900/40 text-slate-500 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wider font-mono border-b border-slate-200/50 dark:border-slate-700/50 backdrop-blur-sm">
                    <th className="py-3 px-5 w-1/4">{t('inventory.productDetails')}</th>
                    <th className="py-3 px-4 w-1/8">
                      <button
                        onClick={() => toggleSort('sku')}
                        className="flex items-center gap-1 hover:text-slate-800 transition-colors"
                      >
                        {t('inventory.sku')} <ArrowUpDown size={11} />
                      </button>
                    </th>
                    <th className="py-3 px-4 w-1/6">{t('inventory.category').replace(':', '')}</th>
                    <th className="py-3 px-4 w-1/8 text-right">
                      <button
                        onClick={() => toggleSort('price')}
                        className="flex items-center gap-1 hover:text-slate-800 transition-colors justify-end w-full"
                      >
                        {t('inventory.price')} <ArrowUpDown size={11} />
                      </button>
                    </th>
                    <th className="py-3 px-4 w-1/8 text-right">{t('inventory.cost')}</th>
                    <th className="py-3 px-4 w-1/8 text-right">{t('inventory.margin')}</th>
                    <th className="py-3 px-5 w-1/6 text-center">
                      <button
                        onClick={() => toggleSort('stock')}
                        className="flex items-center gap-1 hover:text-slate-800 transition-colors justify-center w-full"
                      >
                        {t('inventory.stock')} <ArrowUpDown size={11} />
                      </button>
                    </th>
                    <th className="py-3 px-4 w-[100px] text-center">{t('inventory.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 dark:divide-slate-700/50 text-xs font-sans text-slate-700 dark:text-slate-200">
                  {sortedAndFilteredProducts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-12 text-center text-slate-400 font-medium font-mono"
                      >
                        {t('inventory.noProductsRegistered')}
                      </td>
                    </tr>
                  ) : (
                    sortedAndFilteredProducts.map((prod) => {
                      const isLow = prod.stock <= prod.minStock && prod.stock > 0;
                      const isOut = prod.stock === 0;
                      const margin =
                        prod.price > 0 ? ((prod.price - prod.cost) / prod.price) * 100 : 0;

                      return (
                        <tr
                          key={prod.id}
                          id={`inventory-row-${prod.id}`}
                          className={`hover:bg-white/30 dark:hover:bg-slate-800/30 transition-colors ${isOut ? 'bg-rose-500/10' : isLow ? 'bg-amber-500/10' : ''}`}
                        >
                          <td className="py-3.5 px-5 font-semibold text-slate-800 flex items-center space-x-3.5 truncate">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0 flex items-center justify-center">
                              {prod.image ? (
                                <img
                                  src={prod.image}
                                  alt={prod.name}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <span className="text-xl">☕</span>
                              )}
                            </div>
                            <div className="truncate">
                              <span className="font-semibold block truncate text-slate-800 dark:text-slate-100 max-w-[150px]">
                                {prod.name}
                              </span>
                              <span className="text-[10px] font-mono font-medium text-slate-400 block mt-0.5">
                                {t('inventory.thresholdAlert')}: {prod.minStock}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[11px] truncate text-slate-500">
                            {prod.sku}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getProductCategoryColor(prod.category)}`}
                            >
                              {getProductCategoryName(prod.category)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-slate-100 text-right">
                            {settings.currency}
                            {prod.price.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-500 text-right">
                            {settings.currency}
                            {prod.cost.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <span
                              className={`font-mono font-medium ${margin >= 50 ? 'text-emerald-600' : 'text-slate-500'}`}
                            >
                              {margin.toFixed(0)}%
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-center">
                            <div className="flex flex-col items-center justify-center">
                              <span
                                className={`font-mono font-bold text-xs ${isOut ? 'text-rose-500 dark:text-rose-400' : isLow ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}
                              >
                                {prod.stock}
                              </span>
                              {isOut ? (
                                <span className="text-[9px] text-rose-500 font-bold uppercase mt-0.5 flex items-center gap-0.5">
                                  <AlertTriangle size={10} /> {t('inventory.outOfStock')}
                                </span>
                              ) : isLow ? (
                                <span className="text-[9px] text-amber-500 font-bold uppercase mt-0.5 flex items-center gap-0.5">
                                  <AlertTriangle size={10} /> {t('inventory.lowStock')}
                                </span>
                              ) : (
                                <span className="text-[9px] text-emerald-500 font-bold uppercase mt-0.5 font-mono">
                                  {t('inventory.goodLevel')}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center justify-center space-x-1.5">
                              <button
                                onClick={() => handleOpenEditProduct(prod)}
                                className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200/60 rounded-lg transition-colors"
                                title={t('inventory.editCatalogProduct')}
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                id={`del-prod-${prod.id}`}
                                onClick={() => {
                                  if (confirm(t('inventory.deleteConfirm', { name: prod.name })))
                                    handleDeleteProduct(prod.id);
                                }}
                                className="p-1.5 text-slate-400 hover:text-rose-600 bg-rose-50 hover:bg-rose-100/50 rounded-lg transition-colors"
                                title={t('inventory.deleteProduct')}
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
            <div className="px-5 py-3 border-t border-slate-200/50 dark:border-slate-700/50 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm text-[11px] text-slate-500 dark:text-slate-400 font-mono flex justify-between">
              <span>
                {t('inventory.activeSkus')}: {products.length}
              </span>
              <span className="flex items-center gap-4">
                <span className="text-amber-600 font-bold flex items-center gap-1">
                  ● {t('inventory.lowStock')}:{' '}
                  {products.filter((p) => p.stock <= p.minStock && p.stock > 0).length}
                </span>
                <span className="text-rose-600 font-bold flex items-center gap-1">
                  ● {t('inventory.outOfStock')}: {products.filter((p) => p.stock === 0).length}
                </span>
              </span>
            </div>
          </div>
        </>
      )}

      {activeTab === 'categories' && (
        /* CATEGORIES TAB */
        <div
          id="categories-tab-content"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {categories.map((cat) => {
            const productCount = products.filter((p) => p.category === cat.id).length;
            return (
              <div
                key={cat.id}
                id={`cat-card-${cat.id}`}
                className="glass dark:glass-dark border border-white/20 dark:border-white/10 rounded-2xl p-5 shadow-lg space-y-4 flex flex-col justify-between card-hover"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border ${cat.color}`}
                    >
                      {cat.name}
                    </span>
                    <button
                      id={`del-cat-${cat.id}`}
                      disabled={productCount > 0}
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-slate-400 p-1.5 hover:bg-slate-50 rounded-lg transition-all"
                      title={
                        productCount > 0
                          ? t('inventory.cannotDeleteCategory')
                          : t('inventory.deleteCategory')
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 font-mono">
                    {t('inventory.id')}: {cat.id}
                  </p>
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                  <span className="text-xs text-slate-500 font-medium">
                    {t('inventory.linkedProducts')}
                  </span>
                  <span className="font-mono text-slate-800 dark:text-slate-100 font-bold text-sm bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                    {productCount} {t('inventory.items')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'suppliers' && (
        /* SUPPLIERS TAB */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {suppliers.length === 0 ? (
            <div className="col-span-full glass dark:glass-dark border border-white/20 dark:border-white/10 rounded-2xl p-12 text-center text-slate-400 font-mono text-xs">
              {t('inventory.noSuppliers')}
            </div>
          ) : (
            suppliers.map((sup) => (
              <div
                key={sup.id}
                className="glass dark:glass-dark border border-white/20 dark:border-white/10 rounded-2xl p-5 shadow-lg flex items-start justify-between card-hover"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Truck size={16} className="text-emerald-500 shrink-0" />
                    <h4 className="font-sans font-bold text-slate-800 dark:text-slate-100 text-sm truncate">
                      {sup.name}
                    </h4>
                  </div>
                  <div className="mt-2 space-y-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {sup.contact && <p className="truncate">{sup.contact}</p>}
                    {sup.phone && <p className="truncate">{sup.phone}</p>}
                    {sup.email && <p className="truncate">{sup.email}</p>}
                  </div>
                </div>
                <button
                  onClick={() => removeSupplier(sup.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 bg-rose-50 hover:bg-rose-100/50 rounded-lg transition-colors shrink-0"
                  title={t('inventory.deleteSupplier')}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'log' && (
        /* STOCK ADJUSTMENT LOG */
        <div className="flex-1 glass dark:glass-dark border border-white/20 dark:border-white/10 rounded-2xl shadow-lg overflow-hidden flex flex-col backdrop-blur-md">
          <div className="flex-1 overflow-y-auto">
            {adjustments.length === 0 ? (
              <div className="py-16 text-center text-slate-400 font-mono text-xs">
                {t('inventory.noAdjustments')}
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/40 dark:bg-slate-900/40 text-slate-500 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wider font-mono border-b border-slate-200/50 dark:border-slate-700/50 sticky top-0 backdrop-blur-sm">
                    <th className="py-3 px-4">{t('inventory.logWhen')}</th>
                    <th className="py-3 px-4">{t('inventory.productDetails')}</th>
                    <th className="py-3 px-4 text-center">{t('inventory.logReason')}</th>
                    <th className="py-3 px-4 text-right">{t('inventory.logChange')}</th>
                    <th className="py-3 px-4 text-right">{t('inventory.stock')}</th>
                    <th className="py-3 px-4">{t('inventory.logBy')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 dark:divide-slate-700/50 text-xs text-slate-700 dark:text-slate-200">
                  {adjustments.map((a) => (
                    <tr key={a.id} className="hover:bg-white/30 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {new Date(a.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-semibold truncate max-w-[160px]">
                        {a.productName}
                        {a.supplierName && (
                          <span className="block text-[10px] text-slate-400 font-normal">
                            {a.supplierName}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            a.reason === 'received'
                              ? 'bg-emerald-100 text-emerald-700'
                              : a.reason === 'waste'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {t(`inventory.reason_${a.reason}`)}
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold ${
                          a.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {a.delta >= 0 ? '+' : ''}
                        {a.delta}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">{a.newStock}</td>
                      <td className="py-3 px-4 text-slate-500 truncate max-w-[100px]">
                        {a.operatorName || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Product Add/Edit Form */}
      <AnimatePresence>
        {productModalOpen && (
          <div
            id="product-form-modal"
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="font-sans font-bold text-slate-800 text-base">
                  {editingProduct
                    ? t('inventory.editCatalogProduct')
                    : t('inventory.addNewProduct')}
                </h3>
                <button
                  onClick={() => setProductModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 bg-white border border-slate-200 rounded-lg shadow-sm"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmitProduct}>
                <div className="p-6 space-y-4 max-h-[420px] overflow-y-auto">
                  {/* Basic information */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        {t('inventory.productName')}
                      </label>
                      <input
                        id="form-prod-name"
                        type="text"
                        required
                        placeholder="e.g. White Mocha Latte"
                        value={prodName}
                        onChange={(e) => setProdName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        {t('inventory.skuCode')}
                      </label>
                      <input
                        id="form-prod-sku"
                        type="text"
                        required
                        placeholder="e.g. BEV-MOC-01"
                        value={prodSku}
                        onChange={(e) => setProdSku(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        {t('inventory.category').replace(':', ' *')}
                      </label>
                      <select
                        id="form-prod-category"
                        value={prodCategory}
                        onChange={(e) => setProdCategory(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 font-semibold"
                      >
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Financials & Stock */}
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        {t('inventory.sellPrice')} ({settings.currency}) *
                      </label>
                      <input
                        id="form-prod-price"
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        placeholder="0.00"
                        value={prodPrice}
                        onChange={(e) => setProdPrice(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        {t('inventory.costPrice')} ({settings.currency}) *
                      </label>
                      <input
                        id="form-prod-cost"
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        placeholder="0.00"
                        value={prodCost}
                        onChange={(e) => setProdCost(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        {t('inventory.inStockCount')}
                      </label>
                      <input
                        id="form-prod-stock"
                        type="number"
                        min="0"
                        required
                        placeholder="0"
                        value={prodStock}
                        onChange={(e) => setProdStock(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        {t('inventory.lowStockAlert')}
                      </label>
                      <input
                        id="form-prod-minstock"
                        type="number"
                        min="0"
                        placeholder="5"
                        value={prodMinStock}
                        onChange={(e) => setProdMinStock(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Asset settings */}
                  <div className="pt-2 border-t border-slate-100">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      {t('inventory.productImageOptional')}
                    </label>
                    <input
                      id="form-prod-image"
                      type="url"
                      placeholder="https://images.unsplash.com/..."
                      value={prodImage}
                      onChange={(e) => setProdImage(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 placeholder-slate-300"
                    />
                  </div>
                </div>

                <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setProductModalOpen(false)}
                    className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"
                  >
                    {t('inventory.cancel')}
                  </button>
                  <button
                    type="submit"
                    id="form-submit-prod-btn"
                    className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-sans font-bold text-xs sm:text-sm rounded-xl flex items-center shadow-lg shadow-slate-900/10"
                  >
                    <Check size={16} className="me-1" />
                    <span>{t('inventory.saveCatalogItem')}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Category Add Form */}
      <AnimatePresence>
        {categoryModalOpen && (
          <div
            id="category-form-modal"
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 space-y-4"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-sans font-bold text-slate-800 text-base flex items-center gap-2">
                  <FolderPlus size={18} className="text-emerald-500" />{' '}
                  {t('inventory.addNewCategory')}
                </h3>
                <button
                  onClick={() => setCategoryModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmitCategory} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    {t('inventory.categoryName')}
                  </label>
                  <input
                    id="new-cat-name-input"
                    type="text"
                    required
                    placeholder="e.g. Beverages"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 font-semibold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    {t('inventory.visualThemeColor')}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {categoryColors.map((colorOption) => (
                      <button
                        key={colorOption.label}
                        type="button"
                        onClick={() => setNewCatColor(colorOption.class)}
                        className={`p-2.5 rounded-xl border text-[10px] font-bold transition-all ${
                          newCatColor === colorOption.class
                            ? 'border-slate-800 ring-2 ring-slate-800/15'
                            : 'border-slate-200 opacity-70 hover:opacity-100'
                        } ${colorOption.class.split(' ')[0]}`}
                      >
                        {colorOption.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setCategoryModalOpen(false)}
                    className="px-4 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 rounded-lg"
                  >
                    {t('inventory.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm"
                  >
                    {t('inventory.saveCategory')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Receive Stock (lightweight purchase order) */}
      <AnimatePresence>
        {receiveOpen && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <PackagePlus size={18} className="text-emerald-500" />{' '}
                  {t('inventory.receiveStock')}
                </h3>
                <button
                  onClick={() => setReceiveOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    {t('inventory.products')}
                  </label>
                  <select
                    value={recvProductId}
                    onChange={(e) => setRecvProductId(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.stock})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      {t('inventory.quantityReceived')}
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={recvQty}
                      onChange={(e) => setRecvQty(e.target.value)}
                      placeholder="0"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-mono dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      {t('inventory.suppliers')}
                    </label>
                    <select
                      value={recvSupplierId}
                      onChange={(e) => setRecvSupplierId(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">—</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <input
                  type="text"
                  value={recvNote}
                  onChange={(e) => setRecvNote(e.target.value)}
                  placeholder={t('inventory.noteOptional')}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-end gap-2">
                <button
                  onClick={() => setReceiveOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  {t('inventory.cancel')}
                </button>
                <button
                  onClick={handleReceiveStock}
                  disabled={!recvProductId || !(parseInt(recvQty) > 0)}
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg flex items-center gap-1.5"
                >
                  <Check size={14} /> {t('inventory.confirmReceive')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Add Supplier */}
      <AnimatePresence>
        {supplierModalOpen && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Truck size={18} className="text-emerald-500" /> {t('inventory.addSupplier')}
                </h3>
                <button
                  onClick={() => setSupplierModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleAddSupplier} className="p-6 space-y-3">
                <input
                  type="text"
                  required
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  placeholder={t('inventory.supplierName')}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="text"
                  value={supContact}
                  onChange={(e) => setSupContact(e.target.value)}
                  placeholder={t('inventory.supplierContact')}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="tel"
                    value={supPhone}
                    onChange={(e) => setSupPhone(e.target.value)}
                    placeholder={t('inventory.phoneNumber')}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-mono dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="email"
                    value={supEmail}
                    onChange={(e) => setSupEmail(e.target.value)}
                    placeholder={t('inventory.emailAddress')}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setSupplierModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                  >
                    {t('inventory.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg"
                  >
                    {t('inventory.saveSupplier')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
