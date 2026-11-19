import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { apiGet } from '@/shared/api/client'
import { BarChart } from '@/shared/components/charts/BarChart'
import { BarList } from '@/shared/components/charts/BarList'
import { formatCurrency, formatDate } from '@/shared/lib/formatters'
import { financeInsights, type Insight } from '@/features/majalah/insights'
import { periodeLabel, previousPeriode, type Periode } from '@/features/majalah/data'
import {
  ChapterBand,
  ContinuationBand,
  DetailSheets,
  InsightList,
  KpiTile,
  SectionLabel,
  SHEET,
  SheetFooter,
  useKlinikNama,
  type DetailColumn,
  type DetailLine,
  type Kpi,
} from '@/features/majalah/sheet'
import {
  SOURCE_LABEL,
  TIPE_LABEL,
  type AkunSaldo,
  type BukuBesarSemuaData,
  type HighlightsData,
  type HighlightsPosisi,
  type HighlightsRingkasan,
  type LabaRugiData,
  type NeracaData,
  type NeracaSaldoData,
  type TipeAkun,
} from '@/features/finance/types'
import { bukuBesarInsights, labaRugiInsights, neracaInsights, neracaSaldoInsights } from './insights'

// Magazine-style PDFs for the Keuangan reports: a summary page (KPIs with comparison, charts,
// automatic findings, a notes/approval box) followed by the full detail over as many pages as needed.

const money = (n: number) => (n < 0 ? `(${formatCurrency(-n)})` : formatCurrency(n))
const TIPE_ORDER: TipeAkun[] = ['aset', 'kewajiban', 'ekuitas', 'pendapatan', 'beban']

type Chart = { title: string; node: ReactNode }

function SummarySheet({
  title,
  tagline,
  periodeText,
  compareText,
  kpis,
  charts,
  insights,
  status,
  footer,
}: {
  title: string
  tagline: string
  periodeText: string
  compareText?: string
  kpis: Kpi[]
  charts: Chart[]
  insights: Insight[]
  status?: ReactNode
  footer: string
}) {
  const klinik = useKlinikNama()
  return (
    <section className={SHEET} aria-label={`Ringkasan ${title}`}>
      <ChapterBand
        kicker={`${klinik} · Laporan keuangan`}
        title={title}
        tagline={tagline}
        right={
          <>
            {periodeText}
            {compareText ? (
              <>
                <br />
                <span className="text-white/45">vs {compareText}</span>
              </>
            ) : null}
          </>
        }
      />
      <div className="grid min-h-0 flex-1 grid-cols-[1.35fr_1fr] gap-6 px-8 py-5">
        <div className="flex min-h-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            {kpis.map((k) => (
              <KpiTile key={k.label} k={k} prevLabel={compareText ? 'pembanding' : 'sebelumnya'} />
            ))}
          </div>
          <div className={charts.length > 1 ? 'grid min-h-0 flex-1 grid-cols-2 gap-5' : 'min-h-0 flex-1'}>
            {charts.map((c) => (
              <div key={c.title} className="min-h-0 overflow-hidden">
                <SectionLabel>{c.title}</SectionLabel>
                {c.node}
              </div>
            ))}
          </div>
        </div>
        <div className="flex min-h-0 flex-col gap-4">
          {status}
          <div className="min-h-0 overflow-hidden">
            <SectionLabel>Temuan</SectionLabel>
            <InsightList items={insights.slice(0, 6).map((insight) => ({ insight }))} />
          </div>
          <div className="mt-auto rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <SectionLabel>Catatan & persetujuan</SectionLabel>
            <div className="space-y-4 pt-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="border-b border-dashed border-slate-300" />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-6 text-[9px] text-slate-500">
              <p className="border-t border-slate-400 pt-1">Disusun oleh</p>
              <p className="border-t border-slate-400 pt-1">Disetujui oleh</p>
            </div>
          </div>
        </div>
      </div>
      <SheetFooter page={1} left={footer} />
    </section>
  )
}

function StatusPill({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  return (
    <p
      className={
        ok
          ? 'rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800'
          : 'rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700'
      }
    >
      {ok ? `✓ ${okText}` : `⚠ ${badText}`}
    </p>
  )
}

const top5 = (rows: AkunSaldo[], sign = 1) =>
  rows
    .map((r) => ({ key: String(r.akun.id), label: r.akun.nama, value: r.saldo * sign }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

const footerOf = (klinik: string, title: string, periode: string) => `${klinik} · ${title} · ${periode}`

// ── Laba Rugi ──

export function LabaRugiMagazine({ d, periode }: { d: LabaRugiData; periode: Periode }) {
  const klinik = useKlinikNama()
  const prevP = previousPeriode(periode)
  const prev = useQuery({
    queryKey: ['laporan', '/finance/laporan/laba-rugi', 'range', prevP.dari, prevP.sampai, undefined],
    queryFn: () => apiGet<LabaRugiData>('/finance/laporan/laba-rugi', { ...prevP }),
  }).data?.data
  const label = periodeLabel(periode)
  const margin = d.total_pendapatan ? (d.laba_bersih / d.total_pendapatan) * 100 : 0
  const prevMargin = prev?.total_pendapatan ? (prev.laba_bersih / prev.total_pendapatan) * 100 : undefined
  const footer = footerOf(klinik, 'Laba Rugi', label)

  const lines: DetailLine[] = [
    { kind: 'section', label: 'PENDAPATAN' },
    ...d.pendapatan.map((r): DetailLine => ({ kind: 'row', cells: [r.akun.kode, r.akun.nama, money(r.saldo)] })),
    { kind: 'subtotal', label: 'Total pendapatan', cells: [money(d.total_pendapatan)] },
    { kind: 'section', label: 'BEBAN' },
    ...d.beban.map((r): DetailLine => ({ kind: 'row', cells: [r.akun.kode, r.akun.nama, money(r.saldo)] })),
    { kind: 'subtotal', label: 'Total beban', cells: [money(d.total_beban)] },
    { kind: 'total', label: d.laba_bersih >= 0 ? 'LABA BERSIH' : 'RUGI BERSIH', cells: [money(d.laba_bersih)] },
  ]
  const cols: DetailColumn[] = [{ header: 'Kode', width: '16%', mono: true }, { header: 'Akun' }, { header: 'Jumlah', align: 'right', width: '22%' }]

  return (
    <>
      <SummarySheet
        title="Laba Rugi"
        tagline="Pendapatan bersih dikurangi HPP dan beban operasional"
        periodeText={label}
        compareText={periodeLabel(prevP)}
        kpis={[
          { label: 'Pendapatan bersih', value: d.total_pendapatan, prev: prev?.total_pendapatan, money: true },
          { label: 'Total beban', value: d.total_beban, prev: prev?.total_beban, money: true, lowerIsBetter: true },
          { label: d.laba_bersih >= 0 ? 'Laba bersih' : 'Rugi bersih', value: d.laba_bersih, prev: prev?.laba_bersih, money: true },
          { label: 'Margin bersih', value: Math.round(margin * 10) / 10, prev: prevMargin === undefined ? undefined : Math.round(prevMargin * 10) / 10, percent: true },
        ]}
        charts={[
          { title: 'Sumber pendapatan', node: <BarList items={top5(d.pendapatan)} formatValue={formatCurrency} emptyText="Belum ada pendapatan" /> },
          { title: '5 beban terbesar', node: <BarList items={top5(d.beban)} formatValue={formatCurrency} emptyText="Belum ada beban" /> },
        ]}
        insights={labaRugiInsights(d, prev)}
        footer={footer}
      />
      <DetailSheets title="Rincian laba rugi" subtitle={`${formatDate(d.dari)} – ${formatDate(d.sampai)}`} columns={cols} lines={lines} firstPage={2} footer={footer} />
    </>
  )
}

// ── Neraca ──

export function NeracaMagazine({ d, periode }: { d: NeracaData; periode: Periode }) {
  const klinik = useKlinikNama()
  const prevPer = previousPeriode(periode).sampai
  const prev = useQuery({
    queryKey: ['laporan', '/finance/laporan/neraca', 'per', prevPer, prevPer, undefined],
    queryFn: () => apiGet<NeracaData>('/finance/laporan/neraca', { per: prevPer, sampai: prevPer }),
  }).data?.data
  const perText = `Per ${formatDate(d.per)}`
  const footer = footerOf(klinik, 'Neraca', perText)
  const ratio = d.total_aset ? (d.total_kewajiban / d.total_aset) * 100 : 0
  const prevRatio = prev?.total_aset ? (prev.total_kewajiban / prev.total_aset) * 100 : undefined
  const row = (r: AkunSaldo): DetailLine => ({ kind: 'row', cells: [r.akun.kode, r.akun.nama, money(r.saldo)] })

  const lines: DetailLine[] = [
    { kind: 'section', label: 'ASET' },
    ...d.aset.map(row),
    { kind: 'total', label: 'TOTAL ASET', cells: [money(d.total_aset)] },
    { kind: 'section', label: 'KEWAJIBAN' },
    ...d.kewajiban.map(row),
    { kind: 'subtotal', label: 'Total kewajiban', cells: [money(d.total_kewajiban)] },
    { kind: 'section', label: 'EKUITAS' },
    ...d.ekuitas.map(row),
    { kind: 'row', cells: ['', 'Laba tahun berjalan', money(d.laba_berjalan)], muted: true },
    { kind: 'subtotal', label: 'Total ekuitas', cells: [money(d.total_ekuitas)] },
    { kind: 'total', label: 'TOTAL KEWAJIBAN + EKUITAS', cells: [money(d.total_pasiva)] },
  ]
  const pasiva = [...d.kewajiban, ...d.ekuitas, ...(d.laba_berjalan > 0 ? [{ akun: { id: -1, nama: 'Laba tahun berjalan' }, saldo: d.laba_berjalan } as unknown as AkunSaldo] : [])]

  return (
    <>
      <SummarySheet
        title="Neraca"
        tagline="Posisi aset, kewajiban, dan ekuitas"
        periodeText={perText}
        compareText={`per ${formatDate(prevPer)}`}
        status={<StatusPill ok={d.seimbang} okText={`Seimbang · aset = kewajiban + ekuitas = ${formatCurrency(d.total_aset)}`} badText={`Tidak seimbang · selisih ${formatCurrency(Math.abs(d.total_aset - d.total_pasiva))}`} />}
        kpis={[
          { label: 'Total aset', value: d.total_aset, prev: prev?.total_aset, money: true },
          { label: 'Total kewajiban', value: d.total_kewajiban, prev: prev?.total_kewajiban, money: true, lowerIsBetter: true },
          { label: 'Total ekuitas', value: d.total_ekuitas, prev: prev?.total_ekuitas, money: true },
          { label: 'Kewajiban / aset', value: Math.round(ratio * 10) / 10, prev: prevRatio === undefined ? undefined : Math.round(prevRatio * 10) / 10, percent: true, lowerIsBetter: true },
        ]}
        charts={[
          { title: 'Komposisi aset', node: <BarList items={top5(d.aset)} formatValue={formatCurrency} emptyText="Belum ada aset" /> },
          { title: 'Sumber pembiayaan', node: <BarList items={top5(pasiva)} formatValue={formatCurrency} emptyText="Belum ada kewajiban/ekuitas" /> },
        ]}
        insights={neracaInsights(d, prev)}
        footer={footer}
      />
      <DetailSheets
        title="Rincian neraca"
        subtitle={perText}
        columns={[{ header: 'Kode', width: '16%', mono: true }, { header: 'Akun' }, { header: 'Saldo', align: 'right', width: '22%' }]}
        lines={lines}
        firstPage={2}
        footer={footer}
      />
    </>
  )
}

// ── Neraca saldo ──

export function NeracaSaldoMagazine({ d }: { d: NeracaSaldoData }) {
  const klinik = useKlinikNama()
  const perText = `Per ${formatDate(d.sampai)}`
  const footer = footerOf(klinik, 'Neraca Saldo', perText)
  const seimbang = Math.round(d.total_debit * 100) === Math.round(d.total_kredit * 100)
  const bersaldo = d.rows.filter((r) => r.debit || r.kredit)

  const perTipe = TIPE_ORDER.map((t) => {
    const rows = bersaldo.filter((r) => r.akun.tipe === t)
    return { tipe: t, rows, debit: rows.reduce((s, r) => s + r.debit, 0), kredit: rows.reduce((s, r) => s + r.kredit, 0) }
  })
  const lines: DetailLine[] = []
  for (const g of perTipe) {
    if (!g.rows.length) continue
    lines.push({ kind: 'section', label: TIPE_LABEL[g.tipe].toUpperCase(), note: `${g.rows.length} akun` })
    for (const r of g.rows) lines.push({ kind: 'row', cells: [r.akun.kode, r.akun.nama, r.debit ? formatCurrency(r.debit) : '', r.kredit ? formatCurrency(r.kredit) : ''] })
    lines.push({ kind: 'subtotal', label: `Subtotal ${TIPE_LABEL[g.tipe].toLowerCase()}`, cells: [g.debit ? formatCurrency(g.debit) : '', g.kredit ? formatCurrency(g.kredit) : ''] })
  }
  lines.push({ kind: 'total', label: 'TOTAL', cells: [formatCurrency(d.total_debit), formatCurrency(d.total_kredit)] })

  return (
    <>
      <SummarySheet
        title="Neraca Saldo"
        tagline="Saldo setiap akun sebagai dasar laba rugi dan neraca"
        periodeText={perText}
        status={<StatusPill ok={seimbang} okText="Seimbang · total debit = total kredit" badText={`Tidak seimbang · selisih ${formatCurrency(Math.abs(d.total_debit - d.total_kredit))}`} />}
        kpis={[
          { label: 'Total debit', value: d.total_debit, money: true },
          { label: 'Total kredit', value: d.total_kredit, money: true },
          { label: 'Akun bersaldo', value: bersaldo.length, note: `dari ${d.rows.length} akun` },
          { label: 'Selisih', value: Math.abs(d.total_debit - d.total_kredit), money: true, note: seimbang ? 'seimbang' : 'periksa jurnal' },
        ]}
        charts={[
          {
            title: 'Saldo per kelompok akun',
            node: (
              <BarList
                items={perTipe.map((g) => ({ key: g.tipe, label: TIPE_LABEL[g.tipe], value: Math.max(g.debit, g.kredit) }))}
                formatValue={formatCurrency}
              />
            ),
          },
        ]}
        insights={neracaSaldoInsights(d)}
        footer={footer}
      />
      <DetailSheets
        title="Rincian neraca saldo"
        subtitle={perText}
        columns={[
          { header: 'Kode', width: '14%', mono: true },
          { header: 'Akun' },
          { header: 'Debit', align: 'right', width: '20%' },
          { header: 'Kredit', align: 'right', width: '20%' },
        ]}
        lines={lines}
        firstPage={2}
        footer={footer}
      />
    </>
  )
}

// ── Buku besar (semua akun) ──

export function BukuBesarMagazine({ d }: { d: BukuBesarSemuaData }) {
  const klinik = useKlinikNama()
  const label = `${formatDate(d.dari)} – ${formatDate(d.sampai)}`
  const footer = footerOf(klinik, 'Buku Besar', label)
  const aktif = d.akuns.filter((a) => a.rows.length)
  const diam = d.akuns.filter((a) => !a.rows.length && a.saldo_awal !== 0)

  const lines: DetailLine[] = []
  for (const a of aktif) {
    lines.push({ kind: 'section', label: `${a.akun.kode} · ${a.akun.nama}`, note: `${TIPE_LABEL[a.akun.tipe]} · saldo normal ${a.akun.saldo_normal}` })
    lines.push({ kind: 'row', cells: ['', '', '', 'Saldo awal', '', '', money(a.saldo_awal)], muted: true })
    for (const r of a.rows) {
      lines.push({
        kind: 'row',
        cells: [
          formatDate(r.tanggal),
          r.kode,
          SOURCE_LABEL[r.source_type] ?? r.source_type,
          r.keterangan,
          r.debit ? formatCurrency(r.debit) : '',
          r.kredit ? formatCurrency(r.kredit) : '',
          money(r.saldo),
        ],
      })
    }
    lines.push({ kind: 'subtotal', label: 'Total mutasi & saldo akhir', cells: [formatCurrency(a.total_debit), formatCurrency(a.total_kredit), money(a.saldo_akhir)] })
  }
  if (diam.length) {
    lines.push({ kind: 'section', label: 'AKUN TANPA MUTASI', note: 'saldo tetap sepanjang periode' })
    for (const a of diam) lines.push({ kind: 'row', cells: ['', a.akun.kode, TIPE_LABEL[a.akun.tipe], a.akun.nama, '', '', money(a.saldo_akhir)], muted: true })
  }
  lines.push({ kind: 'total', label: 'TOTAL SELURUH MUTASI', cells: [formatCurrency(d.total_debit), formatCurrency(d.total_kredit), ''] })

  const aktifTop = [...aktif]
    .sort((a, b) => b.total_debit + b.total_kredit - (a.total_debit + a.total_kredit))
    .slice(0, 5)
    .map((a) => ({ key: String(a.akun.id), label: a.akun.nama, value: a.total_debit + a.total_kredit }))

  return (
    <>
      <SummarySheet
        title="Buku Besar"
        tagline="Mutasi seluruh akun, dikelompokkan per akun dengan saldo berjalan"
        periodeText={label}
        status={
          <StatusPill
            ok={Math.round(d.total_debit * 100) === Math.round(d.total_kredit * 100)}
            okText="Total debit = total kredit untuk seluruh mutasi"
            badText="Total debit dan kredit mutasi tidak sama"
          />
        }
        kpis={[
          { label: 'Akun bermutasi', value: d.akun_bermutasi, note: `dari ${d.akuns.length} akun` },
          { label: 'Baris mutasi', value: d.jumlah_transaksi },
          { label: 'Total debit', value: d.total_debit, money: true },
          { label: 'Total kredit', value: d.total_kredit, money: true },
        ]}
        charts={[{ title: 'Akun dengan mutasi terbesar (debit + kredit)', node: <BarList items={aktifTop} formatValue={formatCurrency} emptyText="Tidak ada mutasi" /> }]}
        insights={bukuBesarInsights(d)}
        footer={footer}
      />
      <DetailSheets
        title="Rincian buku besar"
        subtitle={label}
        columns={[
          { header: 'Tanggal', width: '10%' },
          { header: 'Jurnal', width: '13%', mono: true },
          { header: 'Sumber', width: '11%' },
          { header: 'Keterangan' },
          { header: 'Debit', align: 'right', width: '12%' },
          { header: 'Kredit', align: 'right', width: '12%' },
          { header: 'Saldo', align: 'right', width: '13%' },
        ]}
        lines={lines}
        firstPage={2}
        footer={footer}
      />
    </>
  )
}

// ── Financial Highlights ──

const bulanLabel = (b: string, full = false) => {
  const [y, m] = b.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', full ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' })
}
const rangeText = (r: { dari: string; sampai: string }) => `${formatDate(r.dari)} – ${formatDate(r.sampai)}`

function PctCell({ cur, base }: { cur: number; base: number }) {
  if (base === 0) return <td className="px-1.5 py-1 text-right text-slate-400">—</td>
  const c = ((cur - base) / Math.abs(base)) * 100
  return (
    <td className={`px-1.5 py-1 text-right font-bold tabular-nums ${c >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
      {c >= 0 ? '+' : '−'}
      {Math.abs(c).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%
    </td>
  )
}

type FoRingkasan = { ringkasan: { kunjungan: number; pasien_baru: number; transaksi: number; pendapatan_bersih: number } }

export function HighlightsMagazine({ d, periode }: { d: HighlightsData; periode: Periode }) {
  const klinik = useKlinikNama()
  const label = periodeLabel(periode)
  const footer = footerOf(klinik, 'Financial Highlights', label)
  const p = d.periode
  // Same cache key as the on-screen Operasional block, so it is already loaded when printing.
  const fo = useQuery({
    queryKey: ['laporan', '/laporan/fo', 'range', periode.dari, periode.sampai, undefined],
    queryFn: () => apiGet<FoRingkasan>('/laporan/fo', { ...periode }),
  }).data?.data?.ringkasan

  const rows: { label: string; key: keyof HighlightsRingkasan; pct?: boolean; strong?: boolean }[] = [
    { label: 'Pendapatan', key: 'pendapatan' },
    { label: 'HPP', key: 'hpp' },
    { label: 'Laba kotor', key: 'laba_kotor', strong: true },
    { label: 'Beban operasional', key: 'beban_operasional' },
    { label: 'Laba bersih', key: 'laba_bersih', strong: true },
    { label: 'Margin kotor', key: 'margin_kotor', pct: true },
    { label: 'Margin bersih', key: 'margin_bersih', pct: true },
  ]
  const posisiRows: { label: string; key: keyof HighlightsPosisi; strong?: boolean }[] = [
    { label: 'Kas & bank', key: 'kas_bank' },
    { label: 'Total aset', key: 'total_aset', strong: true },
    { label: 'Utang usaha', key: 'utang_usaha' },
    { label: 'Utang deposit pasien', key: 'utang_deposit_pasien' },
    { label: 'Total kewajiban', key: 'total_kewajiban', strong: true },
    { label: 'Ekuitas', key: 'total_ekuitas', strong: true },
  ]
  const fmt = (pct: boolean | undefined, v: number) => (pct ? `${v.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%` : money(v))
  const potongan = d.komposisi_pendapatan.filter((a) => a.saldo < 0)
  const th = 'h-6 px-1.5 text-right text-[9px] font-bold tracking-wider text-slate-500 uppercase first:text-left'

  const trenLines: DetailLine[] = d.tren.map((t) => ({
    kind: 'row',
    cells: [bulanLabel(t.bulan, true), money(t.pendapatan), money(t.beban), money(t.laba_bersih)],
  }))
  const sum = (k: 'pendapatan' | 'beban' | 'laba_bersih') => d.tren.reduce((s, t) => s + t[k], 0)
  trenLines.push({ kind: 'total', label: 'Total 12 bulan', cells: [money(sum('pendapatan')), money(sum('beban')), money(sum('laba_bersih'))] })
  const lastBulan = d.tren[d.tren.length - 1]?.bulan ?? periode.sampai.slice(0, 7)
  const operasional: [string, string][] = [
    ['Kunjungan', fo ? fo.kunjungan.toLocaleString('id-ID') : '…'],
    ['Pasien baru', fo ? fo.pasien_baru.toLocaleString('id-ID') : '…'],
    ['Transaksi kasir', fo ? fo.transaksi.toLocaleString('id-ID') : '…'],
    ['Rata-rata / transaksi', fo ? formatCurrency(fo.transaksi ? fo.pendapatan_bersih / fo.transaksi : 0) : '…'],
  ]

  return (
    <>
      <SummarySheet
        title="Financial Highlights"
        tagline="Ringkasan kinerja keuangan untuk owner"
        periodeText={label}
        compareText={rangeText(d.pembanding)}
        kpis={[
          { label: 'Pendapatan', value: p.pendapatan, prev: d.pembanding.pendapatan, money: true },
          { label: 'Laba kotor', value: p.laba_kotor, prev: d.pembanding.laba_kotor, money: true, note: `margin ${p.margin_kotor.toLocaleString('id-ID')}%` },
          {
            label: p.laba_bersih >= 0 ? 'Laba bersih' : 'Rugi bersih',
            value: p.laba_bersih,
            prev: d.pembanding.laba_bersih,
            money: true,
            note: `margin ${p.margin_bersih.toLocaleString('id-ID')}%`,
          },
          { label: 'Kas & bank', value: d.posisi.kas_bank, prev: d.posisi_pembanding.kas_bank, money: true, note: `per ${formatDate(d.posisi.per)}` },
        ]}
        charts={[
          {
            title: 'Tren pendapatan 12 bulan',
            node: (
              <BarChart
                className="h-44"
                data={d.tren.map((t) => ({ key: t.bulan, label: bulanLabel(t.bulan), value: Math.max(0, t.pendapatan) }))}
                formatValue={formatCurrency}
              />
            ),
          },
          { title: 'Komposisi pendapatan', node: <BarList items={top5(d.komposisi_pendapatan)} formatValue={formatCurrency} emptyText="Belum ada pendapatan" /> },
        ]}
        insights={financeInsights(d)}
        footer={footer}
      />

      <section className={SHEET} aria-label="Perbandingan dan posisi keuangan">
        <ContinuationBand title="Perbandingan & posisi keuangan" subtitle={label} />
        <div className="grid min-h-0 flex-1 grid-cols-[1.45fr_1fr] gap-6 px-8 pt-4">
          <div className="flex min-h-0 flex-col gap-4">
            <div>
              <SectionLabel>Laba rugi dibanding periode sebelumnya dan tahun lalu</SectionLabel>
              <table className="w-full border-collapse text-[10.5px]">
                <thead>
                  <tr className="border-b border-slate-300">
                    <th className={th}>Pos</th>
                    <th className={th}>{rangeText(p)}</th>
                    <th className={th}>{rangeText(d.pembanding)}</th>
                    <th className={th}>Δ</th>
                    <th className={th}>{rangeText(d.tahun_lalu)}</th>
                    <th className={th}>Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const cur = p[r.key] as number
                    const prev = d.pembanding[r.key] as number
                    const yoy = d.tahun_lalu[r.key] as number
                    return (
                      <tr key={r.key} className={`border-b border-slate-100 ${r.strong ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
                        <td className="px-1.5 py-1">{r.label}</td>
                        <td className="px-1.5 py-1 text-right tabular-nums">{fmt(r.pct, cur)}</td>
                        <td className="px-1.5 py-1 text-right tabular-nums">{fmt(r.pct, prev)}</td>
                        {r.pct ? <td className="px-1.5 py-1 text-right text-slate-400">—</td> : <PctCell cur={cur} base={prev} />}
                        <td className="px-1.5 py-1 text-right tabular-nums">{fmt(r.pct, yoy)}</td>
                        {r.pct ? <td className="px-1.5 py-1 text-right text-slate-400">—</td> : <PctCell cur={cur} base={yoy} />}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div>
              <SectionLabel>Operasional (dari transaksi kasir)</SectionLabel>
              <div className="grid grid-cols-4 gap-2">
                {operasional.map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-50 p-2">
                    <p className="text-[9px] font-bold tracking-wider text-slate-500 uppercase">{k}</p>
                    <p className="text-sm font-extrabold text-slate-900 tabular-nums">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-4">
            <div>
              <SectionLabel>Posisi keuangan</SectionLabel>
              <table className="w-full border-collapse text-[10.5px]">
                <thead>
                  <tr className="border-b border-slate-300">
                    <th className={th}>Pos</th>
                    <th className={th}>{formatDate(d.posisi.per)}</th>
                    <th className={th}>{formatDate(d.posisi_pembanding.per)}</th>
                  </tr>
                </thead>
                <tbody>
                  {posisiRows.map((r) => (
                    <tr key={r.key} className={`border-b border-slate-100 ${r.strong ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
                      <td className="px-1.5 py-1">{r.label}</td>
                      <td className="px-1.5 py-1 text-right tabular-nums">{money(d.posisi[r.key] as number)}</td>
                      <td className="px-1.5 py-1 text-right tabular-nums">{money(d.posisi_pembanding[r.key] as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="min-h-0 overflow-hidden">
              <SectionLabel>5 beban terbesar</SectionLabel>
              <BarList items={top5(d.beban_terbesar)} formatValue={formatCurrency} emptyText="Belum ada beban di periode ini" />
              {potongan.length ? (
                <p className="mt-2 text-[9.5px] text-slate-500">
                  Pendapatan sudah dikurangi {potongan.map((a) => `${a.akun.nama} ${formatCurrency(-a.saldo)}`).join(', ')}.
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <SheetFooter page={2} left={footer} />
      </section>

      <DetailSheets
        title="Laba / rugi per bulan"
        subtitle={`12 bulan sampai ${bulanLabel(lastBulan, true)}`}
        columns={[
          { header: 'Bulan' },
          { header: 'Pendapatan', align: 'right', width: '22%' },
          { header: 'Beban', align: 'right', width: '22%' },
          { header: 'Laba / rugi', align: 'right', width: '22%' },
        ]}
        lines={trenLines}
        firstPage={3}
        footer={footer}
      />
    </>
  )
}
