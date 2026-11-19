import { toast as pushToast } from '@/shared/components/Toaster'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { HandCoins, Laptop, Package, Search, ShoppingCart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { apiGet } from '@/shared/api/client'
import { EmptyState } from '@/shared/components/EmptyState'
import { KpiCard } from '@/shared/components/KpiCard'
import { PageHeader } from '@/shared/components/PageHeader'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { Button } from '@/shared/ui/button'
import { Tabs } from '@/shared/ui/tabs'
import { formatCurrency, formatDate } from '@/shared/lib/formatters'
import { PaymentModal, type PaymentTarget } from '@/features/pembayaran/components/PaymentModal'

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

  function showToast(message: string, tone: 'success' | 'error' = 'success') {
    pushToast(message, tone)
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
      <PageHeader title="Pembayaran Produk" description="Tagihan obat & produk dari depo" />

      {/* Same overview grid as the other pages: cards keep their size instead of stretching. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Invoice Pending"
          value={stats.count}
          icon={<Package className="h-5 w-5" />}
          iconClass="bg-rose-50 text-rose-600"
        />
        <KpiCard
          label="Total Tagihan"
          value={formatCurrency(stats.total)}
          icon={<HandCoins className="h-5 w-5" />}
          iconClass="bg-indigo-50 text-indigo-600"
        />
      </div>

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { value: 'langsung', label: 'Langsung', icon: <ShoppingCart /> },
          { value: 'online', label: 'Online', icon: <Laptop /> },
        ]}
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-bold text-slate-900">Daftar Invoice</h3>
          <div className="relative w-full sm:w-72">
            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari invoice / pasien"
              className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pr-3 pl-9 text-xs font-medium focus:border-rose-500 focus:outline-none"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">Memuat invoice produk...</div>
        ) : rows.length === 0 ? (
          <EmptyState title="Belum ada tagihan" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-sticky-actions w-full text-left text-sm">
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
                    <td className="px-4 py-3 font-mono text-xs font-bold text-rose-700">{row.kode}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{formatDate(row.tanggal)}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-800">{row.pasien?.nama || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{row.keterangan || '-'}</td>
                    <td className="px-4 py-3 text-xs font-bold">{formatCurrency(row.total_harga ?? 0)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button type="button" size="sm" onClick={() => openPay(row)}>
                          Bayar
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
