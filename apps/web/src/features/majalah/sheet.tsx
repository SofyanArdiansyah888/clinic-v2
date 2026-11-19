import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { apiGet } from '@/shared/api/client'
import { cn } from '@/shared/lib/cn'
import { formatCurrency, formatNumber } from '@/shared/lib/formatters'
import type { Insight, Tone } from './insights'

// Building blocks for magazine-style printed reports: one <section> = one A4 landscape page.
// Used by Majalah Kinerja and by every report's PDF (see ReportShell `magazine`).

export const SHEET =
  'sheet relative mx-auto flex h-[186mm] w-[273mm] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'

export type Kpi = { label: string; value: number; prev?: number; money?: boolean; percent?: boolean; lowerIsBetter?: boolean; note?: string }

export function useKlinikNama() {
  return (
    useQuery({
      queryKey: ['pengaturan', 'klinik'],
      queryFn: () => apiGet<{ nama?: string }>('/pengaturan/klinik'),
      staleTime: 10 * 60_000,
    }).data?.data?.nama || 'Klinik'
  )
}

export function SheetFooter({ page, left }: { page: number | string; left: string }) {
  return (
    <div className="mt-auto flex items-center justify-between border-t border-slate-200 px-8 py-2 text-[9px] tracking-wide text-slate-400 uppercase">
      <span>{left}</span>
      <span className="tabular-nums">{page}</span>
    </div>
  )
}

/** Dark title band at the top of a chapter page. */
export function ChapterBand({ kicker, title, tagline, right }: { kicker: string; title: string; tagline?: string; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between bg-slate-900 px-8 py-5 text-white">
      <div>
        <p className="text-[10px] font-bold tracking-[0.3em] text-rose-300 uppercase">{kicker}</p>
        <h2 className="text-3xl leading-tight font-extrabold tracking-tight">{title}</h2>
        {tagline ? <p className="text-xs text-white/60">{tagline}</p> : null}
      </div>
      {right ? <div className="text-right text-xs text-white/70">{right}</div> : null}
    </div>
  )
}

/** Slim band for continuation pages (rincian). */
export function ContinuationBand({ title, subtitle, right }: { title: string; subtitle?: string; right?: string }) {
  return (
    <div className="flex items-end justify-between border-b-2 border-slate-900 px-8 pt-6 pb-2">
      <div>
        <h2 className="text-lg leading-tight font-extrabold tracking-tight text-slate-900">{title}</h2>
        {subtitle ? <p className="text-[11px] text-slate-500">{subtitle}</p> : null}
      </div>
      {right ? <p className="text-[11px] text-slate-500">{right}</p> : null}
    </div>
  )
}

export const SectionLabel = ({ children, className }: { children: ReactNode; className?: string }) => (
  <p className={cn('mb-2 text-[10px] font-bold tracking-[0.12em] text-slate-500 uppercase', className)}>{children}</p>
)

const fmtVal = (k: Kpi, v: number) => (k.money ? formatCurrency(v) : k.percent ? `${formatNumber(v)}%` : formatNumber(v))

export function KpiTile({ k, prevLabel = 'sebelumnya' }: { k: Kpi; prevLabel?: string }) {
  const c = k.prev === undefined || k.prev === 0 ? null : ((k.value - k.prev) / Math.abs(k.prev)) * 100
  const good = c === null ? null : (c >= 0) !== !!k.lowerIsBetter
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-[10px] font-bold tracking-[0.1em] text-slate-500 uppercase">{k.label}</p>
      <p className={cn('mt-1 text-[22px] leading-tight font-extrabold tracking-tight tabular-nums', k.value < 0 ? 'text-rose-600' : 'text-slate-900')}>
        {fmtVal(k, k.value)}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-1 text-[10px] text-slate-500">
        {c !== null ? (
          <span className={cn('inline-flex items-center font-bold', good ? 'text-emerald-700' : 'text-rose-600')}>
            {c >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {formatNumber(Math.abs(c))}%
          </span>
        ) : null}
        <span>
          {k.prev !== undefined ? `${prevLabel}: ${fmtVal(k, k.prev)}` : null}
          {k.note ? `${k.prev !== undefined ? ' · ' : ''}${k.note}` : null}
        </span>
      </p>
    </div>
  )
}

export const TONE: Record<Tone, { icon: ReactNode; cls: string; label: string }> = {
  naik: { icon: <ArrowUpRight className="h-3.5 w-3.5" />, cls: 'bg-emerald-50 text-emerald-700', label: 'Naik' },
  turun: { icon: <ArrowDownRight className="h-3.5 w-3.5" />, cls: 'bg-rose-50 text-rose-600', label: 'Turun' },
  perhatian: { icon: <AlertTriangle className="h-3.5 w-3.5" />, cls: 'bg-amber-50 text-amber-700', label: 'Perhatian' },
  info: { icon: <Info className="h-3.5 w-3.5" />, cls: 'bg-slate-100 text-slate-500', label: 'Info' },
}

export function InsightList({ items, prefix }: { items: { insight: Insight; divisi?: string }[]; prefix?: boolean }) {
  if (!items.length) return <p className="text-xs text-slate-400">Belum ada data yang cukup untuk dianalisa.</p>
  return (
    <ul className="space-y-2">
      {items.map(({ insight, divisi }, i) => (
        <li key={i} className="flex gap-2 text-[11.5px] leading-snug text-slate-700">
          <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full', TONE[insight.tone].cls)} title={TONE[insight.tone].label}>
            {TONE[insight.tone].icon}
          </span>
          <span>
            {prefix && divisi ? <b className="text-slate-900">{divisi}: </b> : null}
            {insight.text}
          </span>
        </li>
      ))}
    </ul>
  )
}

// ── Paged detail tables ──

export type DetailColumn = { header: string; align?: 'right'; width?: string; mono?: boolean }
export type DetailLine =
  | { kind: 'section'; label: string; note?: string }
  | { kind: 'row'; cells: ReactNode[]; muted?: boolean }
  | { kind: 'subtotal' | 'total'; label: string; cells: ReactNode[] }

/** Rows per landscape page; every line is one fixed-height row (long text is truncated). */
export const LINES_PER_PAGE = 27

export function paginate<T>(items: T[], size = LINES_PER_PAGE): T[][] {
  if (!items.length) return [[]]
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size))
  return pages
}

/**
 * The detail part of a report spread over as many sheets as it needs. A section label that
 * would end a page is carried to the next one so a group never starts at the bottom.
 */
export function DetailSheets({
  title,
  subtitle,
  columns,
  lines,
  firstPage,
  footer,
}: {
  title: string
  subtitle?: string
  columns: DetailColumn[]
  lines: DetailLine[]
  firstPage: number
  footer: string
}) {
  const pages: DetailLine[][] = []
  let cur: DetailLine[] = []
  for (const line of lines) {
    if (cur.length >= LINES_PER_PAGE || (line.kind === 'section' && cur.length >= LINES_PER_PAGE - 2)) {
      pages.push(cur)
      cur = []
    }
    cur.push(line)
  }
  pages.push(cur)

  return (
    <>
      {pages.map((page, pi) => (
        <section key={pi} className={SHEET} aria-label={`${title} halaman ${pi + 1}`}>
          <ContinuationBand title={title} subtitle={subtitle} right={pages.length > 1 ? `Bagian ${pi + 1} dari ${pages.length}` : undefined} />
          <div className="min-h-0 flex-1 px-8 pt-3">
            <table className="w-full table-fixed border-collapse text-[10.5px]">
              <colgroup>
                {columns.map((c, i) => (
                  <col key={i} style={c.width ? { width: c.width } : undefined} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-slate-300 text-[9px] font-bold tracking-wider text-slate-500 uppercase">
                  {columns.map((c, i) => (
                    <th key={i} className={cn('h-6 px-1.5 text-left', c.align === 'right' && 'text-right')}>
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="py-6 text-center text-slate-400">
                      Tidak ada data pada periode ini.
                    </td>
                  </tr>
                ) : (
                  page.map((line, li) => <DetailRow key={li} line={line} columns={columns} />)
                )}
              </tbody>
            </table>
          </div>
          <SheetFooter page={firstPage + pi} left={footer} />
        </section>
      ))}
    </>
  )
}

function DetailRow({ line, columns }: { line: DetailLine; columns: DetailColumn[] }) {
  const cell = (c: DetailColumn | undefined, extra?: string) =>
    cn('h-[5.4mm] truncate px-1.5', c?.align === 'right' && 'text-right tabular-nums', c?.mono && 'font-mono', extra)
  if (line.kind === 'section') {
    return (
      <tr className="border-b border-slate-300 bg-slate-100">
        <td colSpan={columns.length} className="h-[5.4mm] truncate px-1.5 text-[10.5px] font-extrabold text-slate-900">
          {line.label}
          {line.note ? <span className="ml-2 font-normal text-slate-500">{line.note}</span> : null}
        </td>
      </tr>
    )
  }
  if (line.kind === 'row') {
    return (
      <tr className={cn('border-b border-slate-100', line.muted ? 'text-slate-400 italic' : 'text-slate-700')}>
        {line.cells.map((v, i) => (
          <td key={i} className={cell(columns[i])}>
            {v}
          </td>
        ))}
      </tr>
    )
  }
  const lead = columns.length - line.cells.length
  return (
    <tr className={cn(line.kind === 'total' ? 'bg-slate-900 font-extrabold text-white' : 'border-b-2 border-slate-300 font-bold text-slate-900')}>
      <td colSpan={lead} className="h-[5.4mm] truncate px-1.5">
        {line.label}
      </td>
      {line.cells.map((v, i) => (
        <td key={i} className={cell(columns[lead + i])}>
          {v}
        </td>
      ))}
    </tr>
  )
}
