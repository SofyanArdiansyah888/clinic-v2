import { useQuery } from '@tanstack/react-query'
import { addDays, format, startOfMonth } from 'date-fns'
import { Download, FileDown } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { apiGet } from '@/shared/api/client'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { EmptyState } from '@/shared/components/EmptyState'
import { PageHeader } from '@/shared/components/PageHeader'
import { PrintFooter, PrintHeader } from '@/shared/components/print/PrintDocument'
import { printReport } from '@/shared/lib/print'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { downloadCsv, type CsvValue } from '@/shared/lib/csv'
import { formatDate, todayISO } from '@/shared/lib/formatters'

export type Periode = { dari: string; sampai: string }

const PRESETS: { label: string; range: () => Periode }[] = [
  { label: 'Hari ini', range: () => ({ dari: todayISO(), sampai: todayISO() }) },
  { label: '7 hari', range: () => ({ dari: format(addDays(new Date(), -6), 'yyyy-MM-dd'), sampai: todayISO() }) },
  { label: 'Bulan ini', range: () => ({ dari: format(startOfMonth(new Date()), 'yyyy-MM-dd'), sampai: todayISO() }) },
]

type ReportShellProps<T> = {
  title: string
  description?: string
  endpoint: string
  children: (data: T, periode: Periode) => ReactNode
  // 'per' shows a single "per tanggal" date for point-in-time reports such as a balance sheet.
  mode?: 'range' | 'per'
  // Extra query parameters and the inputs that set them.
  params?: Record<string, unknown>
  filters?: ReactNode
  enabled?: boolean
  // Shown instead of the report while `enabled` is false (e.g. "pick an account first").
  idleMessage?: string
  actions?: ReactNode
  // "PDF" prints the page on A4 with the clinic letterhead; false hides the button.
  // With `majalah`, it instead opens that division's chapter of Majalah Kinerja for the
  // same period and prints it there (A4 landscape magazine).
  pdf?: false | { orientation?: 'portrait' | 'landscape'; majalah?: 'fo' | 'dokter' | 'terapis' | 'apotek' }
}

const inputClass =
  'rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-rose-500 focus:outline-none'

// Period picker + data loading shared by the report pages. The server defaults
// and validates the range (max 1 year); the page starts on the current month.
export function ReportShell<T>({
  title,
  description,
  endpoint,
  children,
  mode = 'range',
  params,
  filters,
  enabled = true,
  idleMessage,
  actions,
  pdf = {},
}: ReportShellProps<T>) {
  const [periode, setPeriode] = useState<Periode>(() => PRESETS[2].range())
  const navigate = useNavigate()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['laporan', endpoint, mode, periode.dari, periode.sampai, params],
    queryFn: () =>
      apiGet<T>(endpoint, mode === 'per' ? { per: periode.sampai, sampai: periode.sampai, ...params } : { ...periode, ...params }),
    enabled: enabled && !!periode.dari && !!periode.sampai,
  })

  const errorMessage =
    (error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message ?? 'Gagal memuat laporan'

  const periodeLabel =
    mode === 'per' ? `Per ${formatDate(periode.sampai)}` : `${formatDate(periode.dari)} – ${formatDate(periode.sampai)}`
  const fileName = `${title} ${mode === 'per' ? periode.sampai : `${periode.dari} sd ${periode.sampai}`}`

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        className="print-hide"
        actions={
          actions || pdf ? (
            <>
              {actions}
              {pdf ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!data?.data}
                  onClick={() =>
                    pdf.majalah
                      ? navigate({
                          to: '/laporan/majalah',
                          search: { bab: pdf.majalah, dari: periode.dari, sampai: periode.sampai, cetak: 1 },
                        })
                      : printReport(fileName, pdf.orientation)
                  }
                >
                  <FileDown />
                  PDF
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      />
      <PrintHeader title={title} periode={periodeLabel} />

      <div className="print-hide flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        {filters}
        <div className={mode === 'per' ? 'hidden' : 'space-y-1.5'}>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500" htmlFor="lap-dari">
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
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500" htmlFor="lap-sampai">
            {mode === 'per' ? 'Per Tanggal' : 'Sampai'}
          </label>
          <input
            id="lap-sampai"
            type="date"
            value={periode.sampai}
            min={mode === 'per' ? undefined : periode.dari}
            onChange={(e) =>
              setPeriode((p) => ({ dari: mode === 'per' && e.target.value < p.dari ? e.target.value : p.dari, sampai: e.target.value }))
            }
            className={inputClass}
          />
        </div>
        <div className={mode === 'per' ? 'hidden' : 'flex flex-wrap gap-2'}>
          {PRESETS.map((p) => (
            <Button key={p.label} type="button" variant="outline" size="sm" onClick={() => setPeriode(p.range())}>
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {!enabled && idleMessage ? <EmptyState title="Pilih filter" description={idleMessage} /> : null}
      {isLoading ? <p className="text-sm text-slate-500">Memuat laporan...</p> : null}
      {isError ? <div className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{errorMessage}</div> : null}
      {data?.data ? children(data.data, periode) : null}
      {data?.data && pdf ? <PrintFooter /> : null}
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
          className="print-hide"
          disabled={data.length === 0}
          onClick={() =>
            downloadCsv(
              `${filename}_${periode.dari}_${periode.sampai}`,
              columns.map((c) => c.header),
              data.map((r) => columns.map((c) => c.csv(r))),
            )
          }
        >
          <Download />
          Export CSV
        </Button>
      </div>
      <DataTable columns={columns} data={data} rowKey={rowKey} emptyTitle="Tidak ada data" emptyDescription="Belum ada data di periode ini." />
    </Card>
  )
}

export function KpiGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 }) {
  // A4 is narrower than the lg breakpoint, so paper gets the wide layout explicitly.
  return (
    <div
      className={
        cols === 3
          ? 'grid grid-cols-2 gap-3 lg:grid-cols-3 print:grid-cols-3 print:gap-2'
          : 'grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4 print:gap-2'
      }
    >
      {children}
    </div>
  )
}
