// Central theme colors for charts and UI (red/white focused)
export const PRIMARY = '#D12F36'
export const PRIMARY_DARK = '#9F262C'
export const PRIMARY_LIGHT = '#F48A92'
export const PRIMARY_BG = '#F8E2E5'
export const WHITE = '#FFFFFF'

export const CHART_PALETTE = [PRIMARY, PRIMARY_LIGHT, PRIMARY_DARK, '#FFFFFF']

export const STAGE_COLORS: Record<string, string> = {
  INQUIRY: PRIMARY_LIGHT,
  QUALIFIED: PRIMARY,
  PROPOSAL: PRIMARY_DARK,
  NEGOTIATION: '#D6453B',
  WON: '#FFB4B4',
  LOST: PRIMARY_DARK,
  ON_HOLD: '#F3CFCF',
}

export const PIE_COLORS = [PRIMARY, PRIMARY_LIGHT]

export const SEVERITY_COLORS: Record<string, string> = {
  LOW: '#FFECEC',
  MEDIUM: '#FFBFBF',
  HIGH: PRIMARY,
  CRITICAL: PRIMARY_DARK,
}

export default {
  PRIMARY,
  PRIMARY_DARK,
  PRIMARY_LIGHT,
  PRIMARY_BG,
  WHITE,
  CHART_PALETTE,
  STAGE_COLORS,
  PIE_COLORS,
  SEVERITY_COLORS,
}
