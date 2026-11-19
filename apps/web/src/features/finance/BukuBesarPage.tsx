import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { KpiCard } from '@/shared/components/KpiCard'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { cn } from '@/shared/lib/cn'
import { downloadCsv } from '@/shared/lib/csv'
import { formatCurrency, formatDate } from '@/shared/lib/formatters'
import { KpiGrid, ReportShell } from '@/features/laporan/ReportShell'
import { AkunSelect } from '@/features/finance/components/AkunSelect'
import { Rp } from '@/features/finance/components/Statement'
import { BukuBesarMagazine } from '@/features/finance/print/magazines'
import { SOURCE_LABEL, TIPE_LABEL, type BukuBesarAkun, type BukuBesarSemuaData, type TipeAkun } from '@/features/finance/types'

const TIPE_ORDER: TipeAkun[] = ['aset', 'kewajiban', 'ekuitas', 'pendapatan', 'beban']

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

function Ledger({ d, dari, sampai }: { d: BukuBesarSemuaData; dari: string; sampai: string }) {
  const groups = useMemo(
    () => TIPE_ORDER.map((tipe) => ({ tipe, akuns: d.akuns.filter((a) => a.akun.tipe === tipe) })).filter((g) => g.akuns.length),
    [d.akuns],
  )

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

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {formatDate(dari)} – {formatDate(sampai)} · {d.akuns.length} akun
        </p>
        <Button type="button" variant="outline" size="sm" disabled={!d.akuns.length} onClick={exportCsv}>
          <Download />
          Export CSV
        </Button>
      </div>

      {groups.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">Tidak ada akun yang cocok dengan filter.</p> : null}

      {groups.map((g) => (
        <section key={g.tipe} className="space-y-3" aria-label={TIPE_LABEL[g.tipe]}>
          <h3 className="text-xs font-extrabold tracking-wider text-slate-500 uppercase">
            {TIPE_LABEL[g.tipe]} <span className="font-semibold text-slate-400">· {g.akuns.length} akun</span>
          </h3>
          {g.akuns.map((a) => (
            <AkunLedger key={a.akun.id} a={a} />
          ))}
        </section>
      ))}
    </>
  )
}

function AkunLedger({ a }: { a: BukuBesarAkun }) {
  const ada = a.rows.length > 0
  const [open, setOpen] = useState(ada)
  const th = 'px-3 py-2 text-left text-[11px] font-bold tracking-wider text-slate-500 uppercase'

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        disabled={!ada}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left enabled:hover:bg-slate-50"
      >
        <span className="text-slate-400">
          {ada ? open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" /> : <span className="inline-block h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-mono text-xs font-bold text-rose-700">{a.akun.kode}</span>{' '}
          <span className="text-sm font-bold text-slate-900">{a.akun.nama}</span>
          <span className="ml-2 text-[11px] text-slate-500">saldo normal {a.akun.saldo_normal}</span>
        </span>
        <span className="text-xs text-slate-500">{ada ? `${a.rows.length} mutasi` : 'Tidak ada mutasi'}</span>
        <span className="text-xs whitespace-nowrap text-slate-600 tabular-nums">
          <Rp value={a.saldo_awal} /> <span className="text-slate-400">→</span> <b className="text-slate-900"><Rp value={a.saldo_akhir} /></b>
        </span>
      </button>

      {open && ada ? (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Tanggal</th>
                <th className={th}>Jurnal</th>
                <th className={th}>Sumber</th>
                <th className={th}>Keterangan</th>
                <th className={cn(th, 'text-right')}>Debit</th>
                <th className={cn(th, 'text-right')}>Kredit</th>
                <th className={cn(th, 'text-right')}>Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="text-slate-500 italic">
                <td className="px-3 py-2" colSpan={6}>
                  Saldo awal
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Rp value={a.saldo_awal} />
                </td>
              </tr>
              {a.rows.map((r, i) => (
                <tr key={`${r.jurnal_id}-${i}`} className="text-slate-700">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.tanggal)}</td>
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-rose-700">{r.kode}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{SOURCE_LABEL[r.source_type] ?? r.source_type}</td>
                  <td className="px-3 py-2">
                    <p>{r.keterangan}</p>
                    {r.referensi ? <p className="font-mono text-[11px] text-slate-500">{r.referensi}</p> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.debit ? formatCurrency(r.debit) : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.kredit ? formatCurrency(r.kredit) : ''}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    <Rp value={r.saldo} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 font-bold text-slate-900">
                <td className="px-3 py-2" colSpan={4}>
                  Total mutasi & saldo akhir
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(a.total_debit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(a.total_kredit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Rp value={a.saldo_akhir} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </Card>
  )
}
