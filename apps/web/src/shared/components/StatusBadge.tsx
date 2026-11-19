import { cn } from '@/shared/lib/cn'
import { STATUS_CLASS } from '@/shared/lib/status'

type StatusBadgeProps = {
  status?: string | boolean | null
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const key = String(status ?? '').toLowerCase()
  const mapped = STATUS_CLASS[key] ?? {
    label: status === true ? 'Aktif' : status === false ? 'Nonaktif' : status ? String(status) : '-',
    className: 'status-badge-diproses',
  }

  return (
    <span className={cn('status-badge', mapped.className, className)}>
      <span aria-hidden>•</span>
      {mapped.label}
    </span>
  )
}
