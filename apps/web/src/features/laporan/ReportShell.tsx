import { useQuery } from '@tanstack/react-query'
import { addDays, format, startOfMonth } from 'date-fns'
import { Download } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { apiGet } from '@/shared/api/client'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { PageHeader } from '@/shared/components/PageHeader'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { downloadCsv, type CsvValue } from '@/shared/lib/csv'
import { todayISO } from '@/shared/lib/formatters'

export type Periode = { dari: string; sampai: string }

const PRESETS: { label: string; range: () => Periode }[] = [
  { label: 'Hari ini', range: () => ({ dari: todayISO(), sampai: todayISO() }) },
  { label: '7 hari', range: () => ({ dari: format(addDays(new Date(), -6), 'yyyy-MM-dd'), sampai: todayISO() }) },
  { label: 'Bulan ini', range: () => ({ dari: format(startOfMonth(new Date()), 'yyyy-MM-dd'), sampai: todayISO() }) },
]

type ReportShellProps<T> = {
  title: string
  description: string
  endpoint: string
  children: (data: T, periode: Periode) => ReactNode
}

const inputClass =
  'rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-teal-500 focus:outline-none'

// Period picker + data loading shared by the report pages. The server defaults
// and validates the range (max 1 year); the page starts on the current month.
export function ReportShell<T>({ title, description, endpoint, children }: ReportShellProps<T>) {
  const [periode, setPeriode] = useState<Periode>(() => PRESETS[2].range())

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['laporan', endpoint, periode.dari, periode.sampai],
    queryFn: () => apiGet<T>(endpoint, periode),
    enabled: !!periode.dari && !!periode.sampai,
  })

  const errorMessage =
    (error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message ?? 'Gagal memuat laporan'

  return (
    <div className="space-y-5">
      <PageHeader title={title} description={description} />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500" htmlFor="lap-dari">
            Dari
          </label>
          <input
            id="lap-dari"
            type="date"
            value={periode.dari}
            max={periode.sampai}
            onChange={(e) => setPeriode((p) => ({ ...p, dari: e.target.value }))}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500" htmlFor="lap-sampai">
            Sampai
          </label>
          <input
            id="lap-sampai"
            type="date"
            value={periode.sampai}
            min={periode.dari}
            onChange={(e) => setPeriode((p) => ({ ...p, sampai: e.target.value }))}
            className={inputClass}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.label} type="button" variant="outline" size="sm" onClick={() => setPeriode(p.range())}>
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? <p className="text-sm text-slate-500">Memuat laporan...</p> : null}
      {isError ? <div className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{errorMessage}</div> : null}
      {data?.data ? children(data.data, periode) : null}
    </div>
  )
}

export type ReportColumn<T> = Column<T> & { csv: (row: T) => CsvValue }

type ReportTableProps<T> = {
  title: string
  description?: string
  columns: ReportColumn<T>[]
  rows: T[] | null | undefined
  rowKey: (row: T) => string | number
  filename: string
  periode: Periode
}

export function ReportTable<T>({ title, description, columns, rows, rowKey, filename, periode }: ReportTableProps<T>) {
  const data = rows ?? []
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {description ? <p className="text-xs text-slate-500">{description}</p> : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={data.length === 0}
          onClick={() =>
            downloadCsv(
              `${filename}_${periode.dari}_${periode.sampai}`,
              columns.map((c) => c.header),
              data.map((r) => columns.map((c) => c.csv(r))),
            )
          }
        >
          <Download className="h-3.5 w-3.5" />
          Ekspor CSV
        </Button>
      </div>
      <DataTable columns={columns} data={data} rowKey={rowKey} emptyTitle="Tidak ada data" emptyDescription="Belum ada data pada periode ini." />
    </Card>
  )
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
}
