import React, { useState, useMemo, useCallback } from 'react';
import { Plus, Layers, PackagePlus, Tag } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, PurchaseOrder, PurchaseOrderStatus } from '../types';
import { normalizePoLines } from '../lib/purchaseOrders';
import { printProductLabels } from '../lib/productLabels';

import { useProductStore } from '../stores/productStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useSupplyStore } from '../stores/supplyStore';
import { useAuthStore } from '../stores/authStore';
import { syncToCloudIfEnabled } from '../lib/sync';
import { adjustStock, receivePurchaseOrder } from '../services';
import { useModalA11y } from '../lib/useModalA11y';
import { useTranslation } from 'react-i18next';
import { notify } from '../lib/utils/ui';
import { askConfirmation } from '../lib/utils/ui';
import { safeImageUrl } from '../lib/imageUrl';
import { shortId } from '../lib/utils/ids';
import {
  CategoryFormModal,
  InventoryCategoriesTab,
  InventoryProductsTab,
  InventoryPurchaseOrdersTab,
  InventoryStockLogTab,
  InventorySuppliersTab,
  ProductFormModal,
  PurchaseOrderFormModal,
  ReceiveStockModal,
  SupplierFormModal,
} from './inventory/index';

// Colors available for categories
const categoryColors = [
  { class: 'badge badge-blue', bg: 'bg-blue-500', label: 'Blue' },
  { class: 'badge badge-amber', bg: 'bg-amber-500', label: 'Amber' },
  { class: 'badge badge-emerald', bg: 'bg-emerald-500', label: 'Emerald' },
  { class: 'badge badge-purple', bg: 'bg-purple-500', label: 'Purple' },
  { class: 'badge badge-rose', bg: 'bg-rose-500', label: 'Rose' },
  { class: 'badge badge-slate', bg: 'bg-slate-500', label: 'Slate' },
];

/**
 * Inventory screen: manage products and categories, adjust stock, print product
 * labels, and import or export the catalog as CSV.
 */
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
  const [recvReason, setRecvReason] = useState<'received' | 'waste' | 'correction' | 'other'>(
    'received',
  );

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
          quantity: parseInt(l.quantity, 10) || 0,
          unitCost: parseFloat(l.unitCost) || 0,
        };
      }),
    );
    if (lines.length === 0) {
      notify(t('inventory.poNeedLines'));
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

  // The status transition, the per-line stock application, the audit entries and
  // the cloud push all belong to receivePurchaseOrder; this screen only asks
  // the operator to confirm.
  const handleReceivePo = useCallback(
    async (po: PurchaseOrder) => {
      if (!(await askConfirmation(t('inventory.poReceiveConfirm')))) return;
      receivePurchaseOrder(po.id, currentUser?.name ?? null);
    },
    [currentUser, t],
  );

  const handleReceiveStock = useCallback(() => {
    const qty = parseInt(recvQty, 10);
    const supplier = suppliers.find((s) => s.id === recvSupplierId);
    // A negative delta is legitimate here — waste and corrections both use one —
    // so the service, not this screen, decides what is refusable.
    const result = adjustStock({
      productId: recvProductId,
      delta: qty,
      reason: recvReason,
      note: recvNote || null,
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? null,
      operatorName: currentUser?.name ?? null,
    });
    if (!result.success) {
      if (result.error === 'negative-stock') notify(t('inventory.stockCannotBeNegative'));
      // 'zero-delta' and 'unknown-product' mean the form is incomplete, which
      // the disabled submit already communicates; nothing to say twice.
      return;
    }
    setReceiveOpen(false);
    setRecvProductId('');
    setRecvQty('');
    setRecvSupplierId('');
    setRecvNote('');
    setRecvReason('received');
  }, [recvProductId, recvQty, suppliers, recvSupplierId, recvReason, recvNote, currentUser, t]);

  const handleAddSupplier = useCallback(
    (e: React.FormEvent) => {
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
    },
    [supName, supContact, supPhone, supEmail, addSupplier],
  );

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
  // Must be one of categoryColors, or the picker shows nothing selected and a
  // category saved without touching it stores a class the badge styles ignore.
  const [newCatColor, setNewCatColor] = useState(categoryColors[0].class);

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
    setProdSku(`SKU-${shortId().replaceAll('-', '').slice(0, 6).toUpperCase()}`);
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
      notify(t('inventory.pleaseFillRequired'));
      return;
    }

    const duplicateSku = products.find((p) => p.sku === prodSku && p.id !== editingProduct?.id);
    if (duplicateSku) {
      notify(
        t('inventory.duplicateSku', {
          defaultValue: 'This SKU is already used by another product.',
        }),
      );
      return;
    }

    const productPayload = {
      name: prodName,
      sku: prodSku,
      category: prodCategory,
      price: parseFloat(prodPrice),
      cost: parseFloat(prodCost),
      stock: parseInt(prodStock, 10),
      minStock: parseInt(prodMinStock, 10) || 0,
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
    setNewCatColor(categoryColors[0].class);
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
            : prod.stock <= 0;

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

  // Print price-tag labels (name, price, SKU, scannable barcode) for whatever
  // the current filter/search shows.
  const handlePrintLabels = useCallback(() => {
    const outcome = printProductLabels(sortedAndFilteredProducts, settings, { columns: 3 });
    if (outcome === 'popup-blocked') notify(t('history.standardPrintBlocked'));
  }, [sortedAndFilteredProducts, settings, t]);

  const toggleSort = (field: 'name' | 'stock' | 'price' | 'sku') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Helpers
  const categoryMap = useMemo(() => {
    return new Map(categories.map((c) => [c.id, c]));
  }, [categories]);

  const getProductCategoryName = (catId: string) => {
    return categoryMap.get(catId)?.name || 'General';
  };

  const getProductCategoryColor = (catId: string) => {
    return categoryMap.get(catId)?.color || 'badge badge-slate';
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

  const productPreviewUrl = safeImageUrl(prodImage);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      id="inventory-root"
      className="flex-1 flex flex-col h-screen overflow-hidden bg-transparent p-6 text-slate-800 dark:text-slate-100"
    >
      {/* Header Panel */}
      <div
        id="inventory-header"
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4"
      >
        <div>
          <h2 className="font-sans font-extrabold tracking-tight text-slate-900 dark:text-white text-2xl flex items-center gap-3">
            <Layers className="text-emerald-500" size={28} /> {t('inventory.catalogInventory')}
          </h2>
          <p className="text-slate-500 text-sm mt-1">{t('inventory.manageStoreItems')}</p>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          {activeTab === 'products' && (
            <button
              id="print-labels-btn"
              onClick={handlePrintLabels}
              disabled={sortedAndFilteredProducts.length === 0}
              className="glass dark:glass-dark hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-900 dark:text-white font-sans font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition-all"
              title={t('inventory.printLabelsHint')}
            >
              <Tag size={18} />
              <span className="hidden sm:inline">{t('inventory.printLabels')}</span>
            </button>
          )}

          {activeTab === 'products' && (
            <button
              id="receive-stock-btn"
              onClick={() => {
                setRecvProductId(products[0]?.id || '');
                setReceiveOpen(true);
              }}
              className="glass dark:glass-dark hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-sans font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition-all"
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
      <div
        role="tablist"
        aria-label={t('inventory.catalogInventory')}
        className="flex space-x-6 border-b border-slate-200 dark:border-white/10 mb-6 relative"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 text-sm font-semibold transition-colors relative z-10 ${
              activeTab === tab.id
                ? 'text-emerald-500'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <motion.div
                layoutId="inventoryTab"
                className="absolute -bottom-px left-0 right-0 h-0.5 bg-emerald-500 rounded-t-full"
                initial={false}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'products' && (
          <InventoryProductsTab
            t={t}
            products={products}
            categories={categories}
            settings={settings}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            selectedCategory={selectedCategory}
            onSelectedCategoryChange={setSelectedCategory}
            stockFilter={stockFilter}
            onStockFilterChange={setStockFilter}
            sortBy={sortBy}
            sortOrder={sortOrder}
            sortedAndFilteredProducts={sortedAndFilteredProducts}
            onToggleSort={toggleSort}
            getProductCategoryName={getProductCategoryName}
            getProductCategoryColor={getProductCategoryColor}
            onEditProduct={handleOpenEditProduct}
            onDeleteProduct={handleDeleteProduct}
          />
        )}

        {activeTab === 'categories' && (
          <InventoryCategoriesTab
            t={t}
            products={products}
            categories={categories}
            onAddCategory={() => setCategoryModalOpen(true)}
            onDeleteCategory={handleDeleteCategory}
          />
        )}

        {activeTab === 'suppliers' && (
          <InventorySuppliersTab t={t} suppliers={suppliers} onDeleteSupplier={removeSupplier} />
        )}

        {activeTab === 'orders' && (
          <InventoryPurchaseOrdersTab
            t={t}
            settings={settings}
            purchaseOrders={purchaseOrders}
            statusBadge={PO_STATUS_BADGE}
            onSetStatus={setPurchaseOrderStatus}
            onReceive={handleReceivePo}
            onDeleteOrder={deletePurchaseOrder}
          />
        )}

        {activeTab === 'log' && <InventoryStockLogTab t={t} adjustments={adjustments} />}
      </div>

      {/* MODAL: Product Add/Edit Form */}
      <AnimatePresence>
        {productModalOpen && (
          <ProductFormModal
            t={t}
            modalRef={productModalRef}
            editingProduct={editingProduct}
            categories={categories}
            settings={settings}
            prodName={prodName}
            prodSku={prodSku}
            prodCategory={prodCategory}
            prodPrice={prodPrice}
            prodCost={prodCost}
            prodStock={prodStock}
            prodMinStock={prodMinStock}
            prodImage={prodImage}
            productPreviewUrl={productPreviewUrl}
            onNameChange={setProdName}
            onSkuChange={setProdSku}
            onCategoryChange={setProdCategory}
            onPriceChange={setProdPrice}
            onCostChange={setProdCost}
            onStockChange={setProdStock}
            onMinStockChange={setProdMinStock}
            onImageChange={setProdImage}
            onClose={() => setProductModalOpen(false)}
            onSubmit={handleSubmitProduct}
          />
        )}
      </AnimatePresence>

      {/* MODAL: Category Add Form */}
      <AnimatePresence>
        {categoryModalOpen && (
          <CategoryFormModal
            t={t}
            modalRef={categoryModalRef}
            categoryColors={categoryColors}
            newCatName={newCatName}
            newCatColor={newCatColor}
            onNameChange={setNewCatName}
            onColorChange={setNewCatColor}
            onClose={() => setCategoryModalOpen(false)}
            onSubmit={handleSubmitCategory}
          />
        )}
      </AnimatePresence>

      {/* MODAL: Receive Stock / Adjust */}
      <AnimatePresence>
        {receiveOpen && (
          <ReceiveStockModal
            t={t}
            modalRef={receiveModalRef}
            products={products}
            suppliers={suppliers}
            recvProductId={recvProductId}
            recvQty={recvQty}
            recvSupplierId={recvSupplierId}
            recvNote={recvNote}
            recvReason={recvReason}
            onProductIdChange={setRecvProductId}
            onQuantityChange={setRecvQty}
            onSupplierIdChange={setRecvSupplierId}
            onNoteChange={setRecvNote}
            onReasonChange={setRecvReason}
            onClose={() => setReceiveOpen(false)}
            onSubmit={handleReceiveStock}
          />
        )}
      </AnimatePresence>

      {/* MODAL: Add Supplier */}
      <AnimatePresence>
        {supplierModalOpen && (
          <SupplierFormModal
            t={t}
            modalRef={supplierModalRef}
            supName={supName}
            supContact={supContact}
            supPhone={supPhone}
            supEmail={supEmail}
            onNameChange={setSupName}
            onContactChange={setSupContact}
            onPhoneChange={setSupPhone}
            onEmailChange={setSupEmail}
            onClose={() => setSupplierModalOpen(false)}
            onSubmit={handleAddSupplier}
          />
        )}
      </AnimatePresence>

      {/* MODAL: New Purchase Order */}
      <AnimatePresence>
        {poModalOpen && (
          <PurchaseOrderFormModal
            t={t}
            modalRef={poModalRef}
            products={products}
            suppliers={suppliers}
            settings={settings}
            poSupplierId={poSupplierId}
            poNote={poNote}
            poLines={poLines}
            onSupplierIdChange={setPoSupplierId}
            onNoteChange={setPoNote}
            onLineChange={handlePoLineChange}
            onRemoveLine={(index) => setPoLines((prev) => prev.filter((_, i) => i !== index))}
            onAddLine={() => {
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
            onClose={() => setPoModalOpen(false)}
            onSubmit={handleSavePoDraft}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
