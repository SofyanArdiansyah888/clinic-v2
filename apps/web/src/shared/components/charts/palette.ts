// Categorical chart colours, independent of the app theme (see --chart-* in styles/globals.css;
// the dark theme swaps in steps tuned for dark surfaces). The order is part of the palette:
// it keeps neighbouring colours distinguishable for colour-blind readers, so slots are
// assigned in order and never cycled. Past 8 items, use CHART_OTHER.

export const CHART_SLOTS = 8

export const CHART_OTHER = 'var(--chart-other)'

/** Colour for the n-th category (0-based). */
export function chartColor(index: number) {
  return index >= 0 && index < CHART_SLOTS ? `var(--chart-${index + 1})` : CHART_OTHER
}

/** Named slots for single-series charts so related measures keep distinct colours. */
export const SERIES = {
  pendapatan: chartColor(0), // blue
  kunjungan: chartColor(1), // orange
  laba: chartColor(2), // aqua
  beban: chartColor(7), // red
} as const
