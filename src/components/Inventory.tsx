import React, { useState, useMemo } from 'react';
import { 
  Plus, Search, Edit2, Trash2, ArrowUpDown, Tag, AlertTriangle, 
  Settings, FolderPlus, DollarSign, BarChart, Percent, Check, X, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Category, StoreSettings } from '../types';

import { useProductStore } from '../stores/productStore';
import { useSettingsStore } from '../stores/settingsStore';
import { syncToCloudIfEnabled } from '../lib/sync';

export default function Inventory() {
  const { 
    products, categories, 
    handleAddProduct, handleUpdateProduct, handleDeleteProduct,
    handleAddCategory, handleDeleteCategory 
  } = useProductStore();
  const { settings } = useSettingsStore();
  
  // Tab control: 'products' or 'categories'
  const [activeTab, setActiveTab] = useState<'products' | 'categories'>('products');

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
      alert('Please fill out all required fields');
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
      image: prodImage || 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
    };

    if (editingProduct) {
      const updated = { ...productPayload, id: editingProduct.id };
      handleUpdateProduct(updated);
      syncToCloudIfEnabled([updated]);
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
    let list = products.filter(prod => {
      const matchesSearch = prod.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            prod.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || prod.category === selectedCategory;
      const matchesStock = 
        stockFilter === 'all' ? true :
        stockFilter === 'low' ? (prod.stock <= prod.minStock && prod.stock > 0) :
        prod.stock === 0;

      return matchesSearch && matchesCategory && matchesStock;
    });

    list.sort((a, b) => {
      let valA: any = a[sortBy];
      let valB: any = b[sortBy];

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [products, searchQuery, selectedCategory]);

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
    return categories.find(c => c.id === catId)?.name || 'General';
  };

  const getProductCategoryColor = (catId: string) => {
    return categories.find(c => c.id === catId)?.color || 'bg-slate-100 text-slate-800 border-slate-200';
  };

  return (
    <div id="inventory-root" className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 p-6">
      
      {/* Header Panel */}
      <div id="inventory-header" className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-sans font-extrabold tracking-tight text-slate-900 text-xl sm:text-2xl flex items-center gap-2">
            <Layers className="text-emerald-500" /> Catalog & Inventory
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Manage store items, stock alarms, pricing margins, and categories.</p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Subscreen Tabs */}
          <div className="bg-slate-200/60 p-1 rounded-xl flex">
            <button
              onClick={() => setActiveTab('products')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'products' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Products
            </button>
            <button
              onClick={() => setActiveTab('categories')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'categories' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Categories
            </button>
          </div>

          <button
            id="add-item-trigger-btn"
            onClick={activeTab === 'products' ? handleOpenAddProduct : () => setCategoryModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-sans font-bold text-xs sm:text-sm px-4 py-2 rounded-xl flex items-center space-x-1.5 shadow-lg shadow-emerald-600/10"
          >
            <Plus size={16} />
            <span>{activeTab === 'products' ? 'Add Product' : 'Add Category'}</span>
          </button>
        </div>
      </div>

      {activeTab === 'products' ? (
        /* PRODUCTS TAB */
        <>
          {/* Filter Bar */}
          <div id="inventory-filters" className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 mb-6 shrink-0">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="flex-1 flex items-center space-x-2 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200/40">
                <Search size={16} className="text-slate-400" />
                <input
                  id="inventory-search-input"
                  type="text"
                  placeholder="Search products by SKU or Name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent border-none text-slate-800 text-xs focus:outline-none placeholder-slate-400"
                />
              </div>

              {/* Select Category */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Category:</span>
                <select
                  id="filter-category-select"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold px-3 py-1.5 text-slate-600 focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">All Categories</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Stock status filter */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Stock Level:</span>
                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    onClick={() => setStockFilter('all')}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${
                      stockFilter === 'all' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setStockFilter('low')}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${
                      stockFilter === 'low' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Low
                  </button>
                  <button
                    onClick={() => setStockFilter('out')}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${
                      stockFilter === 'out' ? 'bg-rose-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Out
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div id="inventory-table-container" className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto">
              <table id="inventory-table" className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] font-bold uppercase tracking-wider font-mono border-b border-slate-100">
                    <th className="py-3 px-5 w-1/4">Product Details</th>
                    <th className="py-3 px-4 w-1/8">
                      <button onClick={() => toggleSort('sku')} className="flex items-center gap-1 hover:text-slate-800 transition-colors">
                        SKU <ArrowUpDown size={11} />
                      </button>
                    </th>
                    <th className="py-3 px-4 w-1/6">Category</th>
                    <th className="py-3 px-4 w-1/8 text-right">
                      <button onClick={() => toggleSort('price')} className="flex items-center gap-1 hover:text-slate-800 transition-colors justify-end w-full">
                        Price <ArrowUpDown size={11} />
                      </button>
                    </th>
                    <th className="py-3 px-4 w-1/8 text-right">Cost</th>
                    <th className="py-3 px-4 w-1/8 text-right">Margin</th>
                    <th className="py-3 px-5 w-1/6 text-center">
                      <button onClick={() => toggleSort('stock')} className="flex items-center gap-1 hover:text-slate-800 transition-colors justify-center w-full">
                        Stock <ArrowUpDown size={11} />
                      </button>
                    </th>
                    <th className="py-3 px-4 w-[100px] text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-sans text-slate-600">
                  {sortedAndFilteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 font-medium font-mono">
                        NO PRODUCTS REGISTERED IN CATALOG
                      </td>
                    </tr>
                  ) : (
                    sortedAndFilteredProducts.map(prod => {
                      const isLow = prod.stock <= prod.minStock && prod.stock > 0;
                      const isOut = prod.stock === 0;
                      const margin = ((prod.price - prod.cost) / prod.price) * 100;

                      return (
                        <tr 
                          key={prod.id} 
                          id={`inventory-row-${prod.id}`}
                          className={`hover:bg-slate-50/50 transition-colors ${isOut ? 'bg-rose-50/20' : isLow ? 'bg-amber-50/10' : ''}`}
                        >
                          <td className="py-3.5 px-5 font-semibold text-slate-800 flex items-center space-x-3.5 truncate">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                              {prod.image ? (
                                <img src={prod.image} alt={prod.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <span className="text-xl">☕</span>
                              )}
                            </div>
                            <div className="truncate">
                              <span className="font-semibold block truncate text-slate-800 max-w-[150px]">{prod.name}</span>
                              <span className="text-[10px] font-mono font-medium text-slate-400 block mt-0.5">Threshold Alert: {prod.minStock}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[11px] truncate text-slate-500">{prod.sku}</td>
                          <td className="py-3.5 px-4">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getProductCategoryColor(prod.category)}`}>
                              {getProductCategoryName(prod.category)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-right">{settings.currency}{prod.price.toFixed(2)}</td>
                          <td className="py-3.5 px-4 font-mono text-slate-500 text-right">{settings.currency}{prod.cost.toFixed(2)}</td>
                          <td className="py-3.5 px-4 text-right">
                            <span className={`font-mono font-medium ${margin >= 50 ? 'text-emerald-600' : 'text-slate-500'}`}>
                              {margin.toFixed(0)}%
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-center">
                            <div className="flex flex-col items-center justify-center">
                              <span className={`font-mono font-bold text-xs ${isOut ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-slate-900'}`}>
                                {prod.stock}
                              </span>
                              {isOut ? (
                                <span className="text-[9px] text-rose-500 font-bold uppercase mt-0.5 flex items-center gap-0.5">
                                  <AlertTriangle size={10} /> OUT OF STOCK
                                </span>
                              ) : isLow ? (
                                <span className="text-[9px] text-amber-500 font-bold uppercase mt-0.5 flex items-center gap-0.5">
                                  <AlertTriangle size={10} /> LOW STOCK
                                </span>
                              ) : (
                                <span className="text-[9px] text-emerald-500 font-bold uppercase mt-0.5 font-mono">Good level</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center justify-center space-x-1.5">
                              <button
                                onClick={() => handleOpenEditProduct(prod)}
                                className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200/60 rounded-lg transition-colors"
                                title="Edit product parameters"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                id={`del-prod-${prod.id}`}
                                onClick={() => { if (confirm(`Delete ${prod.name}?`)) handleDeleteProduct(prod.id); }}
                                className="p-1.5 text-slate-400 hover:text-rose-600 bg-rose-50 hover:bg-rose-100/50 rounded-lg transition-colors"
                                title="Delete product"
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
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 font-mono flex justify-between">
              <span>ACTIVE SKUS: {products.length}</span>
              <span className="flex items-center gap-4">
                <span className="text-amber-600 font-bold flex items-center gap-1">
                  ● LOW STOCK: {products.filter(p => p.stock <= p.minStock && p.stock > 0).length}
                </span>
                <span className="text-rose-600 font-bold flex items-center gap-1">
                  ● OUT OF STOCK: {products.filter(p => p.stock === 0).length}
                </span>
              </span>
            </div>
          </div>
        </>
      ) : (
        /* CATEGORIES TAB */
        <div id="categories-tab-content" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map(cat => {
            const productCount = products.filter(p => p.category === cat.id).length;
            return (
              <div
                key={cat.id}
                id={`cat-card-${cat.id}`}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${cat.color}`}>
                      {cat.name}
                    </span>
                    <button
                      id={`del-cat-${cat.id}`}
                      disabled={productCount > 0}
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-slate-400 p-1.5 hover:bg-slate-50 rounded-lg transition-all"
                      title={productCount > 0 ? "Cannot delete category containing products" : "Delete category"}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 font-mono">ID: {cat.id}</p>
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                  <span className="text-xs text-slate-500 font-medium">Linked Products</span>
                  <span className="font-mono text-slate-800 font-bold text-sm bg-slate-100 px-2.5 py-1 rounded-lg">
                    {productCount} items
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Product Add/Edit Form */}
      <AnimatePresence>
        {productModalOpen && (
          <div id="product-form-modal" className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="font-sans font-bold text-slate-800 text-base">
                  {editingProduct ? 'Edit Catalog Product' : 'Add New Product'}
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
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Product Name *</label>
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
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">SKU Code *</label>
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
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Category *</label>
                      <select
                        id="form-prod-category"
                        value={prodCategory}
                        onChange={(e) => setProdCategory(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 font-semibold text-slate-600"
                      >
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Financials & Stock */}
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Sell Price ({settings.currency}) *</label>
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
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Cost Price ({settings.currency}) *</label>
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
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">In-Stock Count *</label>
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
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Low-Stock Alert Level</label>
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
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Product Image URL (Optional)</label>
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
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="form-submit-prod-btn"
                    className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-sans font-bold text-xs sm:text-sm rounded-xl flex items-center shadow-lg shadow-slate-900/10"
                  >
                    <Check size={16} className="mr-1" />
                    <span>Save Catalog Item</span>
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
          <div id="category-form-modal" className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 space-y-4"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-sans font-bold text-slate-800 text-base flex items-center gap-2">
                  <FolderPlus size={18} className="text-emerald-500" /> Add New Category
                </h3>
                <button onClick={() => setCategoryModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmitCategory} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Category Name *</label>
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
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Visual Theme Color</label>
                  <div className="grid grid-cols-4 gap-2">
                    {categoryColors.map(colorOption => (
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
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm"
                  >
                    Save Category
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
