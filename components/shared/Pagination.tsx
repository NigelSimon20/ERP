'use client'

import { Button } from '@/components/ui/button'
import { ChevronLeftRegular, ChevronRightRegular } from '@fluentui/react-icons';

interface PaginationProps {
  page: number
  pages: number
  total: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, pages, total, onPageChange }: PaginationProps) {
  if (pages <= 1) return null

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
      <p className="text-muted-foreground">
        Page {page} of {pages} &middot; {total} total
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeftRegular className="h-3 w-3 mr-1" /> Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Next <ChevronRightRegular className="h-3 w-3 ml-1" />
        </Button>
      </div>
    </div>
  )
}
