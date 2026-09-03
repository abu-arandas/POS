// One file per tab. They shared a single 807-line module only because they were
// extracted together in phase 2; nothing is shared between them but the import
// header, so the module was five unrelated screens in a trench coat.
export { InventoryProductsTab } from './ProductsTab';
export type { InventoryProductsTabProps } from './ProductsTab';
export { InventoryCategoriesTab } from './CategoriesTab';
export type { InventoryCategoriesTabProps } from './CategoriesTab';
export { InventorySuppliersTab } from './SuppliersTab';
export type { InventorySuppliersTabProps } from './SuppliersTab';
export { InventoryPurchaseOrdersTab } from './PurchaseOrdersTab';
export type { InventoryPurchaseOrdersTabProps } from './PurchaseOrdersTab';
export { InventoryStockLogTab } from './StockLogTab';
export type { InventoryStockLogTabProps } from './StockLogTab';
export { CategoryFormModal } from './CategoryFormModal';
export type { CategoryColorOption, CategoryFormModalProps } from './CategoryFormModal';
export { ProductFormModal } from './ProductFormModal';
export type { ProductFormModalProps } from './ProductFormModal';
export { PurchaseOrderFormModal } from './PurchaseOrderFormModal';
export type { PurchaseOrderDraftLine, PurchaseOrderFormModalProps } from './PurchaseOrderFormModal';
export { ReceiveStockModal } from './ReceiveStockModal';
export type { ReceiveStockModalProps } from './ReceiveStockModal';
export { SupplierFormModal } from './SupplierFormModal';
export type { SupplierFormModalProps } from './SupplierFormModal';
