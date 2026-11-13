import { toast as pushToast } from '@/shared/components/Toaster'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Gift,
  HandCoins,
  Info,
  Printer,
  Search,
  Send,
  Stethoscope,
  Users,
  Wrench,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { apiGet } from '@/shared/api/client'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { Button } from '@/shared/ui/button'
import { formatCurrency, formatDate, todayISO } from '@/shared/lib/formatters'
import { cn } from '@/shared/lib/cn'
import { PaymentModal, type PaymentTarget } from '@/features/pembayaran/components/PaymentModal'

type TindakanRow = {
  treatment_id?: number
  jumlah?: number
  total?: number
  catatan?: string
}

type QueueRow = {
  id: number
  kode: string
  tanggal: string
  status: string
  biaya?: number
  diagnosa?: string
  antrian_jam?: string
  pasien?: { id: number; nama?: string; kode?: string }
  staff?: { id: number; nama?: string }
  tindakans?: TindakanRow[]
}

const today = todayISO()

function rowTotal(row: QueueRow): number {
  if (row.biaya && row.biaya > 0) return row.biaya
  return (row.tindakans ?? []).reduce((sum, t) => sum + (t.total ?? 0), 0)
}

function tindakanSummary(row: QueueRow): string {
  const items = row.tindakans ?? []
  if (items.length === 0) return row.diagnosa || 'Perawatan'
  return items
    .map((t) => `Treatment #${t.treatment_id ?? '-'} (${t.jumlah ?? 1}x)`)
    .join(', ')
}

function buildLineItems(row: QueueRow) {
  const items = row.tindakans ?? []
  if (items.length > 0) {
    return items.map((t) => ({
      nama: `Treatment #${t.treatment_id ?? '-'}`,
      qty: t.jumlah ?? 1,
      subtotal: t.total ?? 0,
    }))
  }
  return [{ nama: row.diagnosa || 'Tagihan perawatan', qty: 1, subtotal: row.biaya ?? 0 }]
}

export function PembayaranPerawatanPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'reguler' | 'paket'>('reguler')
  const [search, setSearch] = useState('')
  const [staffId, setStaffId] = useState('')
  const [payTarget, setPayTarget] = useState<PaymentTarget | null>(null)

  function showToast(message: string, tone: 'success' | 'error' = 'success') {
    pushToast(message, tone)
  }

  const endpoint =
    activeTab === 'reguler' ? '/pembayaran/perawatan/reguler' : '/pembayaran/perawatan/paket'

  const { data, isLoading, isError } = useQuery({
    queryKey: ['pembayaran-perawatan', activeTab, search],
    queryFn: () => apiGet<QueueRow[]>(endpoint, { per_page: 200, page: 1, search: search || undefined }),
  })

  const rows = data?.data ?? []

  const stats = useMemo(() => {
    const totalPending = rows.reduce((sum, r) => sum + rowTotal(r), 0)
    return { count: rows.length, totalPending }
  }, [rows])

  function openPay(row: QueueRow) {
    const total = rowTotal(row)
    if (total <= 0) {
      showToast('Total tagihan Rp 0 — pastikan perawatan memiliki tindakan/biaya', 'error')
      return
    }
    setPayTarget({
      sourceType: 'perawatan',
      sourceId: row.id,
      label: row.kode,
      pasienNama: row.pasien?.nama,
      total,
      lineItems: buildLineItems(row),
    })
  }

  const infoText =
    activeTab === 'reguler'
      ? 'Pasien dari Perawatan (Treatment Reguler atau EMR Kirim ke Kasir) akan muncul di sini. Setelah bayar, status menjadi selesai dan tercatat di penjualan.'
      : 'Tagihan pembelian paket treatment (multi-sesi). Setelah dibayar, paket aktif tercatat dan bisa dibatalkan di menu Batal Paket jika ada sisa sesi.'

  return (
    <div className="space-y-6">

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Kasir — Pembayaran Perawatan</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Terima pembayaran treatment pasien setelah proses dari modul Perawatan.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
        <div className="text-xs text-blue-900">
          <p className="font-bold">Alur: Perawatan → Kasir → Lunas</p>
          <p className="mt-1 text-blue-800">{infoText}</p>
          <Link
            to="/perawatan"
            className="mt-2 inline-flex items-center gap-1 font-bold text-blue-700 hover:underline"
          >
            Buka modul Perawatan <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-medium text-slate-500">Antrian Ke Kasir</p>
            <h3 className="mt-1 text-xl font-extrabold text-rose-600">{stats.count} Pasien</h3>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <Users className="h-6 w-6" />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Tagihan Pending</p>
            <h3 className="mt-1 text-xl font-extrabold text-slate-900">{formatCurrency(stats.totalPending)}</h3>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <HandCoins className="h-6 w-6" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab('reguler')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs font-extrabold transition-all',
            activeTab === 'reguler'
              ? 'bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-md shadow-rose-600/20'
              : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          <Wrench className="h-4 w-4" />
          Perawatan Reguler
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('paket')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs font-extrabold transition-all',
            activeTab === 'paket'
              ? 'bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-md shadow-rose-600/20'
              : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          <Gift className="h-4 w-4" />
          Perawatan Paket
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-rose-600" />
            <h3 className="text-sm font-extrabold text-slate-900">
              {activeTab === 'reguler' ? 'Queue Reguler' : 'Queue Paket'}
            </h3>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari pasien / kode..."
              className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pr-3 pl-9 text-xs font-medium focus:border-rose-500 focus:outline-none"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">Memuat antrian kasir...</div>
        ) : isError ? (
          <div className="p-12 text-center text-xs text-rose-600">Gagal memuat data. Pastikan API server berjalan.</div>
        ) : rows.length === 0 ? (
          <div className="space-y-3 p-12 text-center">
            <p className="text-sm font-bold text-slate-700">Belum ada tagihan menunggu bayar</p>
            <ol className="mx-auto max-w-md list-decimal space-y-1 text-left text-xs text-slate-500">
              <li>Buka menu <strong>Perawatan</strong></li>
              <li>
                {activeTab === 'reguler'
                  ? 'Tab Treatment Reguler → isi pasien & treatment → klik Proses Ke Kasir'
                  : 'Tab Treatment Paket → pilih paket → klik Proses Ke Kasir'}
              </li>
              <li>Kembali ke halaman ini — pasien akan muncul di tabel</li>
            </ol>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-sticky-actions w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Kode</th>
                  <th className="px-4 py-3">Masuk</th>
                  <th className="px-4 py-3">Pasien</th>
                  <th className="px-4 py-3">Dokter</th>
                  <th className="px-4 py-3">Rincian</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono text-xs font-bold whitespace-nowrap text-rose-700">{row.kode}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-600">
                      <div>{formatDate(row.tanggal || today)}</div>
                      {row.antrian_jam ? <div className="text-[11px] text-slate-400">{row.antrian_jam}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-800">{row.pasien?.nama || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{row.staff?.nama || '-'}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-xs text-slate-500" title={tindakanSummary(row)}>
                      {tindakanSummary(row)}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-900">{formatCurrency(rowTotal(row))}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => openPay(row)}
                          className="h-8 rounded-lg bg-rose-600 text-[11px] font-bold text-white hover:bg-rose-700"
                        >
                          Bayar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => showToast('Print invoice — segera hadir', 'success')}
                          className="h-8 rounded-lg px-2"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => showToast('Kirim invoice — segera hadir', 'success')}
                          className="h-8 rounded-lg px-2"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PaymentModal
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        target={payTarget}
        staffId={staffId}
        onStaffIdChange={setStaffId}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ['pembayaran-perawatan'] })
          void queryClient.invalidateQueries({ queryKey: ['perawatan'] })
          void queryClient.invalidateQueries({ queryKey: ['antrian'] })
          void queryClient.invalidateQueries({ queryKey: ['pembayaran-paket-sisa'] })
          showToast('Pembayaran berhasil diproses!', 'success')
        }}
        onError={(msg) => showToast(msg, 'error')}
      />
    </div>
  )
}
