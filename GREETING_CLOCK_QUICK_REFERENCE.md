# Real-time Greeting & Clock System - Quick Reference

## Component Selection Guide

Choose the right component for your use case:

### 📍 Where to Use Each Component

| Location | Component | Best For |
|----------|-----------|----------|
| **Dashboard Header** | `<GreetingHeader />` | Main dashboard greeting with full info |
| **Top Navigation Bar** | `<TopNavigationClock />` | Header bar with time and optional date |
| **Sidebar/Panel** | `<InlineGreetingClock />` | Greeting + time in sidebar |
| **Status Bar/Footer** | `<StatusBarClock />` | Minimal time display |
| **Dashboard Widget** | `<DashboardClockWidget />` | Standalone widget with large time |
| **Card Display** | `<GreetingCard />` | Simple greeting with icon |
| **Time Display** | `<LiveClock />` | Just time and date |
| **Tight Spaces** | `<CompactClockWidget />` | Minimal widget version |

---

## Quick Code Snippets

### 1. Add to Dashboard Header
```tsx
// app/(dashboard)/dashboard/page.tsx
import { GreetingHeader } from '@/components/dashboard/GreetingHeader'

export default function DashboardPage() {
  return (
    <div>
      <GreetingHeader 
        userName="John Doe"
        layout="horizontal"
        showGreetingIcon={true}
        showClockIcon={true}
      />
      {/* Rest of dashboard */}
    </div>
  )
}
```

### 2. Add to Top Navigation
```tsx
// components/layout/Header.tsx
import { TopNavigationClock } from '@/components/dashboard/ClockVariants'

export function Header() {
  return (
    <header className="flex justify-between items-center px-6 py-4">
      <h1>Raven Shield</h1>
      <TopNavigationClock showDate={false} />
    </header>
  )
}
```

### 3. Add to Sidebar
```tsx
// components/layout/Sidebar.tsx
import { InlineGreetingClock } from '@/components/dashboard/ClockVariants'

export function Sidebar() {
  return (
    <aside className="bg-gray-50 p-4 space-y-6">
      <nav>{/* Links */}</nav>
      <InlineGreetingClock userName="Sarah" />
    </aside>
  )
}
```

### 4. Add to Footer/Status Bar
```tsx
// components/layout/Footer.tsx
import { StatusBarClock } from '@/components/dashboard/ClockVariants'

export function Footer() {
  return (
    <footer className="bg-gray-100 px-6 py-3 flex justify-between">
      <span>Raven Shield ERP</span>
      <StatusBarClock />
    </footer>
  )
}
```

### 5. Add Dashboard Widget
```tsx
// app/(dashboard)/dashboard/page.tsx
import { DashboardClockWidget } from '@/components/dashboard/DashboardClockWidget'

export default function Dashboard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <DashboardClockWidget 
        title="Current Time"
        userName="John"
        showGreeting={true}
      />
      {/* Other widgets */}
    </div>
  )
}
```

---

## Greeting Phases

```
┌─────────────────────────────────────────────────┐
│ 5:00 AM - 11:59 AM  → Morning  [☀️ Amber]       │
├─────────────────────────────────────────────────┤
│ 12:00 PM - 4:59 PM  → Afternoon [☁️ Blue]       │
├─────────────────────────────────────────────────┤
│ 5:00 PM - 8:59 PM   → Evening  [☁️ Orange]      │
├─────────────────────────────────────────────────┤
│ 9:00 PM - 4:59 AM   → Night    [🌙 Indigo]     │
└─────────────────────────────────────────────────┘
```

### Greeting Messages

**Morning (5:00 - 11:59)**
- Message: "Good morning"
- Subtext: "Ready to start the day?"

**Afternoon (12:00 - 16:59)**
- Message: "Good afternoon"
- Subtext: "Keep up the great work."

**Evening (17:00 - 20:59)**
- Message: "Good evening"
- Subtext: "Wrapping up for the day?"

**Night (21:00 - 04:59)**
- Message: "Good night"
- Subtext: "Working late? Stay focused."

---

## Component Props

### GreetingHeader
```tsx
<GreetingHeader
  userName="John"              // Optional
  showGreetingIcon={true}      // Optional
  showClockIcon={true}         // Optional
  layout="horizontal"          // "horizontal" | "vertical"
  compact={false}              // Optional
/>
```

### TopNavigationClock
```tsx
<TopNavigationClock
  showDate={false}             // Optional
  className=""                 // Optional
/>
```

### InlineGreetingClock
```tsx
<InlineGreetingClock
  userName="John"              // Optional
  className=""                 // Optional
/>
```

### StatusBarClock
```tsx
<StatusBarClock
  className=""                 // Optional
/>
```

### DashboardClockWidget
```tsx
<DashboardClockWidget
  title="Current Time"         // Optional
  showGreeting={true}          // Optional
  userName="John"              // Optional
/>
```

### GreetingCard
```tsx
<GreetingCard
  userName="John"              // Optional
  showIcon={true}              // Optional
/>
```

### LiveClock
```tsx
<LiveClock
  showIcon={true}              // Optional
  showDate={true}              // Optional
  compact={false}              // Optional
/>
```

### CompactClockWidget
```tsx
<CompactClockWidget />
```

---

## Hooks API

### useGreeting
```tsx
import { useGreeting } from '@/hooks/useGreeting'

export function MyComponent() {
  const { phrase, subMessage, phase } = useGreeting()
  
  return (
    <div>
      <h1>{phrase}</h1>
      <p>{subMessage}</p>
      <span>{phase}</span>
    </div>
  )
}
```

### useClock
```tsx
import { useClock } from '@/hooks/useClock'

export function MyComponent() {
  const { timeString, dateString, dateShort, now } = useClock()
  
  return (
    <div>
      <p>{timeString}</p>
      <p>{dateString}</p>
      <p>{dateShort}</p>
    </div>
  )
}
```

---

## Common Layouts

### Layout 1: Dashboard with Header
```tsx
export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Greeting header */}
      <GreetingHeader userName="John" layout="horizontal" />
      
      {/* Main content */}
      <div className="grid grid-cols-3 gap-4">
        <DashboardClockWidget showGreeting={true} />
        <Card>Stats</Card>
        <Card>Charts</Card>
      </div>
    </div>
  )
}
```

### Layout 2: App with Navigation
```tsx
export default function AppLayout({ children }) {
  return (
    <div>
      {/* Header */}
      <header className="flex justify-between items-center px-6 py-4 border-b">
        <h1>Raven Shield</h1>
        <TopNavigationClock showDate={false} />
      </header>
      
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-gray-50 p-4">
          <InlineGreetingClock userName="User" />
        </aside>
        
        {/* Main content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
      
      {/* Footer */}
      <footer className="bg-gray-100 px-6 py-3 flex justify-between border-t">
        <span>2026</span>
        <StatusBarClock />
      </footer>
    </div>
  )
}
```

### Layout 3: Simple Greeting Page
```tsx
export default function Page() {
  return (
    <div className="space-y-4">
      <GreetingCard userName="John" showIcon={true} />
      <LiveClock showIcon={true} showDate={true} />
    </div>
  )
}
```

---

## Icon Reference

All icons from `react-icons/fi`:

| Icon | Usage |
|------|-------|
| `FiSun` | Morning phase |
| `FiCloud` | Afternoon/Evening phase |
| `FiMoon` | Night phase |
| `FiClock` | Time indicator |
| `FiCalendar` | Date indicator |

---

## Styling with Tailwind

Components use standard Tailwind utilities:

- **Text**: `text-sm`, `text-xs`, `text-2xl`, `text-5xl`
- **Font**: `font-mono`, `font-semibold`, `font-bold`
- **Colors**: `text-gray-900`, `text-gray-600`, `text-amber-500`, `text-blue-400`, `text-orange-400`, `text-indigo-500`
- **Background**: `bg-white`, `bg-gray-50`, `bg-gray-100`
- **Spacing**: `gap-2`, `gap-3`, `gap-4`, `p-3`, `p-4`, `p-6`
- **Borders**: `border`, `border-gray-200`, `rounded-lg`

All fully responsive with mobile-first design.

---

## Integration Steps

### Step 1: Copy Hook Files
- Copy `hooks/useGreeting.ts` to your project
- Copy `hooks/useClock.ts` to your project

### Step 2: Copy Component Files
- Copy `components/dashboard/GreetingCard.tsx`
- Copy `components/dashboard/LiveClock.tsx`
- Copy `components/dashboard/GreetingHeader.tsx`
- Copy `components/dashboard/ClockVariants.tsx`
- Copy `components/dashboard/DashboardClockWidget.tsx`

### Step 3: Import and Use
```tsx
import { GreetingHeader } from '@/components/dashboard/GreetingHeader'

// Use in your pages
<GreetingHeader userName={user?.name} />
```

### Step 4: No Configuration Needed
Everything works out of the box!

---

## Performance Tips

1. **Memoize props**: If passing same props to multiple instances
2. **Use compact mode**: For space-constrained areas
3. **Hide icons**: If not needed for cleaner look
4. **Lazy load**: Import components where needed
5. **Combine hooks**: Use both in same component when possible

---

## Customization Quick Starts

### Change Update Frequency
**Edit `hooks/useClock.ts`:**
```typescript
const interval = setInterval(() => setNow(new Date()), 100)  // 100ms instead of 1000ms
```

### Change Greeting Messages
**Edit `hooks/useGreeting.ts`:**
```typescript
const PHASE_CONFIG: Record<TimePhase, { phrase: string; subMessage: string }> = {
  morning: {
    phrase: 'Your custom greeting',
    subMessage: 'Your custom message'
  },
  // ...
}
```

### Change Colors
Edit component's `phaseIcons` object:
```typescript
const phaseIcons: Record<string, React.ReactNode> = {
  morning: <FiSun className="w-8 h-8 text-yellow-600" />,
  // ...
}
```

### Use Different Icons
Replace react-icons imports:
```typescript
import { BsSun } from 'react-icons/bs'
import { MdWbSunny } from 'react-icons/md'
```

---

## Troubleshooting

### Component not updating?
- Check browser console for errors
- Ensure component is inside `<ClientProvider>` if needed
- Verify `'use client'` directive present

### Time not showing?
- Check that `date-fns` is installed
- Verify useEffect cleanup is working
- Check browser DevTools Performance tab

### Styling issues?
- Ensure Tailwind CSS is configured
- Check for CSS conflicts
- Use `!important` for overrides (last resort)

### Props not working?
- Verify you're passing correct prop names
- Check TypeScript errors in IDE
- Look at component implementation for available props

---

## Files Quick Reference

```
✅ hooks/useGreeting.ts
   ↳ Export: useGreeting()
   ↳ Returns: { phrase, subMessage, phase }

✅ hooks/useClock.ts
   ↳ Export: useClock()
   ↳ Returns: { timeString, dateString, dateShort, now }

✅ components/dashboard/GreetingCard.tsx
   ↳ Export: GreetingCard component

✅ components/dashboard/LiveClock.tsx
   ↳ Export: LiveClock component

✅ components/dashboard/GreetingHeader.tsx
   ↳ Export: GreetingHeader component

✅ components/dashboard/ClockVariants.tsx
   ↳ Exports: TopNavigationClock, StatusBarClock, InlineGreetingClock

✅ components/dashboard/DashboardClockWidget.tsx
   ↳ Exports: DashboardClockWidget, CompactClockWidget
```

---

## Next.js App Router Integration

### In Page Components
```tsx
// app/(dashboard)/dashboard/page.tsx
'use client'

import { GreetingHeader } from '@/components/dashboard/GreetingHeader'

export default function DashboardPage() {
  return <GreetingHeader userName="John" />
}
```

### In Layout Components
```tsx
// app/(dashboard)/layout.tsx
'use client'

import { GreetingHeader } from '@/components/dashboard/GreetingHeader'

export default function DashboardLayout({ children }) {
  return (
    <div>
      <GreetingHeader />
      {children}
    </div>
  )
}
```

### In Shared Components
```tsx
// components/layout/Header.tsx
'use client'

import { TopNavigationClock } from '@/components/dashboard/ClockVariants'

export function Header() {
  return <TopNavigationClock />
}
```

---

**Status**: ✅ Ready to use  
**Last Updated**: 2026-06-27  
**Version**: 1.0.0
