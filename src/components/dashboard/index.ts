// The dashboard split by panel. Dashboard.tsx is the layout; useDashboardMetrics
// derives every figure from the stores, and each panel below just renders what
// it is handed — so a panel can be read, and tested, on its own.
export { DashboardHeader } from './DashboardHeader';
export type { DashboardHeaderProps } from './DashboardHeader';
export { KpiRow } from './KpiRow';
export type { KpiRowProps } from './KpiRow';
export { SalesTrendChart } from './SalesTrendChart';
export type { SalesTrendChartProps, SalesTrendPoint } from './SalesTrendChart';
export { TopProductsChart } from './TopProductsChart';
export type { TopProductsChartProps, TopProductRow } from './TopProductsChart';
export { CategoryShareChart } from './CategoryShareChart';
export type { CategoryShareChartProps } from './CategoryShareChart';
export { PaymentMethodsPanel } from './PaymentMethodsPanel';
export type { PaymentMethodsPanelProps } from './PaymentMethodsPanel';
export { OperatorPanel } from './OperatorPanel';
export type { OperatorPanelProps } from './OperatorPanel';
export { PurchasingPanel } from './PurchasingPanel';
export type { PurchasingPanelProps } from './PurchasingPanel';
export { ChartTooltip } from './ChartTooltip';
export type { ChartTooltipProps } from './ChartTooltip';
export { useDashboardMetrics, PAYMENT_METHOD_ORDER } from './useDashboardMetrics';
export type { DashboardRange, CategoryShareRow, PaymentMethodRow } from './useDashboardMetrics';
