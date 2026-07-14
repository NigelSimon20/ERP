// Central theme colors for charts and UI (Ravenshield red/neutral enterprise palette).
// Flat, enterprise styling: series colors are limited to red + grayscale only.
export const PRIMARY = '#DC2626'
export const PRIMARY_DARK = '#B91C1C'
export const PRIMARY_LIGHT = '#FEE2E2'
export const PRIMARY_BG = '#FEF2F2'
export const WHITE = '#FFFFFF'

// Grayscale tones for chart gridlines/axes/neutral series segments
export const GRAY_DARK = '#374151'
export const GRAY = '#9CA3AF'
export const GRAY_LIGHT = '#E5E7EB'

// Subtle gridlines + muted axis labels for recharts <CartesianGrid>/<XAxis>/<YAxis>
export const CHART_GRID_STROKE = GRAY_LIGHT
export const CHART_AXIS_TICK = { fontSize: 11, fill: GRAY }
export const CHART_TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 10,
  border: `1px solid ${GRAY_LIGHT}`,
  boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
}

export const CHART_PALETTE = [PRIMARY, GRAY_DARK, GRAY, GRAY_LIGHT]

export const STAGE_COLORS: Record<string, string> = {
  INQUIRY: GRAY_LIGHT,
  QUALIFIED: GRAY,
  PROPOSAL: PRIMARY_LIGHT,
  NEGOTIATION: PRIMARY,
  WON: GRAY_DARK,
  LOST: GRAY,
  ON_HOLD: GRAY_LIGHT,
}

export const PIE_COLORS = [PRIMARY, GRAY_LIGHT]

export const SEVERITY_COLORS: Record<string, string> = {
  LOW: GRAY_LIGHT,
  MEDIUM: GRAY,
  HIGH: PRIMARY,
  CRITICAL: PRIMARY_DARK,
}

export default {
  PRIMARY,
  PRIMARY_DARK,
  PRIMARY_LIGHT,
  PRIMARY_BG,
  WHITE,
  GRAY_DARK,
  GRAY,
  GRAY_LIGHT,
  CHART_GRID_STROKE,
  CHART_AXIS_TICK,
  CHART_TOOLTIP_STYLE,
  CHART_PALETTE,
  STAGE_COLORS,
  PIE_COLORS,
  SEVERITY_COLORS,
}
