import { RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import type { Periode } from '@/shared/lib/listFilters'

/**
 * Filter row above a list: fields wrap onto new lines on narrow screens and the
 * reset button stays at the end of the row.
 */
export function FilterBar({
  children,
  onReset,
  canReset,
  className,
}: {
  children: ReactNode
  onReset?: () => void
  canReset?: boolean
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label="Filter"
      className={cn('flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm', className)}
    >
      {children}
      {onReset ? (
        <Button type="button" variant="outline" className="h-10 shrink-0" disabled={!canReset} onClick={onReset}>
          <RotateCcw />
          Reset
        </Button>
      ) : null}
    </div>
  )
}

export function FilterField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-[160px] flex-1 space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        {label}
      </label>
      {children}
    </div>
  )
}

/** Inclusive date range; picking a start after the end moves the end along. */
export function PeriodeFilter({
  value,
  onChange,
  idPrefix,
  label = 'Periode',
}: {
  value: Periode
  onChange: (value: Periode) => void
  idPrefix: string
  label?: string
}) {
  return (
    <FilterField label={label} htmlFor={`${idPrefix}-dari`} className="min-w-[260px] flex-[2]">
      <div className="flex items-center gap-2">
        <Input
          id={`${idPrefix}-dari`}
          type="date"
          className="min-w-0"
          aria-label="Dari tanggal"
          value={value.dari}
          max={value.sampai || undefined}
          onChange={(e) => {
            const dari = e.target.value
            onChange({ dari, sampai: value.sampai && dari > value.sampai ? dari : value.sampai })
          }}
        />
        <span className="shrink-0 text-xs text-slate-400">s/d</span>
        <Input
          id={`${idPrefix}-sampai`}
          type="date"
          className="min-w-0"
          aria-label="Sampai tanggal"
          value={value.sampai}
          min={value.dari || undefined}
          onChange={(e) => onChange({ ...value, sampai: e.target.value })}
        />
      </div>
    </FilterField>
  )
}

export type FilterOption = { value: string; label: string }

export function FilterSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  options: FilterOption[]
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="ui-input flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus-visible:border-rose-600 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
