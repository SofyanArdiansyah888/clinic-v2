import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { apiGet } from '@/shared/api/client'
import { BarList } from '@/shared/components/charts/BarList'
import { formatCurrency, formatDate } from '@/shared/lib/formatters'
import type { Insight } from '@/features/majalah/insights'
import { periodeLabel, previousPeriode, type Periode } from '@/features/majalah/data'
import {
  ChapterBand,
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
