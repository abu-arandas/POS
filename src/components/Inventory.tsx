import React, { useState, useMemo, useCallback } from 'react';
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
  Image as ImageIcon,
  Mail,
  Phone,
  User,
  ClipboardList,
  Send,
  Ban,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, PurchaseOrder, PurchaseOrderStatus } from '../types';
import { poTotal, poUnitCount, normalizePoLines } from '../lib/purchaseOrders';

import { useProductStore } from '../stores/productStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useSupplyStore } from '../stores/supplyStore';
import { useAuthStore } from '../stores/authStore';
import { syncToCloudIfEnabled } from '../lib/sync';
import { useModalA11y } from '../lib/useModalA11y';
import { useTranslation } from 'react-i18next';

// Colors available for categories
const categoryColors = [
  { class: 'badge badge-blue', bg: 'bg-blue-500', label: 'Blue' },
  { class: 'badge badge-amber', bg: 'bg-amber-500', label: 'Amber' },
  { class: 'badge badge-emerald', bg: 'bg-emerald-500', label: 'Emerald' },
  { class: 'badge badge-purple', bg: 'bg-purple-500', label: 'Purple' },
  { class: 'badge badge-rose', bg: 'bg-rose-500', label: 'Rose' },
  { class: 'badge badge-slate', bg: 'bg-slate-500', label: 'Slate' },
];

export default function Inventory() {
  const { t } = useTranslation();
  const products = useProductStore((s) => s.products);
  const categories = useProductStore((s) => s.categories);
  const handleAddProduct = useProductStore((s) => s.handleAddProduct);
  const handleUpdateProduct = useProductStore((s) => s.handleUpdateProduct);
  const handleDeleteProduct = useProductStore((s) => s.handleDeleteProduct);
  const handleAddCategory = useProductStore((s) => s.handleAddCategory);
  const handleDeleteCategory = useProductStore((s) => s.handleDeleteCategory);
  
  const settings = useSettingsStore((s) => s.settings);
  
  const suppliers = useSupplyStore((s) => s.suppliers);
  const adjustments = useSupplyStore((s) => s.adjustments);
  const addSupplier = useSupplyStore((s) => s.addSupplier);
  const removeSupplier = useSupplyStore((s) => s.removeSupplier);
  const logAdjustment = useSupplyStore((s) => s.logAdjustment);
  const purchaseOrders = useSupplyStore((s) => s.purchaseOrders);
  const createPurchaseOrder = useSupplyStore((s) => s.createPurchaseOrder);
  const setPurchaseOrderStatus = useSupplyStore((s) => s.setPurchaseOrderStatus);
  const deletePurchaseOrder = useSupplyStore((s) => s.deletePurchaseOrder);

  const currentUser = useAuthStore((s) => s.currentUser);

  // Tab control
  const [activeTab, setActiveTab] = useState<
    'products' | 'categories' | 'suppliers' | 'orders' | 'log'
  >('products');

  // Receive-stock (lightweight purchase order) modal
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [recvProductId, setRecvProductId] = useState('');
  const [recvQty, setRecvQty] = useState('');
  const [recvSupplierId, setRecvSupplierId] = useState('');
  const [recvNote, setRecvNote] = useState('');
  const [recvReason, setRecvReason] = useState<'received' | 'waste' | 'correction' | 'other'>('received');

  // Supplier form
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supEmail, setSupEmail] = useState('');

  // Purchase order form. Lines are kept as strings while editing so partially
  // typed numbers don't get clobbered; they're parsed on save.
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poNote, setPoNote] = useState('');
  const [poLines, setPoLines] = useState<
    Array<{ productId: string; quantity: string; unitCost: string }>
  >([]);

  const handleOpenPoModal = useCallback(() => {
    const first = products[0];
    setPoSupplierId('');
    setPoNote('');
    setPoLines([
      { productId: first?.id ?? '', quantity: '', unitCost: first ? String(first.cost) : '' },
    ]);
    setPoModalOpen(true);
  }, [products]);

  const handlePoLineChange = (
    idx: number,
    patch: Partial<{ productId: string; quantity: string; unitCost: string }>,
  ) => {
    setPoLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, ...patch };
        // Picking a product pre-fills the unit cost from the catalog.
        if (patch.productId) {
          const prod = products.find((p) => p.id === patch.productId);
          if (prod) next.unitCost = String(prod.cost);
        }
        return next;
      }),
    );
  };

  const handleSavePoDraft = useCallback(() => {
    const lines = normalizePoLines(
      poLines.map((l) => {
        const prod = products.find((p) => p.id === l.productId);
        return {
          productId: prod?.id ?? '',
          productName: prod?.name ?? '',
          quantity: parseInt(l.quantity) || 0,
          unitCost: parseFloat(l.unitCost) || 0,
        };
      }),
    );
    if (lines.length === 0) {
      alert(t('inventory.poNeedLines'));
      return;
    }
    const supplier = suppliers.find((s) => s.id === poSupplierId);
    createPurchaseOrder({
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? null,
      lines,
      note: poNote.trim() || null,
      createdBy: currentUser?.name ?? null,
    });
    setPoModalOpen(false);
  }, [poLines, poSupplierId, poNote, products, suppliers, currentUser, createPurchaseOrder, t]);

  // Receiving applies stock to the LIVE catalog and writes one audit-log entry
  // per line, exactly like a manual receive — then locks the PO as received.
  const handleReceivePo = useCallback(
    (po: PurchaseOrder) => {
      if (!confirm(t('inventory.poReceiveConfirm'))) return;
      const liveProducts = useProductStore.getState().products;
      const updatedProducts: Product[] = [];
      for (const line of po.lines) {
        const prod = liveProducts.find((p) => p.id === line.productId);
        if (!prod) continue; // product deleted since ordering — skip its line
        const updated = { ...prod, stock: prod.stock + line.quantity };
        handleUpdateProduct(updated);
        updatedProducts.push(updated);
        logAdjustment({
          productId: updated.id,
          productName: updated.name,
          delta: line.quantity,
          newStock: updated.stock,
          reason: 'received',
          note: `PO ${po.id}`,
          supplierId: po.supplierId,
          supplierName: po.supplierName,
          operatorName: currentUser?.name ?? null,
        });
      }
      if (updatedProducts.length > 0) syncToCloudIfEnabled(updatedProducts);
      setPurchaseOrderStatus(po.id, 'received');
    },
    [handleUpdateProduct, logAdjustment, setPurchaseOrderStatus, currentUser, t],
  );

  const handleReceiveStock = useCallback(() => {
    const product = products.find((p) => p.id === recvProductId);
    const qty = parseInt(recvQty);
    if (!product || !qty) return; // allows negative if reason is waste
    const newStock = product.stock + qty;
    if (newStock < 0) {
      alert("Stock cannot be negative.");
      return;
    }
    const updated = { ...product, stock: newStock };
    handleUpdateProduct(updated);
    syncToCloudIfEnabled([updated]);
    const supplier = suppliers.find((s) => s.id === recvSupplierId);
    logAdjustment({
      productId: product.id,
      productName: product.name,
      delta: qty,
      newStock: updated.stock,
      reason: recvReason,
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
    setRecvReason('received');
  }, [
    products, recvProductId, recvQty, suppliers, recvSupplierId, recvReason,
    recvNote, currentUser, handleUpdateProduct, logAdjustment
  ]);

  const handleAddSupplier = useCallback((e: React.FormEvent) => {
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
  }, [supName, supContact, supPhone, supEmail, addSupplier]);

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

  const productModalRef = useModalA11y(productModalOpen, () => setProductModalOpen(false));
  const categoryModalRef = useModalA11y(categoryModalOpen, () => setCategoryModalOpen(false));
  const receiveModalRef = useModalA11y(receiveOpen, () => setReceiveOpen(false));
  const supplierModalRef = useModalA11y(supplierModalOpen, () => setSupplierModalOpen(false));
  const poModalRef = useModalA11y(poModalOpen, () => setPoModalOpen(false));

  // Product Form Fields
  const [prodName, setProdName] = useState('');
  const [prodSku, setProdSku] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodCost, setProdCost] = useState('');
  const [prodStock, setProdStock] = useState('');
  const [prodMinStock, setProdMinStock] = useState('');
  const [prodImage, setProdImage] = useState('');

  // Open Add Product Dialog
  const handleOpenAddProduct = useCallback(() => {
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
  }, [categories]);

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

    const duplicateSku = products.find(
      (p) => p.sku === prodSku && p.id !== editingProduct?.id
    );
    if (duplicateSku) {
      alert(t('inventory.duplicateSku', { defaultValue: 'This SKU is already used by another product.' }));
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
      image: prodImage || '',
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
    setCategoryModalOpen(false); // only close if not inline, but we want inline behavior to stay same for states
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
      'badge badge-slate'
    );
  };

  const tabs = [
    { id: 'products', label: t('inventory.products') },
    { id: 'categories', label: t('inventory.categories') },
    { id: 'suppliers', label: t('inventory.suppliers') },
    { id: 'orders', label: t('inventory.purchaseOrders') },
    { id: 'log', label: t('inventory.stockLog') },
  ] as const;

  const PO_STATUS_BADGE: Record<PurchaseOrderStatus, string> = {
    draft: 'badge badge-slate',
    ordered: 'badge badge-blue',
    received: 'badge badge-emerald',
    cancelled: 'badge badge-rose',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      id="inventory-root"
      className="flex-1 flex flex-col h-screen overflow-hidden bg-transparent p-6 text-slate-800 dark:text-slate-100"
    >
      {/* Header Panel */}
      <div id="inventory-header" className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="font-sans font-extrabold tracking-tight text-slate-900 dark:text-white text-2xl flex items-center gap-3">
            <Layers className="text-emerald-500" size={28} /> {t('inventory.catalogInventory')}
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {t('inventory.manageStoreItems')}
          </p>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          {activeTab === 'products' && (
            <button
              id="receive-stock-btn"
              onClick={() => {
                setRecvProductId(products[0]?.id || '');
                setReceiveOpen(true);
              }}
              className="glass-dark hover:bg-slate-800 text-white font-sans font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition-all"
            >
              <PackagePlus size={18} />
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
                    : activeTab === 'orders'
                      ? handleOpenPoModal
                      : () => setSupplierModalOpen(true)
              }
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-sans font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
            >
              <Plus size={18} />
              <span>
                {activeTab === 'products'
                  ? t('inventory.addProduct')
                  : activeTab === 'categories'
                    ? t('inventory.addCategory')
                    : activeTab === 'orders'
                      ? t('inventory.newPurchaseOrder')
                      : t('inventory.addSupplier')}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation with Animated Underline */}
      <div role="tablist" aria-label={t('inventory.catalogInventory')} className="flex space-x-6 border-b border-white/10 mb-6 relative">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 text-sm font-semibold transition-colors relative z-10 ${
              activeTab === tab.id
                ? 'text-emerald-500'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <motion.div
                layoutId="inventoryTab"
                className="absolute -bottom-[1px] left-0 right-0 h-[2px] bg-emerald-500 rounded-t-full"
                initial={false}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'products' && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {/* Filter Bar */}
            <div
              id="inventory-filters"
              className="surface p-4 rounded-2xl shadow-lg mb-6 shrink-0 flex flex-wrap gap-4 items-center"
            >
              {/* Search */}
              <div className="flex-1 min-w-[200px] flex items-center space-x-2 bg-slate-900/50 px-3 py-2 rounded-xl border border-white/10 focus-within:border-emerald-500/50 transition-colors">
                <Search size={18} className="text-slate-400" />
                <input
                  id="inventory-search-input"
                  type="text"
                  placeholder={t('inventory.searchProducts')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent border-none text-slate-200 text-sm focus:outline-none placeholder-slate-500 glass-input"
                />
              </div>

              {/* Select Category */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                  {t('inventory.category')}
                </span>
                <select
                  id="filter-category-select"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-slate-900/50 border border-white/10 rounded-xl text-sm font-semibold px-4 py-2 text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
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
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                  {t('inventory.stockLevel')}
                </span>
                <div className="flex bg-slate-900/50 p-1 rounded-xl border border-white/10">
                  <button
                    onClick={() => setStockFilter('all')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      stockFilter === 'all'
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t('inventory.all')}
                  </button>
                  <button
                    onClick={() => setStockFilter('low')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      stockFilter === 'low'
                        ? 'bg-amber-500/20 text-amber-400 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t('inventory.low')}
                  </button>
                  <button
                    onClick={() => setStockFilter('out')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      stockFilter === 'out'
                        ? 'bg-rose-500/20 text-rose-400 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
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
              <div className="flex-1 overflow-y-auto">
                <table id="inventory-table" className="w-full text-left border-collapse table-fixed">
                  <thead>
                    <tr className="bg-slate-900/80 text-slate-400 text-xs font-bold uppercase tracking-wider font-mono border-b border-white/5 sticky top-0 z-10 backdrop-blur-md">
                      <th className="py-4 px-6 w-1/4">{t('inventory.productDetails')}</th>
                      <th
                        className="py-4 px-4 w-1/8"
                        aria-sort={sortBy === 'sku' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
                      >
                        <button
                          onClick={() => toggleSort('sku')}
                          className="flex items-center gap-2 hover:text-white transition-colors"
                        >
                          {t('inventory.sku')} <ArrowUpDown size={12} />
                        </button>
                      </th>
                      <th className="py-4 px-4 w-1/6">{t('inventory.category').replace(':', '')}</th>
                      <th
                        className="py-4 px-4 w-1/8 text-right"
                        aria-sort={sortBy === 'price' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
                      >
                        <button
                          onClick={() => toggleSort('price')}
                          className="flex items-center gap-2 hover:text-white transition-colors justify-end w-full"
                        >
                          {t('inventory.price')} <ArrowUpDown size={12} />
                        </button>
                      </th>
                      <th className="py-4 px-4 w-1/8 text-right">{t('inventory.cost')}</th>
                      <th className="py-4 px-4 w-1/8 text-right">{t('inventory.margin')}</th>
                      <th
                        className="py-4 px-6 w-1/6 text-center"
                        aria-sort={sortBy === 'stock' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
                      >
                        <button
                          onClick={() => toggleSort('stock')}
                          className="flex items-center gap-2 hover:text-white transition-colors justify-center w-full"
                        >
                          {t('inventory.stock')} <ArrowUpDown size={12} />
                        </button>
                      </th>
                      <th className="py-4 px-4 w-[100px] text-center">{t('inventory.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                    {sortedAndFilteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={8}>
                          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
                            <Layers size={48} className="opacity-20" />
                            <p className="font-medium font-mono">{t('inventory.noProductsRegistered')}</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      sortedAndFilteredProducts.map((prod) => {
                        const isLow = prod.stock <= prod.minStock && prod.stock > 0;
                        const isOut = prod.stock === 0;
                        const margin = prod.price > 0 ? ((prod.price - prod.cost) / prod.price) * 100 : 0;

                        return (
                          <tr
                            key={prod.id}
                            id={`inventory-row-${prod.id}`}
                            className={`hover:bg-slate-800/50 transition-colors group ${isOut ? 'bg-rose-500/5' : isLow ? 'bg-amber-500/5' : ''}`}
                          >
                            <td className="py-4 px-6 flex items-center gap-4 truncate">
                              <div className="w-10 h-10 rounded-xl bg-slate-800 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center text-xl">
                                {prod.image ? (
                                  <img
                                    src={prod.image}
                                    alt={prod.name}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <ImageIcon className="text-slate-500" size={20} />
                                )}
                              </div>
                              <div className="truncate">
                                <span className="font-bold block truncate text-slate-100">
                                  {prod.name}
                                </span>
                                <span className="text-xs font-mono font-medium text-slate-500 block mt-0.5">
                                  {t('inventory.thresholdAlert')}: {prod.minStock}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-4 font-mono text-xs truncate text-slate-400">
                              {prod.sku}
                            </td>
                            <td className="py-4 px-4">
                              <span className={getProductCategoryColor(prod.category)}>
                                {getProductCategoryName(prod.category)}
                              </span>
                            </td>
                            <td className="py-4 px-4 font-mono font-bold text-white text-right">
                              {settings.currency}{prod.price.toFixed(2)}
                            </td>
                            <td className="py-4 px-4 font-mono text-slate-400 text-right">
                              {settings.currency}{prod.cost.toFixed(2)}
                            </td>
                            <td className="py-4 px-4 text-right font-mono font-medium">
                              <span className={margin >= 50 ? 'text-emerald-400' : 'text-slate-400'}>
                                {margin.toFixed(0)}%
                              </span>
                            </td>
                            <td className="py-4 px-6 text-center">
                              <div className="flex flex-col items-center justify-center">
                                <div className={`px-3 py-1 rounded-lg font-mono font-bold text-sm flex items-center gap-2 ${
                                  isOut ? 'bg-rose-500/20 text-rose-400' 
                                  : isLow ? 'bg-amber-500/20 text-amber-400' 
                                  : 'bg-emerald-500/20 text-emerald-400'
                                }`}>
                                  {isOut || isLow ? <AlertTriangle size={14} /> : null}
                                  {prod.stock}
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleOpenEditProduct(prod)}
                                  aria-label={t('inventory.editCatalogProduct')}
                                  className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  id={`del-prod-${prod.id}`}
                                  onClick={() => {
                                    if (confirm(t('inventory.deleteConfirm', { name: prod.name })))
                                      handleDeleteProduct(prod.id);
                                  }}
                                  aria-label={t('inventory.deleteProduct')}
                                  className="p-2 text-slate-400 hover:text-white bg-rose-500/10 hover:bg-rose-500 rounded-xl transition-colors"
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
              <div className="px-6 py-4 border-t border-white/5 bg-slate-900/50 text-xs text-slate-400 font-mono flex justify-between items-center">
                <span>
                  {t('inventory.activeSkus')}: <strong className="text-white ml-1">{products.length}</strong>
                </span>
                <span className="flex items-center gap-6">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    {t('inventory.lowStock')}:{' '}
                    <strong className="text-amber-400 ml-1">{products.filter((p) => p.stock <= p.minStock && p.stock > 0).length}</strong>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    {t('inventory.outOfStock')}:{' '}
                    <strong className="text-rose-400 ml-1">{products.filter((p) => p.stock === 0).length}</strong>
                  </span>
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'categories' && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            id="categories-tab-content"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 overflow-y-auto pb-6"
          >
            {/* Inline Add Category Card */}
            <button
              type="button"
              className="surface border-2 border-dashed border-white/10 rounded-2xl p-6 shadow-lg flex flex-col justify-center items-center gap-4 cursor-pointer hover:border-emerald-500/50 transition-colors group"
              onClick={() => setCategoryModalOpen(true)}
            >
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus size={24} />
              </div>
              <span className="font-bold text-slate-300">{t('inventory.addCategory')}</span>
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
                        onClick={() => handleDeleteCategory(cat.id)}
                        aria-label={productCount > 0 ? t('inventory.cannotDeleteCategory') : t('inventory.deleteCategory')}
                        className="text-slate-500 hover:text-white hover:bg-rose-500 disabled:opacity-30 disabled:hover:text-slate-500 disabled:hover:bg-transparent p-2 rounded-xl transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 font-mono">
                      ID: {cat.id}
                    </p>
                  </div>

                  <div className="flex justify-between items-center pt-4 mt-4 border-t border-white/10">
                    <span className="text-sm text-slate-400 font-medium">
                      {t('inventory.linkedProducts')}
                    </span>
                    <span className="font-mono text-white font-bold text-sm bg-slate-800 px-3 py-1.5 rounded-lg">
                      {productCount}
                    </span>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}

        {activeTab === 'suppliers' && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex-1 overflow-hidden flex flex-col surface rounded-2xl"
          >
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/80 text-slate-400 text-xs font-bold uppercase tracking-wider font-mono border-b border-white/5 sticky top-0 z-10 backdrop-blur-md">
                    <th className="py-4 px-6">{t('inventory.supplierName')}</th>
                    <th className="py-4 px-4">{t('inventory.supplierContact')}</th>
                    <th className="py-4 px-4">{t('inventory.phoneNumber')}</th>
                    <th className="py-4 px-4">{t('inventory.emailAddress')}</th>
                    <th className="py-4 px-6 text-right">{t('inventory.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                  {suppliers.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
                          <Truck size={48} className="opacity-20" />
                          <p className="font-medium font-mono">{t('inventory.noSuppliers')}</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    suppliers.map((sup) => (
                      <tr key={sup.id} className="hover:bg-slate-800/50 transition-colors group">
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400">
                              <Truck size={20} />
                            </div>
                            <span className="font-bold text-white">{sup.name}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-slate-300">
                          <div className="flex items-center gap-2">
                            <User size={14} className="text-slate-500" />
                            {sup.contact || '—'}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-slate-300 font-mono">
                          <div className="flex items-center gap-2">
                            <Phone size={14} className="text-slate-500" />
                            {sup.phone || '—'}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-slate-300">
                          <div className="flex items-center gap-2">
                            <Mail size={14} className="text-slate-500" />
                            {sup.email || '—'}
                          </div>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <button
                            onClick={() => removeSupplier(sup.id)}
                            aria-label={t('inventory.deleteSupplier')}
                            className="p-2 text-slate-400 hover:text-white bg-rose-500/10 hover:bg-rose-500 rounded-xl transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {activeTab === 'orders' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex-1 overflow-hidden flex flex-col surface rounded-2xl"
          >
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/80 text-slate-400 text-xs font-bold uppercase tracking-wider font-mono border-b border-white/5 sticky top-0 z-10 backdrop-blur-md">
                    <th className="py-4 px-6">{t('inventory.poOrder')}</th>
                    <th className="py-4 px-4">{t('inventory.poSupplier')}</th>
                    <th className="py-4 px-4">{t('inventory.poItems')}</th>
                    <th className="py-4 px-4 text-right">{t('inventory.poTotalCost')}</th>
                    <th className="py-4 px-4 text-center">{t('inventory.poStatus')}</th>
                    <th className="py-4 px-6 text-right">{t('inventory.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                  {purchaseOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
                          <ClipboardList size={48} className="opacity-20" />
                          <p className="font-medium font-mono">{t('inventory.noPurchaseOrders')}</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    purchaseOrders.map((po) => (
                      <tr key={po.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="py-4 px-6">
                          <span className="font-mono font-bold text-white block text-xs">{po.id}</span>
                          <span className="text-[10px] text-slate-500 font-mono mt-1 block">
                            {new Date(po.createdAt).toLocaleString()}
                            {po.createdBy && <> · {po.createdBy}</>}
                          </span>
                          {po.note && (
                            <span className="text-[10px] text-slate-400 mt-1 block truncate max-w-[220px]">
                              {po.note}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-slate-300">
                          <div className="flex items-center gap-2">
                            <Truck size={14} className="text-slate-500" />
                            {po.supplierName || '—'}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-slate-300 font-mono text-xs">
                          {t('inventory.poLinesUnits', {
                            lines: po.lines.length,
                            units: poUnitCount(po),
                          })}
                        </td>
                        <td className="py-4 px-4 text-right font-mono font-bold text-white">
                          {settings.currency}{poTotal(po).toFixed(2)}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className={PO_STATUS_BADGE[po.status]}>
                            {t(`inventory.poStatus_${po.status}`)}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center justify-end gap-2">
                            {po.status === 'draft' && (
                              <>
                                <button
                                  onClick={() => setPurchaseOrderStatus(po.id, 'ordered')}
                                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-colors"
                                  style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)' }}
                                >
                                  <Send size={12} /> {t('inventory.poMarkOrdered')}
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm(t('inventory.poDeleteConfirm'))) deletePurchaseOrder(po.id);
                                  }}
                                  aria-label={t('inventory.poDeleteDraft')}
                                  className="p-2 text-slate-400 hover:text-white bg-rose-500/10 hover:bg-rose-500 rounded-xl transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                            {po.status === 'ordered' && (
                              <>
                                <button
                                  onClick={() => handleReceivePo(po)}
                                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-colors"
                                  style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)' }}
                                >
                                  <PackagePlus size={12} /> {t('inventory.poReceive')}
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm(t('inventory.poCancelConfirm')))
                                      setPurchaseOrderStatus(po.id, 'cancelled');
                                  }}
                                  aria-label={t('inventory.poCancelOrder')}
                                  className="p-2 text-slate-400 hover:text-rose-400 bg-slate-800 hover:bg-rose-500/10 rounded-xl transition-colors"
                                >
                                  <Ban size={14} />
                                </button>
                              </>
                            )}
                            {po.status === 'cancelled' && (
                              <button
                                onClick={() => {
                                  if (confirm(t('inventory.poDeleteConfirm'))) deletePurchaseOrder(po.id);
                                }}
                                aria-label={t('inventory.poDeleteDraft')}
                                className="p-2 text-slate-400 hover:text-white bg-rose-500/10 hover:bg-rose-500 rounded-xl transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {activeTab === 'log' && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex-1 surface rounded-2xl shadow-lg overflow-hidden flex flex-col"
          >
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/80 text-slate-400 text-xs font-bold uppercase tracking-wider font-mono border-b border-white/5 sticky top-0 z-10 backdrop-blur-md">
                    <th className="py-4 px-6">{t('inventory.logWhen')}</th>
                    <th className="py-4 px-4">{t('inventory.productDetails')}</th>
                    <th className="py-4 px-4 text-center">{t('inventory.logReason')}</th>
                    <th className="py-4 px-4 text-right">{t('inventory.logChange')}</th>
                    <th className="py-4 px-4 text-right">{t('inventory.stock')}</th>
                    <th className="py-4 px-6">{t('inventory.logBy')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                  {adjustments.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
                          <Layers size={48} className="opacity-20" />
                          <p className="font-medium font-mono">{t('inventory.noAdjustments')}</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    adjustments.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="py-4 px-6 font-mono text-xs text-slate-400 whitespace-nowrap">
                          {new Date(a.createdAt).toLocaleString()}
                        </td>
                        <td className="py-4 px-4">
                          <span className="font-bold text-white block">{a.productName}</span>
                          {a.supplierName && (
                            <span className="text-xs text-slate-500 font-mono mt-1 block flex items-center gap-1">
                              <Truck size={12} /> {a.supplierName}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span
                            className={`badge ${
                              a.reason === 'received' ? 'badge-emerald' :
                              a.reason === 'waste' ? 'badge-rose' :
                              a.reason === 'correction' ? 'badge-amber' :
                              'badge-slate'
                            }`}
                          >
                            {t(`inventory.reason_${a.reason}`, a.reason)}
                          </span>
                        </td>
                        <td className={`py-4 px-4 text-right font-mono font-bold text-lg ${a.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {a.delta >= 0 ? '+' : ''}{a.delta}
                        </td>
                        <td className="py-4 px-4 text-right font-mono font-bold text-slate-300">
                          {a.newStock}
                        </td>
                        <td className="py-4 px-6 text-slate-400">
                          <div className="flex items-center gap-2">
                            <User size={14} className="text-slate-500" />
                            {a.operatorName || '—'}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>

      {/* MODAL: Product Add/Edit Form */}
      <AnimatePresence>
        {productModalOpen && (
          <div
            id="product-form-modal"
            className="modal-backdrop fixed inset-0 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              ref={productModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-form-title"
              tabIndex={-1}
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="modal-card max-w-3xl w-full flex flex-col max-h-[90vh]"
            >
              <div className="px-8 py-6 border-b border-white/10 flex justify-between items-center bg-slate-900/50">
                <h3 id="product-form-title" className="font-sans font-bold text-white text-xl flex items-center gap-3">
                  {editingProduct ? <Edit2 className="text-emerald-500" /> : <Plus className="text-emerald-500" />}
                  {editingProduct
                    ? t('inventory.editCatalogProduct')
                    : t('inventory.addNewProduct')}
                </h3>
                <button
                  onClick={() => setProductModalOpen(false)}
                  aria-label={t('inventory.cancel')}
                  className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmitProduct} className="flex flex-col overflow-hidden flex-1">
                <div className="p-8 space-y-8 overflow-y-auto">
                  
                  {/* Basic information */}
                  <div>
                    <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2 border-b border-white/5 pb-2">
                      <Layers size={16} className="text-emerald-500" /> Basic Details
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="md:col-span-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                          {t('inventory.productName')} *
                        </label>
                        <input
                          id="form-prod-name"
                          type="text"
                          required
                          placeholder="e.g. White Mocha Latte"
                          value={prodName}
                          onChange={(e) => setProdName(e.target.value)}
                          className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                          {t('inventory.skuCode')} *
                        </label>
                        <input
                          id="form-prod-sku"
                          type="text"
                          required
                          placeholder="e.g. BEV-MOC-01"
                          value={prodSku}
                          onChange={(e) => setProdSku(e.target.value)}
                          className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                          {t('inventory.category').replace(':', ' *')}
                        </label>
                        <select
                          id="form-prod-category"
                          value={prodCategory}
                          onChange={(e) => setProdCategory(e.target.value)}
                          className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white font-semibold focus:outline-none focus:border-emerald-500 transition-colors"
                        >
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Financials & Stock */}
                  <div>
                    <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2 border-b border-white/5 pb-2">
                      <PackagePlus size={16} className="text-emerald-500" /> Financials & Inventory
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
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
                          className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-lg focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
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
                          className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-lg focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                          {t('inventory.inStockCount')} *
                        </label>
                        <input
                          id="form-prod-stock"
                          type="number"
                          min="0"
                          required
                          placeholder="0"
                          value={prodStock}
                          onChange={(e) => setProdStock(e.target.value)}
                          className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                          {t('inventory.lowStockAlert')}
                        </label>
                        <input
                          id="form-prod-minstock"
                          type="number"
                          min="0"
                          placeholder="5"
                          value={prodMinStock}
                          onChange={(e) => setProdMinStock(e.target.value)}
                          className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Asset settings */}
                  <div>
                    <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2 border-b border-white/5 pb-2">
                      <ImageIcon size={16} className="text-emerald-500" /> Media
                    </h4>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                      {t('inventory.productImageOptional')}
                    </label>
                    <div className="flex gap-4">
                      <div className="w-20 h-20 rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                        {prodImage ? (
                          <img src={prodImage} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="text-slate-500" size={32} />
                        )}
                      </div>
                      <input
                        id="form-prod-image"
                        type="url"
                        placeholder="https://images.unsplash.com/..."
                        value={prodImage}
                        onChange={(e) => setProdImage(e.target.value)}
                        className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 placeholder-slate-600 self-center"
                      />
                    </div>
                  </div>
                </div>

                <div className="px-8 py-5 border-t border-white/10 bg-slate-900/80 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setProductModalOpen(false)}
                    className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors"
                  >
                    {t('inventory.cancel')}
                  </button>
                  <button
                    type="submit"
                    id="form-submit-prod-btn"
                    className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-transform active:scale-95"
                  >
                    <Check size={20} />
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
            className="modal-backdrop fixed inset-0 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              ref={categoryModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="category-form-title"
              tabIndex={-1}
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="modal-card max-w-sm w-full p-8 space-y-6"
            >
              <div className="flex justify-between items-center">
                <h3 id="category-form-title" className="font-sans font-bold text-white text-xl flex items-center gap-3">
                  <FolderPlus size={24} className="text-emerald-500" />{' '}
                  {t('inventory.addNewCategory')}
                </h3>
                <button
                  onClick={() => setCategoryModalOpen(false)}
                  aria-label={t('inventory.cancel')}
                  className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmitCategory} className="space-y-6">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    {t('inventory.categoryName')} *
                  </label>
                  <input
                    id="new-cat-name-input"
                    type="text"
                    required
                    placeholder="e.g. Beverages"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors font-bold text-lg"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-3">
                    {t('inventory.visualThemeColor')}
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {categoryColors.map((colorOption) => (
                      <button
                        key={colorOption.label}
                        type="button"
                        onClick={() => setNewCatColor(colorOption.class)}
                        className={`py-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                          newCatColor === colorOption.class
                            ? 'border-emerald-500 bg-slate-800'
                            : 'border-transparent bg-slate-900/50 hover:bg-slate-800'
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-full ${colorOption.bg}`}></div>
                        <span className="text-xs font-bold text-slate-300">{colorOption.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setCategoryModalOpen(false)}
                    className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors"
                  >
                    {t('inventory.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
                  >
                    {t('inventory.saveCategory')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Receive Stock / Adjust */}
      <AnimatePresence>
        {receiveOpen && (
          <div className="modal-backdrop fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              ref={receiveModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="receive-stock-title"
              tabIndex={-1}
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="modal-card max-w-md w-full"
            >
              <div className="px-8 py-6 border-b border-white/10 bg-slate-900/50 flex items-center justify-between">
                <h3 id="receive-stock-title" className="font-bold text-white text-xl flex items-center gap-3">
                  <PackagePlus size={24} className="text-emerald-500" />{' '}
                  {t('inventory.receiveStock')}
                </h3>
                <button
                  onClick={() => setReceiveOpen(false)}
                  aria-label={t('inventory.cancel')}
                  className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    {t('inventory.products')}
                  </label>
                  <select
                    value={recvProductId}
                    onChange={(e) => setRecvProductId(e.target.value)}
                    aria-label={t('inventory.products')}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 text-lg font-bold"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Cur: {p.stock})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Adjustment Reason
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(['received', 'waste', 'correction', 'other'] as const).map(r => (
                      <button
                        key={r}
                        onClick={() => setRecvReason(r)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                          recvReason === r 
                          ? r === 'waste' ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                          : r === 'received' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                          : 'bg-amber-500/20 border-amber-500 text-amber-400'
                          : 'bg-slate-900/50 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {t(`inventory.reason_${r}`, r.charAt(0).toUpperCase() + r.slice(1))}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                      Δ Quantity
                    </label>
                    <input
                      type="number"
                      value={recvQty}
                      onChange={(e) => setRecvQty(e.target.value)}
                      aria-label={t('inventory.qtyChange')}
                      placeholder={recvReason === 'waste' ? "-5" : "10"}
                      className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-xl text-center focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                      {t('inventory.suppliers')}
                    </label>
                    <select
                      value={recvSupplierId}
                      onChange={(e) => setRecvSupplierId(e.target.value)}
                      aria-label={t('inventory.suppliers')}
                      disabled={recvReason !== 'received'}
                      className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                    >
                      <option value="">— None —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Notes
                  </label>
                  <input
                    type="text"
                    value={recvNote}
                    onChange={(e) => setRecvNote(e.target.value)}
                    aria-label={t('inventory.noteOptional')}
                    placeholder={t('inventory.noteOptional')}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div className="px-8 py-5 border-t border-white/10 bg-slate-900/80 flex justify-end gap-3">
                <button
                  onClick={() => setReceiveOpen(false)}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors"
                >
                  {t('inventory.cancel')}
                </button>
                <button
                  onClick={handleReceiveStock}
                  disabled={!recvProductId || !recvQty || isNaN(parseInt(recvQty))}
                  className="px-6 py-3 font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
                >
                  <Check size={20} /> {t('inventory.confirmReceive', 'Confirm')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Add Supplier */}
      <AnimatePresence>
        {supplierModalOpen && (
          <div className="modal-backdrop fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              ref={supplierModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="supplier-form-title"
              tabIndex={-1}
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="modal-card max-w-sm w-full overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-white/10 bg-slate-900/50 flex items-center justify-between">
                <h3 id="supplier-form-title" className="font-bold text-white text-xl flex items-center gap-3">
                  <Truck size={24} className="text-emerald-500" /> {t('inventory.addSupplier')}
                </h3>
                <button
                  onClick={() => setSupplierModalOpen(false)}
                  aria-label={t('inventory.cancel')}
                  className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleAddSupplier} className="p-8 space-y-5">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Company / Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={supName}
                    onChange={(e) => setSupName(e.target.value)}
                    placeholder={t('inventory.supplierName')}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={supContact}
                    onChange={(e) => setSupContact(e.target.value)}
                    placeholder={t('inventory.supplierContact')}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={supPhone}
                      onChange={(e) => setSupPhone(e.target.value)}
                      placeholder={t('inventory.phoneNumber')}
                      className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={supEmail}
                      onChange={(e) => setSupEmail(e.target.value)}
                      placeholder={t('inventory.emailAddress')}
                      className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-6 border-t border-white/5 mt-6">
                  <button
                    type="button"
                    onClick={() => setSupplierModalOpen(false)}
                    className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors"
                  >
                    {t('inventory.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
                  >
                    {t('inventory.saveSupplier')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: New Purchase Order */}
      <AnimatePresence>
        {poModalOpen && (
          <div className="modal-backdrop fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              ref={poModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="po-form-title"
              tabIndex={-1}
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="modal-card max-w-2xl w-full flex flex-col max-h-[90vh]"
            >
              <div className="px-8 py-6 border-b border-white/10 bg-slate-900/50 flex items-center justify-between">
                <h3 id="po-form-title" className="font-bold text-white text-xl flex items-center gap-3">
                  <ClipboardList size={24} className="text-emerald-500" />{' '}
                  {t('inventory.newPurchaseOrder')}
                </h3>
                <button
                  onClick={() => setPoModalOpen(false)}
                  aria-label={t('inventory.cancel')}
                  className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                      {t('inventory.poSupplier')}
                    </label>
                    <select
                      value={poSupplierId}
                      onChange={(e) => setPoSupplierId(e.target.value)}
                      className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">{t('inventory.poNoSupplier')}</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                      {t('inventory.poNote')}
                    </label>
                    <input
                      type="text"
                      value={poNote}
                      onChange={(e) => setPoNote(e.target.value)}
                      placeholder={t('inventory.noteOptional')}
                      className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {poLines.map((lineRow, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={lineRow.productId}
                        onChange={(e) => handlePoLineChange(idx, { productId: e.target.value })}
                        aria-label={t('inventory.products')}
                        className="flex-1 bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 min-w-0"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        value={lineRow.quantity}
                        onChange={(e) => handlePoLineChange(idx, { quantity: e.target.value })}
                        aria-label={t('inventory.poQty')}
                        placeholder={t('inventory.poQty')}
                        className="w-24 bg-slate-900/50 border border-white/10 rounded-xl px-3 py-3 text-white font-mono text-center focus:outline-none focus:border-emerald-500"
                      />
                      <div className="w-32 flex items-center bg-slate-900/50 border border-white/10 rounded-xl overflow-hidden focus-within:border-emerald-500">
                        <span className="ps-3 text-slate-500 font-mono text-sm">{settings.currency}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={lineRow.unitCost}
                          onChange={(e) => handlePoLineChange(idx, { unitCost: e.target.value })}
                          aria-label={t('inventory.poUnitCost')}
                          placeholder="0.00"
                          className="w-full bg-transparent px-2 py-3 text-white font-mono focus:outline-none"
                        />
                      </div>
                      <button
                        onClick={() => setPoLines((prev) => prev.filter((_, i) => i !== idx))}
                        disabled={poLines.length <= 1}
                        aria-label={t('inventory.poRemoveLine')}
                        className="p-2.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl disabled:opacity-25 transition-colors shrink-0"
                        style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const first = products[0];
                      setPoLines((prev) => [
                        ...prev,
                        {
                          productId: first?.id ?? '',
                          quantity: '',
                          unitCost: first ? String(first.cost) : '',
                        },
                      ]);
                    }}
                    className="text-xs font-bold px-3 py-2 rounded-lg transition-colors"
                    style={{ color: '#34d399', border: '1px dashed rgba(16,185,129,0.35)' }}
                  >
                    + {t('inventory.poAddLine')}
                  </button>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-white/5 text-sm">
                  <span className="text-slate-400 font-bold uppercase text-xs tracking-wider">
                    {t('inventory.poTotalCost')}
                  </span>
                  <span className="font-mono font-bold text-emerald-400 text-lg">
                    {settings.currency}
                    {poLines
                      .reduce(
                        (sum, l) => sum + (parseInt(l.quantity) || 0) * (parseFloat(l.unitCost) || 0),
                        0,
                      )
                      .toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="px-8 py-5 border-t border-white/10 bg-slate-900/80 flex justify-end gap-3">
                <button
                  onClick={() => setPoModalOpen(false)}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors"
                >
                  {t('inventory.cancel')}
                </button>
                <button
                  onClick={handleSavePoDraft}
                  className="px-6 py-3 font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
                >
                  <Check size={20} /> {t('inventory.poSaveDraft')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
