# Real-time Greeting & Clock System - Implementation Guide

## Overview

A complete real-time greeting and live clock system for Ravenshield Security ERP. Displays dynamic greetings based on time of day and a live-updating clock throughout the entire application.

---

## Components Created

### 1. **Hooks**

#### `hooks/useGreeting.ts`
Custom hook that returns time-based greeting information.

**Returns:**
```typescript
{
  phrase: string        // e.g., "Good morning"
  subMessage: string    // e.g., "Ready to start the day?"
  phase: TimePhase      // 'morning' | 'afternoon' | 'evening' | 'night'
}
```

**Time Phases:**
- **Morning:** 5:00 - 11:59 - "Good morning, Ready to start the day?"
- **Afternoon:** 12:00 - 16:59 - "Good afternoon, Keep up the great work."
- **Evening:** 17:00 - 20:59 - "Good evening, Wrapping up for the day?"
- **Night:** 21:00 - 4:59 - "Good night, Working late? Stay focused."

**Usage:**
```typescript
import { useGreeting } from '@/hooks/useGreeting'

export function MyComponent() {
  const { phrase, subMessage, phase } = useGreeting()
  return <h1>{phrase}</h1>
}
```

---

#### `hooks/useClock.ts`
Custom hook that returns live-updating time and date strings.

**Returns:**
```typescript
{
  timeString: string    // e.g., "14:35:22"
  dateString: string    // e.g., "Saturday, 27 June 2026"
  dateShort: string     // e.g., "Sat, 27 Jun"
  now: Date            // Current date object
}
```

**Updates:** Every second (1000ms interval)

**Usage:**
```typescript
import { useClock } from '@/hooks/useClock'

export function MyComponent() {
  const { timeString, dateString } = useClock()
  return <div>{timeString} - {dateString}</div>
}
```

---

### 2. **Display Components**

#### `components/dashboard/GreetingCard.tsx`
Displays greeting with phase icon and optional user name.

**Props:**
```typescript
interface GreetingCardProps {
  userName?: string      // Optional user name
  showIcon?: boolean     // Default: true
}
```

**Features:**
- Phase icon (Sun, Cloud, Moon)
- Personalized greeting
- Subheading message

**Usage:**
```tsx
<GreetingCard userName="John" showIcon={true} />
```

**Output:**
```
[Sun Icon] Good morning, John
           Ready to start the day?
```

---

#### `components/dashboard/LiveClock.tsx`
Displays live-updating time and date.

**Props:**
```typescript
interface LiveClockProps {
  showIcon?: boolean     // Default: true
  showDate?: boolean     // Default: true
  compact?: boolean      // Default: false
}
```

**Variations:**
- **Full:** Time + date with clock icon
- **Compact:** Time only with smaller styling

**Usage:**
```tsx
// Full display
<LiveClock showIcon={true} showDate={true} />

// Compact time-only
<LiveClock compact={true} />
```

**Output:**
```
[Clock] 14:35:22
        Saturday, 27 June 2026
```

---

#### `components/dashboard/GreetingHeader.tsx`
Combined greeting and clock header for dashboard/pages.

**Props:**
```typescript
interface GreetingHeaderProps {
  userName?: string          // User name
  showGreetingIcon?: boolean // Default: true
  showClockIcon?: boolean    // Default: true
  layout?: 'horizontal' | 'vertical'  // Default: 'horizontal'
  compact?: boolean          // Default: false
}
```

**Layouts:**
- **Horizontal:** Greeting on left, clock on right
- **Vertical:** Greeting above, clock below
- **Compact:** Minimal space version

**Usage:**
```tsx
// Horizontal layout
<GreetingHeader 
  userName="John" 
  layout="horizontal" 
  showGreetingIcon={true}
  showClockIcon={true}
/>

// Vertical compact
<GreetingHeader 
  userName="Sarah" 
  layout="vertical" 
  compact={true}
/>
```

---

#### `components/dashboard/ClockVariants.tsx`
Multiple compact clock variants for different contexts.

**Exported Components:**

**1. TopNavigationClock**
- For header/navigation bars
- Shows time with optional date
- Very compact

```tsx
<TopNavigationClock showDate={false} />
```

**2. StatusBarClock**
- Ultra-compact for status bars
- Time only
- Smallest format

```tsx
<StatusBarClock />
```

**3. InlineGreetingClock**
- For sidebars/panels
- Greeting with time and date
- Styled as small card

```tsx
<InlineGreetingClock userName="John" />
```

---

#### `components/dashboard/DashboardClockWidget.tsx`
Widget-style clock display for dashboards.

**Components:**

**1. DashboardClockWidget**
- Standalone widget
- Large time display
- Optional greeting section
- 5-7 inch card format

```tsx
<DashboardClockWidget 
  title="Current Time"
  userName="John"
  showGreeting={true}
/>
```

**2. CompactClockWidget**
- Minimal widget version
- Just time and date
- For tight dashboard spaces

```tsx
<CompactClockWidget />
```

---

## Integration Examples

### Example 1: Dashboard Page
```tsx
// app/(dashboard)/dashboard/page.tsx

import { GreetingHeader } from '@/components/dashboard/GreetingHeader'
import { DashboardClockWidget } from '@/components/dashboard/DashboardClockWidget'
import { useAuth } from '@/hooks/useAuth'

export default function DashboardPage() {
  const { user } = useAuth()

  return (
    <div className="space-y-6">
      {/* Header with greeting and clock */}
      <GreetingHeader 
        userName={user?.name} 
        layout="horizontal"
      />

      {/* Dashboard grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Clock widget */}
        <DashboardClockWidget 
          title="Current Time"
          userName={user?.name}
          showGreeting={true}
        />

        {/* Other widgets */}
        <div>KPI Card</div>
        <div>Chart</div>
      </div>
    </div>
  )
}
```

---

### Example 2: Top Navigation Bar
```tsx
// components/layout/TopNav.tsx

import { TopNavigationClock } from '@/components/dashboard/ClockVariants'

export function TopNav() {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
      <div className="text-xl font-bold">Raven Shield</div>
      
      <div className="flex items-center gap-4">
        {/* Profile */}
        <div>Profile Dropdown</div>
        
        {/* Clock in navigation */}
        <TopNavigationClock showDate={false} />
      </div>
    </header>
  )
}
```

---

### Example 3: Sidebar
```tsx
// components/layout/Sidebar.tsx

import { InlineGreetingClock } from '@/components/dashboard/ClockVariants'

export function Sidebar() {
  return (
    <aside className="w-64 bg-gray-50 p-4 space-y-6">
      {/* Navigation items */}
      <nav className="space-y-2">
        <a href="/dashboard">Dashboard</a>
        <a href="/tasks">Tasks</a>
      </nav>

      {/* Clock/greeting in sidebar */}
      <InlineGreetingClock userName="John" />
    </aside>
  )
}
```

---

### Example 4: Status Bar / Footer
```tsx
// components/layout/StatusBar.tsx

import { StatusBarClock } from '@/components/dashboard/ClockVariants'

export function StatusBar() {
  return (
    <footer className="bg-gray-100 border-t border-gray-200 px-6 py-3 flex justify-between items-center">
      <div className="text-sm text-gray-600">
        Ravenshield ERP v1.0
      </div>
      
      <StatusBarClock />
    </footer>
  )
}
```

---

### Example 5: Full Dashboard Layout
```tsx
// app/(dashboard)/dashboard/page.tsx

import { GreetingHeader } from '@/components/dashboard/GreetingHeader'
import { DashboardClockWidget } from '@/components/dashboard/DashboardClockWidget'
import { GreetingCard } from '@/components/dashboard/GreetingCard'
import { LiveClock } from '@/components/dashboard/LiveClock'

export default function EnhancedDashboard() {
  return (
    <div className="space-y-6 p-6">
      {/* Main greeting header */}
      <GreetingHeader 
        userName="John Doe"
        layout="horizontal"
        showGreetingIcon={true}
        showClockIcon={true}
      />

      {/* Cards row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Time card on left */}
        <DashboardClockWidget 
          title="System Time"
          userName="John"
          showGreeting={true}
        />

        {/* Other card on right */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h3 className="font-semibold mb-4">Quick Stats</h3>
          <div className="space-y-2">
            <p>Active Users: 12</p>
            <p>Pending Tasks: 5</p>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-2xl font-bold mb-4">Dashboard Content</h2>
        {/* More content */}
      </div>
    </div>
  )
}
```

---

## Styling Notes

### Colors
- **Morning:** Amber/Orange (FiSun icon)
- **Afternoon:** Blue (FiCloud icon)
- **Evening:** Orange (FiCloud icon)
- **Night:** Indigo (FiMoon icon)

### Icons (react-icons/fi)
- `FiSun` - Morning
- `FiCloud` - Afternoon/Evening
- `FiMoon` - Night
- `FiClock` - Time
- `FiCalendar` - Date

### Responsive Classes
All components use Tailwind CSS and are fully responsive:
- Mobile-first design
- Adapts to different screen sizes
- Compact mode for small screens

---

## Performance Considerations

### Update Intervals
- **useGreeting:** Updates every 60 seconds (checks if phase changed)
- **useClock:** Updates every 1 second (real-time display)

### Memory
- Minimal state management
- Efficient interval cleanup
- No unnecessary re-renders with `useCallback` memoization

### CPU
- Clock updates don't block UI
- Intervals cleared on component unmount
- No memory leaks

---

## Customization

### Add New Time Phases
Edit `hooks/useGreeting.ts`:

```typescript
const PHASE_CONFIG: Record<TimePhase, { phrase: string; subMessage: string }> = {
  morning: {
    phrase: 'Custom phrase',
    subMessage: 'Custom message'
  },
  // ... more phases
}
```

### Change Update Frequency
**For greeting (every 5 minutes):**
```typescript
const interval = setInterval(() => {
  const newPhase = getPhase(new Date().getHours())
  setPhase(prev => prev !== newPhase ? newPhase : prev)
}, 5 * 60 * 1000)  // 5 minutes
```

**For clock (every 100ms):**
```typescript
const interval = setInterval(() => setNow(new Date()), 100)
```

### Custom Icons
Replace `react-icons/fi` imports with different icon libraries:
```typescript
import { BsSun } from 'react-icons/bs'  // Bootstrap Icons
import { MdWbSunny } from 'react-icons/md'  // Material Design
```

---

## File Locations

```
hooks/
├── useGreeting.ts          - Greeting logic hook
└── useClock.ts             - Clock logic hook

components/dashboard/
├── GreetingCard.tsx        - Greeting display card
├── LiveClock.tsx           - Live clock display
├── GreetingHeader.tsx      - Combined greeting header
├── ClockVariants.tsx       - Compact variants
└── DashboardClockWidget.tsx - Widget versions
```

---

## API Reference

### useGreeting Hook
```typescript
const { phrase, subMessage, phase } = useGreeting()

// Returns:
// phrase: "Good morning" | "Good afternoon" | "Good evening" | "Good night"
// subMessage: Contextual message based on time
// phase: "morning" | "afternoon" | "evening" | "night"
```

### useClock Hook
```typescript
const { timeString, dateString, dateShort, now } = useClock()

// Returns:
// timeString: "HH:mm:ss" format
// dateString: "EEEE, d MMMM yyyy" format
// dateShort: "EEE, d MMM" format
// now: Current Date object
```

---

## Browser Compatibility

All components work on:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers

---

## Known Limitations

1. Time is based on client-side system time (not server time)
2. For distributed teams, consider syncing with server time
3. Daylight saving time changes happen at system level

---

## Future Enhancements

- [ ] Server-side time sync for accuracy
- [ ] Multiple timezone support
- [ ] 12-hour/24-hour format toggle
- [ ] Custom greeting messages
- [ ] Notification at time milestones
- [ ] Time analytics/logging

---

## Testing

### Manual Testing
1. Refresh page - greeting/clock should update immediately
2. Wait 1 hour - greeting phrase should change
3. Inspect Network tab - only component updates, no extra requests
4. Check console - no warnings or errors

### Browser DevTools
```javascript
// Test greeting change
setInterval(() => {
  console.log(new Date().getHours())
}, 60000)

// Test clock update
const { useClock } = await import('@/hooks/useClock')
const clock = useClock()
console.log(clock.timeString)
```

---

**Status:** ✅ Production Ready  
**Last Updated:** 2026-06-27  
**Version:** 1.0.0
