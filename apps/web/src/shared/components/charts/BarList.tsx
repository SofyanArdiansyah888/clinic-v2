import { chartColor } from '@/shared/components/charts/palette'
import { cn } from '@/shared/lib/cn'

export type BarListItem = {
  key: string
  label: string
  value: number
  /** Fixed colour for this entity (CSS colour); defaults to the categorical slot of its position. */
  color?: string
}

type BarListProps = {
  items: BarListItem[]
  formatValue: (value: number) => string
  emptyText?: string
  className?: string
}

/**
 * Ranked horizontal bars (top treatment, metode pembayaran, status). Label and
 * value stay in text colors; only the bar carries the hue.
 */
export function BarList({ items, formatValue, emptyText = 'Belum ada data', className }: BarListProps) {
  const max = Math.max(0, ...items.map((i) => i.value))
  if (items.length === 0 || max === 0) {
    return <p className={cn('py-8 text-center text-xs text-slate-400', className)}>{emptyText}</p>
  }

  return (
    <ul className={cn('space-y-3', className)}>
      {items.map((item, i) => (
        <li key={item.key} title={`${item.label}: ${formatValue(item.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 text-slate-700">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color ?? chartColor(i) }} />
              <span className="truncate">{item.label}</span>
            </span>
            <span className="shrink-0 font-semibold text-slate-900 tabular-nums">{formatValue(item.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, background: item.color ?? chartColor(i) }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
