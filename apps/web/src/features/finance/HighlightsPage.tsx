import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { apiGet } from '@/shared/api/client'
import { BarChart } from '@/shared/components/charts/BarChart'
import { BarList } from '@/shared/components/charts/BarList'
import { Card } from '@/shared/ui/card'
import { cn } from '@/shared/lib/cn'
import { formatCurrency, formatDate, formatNumber } from '@/shared/lib/formatters'
import { ReportShell, type Periode } from '@/features/laporan/ReportShell'
import { Rp } from '@/features/finance/components/Statement'
import type { AkunSaldo } from '@/features/finance/types'

type Ringkasan = {
  dari: string
  sampai: string
  pendapatan: number
  hpp: number
  laba_kotor: number
  beban_operasional: number
  laba_bersih: number
  margin_kotor: number
  margin_bersih: number
}

type Posisi = {
  per: string
  total_aset: number
  total_kewajiban: number
  total_ekuitas: number
  kas_bank: number
  utang_deposit_pasien: number
  utang_usaha: number
}

type Highlights = {
  periode: Ringkasan
  pembanding: Ringkasan
  tahun_lalu: Ringkasan
  posisi: Posisi
  posisi_pembanding: Posisi
  tren: { bulan: string; pendapatan: number; beban: number; laba_bersih: number }[]
  komposisi_pendapatan: AkunSaldo[]
  beban_terbesar: AkunSaldo[]
}

type FoRingkasan = {
  ringkasan: { kunjungan: number; pasien_baru: number; transaksi: number; pendapatan_bersih: number }
}

const rangeLabel = (r: { dari: string; sampai: string }) => `${formatDate(r.dari)} – ${formatDate(r.sampai)}`

function bulanLabel(bulan: string, full = false) {
  const [y, m] = bulan.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', full ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' })
}

/** Percent change against a base; null when the base is zero (no meaningful %). */
function change(cur: number, base: number) {
  if (base === 0) return null
  return ((cur - base) / Math.abs(base)) * 100
}

function Delta({ cur, base, suffix }: { cur: number; base: number; suffix: string }) {
  const c = change(cur, base)
  if (c === null) return <span className="text-slate-400">— {suffix}</span>
  const up = c >= 0
  return (
    <span className={cn('font-semibold tabular-nums', up ? 'text-emerald-700' : 'text-rose-600')}>
      {up ? '▲' : '▼'} {Math.abs(c).toLocaleString('id-ID', { maximumFractionDigits: 1 })}% <span className="font-normal text-slate-500">{suffix}</span>
    </span>
  )
}

function Tile({ label, value, sub, children }: { label: string; value: number; sub?: string; children: ReactNode }) {
  return (
    <div className="print-keep space-y-1.5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={cn('text-xl font-bold tracking-tight tabular-nums', value < 0 ? 'text-rose-600' : 'text-slate-900')}>
        <Rp value={value} />
      </p>
      {sub ? <p className="text-[11px] text-slate-500">{sub}</p> : null}
      <div className="flex flex-col gap-0.5 text-[11px]">{children}</div>
    </div>
  )
}

function Panel({ title, description, children, className }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('print-keep overflow-hidden', className)}>
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {description ? <p className="text-xs text-slate-500">{description}</p> : null}
      </div>
      <div className="p-4">{children}</div>
    </Card>
  )
}

const th = 'px-3 py-2 text-right text-[11px] font-bold tracking-wider text-slate-500 uppercase first:text-left'
const td = 'px-3 py-2 text-right tabular-nums first:text-left'

function PctCell({ cur, base }: { cur: number; base: number }) {
  const c = change(cur, base)
  if (c === null) return <td className={cn(td, 'text-slate-400')}>—</td>
  return (
    <td className={cn(td, c >= 0 ? 'text-emerald-700' : 'text-rose-600')}>
      {c >= 0 ? '+' : '−'}
      {Math.abs(c).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%
    </td>
  )
}

function Operasional({ periode }: { periode: Periode }) {
  const { data } = useQuery({
    queryKey: ['laporan', '/laporan/fo', 'range', periode.dari, periode.sampai, undefined],
    queryFn: () => apiGet<FoRingkasan>('/laporan/fo', { ...periode }),
  })
  const r = data?.data?.ringkasan
  if (!r) return <p className="text-xs text-slate-400">Memuat data operasional...</p>
  const items = [
    { label: 'Kunjungan', value: formatNumber(r.kunjungan) },
    { label: 'Pasien baru', value: formatNumber(r.pasien_baru) },
    { label: 'Transaksi kasir', value: formatNumber(r.transaksi) },
    { label: 'Rata-rata per transaksi', value: formatCurrency(r.transaksi ? r.pendapatan_bersih / r.transaksi : 0) },
  ]
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="rounded-xl bg-slate-50 p-3">
          <dt className="text-[11px] font-semibold text-slate-500">{i.label}</dt>
          <dd className="text-base font-bold text-slate-900 tabular-nums">{i.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function HighlightsPage() {
  return (
    <ReportShell<Highlights>
      title="Financial Highlights"
      description="Ringkasan kinerja keuangan untuk owner, dibandingkan dengan periode sebelumnya dan tahun lalu"
      endpoint="/finance/laporan/highlights"
      pdf={{ orientation: 'landscape' }}
    >
      {(h, periode) => {
        const p = h.periode
        const vsPrev = `vs ${rangeLabel(h.pembanding)}`
        const vsYear = 'vs tahun lalu'
        const rows: { label: string; key: keyof Ringkasan; pct?: boolean; strong?: boolean }[] = [
          { label: 'Pendapatan', key: 'pendapatan' },
          { label: 'HPP', key: 'hpp' },
          { label: 'Laba kotor', key: 'laba_kotor', strong: true },
          { label: 'Beban operasional', key: 'beban_operasional' },
          { label: 'Laba bersih', key: 'laba_bersih', strong: true },
          { label: 'Margin kotor', key: 'margin_kotor', pct: true },
          { label: 'Margin bersih', key: 'margin_bersih', pct: true },
        ]
        const posisiRows: { label: string; key: keyof Posisi }[] = [
          { label: 'Kas & bank', key: 'kas_bank' },
          { label: 'Total aset', key: 'total_aset' },
          { label: 'Utang usaha', key: 'utang_usaha' },
          { label: 'Utang deposit pasien', key: 'utang_deposit_pasien' },
          { label: 'Total kewajiban', key: 'total_kewajiban' },
          { label: 'Ekuitas', key: 'total_ekuitas' },
        ]
        const pendapatanItems = h.komposisi_pendapatan
          .filter((a) => a.saldo > 0)
          .map((a) => ({ key: String(a.akun.id), label: a.akun.nama, value: a.saldo }))
        const potongan = h.komposisi_pendapatan.filter((a) => a.saldo < 0)

        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="Pendapatan" value={p.pendapatan}>
                <Delta cur={p.pendapatan} base={h.pembanding.pendapatan} suffix={vsPrev} />
                <Delta cur={p.pendapatan} base={h.tahun_lalu.pendapatan} suffix={vsYear} />
              </Tile>
              <Tile label="Laba kotor" value={p.laba_kotor} sub={`Margin ${p.margin_kotor.toLocaleString('id-ID')}%`}>
                <Delta cur={p.laba_kotor} base={h.pembanding.laba_kotor} suffix={vsPrev} />
                <Delta cur={p.laba_kotor} base={h.tahun_lalu.laba_kotor} suffix={vsYear} />
              </Tile>
              <Tile label={p.laba_bersih >= 0 ? 'Laba bersih' : 'Rugi bersih'} value={p.laba_bersih} sub={`Margin ${p.margin_bersih.toLocaleString('id-ID')}%`}>
                <Delta cur={p.laba_bersih} base={h.pembanding.laba_bersih} suffix={vsPrev} />
                <Delta cur={p.laba_bersih} base={h.tahun_lalu.laba_bersih} suffix={vsYear} />
              </Tile>
              <Tile label="Kas & bank" value={h.posisi.kas_bank} sub={`Per ${formatDate(h.posisi.per)}`}>
                <Delta cur={h.posisi.kas_bank} base={h.posisi_pembanding.kas_bank} suffix={`vs ${formatDate(h.posisi_pembanding.per)}`} />
              </Tile>
            </div>

            <Panel title="Operasional" description={`Dari transaksi kasir, ${rangeLabel(periode)}`}>
              <Operasional periode={periode} />
            </Panel>

            <div className="grid gap-4 lg:grid-cols-5">
              <Panel title="Tren pendapatan 12 bulan" className="lg:col-span-3">
                <BarChart
                  data={h.tren.map((t) => ({ key: t.bulan, label: bulanLabel(t.bulan), value: Math.max(0, t.pendapatan) }))}
                  formatValue={formatCurrency}
                  formatLabel={(d) => bulanLabel(d.key, true)}
                />
              </Panel>
              <Panel title="Laba / rugi per bulan" className="lg:col-span-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className={th}>Bulan</th>
                      <th className={th}>Pendapatan</th>
                      <th className={th}>Laba/Rugi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {h.tren.map((t) => (
                      <tr key={t.bulan}>
                        <td className={td}>{bulanLabel(t.bulan)}</td>
                        <td className={td}>{formatCurrency(t.pendapatan)}</td>
                        <td className={td}>
                          <Rp value={t.laba_bersih} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Komposisi pendapatan" description={rangeLabel(p)}>
                <BarList items={pendapatanItems} formatValue={formatCurrency} emptyText="Belum ada pendapatan di periode ini" />
                {potongan.length ? (
                  <p className="mt-3 text-[11px] text-slate-500">
                    Sudah dikurangi {potongan.map((a) => `${a.akun.nama} ${formatCurrency(-a.saldo)}`).join(', ')}.
                  </p>
                ) : null}
              </Panel>
              <Panel title="5 beban terbesar" description={rangeLabel(p)}>
                <BarList
                  items={h.beban_terbesar.map((a) => ({ key: String(a.akun.id), label: a.akun.nama, value: Math.max(0, a.saldo) }))}
                  formatValue={formatCurrency}
                  emptyText="Belum ada beban di periode ini"
                />
              </Panel>
            </div>

            <div className="grid gap-4 lg:grid-cols-5">
              <Panel title="Perbandingan laba rugi" className="lg:col-span-3">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-xs">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className={th}>Pos</th>
                        <th className={th}>{rangeLabel(p)}</th>
                        <th className={th}>{rangeLabel(h.pembanding)}</th>
                        <th className={th}>Δ</th>
                        <th className={th}>{rangeLabel(h.tahun_lalu)}</th>
                        <th className={th}>Δ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((r) => {
                        const cur = p[r.key] as number
                        const prev = h.pembanding[r.key] as number
                        const yoy = h.tahun_lalu[r.key] as number
                        const fmt = (v: number) => (r.pct ? `${v.toLocaleString('id-ID')}%` : <Rp value={v} />)
                        return (
                          <tr key={r.key} className={r.strong ? 'font-bold text-slate-900' : undefined}>
                            <td className={td}>{r.label}</td>
                            <td className={td}>{fmt(cur)}</td>
                            <td className={td}>{fmt(prev)}</td>
                            {r.pct ? <td className={cn(td, 'text-slate-400')}>—</td> : <PctCell cur={cur} base={prev} />}
                            <td className={td}>{fmt(yoy)}</td>
                            {r.pct ? <td className={cn(td, 'text-slate-400')}>—</td> : <PctCell cur={cur} base={yoy} />}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <Panel title="Posisi keuangan" className="lg:col-span-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className={th}>Pos</th>
                      <th className={th}>{formatDate(h.posisi.per)}</th>
                      <th className={th}>{formatDate(h.posisi_pembanding.per)}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {posisiRows.map((r) => (
                      <tr key={r.key}>
                        <td className={td}>{r.label}</td>
                        <td className={td}>
                          <Rp value={h.posisi[r.key] as number} />
                        </td>
                        <td className={td}>
                          <Rp value={h.posisi_pembanding[r.key] as number} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </div>
          </div>
        )
      }}
    </ReportShell>
  )
}
