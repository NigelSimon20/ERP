// Converts a hex color (as stored by Company.headerColor/sidebarColor/
// buttonColor/etc, via <input type="color">) into the space-separated HSL
// triplet format app/globals.css's shadcn tokens already use (e.g.
// "--primary: 0 72% 51%"), so a company override can plug into the same
// `hsl(var(--x))` convention everywhere else in the app. Pure math, no
// Node-only APIs -- safe to import from a Server Component (app/(dashboard)/
// layout.tsx) or a client component (the Branding tab's live preview).
export function hexToHslTriplet(hex: string): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16) / 255
  const g = parseInt(clean.substring(2, 4), 16) / 255
  const b = parseInt(clean.substring(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break
      case g: h = ((b - r) / d + 2) * 60; break
      default: h = ((r - g) / d + 4) * 60
    }
  }

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}
