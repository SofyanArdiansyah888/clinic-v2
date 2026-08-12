import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

interface KpiCardProps {
  label: string
  value: string | number
  icon?: ReactNode
  iconClass?: string
  valueClass?: string
  className?: string
}

export function KpiCard({
  label,
  value,
  icon,
  iconClass = 'bg-slate-100 text-slate-600',
  valueClass = 'text-slate-900',
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:shadow',
        className,
      )}
    >
      <div className="space-y-1">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <h3 className={cn('text-2xl font-bold tracking-tight', valueClass)}>{value}</h3>
      </div>
      {icon ? (
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base', iconClass)}>
          {icon}
        </div>
      ) : null}
    </div>
  )
}
