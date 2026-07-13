'use client'

import { FaSort, FaSortUp, FaSortDown } from 'react-icons/fa'
import { MdOutlineTableRows } from 'react-icons/md'

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
          <div key={i} className="h-12 bg-gray-100 rounded" />
        ))}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <MdOutlineTableRows size={40} className="mx-auto mb-2 text-gray-200" />
        <p>{emptyMessage ?? 'No records found'}</p>
      </div>
    )
  }

  const pageSize = pagination?.pageSize ?? 25
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pageSize)) : 1

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${col.className ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row, i) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row)}
                className={`${
                  i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                } ${onRowClick ? 'cursor-pointer hover:bg-blue-50/50' : ''} transition-colors duration-100`}
              >
                {columns.map(col => (
                  <td key={col.key} className={`px-4 py-3 text-gray-700 ${col.className ?? ''}`}>
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-500">
            Showing {((pagination.page - 1) * pageSize) + 1}–{Math.min(pagination.page * pageSize, pagination.total)} of {pagination.total}
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => pagination.onPageChange(Math.max(1, pagination.page - 1))}
              disabled={pagination.page === 1}
              className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100"
            >
              Prev
            </button>
            <span className="px-3 py-1 text-xs text-[#CC0000] font-medium">
              {pagination.page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => pagination.onPageChange(Math.min(totalPages, pagination.page + 1))}
              disabled={pagination.page === totalPages}
              className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
