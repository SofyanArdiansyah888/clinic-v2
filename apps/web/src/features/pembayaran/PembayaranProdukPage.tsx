import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCard, HandCoins, Laptop, Package, Printer, Search, Send, ShoppingCart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { apiGet } from '@/shared/api/client'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { Button } from '@/shared/ui/button'
import { formatCurrency, formatDate } from '@/shared/lib/formatters'
import { cn } from '@/shared/lib/cn'
import { PaymentModal, type PaymentTarget } from '@/features/pembayaran/components/PaymentModal'
import { PembayaranToast } from '@/features/pembayaran/components/PembayaranToast'

type PenjualanRow = {
  id: number
  kode: string
  tanggal: string
  status: string
  total_harga?: number
  keterangan?: string
  pasien?: { id: number; nama?: string }
  staff?: { id: number; nama?: string }
}

export function PembayaranProdukPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'langsung' | 'online'>('langsung')
  const [search, setSearch] = useState('')
  const [staffId, setStaffId] = useState('')
  const [payTarget, setPayTarget] = useState<PaymentTarget | null>(null)
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)

  function showToast(message: string, tone: 'success' | 'error' = 'success') {
    setToast({ message, tone })
    window.setTimeout(() => setToast(null), 3200)
  }

  const endpoint = activeTab === 'langsung' ? '/pembayaran/produk/langsung' : '/pembayaran/produk/online'

  const { data, isLoading } = useQuery({
    queryKey: ['pembayaran-produk', activeTab, search],
    queryFn: () => apiGet<PenjualanRow[]>(endpoint, { per_page: 200, page: 1, search: search || undefined }),
  })

  const rows = data?.data ?? []

  const stats = useMemo(() => {
    const total = rows.reduce((sum, r) => sum + (r.total_harga ?? 0), 0)
    return { count: rows.length, total }
  }, [rows])

  function openPay(row: PenjualanRow) {
    setPayTarget({
      sourceType: 'penjualan',
      sourceId: row.id,
      label: row.kode,
      pasienNama: row.pasien?.nama,
      total: row.total_harga ?? 0,
    })
  }

  return (
    <div className="space-y-6">
      {toast ? <PembayaranToast message={toast.message} tone={toast.tone} /> : null}

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Kasir — Pembayaran Produk</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Tagihan penjualan obat/produk dari depo langsung dan pemesanan online. Staff kasir dipilih saat bayar.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-medium text-slate-500">Invoice Pending</p>
            <h3 className="mt-1 text-xl font-extrabold text-teal-600">{stats.count}</h3>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
            <Package className="h-6 w-6" />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Tagihan</p>
            <h3 className="mt-1 text-xl font-extrabold text-slate-900">{formatCurrency(stats.total)}</h3>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <HandCoins className="h-6 w-6" />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-medium text-slate-500">Metode</p>
            <h3 className="mt-1 text-xl font-extrabold text-rose-600">
              {activeTab === 'langsung' ? 'Langsung' : 'Online'}
            </h3>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <CreditCard className="h-6 w-6" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab('langsung')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs font-extrabold transition-all',
            activeTab === 'langsung'
              ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-600/20'
              : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          <ShoppingCart className="h-4 w-4" />
          Penjualan Langsung
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('online')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs font-extrabold transition-all',
            activeTab === 'online'
              ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-600/20'
              : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          <Laptop className="h-4 w-4" />
          Pemesanan Online
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-extrabold text-slate-900">Daftar Invoice Produk</h3>
          <div className="relative w-full sm:w-72">
            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari invoice / pasien..."
              className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pr-3 pl-9 text-xs font-medium focus:border-teal-500 focus:outline-none"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">Memuat invoice produk...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">Tidak ada penjualan produk menunggu bayar.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Pasien</th>
                  <th className="px-4 py-3">Keterangan</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-teal-700">{row.kode}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{formatDate(row.tanggal)}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-800">{row.pasien?.nama || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{row.keterangan || '-'}</td>
                    <td className="px-4 py-3 text-xs font-bold">{formatCurrency(row.total_harga ?? 0)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => openPay(row)}
                          className="h-8 rounded-lg bg-teal-600 text-[11px] font-bold text-white hover:bg-teal-700"
                        >
                          Bayar
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg px-2">
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg px-2">
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
          void queryClient.invalidateQueries({ queryKey: ['pembayaran-produk'] })
          showToast('Pembayaran produk berhasil!', 'success')
        }}
        onError={(msg) => showToast(msg, 'error')}
      />
    </div>
  )
}
