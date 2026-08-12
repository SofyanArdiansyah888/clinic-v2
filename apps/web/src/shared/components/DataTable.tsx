import type { ReactNode } from 'react'
import { EmptyState } from '@/shared/components/EmptyState'
import { TableSkeleton } from '@/shared/ui/skeleton'
import { cn } from '@/shared/lib/cn'

export type Column<T> = {
  key: string
  header: string
  className?: string
  cell: (row: T) => ReactNode
}

type DataTableProps<T> = {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  rowKey: (row: T) => string | number
  className?: string
}

export function DataTable<T>({
  columns,
  data,
  loading,
  emptyTitle,
  emptyDescription,
  rowKey,
  className,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="p-4">
        <TableSkeleton rows={6} cols={Math.min(columns.length, 5)} />
      </div>
    )
  }

  if (!data.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            {columns.map((col) => (
              <th key={col.key} className={cn('px-4 py-3', col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 font-medium">
          {data.map((row) => (
            <tr key={rowKey(row)} className="transition-colors hover:bg-slate-50">
              {columns.map((col) => (
                <td key={col.key} className={cn('px-4 py-3 align-middle text-slate-700', col.className)}>
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
