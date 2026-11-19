import { Download, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '@/shared/components/EmptyState'
import { KpiCard } from '@/shared/components/KpiCard'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { cn } from '@/shared/lib/cn'
import { downloadCsv } from '@/shared/lib/csv'
import { formatCurrency, formatDate } from '@/shared/lib/formatters'
import { KpiGrid, ReportShell } from '@/features/laporan/ReportShell'
import { AkunSelect } from '@/features/finance/components/AkunSelect'
import { Rp } from '@/features/finance/components/Statement'
import { BukuBesarMagazine } from '@/features/finance/print/magazines'
import { SOURCE_LABEL, TIPE_LABEL, type BukuBesarAkun, type BukuBesarRow, type BukuBesarSemuaData } from '@/features/finance/types'

type Filter = { akunId: string; hanyaBermutasi: boolean }

// Narrows the all-accounts ledger to the on-screen filter (the PDF uses the same view).
function applyFilter(d: BukuBesarSemuaData, f: Filter): BukuBesarSemuaData {
  const akuns = d.akuns.filter((a) => (!f.akunId || String(a.akun.id) === f.akunId) && (!f.hanyaBermutasi || a.rows.length > 0))
  return {
    ...d,
    akuns,
    total_debit: akuns.reduce((s, a) => s + a.total_debit, 0),
    total_kredit: akuns.reduce((s, a) => s + a.total_kredit, 0),
    jumlah_transaksi: akuns.reduce((s, a) => s + a.rows.length, 0),
    akun_bermutasi: akuns.filter((a) => a.rows.length).length,
  }
}

export function BukuBesarPage() {
  const [filter, setFilter] = useState<Filter>({ akunId: '', hanyaBermutasi: false })

  return (
    <ReportShell<BukuBesarSemuaData>
      title="Buku Besar"
      description="Mutasi semua akun, dikelompokkan per akun dengan saldo berjalan"
      endpoint="/finance/laporan/buku-besar/semua"
      magazine={(d) => <BukuBesarMagazine d={applyFilter(d, filter)} />}
      filters={
        <>
          <div className="w-full space-y-1.5 sm:w-72">
            <label htmlFor="bb-akun" className="block text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              Akun
            </label>
            <AkunSelect id="bb-akun" value={filter.akunId} onChange={(v) => setFilter((f) => ({ ...f, akunId: v }))} placeholder="Semua akun" />
          </div>
          <label htmlFor="bb-aktif" className="flex h-10 items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              id="bb-aktif"
              type="checkbox"
              checked={filter.hanyaBermutasi}
              onChange={(e) => setFilter((f) => ({ ...f, hanyaBermutasi: e.target.checked }))}
              className="rounded border-slate-300 text-rose-600"
            />
            Hanya akun bermutasi
          </label>
        </>
      }
    >
      {(raw, periode) => <Ledger d={applyFilter(raw, filter)} dari={periode.dari} sampai={periode.sampai} />}
    </ReportShell>
  )
}

// Same cell rhythm and header style as DataTable (the master-data lists, e.g. Perusahaan Mitra).
const TH = 'px-4 py-3'
const TD = 'px-4 py-3 align-middle text-slate-700'
const NUM = 'text-right tabular-nums whitespace-nowrap'

function Ledger({ d, dari, sampai }: { d: BukuBesarSemuaData; dari: string; sampai: string }) {
  const [searchInput, setSearchInput] = useState('')
  const q = searchInput.trim().toLowerCase()

  // Search like the master-data lists: an account match keeps all its lines,
  // otherwise only the lines that match (kode jurnal, keterangan, referensi, sumber).
  const view = useMemo(() => {
    if (!q) return d.akuns.map((a) => ({ a, rows: a.rows }))
    return d.akuns
      .map((a) => {
        const akunHit = `${a.akun.kode} ${a.akun.nama}`.toLowerCase().includes(q)
        const rows = akunHit
          ? a.rows
          : a.rows.filter((r) => `${r.kode} ${r.keterangan} ${r.referensi} ${SOURCE_LABEL[r.source_type] ?? r.source_type}`.toLowerCase().includes(q))
        return { a, rows, keep: akunHit || rows.length > 0 }
      })
      .filter((x) => x.keep)
  }, [d.akuns, q])

  function exportCsv() {
    const rows = d.akuns.flatMap((a) => [
      [a.akun.kode, a.akun.nama, dari, '', '', 'Saldo awal', '', '', a.saldo_awal],
      ...a.rows.map((r) => [a.akun.kode, a.akun.nama, r.tanggal.slice(0, 10), r.kode, r.source_type, r.keterangan, r.debit, r.kredit, r.saldo]),
      [a.akun.kode, a.akun.nama, sampai, '', '', 'Saldo akhir', a.total_debit, a.total_kredit, a.saldo_akhir],
    ])
    downloadCsv(`buku_besar_${dari}_${sampai}`, ['Kode akun', 'Akun', 'Tanggal', 'Jurnal', 'Sumber', 'Keterangan', 'Debit', 'Kredit', 'Saldo'], rows)
  }

  return (
    <>
      <KpiGrid>
        <KpiCard label="Akun bermutasi" value={`${d.akun_bermutasi} / ${d.akuns.length}`} />
        <KpiCard label="Baris mutasi" value={String(d.jumlah_transaksi)} />
        <KpiCard label="Total debit" value={formatCurrency(d.total_debit)} />
        <KpiCard label="Total kredit" value={formatCurrency(d.total_kredit)} />
      </KpiGrid>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3.5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
            <Input
              type="search"
              aria-label="Cari di buku besar"
              className="h-10 pl-9"
              placeholder="Ketik untuk mencari..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" className="h-10" disabled={!d.akuns.length} onClick={exportCsv}>
            <Download />
            Export CSV
          </Button>
        </div>

        {view.length === 0 ? (
          <EmptyState
            title="Tidak ada data"
            description={q ? 'Tidak ada akun atau transaksi yang cocok dengan pencarian.' : 'Tidak ada akun yang cocok dengan filter.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="ui-table w-full min-w-[860px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  <th className={TH}>Tanggal</th>
                  <th className={TH}>Jurnal</th>
                  <th className={TH}>Sumber</th>
                  <th className={TH}>Keterangan</th>
                  <th className={cn(TH, 'text-right')}>Debit</th>
                  <th className={cn(TH, 'text-right')}>Kredit</th>
                  <th className={cn(TH, 'text-right')}>Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                {view.map(({ a, rows }) => (
                  <AkunRows key={a.akun.id} a={a} rows={rows} filtered={rows.length !== a.rows.length} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          {formatDate(dari)} – {formatDate(sampai)} · menampilkan {view.length} dari {d.akuns.length} akun
        </p>
      </Card>
    </>
  )
}

/** One account inside the ledger table: its header row, its lines, then the closing row. */
function AkunRows({ a, rows, filtered }: { a: BukuBesarAkun; rows: BukuBesarRow[]; filtered: boolean }) {
  return (
    <>
      <tr className="bg-slate-50/70">
        <td colSpan={6} className="px-4 py-2.5">
          <span className="font-mono font-bold text-rose-700">{a.akun.kode}</span>{' '}
          <span className="font-bold text-slate-900">{a.akun.nama}</span>
          <span className="ml-2 text-[11px] font-medium text-slate-500">
            {TIPE_LABEL[a.akun.tipe]} · saldo normal {a.akun.saldo_normal}
          </span>
        </td>
        <td className={cn('px-4 py-2.5 text-[11px] text-slate-500', NUM)}>
          Saldo awal{' '}
          <b className="text-slate-700">
            <Rp value={a.saldo_awal} />
          </b>
        </td>
      </tr>
      {a.rows.length === 0 ? (
        <tr>
          <td colSpan={7} className={cn(TD, 'text-slate-400 italic')}>
            Tidak ada mutasi pada periode ini.
          </td>
        </tr>
      ) : (
        rows.map((r, i) => (
          <tr key={`${r.jurnal_id}-${i}`} className="transition-colors hover:bg-slate-50">
            <td className={cn(TD, 'whitespace-nowrap')}>{formatDate(r.tanggal)}</td>
            <td className={cn(TD, 'font-mono font-bold whitespace-nowrap text-rose-700')}>{r.kode}</td>
            <td className={cn(TD, 'whitespace-nowrap')}>{SOURCE_LABEL[r.source_type] ?? r.source_type}</td>
            <td className={TD}>
              <p className="text-slate-900">{r.keterangan}</p>
              {r.referensi ? <p className="font-mono text-[11px] text-slate-500">{r.referensi}</p> : null}
            </td>
            <td className={cn(TD, NUM)}>{r.debit ? formatCurrency(r.debit) : '-'}</td>
            <td className={cn(TD, NUM)}>{r.kredit ? formatCurrency(r.kredit) : '-'}</td>
            <td className={cn(TD, NUM, 'font-semibold text-slate-900')}>
              <Rp value={r.saldo} />
            </td>
          </tr>
        ))
      )}
      <tr className="border-b-2 border-slate-300">
        <td colSpan={4} className={cn(TD, 'font-bold text-slate-900')}>
          {filtered ? 'Total akun (semua mutasi) & saldo akhir' : 'Total & saldo akhir'}
        </td>
        <td className={cn(TD, NUM, 'font-bold text-slate-900')}>{formatCurrency(a.total_debit)}</td>
        <td className={cn(TD, NUM, 'font-bold text-slate-900')}>{formatCurrency(a.total_kredit)}</td>
        <td className={cn(TD, NUM, 'font-bold text-slate-900')}>
          <Rp value={a.saldo_akhir} />
        </td>
      </tr>
    </>
  )
}
