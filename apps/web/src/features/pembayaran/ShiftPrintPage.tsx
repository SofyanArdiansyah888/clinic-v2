import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { Loader2, Printer } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { apiGet } from '@/shared/api/client'
import { useAuthStore } from '@/features/auth/store'
import { KopSurat } from '@/shared/components/print/PrintDocument'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn'
import { formatCurrency, formatDateTime } from '@/shared/lib/formatters'
import { metodeLabel } from '@/shared/lib/pembayaran'
import { PAGE_CSS, printDocument, waitForImages } from '@/shared/lib/print'
import { SUMBER_MUTASI, selisihInfo, type KasirShiftDetail } from './kasir-shift'

const rp = (v: number) => (v < 0 ? `- ${formatCurrency(-v)}` : formatCurrency(v))
const cetak = (kode: string) => printDocument(`Tutup Kasir ${kode}`, PAGE_CSS.A4)

/** A4 cash-up report for one cashier shift; opened in its own tab and printed once loaded. */
export function ShiftPrintPage() {
  const { id } = useParams({ strict: false }) as { id?: string }
  const user = useAuthStore((s) => s.user)
  const query = useQuery({
    queryKey: ['kasir-shift', id],
    queryFn: () => apiGet<KasirShiftDetail>(`/kasir/shift/${id}`),
    enabled: Boolean(id),
    retry: false,
  })
  const d = query.data?.data

  const printed = useRef(false)
  useEffect(() => {
    if (!d || printed.current) return
    printed.current = true
    void waitForImages().then(() => cetak(d.shift.kode))
  }, [d])

  const errorMessage = (query.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{PAGE_CSS.A4}</style>
      <div className="print-hide mx-auto mb-4 flex max-w-[210mm] justify-end px-4">
        <Button type="button" size="sm" disabled={!d} onClick={() => d && cetak(d.shift.kode)}>
          <Printer />
          Cetak
        </Button>
      </div>
      {query.isLoading ? (
        <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat laporan kasir...
        </p>
      ) : !d ? (
        <p className="mx-auto max-w-md rounded-xl bg-white p-6 text-center text-sm font-semibold text-rose-700">
          {errorMessage || 'Shift kasir tidak ditemukan.'}
        </p>
      ) : (
        <div className="mx-auto w-[210mm] bg-white p-[14mm] text-[11px] text-slate-900 shadow-sm print:w-auto print:p-0 print:shadow-none">
          <Laporan d={d} />
          <p className="mt-4 text-[9px] text-slate-500">
            Dicetak oleh {user?.name || user?.username || '-'} pada {formatDateTime(new Date())}
          </p>
        </div>
      )}
    </div>
  )
}

function Laporan({ d }: { d: KasirShiftDetail }) {
  const s = d.shift
  const closed = s.status === 'closed'
  const selisih = s.selisih ?? 0
  const info = selisihInfo(selisih)
  return (
    <>
      <KopSurat />
      <div className="mt-4 flex items-start justify-between gap-6">
        <div>
          <p className="text-base font-black tracking-widest">LAPORAN TUTUP KASIR</p>
          <p className="font-mono text-sm font-bold">{s.kode}</p>
          {!closed ? <p className="mt-1 font-bold text-amber-700">Shift masih terbuka — angka sementara</p> : null}
        </div>
        <table className="text-[10px]">
          <tbody>
            <Info label="Kasir" value={s.kasir_nama || '-'} />
            <Info label="Dibuka" value={formatDateTime(s.opened_at)} />
            <Info label="Ditutup" value={s.closed_at ? formatDateTime(s.closed_at) : '-'} />
            {s.closed_by_nama ? <Info label="Ditutup oleh" value={s.closed_by_nama} /> : null}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_78mm] gap-5">
        <div>
          <p className="mb-1 font-bold">Ringkasan per metode</p>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-y border-slate-700 text-left">
                <th className="py-1">Metode</th>
                <th className="py-1 text-right">Trx</th>
                <th className="py-1 text-right">Masuk</th>
                <th className="py-1 text-right">Keluar</th>
                <th className="py-1 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {d.ringkasan.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-2 text-center text-slate-500">
                    Tidak ada transaksi
                  </td>
                </tr>
              ) : (
                d.ringkasan.map((r) => (
                  <tr key={r.jenis_pembayaran} className="border-b border-slate-200">
                    <td className="py-1">{metodeLabel(r.jenis_pembayaran)}</td>
                    <td className="py-1 text-right tabular-nums">{r.jumlah}</td>
                    <td className="py-1 text-right tabular-nums">{formatCurrency(r.masuk)}</td>
                    <td className="py-1 text-right tabular-nums">{formatCurrency(r.keluar)}</td>
                    <td className="py-1 text-right font-semibold tabular-nums">{rp(r.net)}</td>
                  </tr>
                ))
              )}
              <tr className="border-t border-slate-700 font-bold">
                <td className="py-1">Total</td>
                <td className="py-1 text-right tabular-nums">{d.mutasi.length}</td>
                <td className="py-1 text-right tabular-nums">{formatCurrency(d.total_masuk)}</td>
                <td className="py-1 text-right tabular-nums">{formatCurrency(d.total_keluar)}</td>
                <td className="py-1 text-right tabular-nums">{rp(d.total_masuk - d.total_keluar)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded border border-slate-400 p-2">
          <p className="mb-1 font-bold">Rekonsiliasi kas tunai</p>
          <Line label="Modal awal" value={s.saldo_awal} />
          <Line label="Tunai masuk" value={d.tunai_masuk} />
          <Line label="Tunai keluar" value={-d.tunai_keluar} />
          <Line label="Kas diharapkan" value={d.expected_tunai} className="border-t border-slate-400 pt-0.5 font-bold" />
          <Line label="Kas dihitung (fisik)" value={s.saldo_akhir_fisik ?? 0} muted={!closed} />
          <div className={cn('mt-1 flex justify-between rounded px-1 py-0.5 font-bold', closed ? info.tone : 'text-slate-400')}>
            <span>Selisih {closed ? `(${info.label})` : ''}</span>
            <span className="tabular-nums">{closed ? rp(selisih) : '-'}</span>
          </div>
        </div>
      </div>

      <p className="mt-5 mb-1 font-bold">Rincian mutasi</p>
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-y border-slate-700 text-left">
            <th className="py-1">Waktu</th>
            <th className="py-1">Sumber</th>
            <th className="py-1">Referensi</th>
            <th className="py-1">Metode</th>
            <th className="py-1 text-right">Masuk</th>
            <th className="py-1 text-right">Keluar</th>
          </tr>
        </thead>
        <tbody>
          {d.mutasi.map((m) => (
            <tr key={m.id} className="border-b border-slate-200 break-inside-avoid">
              <td className="py-0.5 whitespace-nowrap">{formatDateTime(m.waktu)}</td>
              <td className="py-0.5">{SUMBER_MUTASI[m.source_type] ?? m.source_type}</td>
              <td className="py-0.5 font-mono">{m.referensi || '-'}</td>
              <td className="py-0.5">
                {metodeLabel(m.jenis_pembayaran)}
                {m.bank_nama ? ` (${m.bank_nama})` : ''}
              </td>
              <td className="py-0.5 text-right tabular-nums">{m.masuk ? formatCurrency(m.masuk) : ''}</td>
              <td className="py-0.5 text-right tabular-nums">{m.keluar ? formatCurrency(m.keluar) : ''}</td>
            </tr>
          ))}
          {d.mutasi.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-2 text-center text-slate-500">
                Tidak ada mutasi
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {s.catatan_buka || s.catatan_tutup ? (
        <div className="mt-3 space-y-0.5">
          {s.catatan_buka ? <p>Catatan buka: {s.catatan_buka}</p> : null}
          {s.catatan_tutup ? <p>Catatan tutup: {s.catatan_tutup}</p> : null}
        </div>
      ) : null}

      <div className="mt-10 grid grid-cols-2 gap-16 break-inside-avoid text-center">
        {[
          ['Kasir', s.kasir_nama],
          ['Diperiksa oleh', ''],
        ].map(([label, nama]) => (
          <div key={label}>
            <p>{label},</p>
            <div className="mt-14 border-t border-slate-500 pt-0.5">{nama || ' '}</div>
          </div>
        ))}
      </div>
    </>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="pr-2 text-slate-500">{label}</td>
      <td className="font-semibold">{value}</td>
    </tr>
  )
}

function Line({ label, value, className, muted }: { label: string; value: number; className?: string; muted?: boolean }) {
  return (
    <div className={cn('flex justify-between', muted && 'text-slate-400', className)}>
      <span>{label}</span>
      <span className="tabular-nums">{muted ? '-' : rp(value)}</span>
    </div>
  )
}
