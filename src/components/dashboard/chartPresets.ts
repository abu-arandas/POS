// Axis and grid settings shared by the dashboard charts. They are prop objects
// rather than wrapper components on purpose: Recharts reads the *type* of each
// direct child of a chart to decide what to render, so an axis hidden inside a
// wrapper is an axis Recharts never sees.

/** Plot area for the horizontal bar charts (best sellers, category share). */
export const horizontalBarMargin = { top: 0, right: 20, left: 20, bottom: 0 } as const;

/** Plot area for the revenue/profit area charts. */
export const trendChartMargin = { top: 10, right: 10, left: -20, bottom: 0 } as const;

/** Dashed grid behind a horizontal bar chart: vertical rules only. */
export const horizontalBarGrid = {
  strokeDasharray: '4 4',
  horizontal: false,
  stroke: '#1e293b',
} as const;

/** Dashed grid behind an area chart: horizontal rules only. */
export const trendChartGrid = {
  strokeDasharray: '4 4',
  vertical: false,
  stroke: '#1e293b',
} as const;

/** Numeric axis of a horizontal bar chart. */
export const barValueAxis = {
  type: 'number',
  stroke: '#475569',
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

/**
 * Category axis of a horizontal bar chart. Callers set `width` themselves —
 * it has to fit the longest label, which differs per chart.
 */
export const barCategoryAxis = {
  dataKey: 'name',
  type: 'category',
  stroke: '#94a3b8',
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

/**
 * Time axis of an area chart. Callers set `dy` themselves, which spaces the
 * labels against the chart height they chose.
 */
export const trendTimeAxis = {
  dataKey: 'label',
  stroke: '#475569',
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

/** Value axis of an area chart. Callers set `dx` for the same reason. */
export const trendValueAxis = {
  stroke: '#475569',
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;
