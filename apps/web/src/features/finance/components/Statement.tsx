import { Download } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { cn } from '@/shared/lib/cn'
import { downloadCsv, type CsvValue } from '@/shared/lib/csv'
import { formatCurrency } from '@/shared/lib/formatters'
import type { AkunSaldo } from '@/features/finance/types'

// Money with negatives in parentheses, the usual style in financial statements.
export function Rp({ value, className }: { value: number; className?: string }) {
  const neg = value < 0
  return (
    <span className={cn('tabular-nums', neg && 'text-rose-600', className)}>
      {neg ? `(${formatCurrency(-value)})` : formatCurrency(value)}
    </span>
  )
}

type SectionProps = {
  title: string
  rows: AkunSaldo[]
  extra?: { label: string; value: number }[]
  total: number
  totalLabel: string
}

export function StatementSection({ title, rows, extra, total, totalLabel }: SectionProps) {
  return (
    <div>
      <h4 className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-extrabold tracking-wider text-slate-600 uppercase">
        {title}
      </h4>
      <ul className="divide-y divide-slate-100 text-xs">
        {rows.length === 0 && !extra?.length ? <li className="px-4 py-2.5 text-slate-400">Tidak ada saldo</li> : null}
        {rows.map((r) => (
          <li key={r.akun.id} className="flex items-center justify-between gap-3 px-4 py-2">
            <span>
              <span className="font-mono text-[11px] text-rose-700">{r.akun.kode}</span> {r.akun.nama}
            </span>
            <Rp value={r.saldo} />
          </li>
        ))}
        {extra?.map((x) => (
          <li key={x.label} className="flex items-center justify-between gap-3 px-4 py-2 italic">
            <span>{x.label}</span>
            <Rp value={x.value} />
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t-2 border-slate-200 px-4 py-2.5 text-xs font-extrabold text-slate-900">
        <span>{totalLabel}</span>
        <Rp value={total} />
      </div>
    </div>
  )
}

type StatementCardProps = {
  title: string
  description?: string
  children: ReactNode
  csv?: { filename: string; headers: string[]; rows: CsvValue[][] }
}

export function StatementCard({ title, description, children, csv }: StatementCardProps) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {description ? <p className="text-xs text-slate-500">{description}</p> : null}
        </div>
        {csv ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadCsv(csv.filename, csv.headers, csv.rows)}>
            <Download className="h-3.5 w-3.5" />
            Ekspor CSV
          </Button>
        ) : null}
      </div>
      {children}
    </Card>
  )
}
