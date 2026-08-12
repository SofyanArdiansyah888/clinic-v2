import { cn } from '@/shared/lib/cn'

const STATUS_CLASS: Record<string, { label: string; className: string }> = {
  menunggu: { label: 'Menunggu', className: 'status-badge-menunggu' },
  waiting: { label: 'Menunggu', className: 'status-badge-menunggu' },
  dipanggil: { label: 'Dipanggil', className: 'status-badge-dipanggil' },
  diproses: { label: 'Diproses', className: 'status-badge-diproses' },
  proses: { label: 'Diproses', className: 'status-badge-diproses' },
  processing: { label: 'Diproses', className: 'status-badge-diproses' },
  bayar: { label: 'Ke Kasir', className: 'status-badge-bayar' },
  unpaid: { label: 'Belum Lunas', className: 'status-badge-bayar' },
  draft: { label: 'Draft', className: 'status-badge-bayar' },
  selesai: { label: 'Selesai', className: 'status-badge-selesai' },
  paid: { label: 'Lunas', className: 'status-badge-selesai' },
  aktif: { label: 'Aktif', className: 'status-badge-selesai' },
  active: { label: 'Aktif', className: 'status-badge-selesai' },
  true: { label: 'Aktif', className: 'status-badge-selesai' },
  batal: { label: 'Batal', className: 'status-badge-batal' },
  cancelled: { label: 'Dibatalkan', className: 'status-badge-batal' },
  dibatalkan: { label: 'Dibatalkan', className: 'status-badge-batal' },
  nonaktif: { label: 'Nonaktif', className: 'status-badge-batal' },
  inactive: { label: 'Nonaktif', className: 'status-badge-batal' },
  false: { label: 'Nonaktif', className: 'status-badge-batal' },
}

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
