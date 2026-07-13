'use client'

import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Sidebar } from './Sidebar'

interface MobileNavProps {
  open: boolean
  onClose: () => void
  role: string
}

export function MobileNav({ open, onClose, role }: MobileNavProps) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="left" className="p-0 w-64">
        <Sidebar role={role} onClose={onClose} />
      </SheetContent>
    </Sheet>
  )
}
