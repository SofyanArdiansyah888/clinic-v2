import { toast as pushToast } from '@/shared/components/Toaster'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Gift, HandCoins, Search, Users, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'
import { apiGet } from '@/shared/api/client'
import { EmptyState } from '@/shared/components/EmptyState'
import { KpiCard } from '@/shared/components/KpiCard'
import { PageHeader } from '@/shared/components/PageHeader'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { Button } from '@/shared/ui/button'
import { Tabs } from '@/shared/ui/tabs'
import { formatCurrency, formatDate, todayISO } from '@/shared/lib/formatters'
import { PaymentModal, type PaymentTarget } from '@/features/pembayaran/components/PaymentModal'

type TindakanRow = {
  treatment_id?: number
  treatment?: { nama?: string }
  jumlah?: number
  total?: number
  catatan?: string
  paket_item_id?: number | null
  paket_beli_tindakan_id?: number | null
}

const sesiPaket = (t: TindakanRow) => Boolean(t.paket_item_id) || Boolean(t.paket_beli_tindakan_id)

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
  /** Bill before discounts (tindakan + resep), computed by the API. */
  total?: number
}

const today = todayISO()

function rowTotal(row: QueueRow): number {
  if (row.total && row.total > 0) return row.total
  if (row.biaya && row.biaya > 0) return row.biaya
  return (row.tindakans ?? []).reduce((sum, t) => sum + (t.total ?? 0), 0)
}

function tindakanSummary(row: QueueRow): string {
  const items = row.tindakans ?? []
  if (items.length === 0) return row.diagnosa || 'Perawatan'
  return items
    .map((t) => `${t.treatment?.nama ?? `Treatment #${t.treatment_id ?? '-'}`} (${t.jumlah ?? 1}x${sesiPaket(t) ? ', paket' : ''})`)
    .join(', ')
}

function buildLineItems(row: QueueRow) {
  const items = row.tindakans ?? []
  if (items.length > 0) {
    return items.map((t) => ({
      nama: t.treatment?.nama ?? `Treatment #${t.treatment_id ?? '-'}`,
      qty: t.jumlah ?? 1,
      subtotal: sesiPaket(t) ? 0 : (t.total ?? 0),
      pakai_paket: sesiPaket(t),
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
    // A visit covered only by package sessions is a Rp 0 bill that still has to be settled.
    if (total <= 0 && !(row.tindakans ?? []).some(sesiPaket)) {
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

  return (
    <div className="space-y-6">
      <PageHeader title="Pembayaran Perawatan" description="Tagihan treatment pasien" />

      {/* Same overview grid as the other pages: cards keep their size instead of stretching. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Antrian Kasir"
          value={stats.count}
          icon={<Users className="h-5 w-5" />}
          iconClass="bg-rose-50 text-rose-600"
        />
        <KpiCard
          label="Total Pending"
          value={formatCurrency(stats.totalPending)}
          icon={<HandCoins className="h-5 w-5" />}
          iconClass="bg-indigo-50 text-indigo-600"
        />
      </div>

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { value: 'reguler', label: 'Reguler', icon: <Wrench /> },
          { value: 'paket', label: 'Paket', icon: <Gift /> },
        ]}
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            {activeTab === 'reguler' ? 'Antrian Reguler' : 'Antrian Paket'}
          </h3>
          <div className="relative w-full sm:w-72">
            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari pasien / kode"
              className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pr-3 pl-9 text-xs font-medium focus:border-rose-500 focus:outline-none"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">Memuat antrian kasir...</div>
        ) : isError ? (
          <div className="p-12 text-center text-xs text-rose-600">Gagal memuat data.</div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Belum ada tagihan"
            description="Kirim pasien ke kasir dari menu Perawatan."
          />
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
