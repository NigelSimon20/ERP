'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { CalendarLtrRegular } from '@fluentui/react-icons'
import { useDashboardFilter } from '@/lib/dashboard-filter-context'

export function DateRangeSelector() {
  const { dateRange, setDateRange } = useDashboardFilter()
  const [open, setOpen] = useState(false)

  const label =
    dateRange.from.toDateString() === dateRange.to.toDateString()
      ? format(dateRange.from, 'dd MMM yyyy')
      : `${format(dateRange.from, 'dd MMM yyyy')} – ${format(dateRange.to, 'dd MMM yyyy')}`

  function handleSelect(range: DateRange | undefined) {
    if (!range?.from) return
    setDateRange({ from: range.from, to: range.to ?? range.from })
    if (range.to) setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="hidden lg:flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-foreground bg-muted/50 border border-border rounded-lg hover:bg-muted transition-colors duration-200"
        >
          <CalendarLtrRegular className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="whitespace-nowrap">{label}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-auto p-0">
        <Calendar
          mode="range"
          selected={{ from: dateRange.from, to: dateRange.to }}
          onSelect={handleSelect}
          numberOfMonths={2}
          defaultMonth={dateRange.from}
        />
      </PopoverContent>
    </Popover>
  )
}
