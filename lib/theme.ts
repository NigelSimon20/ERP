// Central theme colours for charts and UI: the Infinity Nexa palette
// (www.nexainventory.com): brand blue, sky, and slate neutrals.
export const PRIMARY = '#1E40AF'
export const PRIMARY_DARK = '#1B3A96'
export const PRIMARY_LIGHT = '#DBEAFE'
export const PRIMARY_BG = '#EFF6FF'
export const SKY = '#38BDF8'
export const WHITE = '#FFFFFF'

// Semantic colours (not brand): severity and status
export const DANGER = '#DF202E'
export const WARNING = '#E49E22'
export const SUCCESS = '#02985F'

// Grayscale tones for chart gridlines/axes/neutral series segments
export const GRAY_DARK = '#334155'
export const GRAY = '#94A3B8'
export const GRAY_LIGHT = '#E2E8F0'

// Subtle gridlines + muted axis labels for recharts <CartesianGrid>/<XAxis>/<YAxis>
export const CHART_GRID_STROKE = GRAY_LIGHT
export const CHART_AXIS_TICK = { fontSize: 11, fill: GRAY }
export const CHART_TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 10,
  border: `1px solid ${GRAY_LIGHT}`,
  boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
}

export const CHART_PALETTE = [PRIMARY, SKY, GRAY_DARK, GRAY, PRIMARY_LIGHT]

// Keys match the real `LeadStatus` enum values exactly (prisma/schema.prisma)
// — a prior version of this map used different, fictional stage names
// (INQUIRY/PROPOSAL/ON_HOLD) that never matched any actual lead status, so
// most real leads silently fell back to a generic gray everywhere this was
// consumed.
export const STAGE_COLORS: Record<string, string> = {
  NEW: GRAY_LIGHT,
  CONTACTED: GRAY,
  QUALIFIED: PRIMARY_LIGHT,
  PROPOSAL_SENT: PRIMARY_LIGHT,
  NEGOTIATION: PRIMARY,
  WON: SUCCESS,
  LOST: GRAY,
}

export const PIE_COLORS = [PRIMARY, SKY, GRAY_LIGHT]

export const SEVERITY_COLORS: Record<string, string> = {
  // Severity is semantic, not brand: amber and red, never the brand blue.
  LOW: GRAY,
  MEDIUM: SKY,
  HIGH: WARNING,
  CRITICAL: DANGER,
}

export default {
  PRIMARY,
  PRIMARY_DARK,
  PRIMARY_LIGHT,
  PRIMARY_BG,
  SKY,
  WHITE,
  DANGER,
  WARNING,
  SUCCESS,
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
