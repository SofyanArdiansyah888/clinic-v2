import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, FileDown, Info, Save } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiGet, apiPut } from '@/shared/api/client'
import { BarChart } from '@/shared/components/charts/BarChart'
import { BarList } from '@/shared/components/charts/BarList'
import { PageHeader } from '@/shared/components/PageHeader'
import { toast } from '@/shared/components/Toaster'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn'
import { formatCurrency, formatNumber } from '@/shared/lib/formatters'
import { printReport } from '@/shared/lib/print'
import { useAuthStore } from '@/features/auth/store'
import {
  DIVISI,
  lastMonth,
  periodeLabel,
  previousPeriode,
  startOfMonthIso,
  todayIso,
  type ApotekData,
  type DivisiKey,
  type DmData,
  type FinanceData,
  type FoData,
  type NurseData,
  type Periode,
} from './data'
import { apotekInsights, dokterInsights, financeInsights, foInsights, terapisInsights, type Insight, type Tone } from './insights'

// ── Model per chapter ──

type Kpi = { label: string; value: number; prev?: number; money?: boolean; lowerIsBetter?: boolean; note?: string }
type Chapter = { kpis: Kpi[]; insights: Insight[]; chartTitle: string; chart: ReactNode }

const bulan = (b: string) => {
  const [y, m] = b.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })
}
const top5 = <T,>(rows: T[] | null, key: (r: T) => string | number, label: (r: T) => string, value: (r: T) => number) =>
  [...(rows ?? [])]
    .filter((r) => value(r) > 0)
    .sort((a, b) => value(b) - value(a))
    .slice(0, 5)
    .map((r) => ({ key: String(key(r)), label: label(r), value: value(r) }))

function buildChapter(key: DivisiKey, cur: unknown, prev: unknown): Chapter {
  switch (key) {
    case 'fo': {
      const c = cur as FoData
      const p = prev as FoData | undefined
      return {
        kpis: [
          { label: 'Kunjungan', value: c.ringkasan.kunjungan, prev: p?.ringkasan.kunjungan },
          { label: 'Pasien baru', value: c.ringkasan.pasien_baru, prev: p?.ringkasan.pasien_baru },
          { label: 'Transaksi kasir', value: c.ringkasan.transaksi, prev: p?.ringkasan.transaksi },
          { label: 'Pendapatan kasir', value: c.ringkasan.pendapatan_bersih, prev: p?.ringkasan.pendapatan_bersih, money: true },
        ],
        insights: foInsights(c, p),
        chartTitle: 'Pendapatan kasir per hari',
        chart: (
          <BarChart
            className="h-48"
            data={(c.harian ?? []).map((h) => ({
              key: h.tanggal,
              label: new Date(h.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
              value: h.pendapatan,
            }))}
            formatValue={formatCurrency}
          />
        ),
      }
    }
    case 'dokter': {
      const c = cur as DmData
      const p = prev as DmData | undefined
      return {
        kpis: [
          { label: 'Perawatan', value: c.ringkasan.perawatan, prev: p?.ringkasan.perawatan },
          { label: 'Pasien ditangani', value: c.ringkasan.pasien, prev: p?.ringkasan.pasien },
          { label: 'Nilai perawatan', value: c.ringkasan.nilai, prev: p?.ringkasan.nilai, money: true },
          { label: 'Komisi dokter', value: c.ringkasan.komisi_dokter, prev: p?.ringkasan.komisi_dokter, money: true },
        ],
        insights: dokterInsights(c, p),
        chartTitle: 'Nilai perawatan per dokter',
        chart: <BarList items={top5(c.per_dokter, (r) => r.staff_id, (r) => r.nama, (r) => r.nilai)} formatValue={formatCurrency} />,
      }
    }
    case 'terapis': {
      const c = cur as NurseData
      const p = prev as NurseData | undefined
      return {
        kpis: [
          { label: 'Tindakan', value: c.ringkasan.tindakan, prev: p?.ringkasan.tindakan },
          { label: 'Nilai tindakan', value: c.ringkasan.nilai, prev: p?.ringkasan.nilai, money: true },
          { label: 'Komisi terapis', value: c.ringkasan.komisi_terapis, prev: p?.ringkasan.komisi_terapis, money: true },
          { label: 'Tanpa terapis', value: c.ringkasan.tanpa_terapis, prev: p?.ringkasan.tanpa_terapis, lowerIsBetter: true },
        ],
        insights: terapisInsights(c, p),
        chartTitle: '5 treatment dengan nilai terbesar',
        chart: <BarList items={top5(c.treatment, (r) => r.treatment_id, (r) => r.nama, (r) => r.nilai)} formatValue={formatCurrency} />,
      }
    }
    case 'apotek': {
      const c = cur as ApotekData
      const p = prev as ApotekData | undefined
      return {
        kpis: [
          { label: 'Penjualan obat & produk', value: c.ringkasan.nilai_penjualan, prev: p?.ringkasan.nilai_penjualan, money: true },
          { label: 'Item terjual', value: c.ringkasan.item_terjual, prev: p?.ringkasan.item_terjual },
          { label: 'Resep diserahkan', value: c.ringkasan.resep_diserahkan, prev: p?.ringkasan.resep_diserahkan },
          { label: 'Barang stok menipis', value: c.ringkasan.stok_menipis, lowerIsBetter: true, note: 'saat ini' },
        ],
        insights: apotekInsights(c, p),
        chartTitle: '5 produk terlaris',
        chart: <BarList items={top5(c.barang_terjual, (r) => r.barang_id, (r) => r.nama, (r) => r.nilai)} formatValue={formatCurrency} />,
      }
    }
    case 'finance': {
      const h = cur as FinanceData
      return {
        kpis: [
          { label: 'Pendapatan', value: h.periode.pendapatan, prev: h.pembanding.pendapatan, money: true },
          { label: 'Laba kotor', value: h.periode.laba_kotor, prev: h.pembanding.laba_kotor, money: true, note: `margin ${formatNumber(h.periode.margin_kotor)}%` },
          { label: 'Laba bersih', value: h.periode.laba_bersih, prev: h.pembanding.laba_bersih, money: true, note: `margin ${formatNumber(h.periode.margin_bersih)}%` },
          { label: 'Kas & bank', value: h.posisi.kas_bank, prev: h.posisi_pembanding.kas_bank, money: true },
        ],
        insights: financeInsights(h),
        chartTitle: 'Tren pendapatan 12 bulan',
        chart: (
          <BarChart className="h-48" data={h.tren.map((t) => ({ key: t.bulan, label: bulan(t.bulan), value: Math.max(0, t.pendapatan) }))} formatValue={formatCurrency} />
        ),
      }
    }
  }
}

// ── Notes ──

type Catatan = { divisi: string; isi: string; updated_by_name: string; updated_at: string }
type NoteKey = DivisiKey | 'eksekutif'

const WRITER: Record<NoteKey, string> = {
  eksekutif: 'admin',
  fo: 'staff',
  dokter: 'doctor',
  terapis: 'nurse',
  apotek: 'apoteker',
  finance: 'finance',
}

function NoteBox({ divisi, periode, note, role }: { divisi: NoteKey; periode: Periode; note?: Catatan; role: string }) {
  const qc = useQueryClient()
  const canWrite = role === 'admin' || WRITER[divisi] === role
  const [text, setText] = useState(note?.isi ?? '')
  useEffect(() => setText(note?.isi ?? ''), [note?.isi])
  const save = useMutation({
    mutationFn: () => apiPut('/laporan/catatan', { divisi, ...periode, isi: text }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['majalah-catatan'] })
      toast('Catatan disimpan', 'success')
    },
    onError: () => toast('Catatan gagal disimpan', 'error'),
  })
  const label = divisi === 'eksekutif' ? 'Catatan pimpinan' : 'Catatan & rencana aksi kepala divisi'
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <p className="mb-1.5 text-[10px] font-bold tracking-[0.12em] text-slate-500 uppercase">{label}</p>
      {canWrite ? (
        <div className="print-hide flex min-h-0 flex-1 flex-col gap-2">
          <textarea
            id={`catatan-${divisi}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tulis evaluasi periode ini dan rencana aksi periode berikutnya..."
            className="min-h-0 flex-1 resize-none rounded-lg border border-slate-200 bg-white p-2 text-xs leading-relaxed focus:border-rose-500 focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400">{note ? `Terakhir disimpan oleh ${note.updated_by_name}` : 'Belum disimpan'}</span>
            <Button type="button" size="sm" disabled={save.isPending || text === (note?.isi ?? '')} onClick={() => save.mutate()}>
              <Save />
              Simpan catatan
            </Button>
          </div>
        </div>
      ) : null}
      <div className={cn('min-h-0 flex-1 overflow-hidden', canWrite && 'print-only')}>
        {note?.isi ? (
          <p className="text-xs leading-relaxed whitespace-pre-line text-slate-800">{note.isi}</p>
        ) : (
          <div className="space-y-5 pt-3" aria-label="Belum ada catatan">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="border-b border-dashed border-slate-300" />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sheet building blocks ──

const SHEET =
  'sheet relative mx-auto flex h-[186mm] w-[273mm] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'

function SheetFooter({ page, periode, klinik }: { page: number; periode: string; klinik: string }) {
  return (
    <div className="mt-auto flex items-center justify-between border-t border-slate-200 px-8 py-2 text-[9px] tracking-wide text-slate-400 uppercase">
      <span>
        {klinik} · Laporan Kinerja · {periode}
      </span>
      <span className="tabular-nums">{page}</span>
    </div>
  )
}

const fmtVal = (k: Kpi, v: number) => (k.money ? formatCurrency(v) : formatNumber(v))

function KpiTile({ k, prevLabel }: { k: Kpi; prevLabel: string }) {
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

const TONE: Record<Tone, { icon: ReactNode; cls: string; label: string }> = {
  naik: { icon: <ArrowUpRight className="h-3.5 w-3.5" />, cls: 'bg-emerald-50 text-emerald-700', label: 'Naik' },
  turun: { icon: <ArrowDownRight className="h-3.5 w-3.5" />, cls: 'bg-rose-50 text-rose-600', label: 'Turun' },
  perhatian: { icon: <AlertTriangle className="h-3.5 w-3.5" />, cls: 'bg-amber-50 text-amber-700', label: 'Perhatian' },
  info: { icon: <Info className="h-3.5 w-3.5" />, cls: 'bg-slate-100 text-slate-500', label: 'Info' },
}

function InsightList({ items, prefix }: { items: { insight: Insight; divisi?: string }[]; prefix?: boolean }) {
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

// ── Page ──

const inputClass = 'rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-rose-500 focus:outline-none'

export function MajalahPage() {
  const role = useAuthStore((s) => s.user?.role) ?? ''
  const [periode, setPeriode] = useState<Periode>({ dari: startOfMonthIso(), sampai: todayIso() })
  const prevPeriode = useMemo(() => previousPeriode(periode), [periode])
  const available = DIVISI.filter((d) => d.roles.includes(role))
  const [chosen, setChosen] = useState<DivisiKey[]>(() => available.map((d) => d.key))
  const chapters = available.filter((d) => chosen.includes(d.key))
  const withSummary = role === 'admin'
  const valid = !!periode.dari && !!periode.sampai && periode.dari <= periode.sampai

  const klinik = useQuery({
    queryKey: ['pengaturan', 'klinik'],
    queryFn: () => apiGet<{ nama?: string }>('/pengaturan/klinik'),
    staleTime: 10 * 60_000,
  }).data?.data?.nama || 'Klinik'

  const results = useQueries({
    queries: available.flatMap((d) => [
      { queryKey: ['majalah', d.endpoint, periode.dari, periode.sampai], queryFn: () => apiGet(d.endpoint, { ...periode }), enabled: valid },
      // Finance highlights carry their own comparison; the others are fetched again for the previous period.
      ...(d.key === 'finance'
        ? []
        : [{ queryKey: ['majalah', d.endpoint, prevPeriode.dari, prevPeriode.sampai], queryFn: () => apiGet(d.endpoint, { ...prevPeriode }), enabled: valid }]),
    ]),
  })
  const notes = useQuery({
    queryKey: ['majalah-catatan', periode.dari, periode.sampai],
    queryFn: () => apiGet<Catatan[]>('/laporan/catatan', { ...periode }),
    enabled: valid,
  })

  // Results come back in the order the queries were listed: current, then previous (not for finance).
  const models: Partial<Record<DivisiKey, Chapter>> = {}
  let qi = 0
  for (const d of available) {
    const cur = results[qi++]?.data?.data
    const prev = d.key === 'finance' ? undefined : results[qi++]?.data?.data
    if (cur) models[d.key] = buildChapter(d.key, cur, prev)
  }

  const loading = results.some((r) => r.isLoading) || notes.isLoading
  const failed = results.some((r) => r.isError)
  const noteOf = (k: NoteKey) => notes.data?.data?.find((n) => n.divisi === k)
  const label = periodeLabel(periode)
  const prevLabel = periodeLabel(prevPeriode)

  // Page numbers: cover, optional summary, then one sheet per chapter.
  const firstChapterPage = withSummary ? 3 : 2
  const allInsights = chapters.flatMap((d) => (models[d.key]?.insights ?? []).map((insight) => ({ insight, divisi: d.nama })))
  const sorotan = [...allInsights].filter((x) => x.insight.tone !== 'perhatian').sort((a, b) => b.insight.weight - a.insight.weight).slice(0, 6)
  const perhatian = [...allInsights].filter((x) => x.insight.tone === 'perhatian').sort((a, b) => b.insight.weight - a.insight.weight).slice(0, 6)

  const headline: Kpi[] = [
    models.finance?.kpis[0],
    models.finance?.kpis[2],
    models.fo?.kpis[0],
    models.dokter?.kpis[1] ?? models.fo?.kpis[1],
  ].filter((k): k is Kpi => !!k)

  return (
    <div className="space-y-6">
      <div className="print-hide space-y-4">
        <PageHeader
          title="Majalah Kinerja"
          description="Laporan bergaya majalah per divisi: angka, temuan otomatis, dan catatan kepala divisi, siap dipresentasikan"
          actions={
            <Button type="button" size="sm" disabled={loading || failed || !chapters.length} onClick={() => printReport(`Laporan Kinerja ${klinik} ${periode.dari} sd ${periode.sampai}`, 'landscape')}>
              <FileDown />
              Cetak / PDF
            </Button>
          }
        />
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="space-y-1.5">
            <label htmlFor="mj-dari" className="block text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              Dari
            </label>
            <input id="mj-dari" type="date" value={periode.dari} max={periode.sampai} onChange={(e) => setPeriode((p) => ({ ...p, dari: e.target.value }))} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="mj-sampai" className="block text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              Sampai
            </label>
            <input id="mj-sampai" type="date" value={periode.sampai} min={periode.dari} onChange={(e) => setPeriode((p) => ({ ...p, sampai: e.target.value }))} className={inputClass} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setPeriode({ dari: startOfMonthIso(), sampai: todayIso() })}>
              Bulan ini
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setPeriode(lastMonth())}>
              Bulan lalu
            </Button>
          </div>
          <fieldset className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
            <legend className="mb-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase">Bab yang dicetak</legend>
            {available.map((d) => (
              <label key={d.key} htmlFor={`bab-${d.key}`} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <input
                  id={`bab-${d.key}`}
                  type="checkbox"
                  checked={chosen.includes(d.key)}
                  onChange={(e) => setChosen((c) => (e.target.checked ? [...c, d.key] : c.filter((k) => k !== d.key)))}
                  className="rounded border-slate-300 text-rose-600"
                />
                {d.nama}
              </label>
            ))}
          </fieldset>
        </div>
        <p className="text-xs text-slate-500">
          Dibandingkan dengan {prevLabel}. Pratinjau di bawah sama dengan hasil cetak: satu lembar = satu halaman A4 landscape.
        </p>
        {failed ? <div className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">Sebagian data gagal dimuat. Coba muat ulang halaman.</div> : null}
      </div>

      <div className="sheet-stack flex flex-col gap-6 overflow-x-auto pb-4">
        {/* Cover */}
        <section className={SHEET} aria-label="Sampul">
          <div className="grid h-full grid-cols-[1.45fr_1fr]">
            <div className="flex flex-col justify-between p-12">
              <div>
                <p className="text-[11px] font-bold tracking-[0.3em] text-rose-600 uppercase">{klinik}</p>
                <p className="mt-2 text-[11px] tracking-[0.2em] text-slate-400 uppercase">Laporan kinerja</p>
              </div>
              <div>
                <h1 className="text-[56px] leading-[0.95] font-extrabold tracking-tight text-slate-900">
                  Rapor
                  <br />
                  Kinerja
                  <br />
                  <span className="text-rose-600">Klinik</span>
                </h1>
                <p className="mt-6 text-2xl font-bold text-slate-800">{label}</p>
                <p className="mt-1 text-sm text-slate-500">Dibandingkan dengan {prevLabel}</p>
              </div>
              <p className="text-[10px] text-slate-400">
                Disusun {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} dari data Clinic OS
              </p>
            </div>
            <div className="flex flex-col justify-center gap-6 bg-slate-900 p-10 text-white">
              <p className="text-[11px] font-bold tracking-[0.3em] text-rose-300 uppercase">Isi edisi ini</p>
              <ol className="space-y-4">
                {withSummary ? (
                  <li className="flex items-baseline gap-4 border-b border-white/15 pb-3">
                    <span className="w-6 text-sm font-bold text-rose-300 tabular-nums">2</span>
                    <span className="flex-1 text-lg font-bold">Ringkasan eksekutif</span>
                  </li>
                ) : null}
                {chapters.map((d, i) => (
                  <li key={d.key} className="flex items-baseline gap-4 border-b border-white/15 pb-3">
                    <span className="w-6 text-sm font-bold text-rose-300 tabular-nums">{firstChapterPage + i}</span>
                    <span className="flex-1">
                      <span className="block text-lg leading-tight font-bold">{d.nama}</span>
                      <span className="text-xs text-white/60">{d.tagline}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Executive summary */}
        {withSummary ? (
          <section className={SHEET} aria-label="Ringkasan eksekutif">
            <div className="flex min-h-0 flex-1 flex-col gap-5 px-8 pt-7">
              <div>
                <p className="text-[10px] font-bold tracking-[0.3em] text-rose-600 uppercase">Ringkasan eksekutif</p>
                <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Gambaran {label}</h2>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {headline.map((k) => (
                  <KpiTile key={k.label} k={k} prevLabel="sebelumnya" />
                ))}
              </div>
              <div className="grid min-h-0 flex-1 grid-cols-3 gap-5">
                <div className="min-h-0 overflow-hidden">
                  <p className="mb-2 text-[10px] font-bold tracking-[0.12em] text-slate-500 uppercase">Sorotan</p>
                  <InsightList items={sorotan} prefix />
                </div>
                <div className="min-h-0 overflow-hidden">
                  <p className="mb-2 text-[10px] font-bold tracking-[0.12em] text-amber-700 uppercase">Perlu perhatian</p>
                  <InsightList items={perhatian} prefix />
                </div>
                <div className="flex min-h-0 flex-col pb-4">
                  <NoteBox divisi="eksekutif" periode={periode} note={noteOf('eksekutif')} role={role} />
                </div>
              </div>
            </div>
            <SheetFooter page={2} periode={label} klinik={klinik} />
          </section>
        ) : null}

        {/* Chapters */}
        {chapters.map((d, i) => {
          const m = models[d.key]
          return (
            <section key={d.key} className={SHEET} aria-label={`Bab ${d.nama}`}>
              <div className="flex items-end justify-between bg-slate-900 px-8 py-5 text-white">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.3em] text-rose-300 uppercase">Bab {i + 1}</p>
                  <h2 className="text-3xl leading-tight font-extrabold tracking-tight">{d.nama}</h2>
                  <p className="text-xs text-white/60">{d.tagline}</p>
                </div>
                <p className="text-right text-xs text-white/70">
                  {label}
                  <br />
                  <span className="text-white/45">vs {prevLabel}</span>
                </p>
              </div>
              {m ? (
                <div className="grid min-h-0 flex-1 grid-cols-[1.35fr_1fr] gap-6 px-8 py-5">
                  <div className="flex min-h-0 flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      {m.kpis.map((k) => (
                        <KpiTile key={k.label} k={k} prevLabel="sebelumnya" />
                      ))}
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <p className="mb-2 text-[10px] font-bold tracking-[0.12em] text-slate-500 uppercase">{m.chartTitle}</p>
                      {m.chart}
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-col gap-4">
                    <div className="min-h-0 overflow-hidden">
                      <p className="mb-2 text-[10px] font-bold tracking-[0.12em] text-slate-500 uppercase">Temuan</p>
                      <InsightList items={m.insights.slice(0, 6).map((insight) => ({ insight }))} />
                    </div>
                    <NoteBox divisi={d.key} periode={periode} note={noteOf(d.key)} role={role} />
                  </div>
                </div>
              ) : (
                <p className="flex-1 p-8 text-sm text-slate-400">Memuat data {d.nama}...</p>
              )}
              <SheetFooter page={firstChapterPage + i} periode={label} klinik={klinik} />
            </section>
          )
        })}
      </div>
    </div>
  )
}
