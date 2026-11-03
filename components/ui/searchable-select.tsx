'use client'
import * as React from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { CheckmarkRegular, ChevronDownRegular } from '@fluentui/react-icons'

export interface SearchableSelectOption { value: string; label: string }

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
}

// Drop-in for a Radix <Select> where the list is long enough to need
// type-to-filter (customers, suppliers). Keystrokes go to a real input, so
// they can't fall through to other fields in the form while the list is open.
export function SearchableSelect({
  options, value, onValueChange,
  placeholder = 'Select…', searchPlaceholder = 'Search…', emptyText = 'No matches',
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronDownRegular className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {options.map((o) => (
              <CommandItem
                key={o.value}
                // cmdk filters on `value`; include the id so duplicate names stay distinct
                value={`${o.label} ${o.value}`}
                onSelect={() => { onValueChange(o.value); setOpen(false) }}
              >
                <CheckmarkRegular className={cn('mr-2 h-4 w-4', o.value === value ? 'opacity-100' : 'opacity-0')} />
                {o.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
