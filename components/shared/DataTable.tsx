'use client'
import { ArrowSortRegular, ChevronDownRegular, ChevronUpRegular, TableRegular } from '@fluentui/react-icons';

export interface Column<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  sortable?: boolean
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  onRowClick?: (row: T) => void
  pagination?: {
    page: number
    total: number
    pageSize?: number
    onPageChange: (page: number) => void
  }
  emptyMessage?: string
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  loading,
  onRowClick,
  pagination,
  emptyMessage,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded" />
        ))}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <TableRegular fontSize={40} className="mx-auto mb-2 text-muted" />
        <p>{emptyMessage ?? 'No records found'}</p>
      </div>
    )
  }

  const pageSize = pagination?.pageSize ?? 25
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pageSize)) : 1

  return (
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-muted/50">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider ${col.className ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {data.map((row, i) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row)}
                className={`${
                  i % 2 === 0 ? 'bg-card' : 'bg-muted/30'
                } ${onRowClick ? 'cursor-pointer hover:bg-muted/60' : ''} transition-colors duration-100`}
              >
                {columns.map(col => (
                  <td key={col.key} className={`px-4 py-3 text-foreground ${col.className ?? ''}`}>
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/50">
          <p className="text-xs text-muted-foreground">
            Showing {((pagination.page - 1) * pageSize) + 1}–{Math.min(pagination.page * pageSize, pagination.total)} of {pagination.total}
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => pagination.onPageChange(Math.max(1, pagination.page - 1))}
              disabled={pagination.page === 1}
              className="px-3 py-1 text-xs rounded border border-border disabled:opacity-40 hover:bg-muted"
            >
              Prev
            </button>
            <span className="px-3 py-1 text-xs text-primary font-medium">
              {pagination.page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => pagination.onPageChange(Math.min(totalPages, pagination.page + 1))}
              disabled={pagination.page === totalPages}
              className="px-3 py-1 text-xs rounded border border-border disabled:opacity-40 hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
