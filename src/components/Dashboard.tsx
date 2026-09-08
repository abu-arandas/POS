import { useTranslation } from 'react-i18next';
import {
  CategoryShareChart,
  DashboardHeader,
  KpiRow,
  OperatorPanel,
  PaymentMethodsPanel,
  PurchasingPanel,
  SalesTrendChart,
  TopProductsChart,
  useDashboardMetrics,
} from './dashboard/index';

/**
 * Sales dashboard: revenue and order trends, top products, and stock alerts
 * for the selected period.
 *
 * The figures are derived in useDashboardMetrics and each panel lives in
 * components/dashboard/; this module is the layout that arranges them.
 */
export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const {
    settings,
    chartMode,
    cloudLive,
    range,
    setRange,
    rangeTxns,
    kpis,
    salesTrendData,
    topProductsData,
    categoryShareData,
    paymentMethodsMap,
    totalSalesVolume,
    operatorRows,
    poReport,
    exportRange,
  } = useDashboardMetrics(t, i18n.language);

  return (
    <div
      id="dashboard-root"
      className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-[#020617] p-6 transition-colors duration-300"
    >
      <DashboardHeader
        range={range}
        onRangeChange={setRange}
        canExport={rangeTxns.length > 0}
        onExport={exportRange}
        cloudLive={cloudLive}
      />

      <div id="dashboard-content" className="flex-1 overflow-y-auto space-y-6 pe-1 pb-6">
        <KpiRow kpis={kpis} currency={settings.currency} />

        <SalesTrendChart data={salesTrendData} currency={settings.currency} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <TopProductsChart data={topProductsData} currency={settings.currency} />
          <CategoryShareChart data={categoryShareData} currency={settings.currency} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PaymentMethodsPanel
            byMethod={paymentMethodsMap}
            totalVolume={totalSalesVolume}
            currency={settings.currency}
            chartMode={chartMode}
          />
          <OperatorPanel rows={operatorRows} currency={settings.currency} />
        </div>

        <PurchasingPanel report={poReport} currency={settings.currency} />
      </div>
    </div>
  );
}
