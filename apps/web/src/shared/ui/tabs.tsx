import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

export type TabItem<T extends string> = {
  value: T
  label: string
  icon?: ReactNode
  /** Small counter shown after the label (e.g. queue size). */
  count?: number
}

type TabsProps<T extends string> = {
  value: T
  onChange: (value: T) => void
  items: TabItem<T>[]
  /** Stretch tabs to fill the row (page-level sections). */
  fullWidth?: boolean
  className?: string
}

/**
 * The one tab / segmented control used across the app: page sections,
 * view-mode toggles and filter switches all share this look.
 */
export function Tabs<T extends string>({ value, onChange, items, fullWidth, className }: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        'max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1',
        fullWidth ? 'flex w-full' : 'inline-flex',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-colors [&_svg]:size-3.5 [&_svg]:shrink-0',
              fullWidth && 'flex-1',
              active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] font-bold tabular-nums',
                  active ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600',
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
