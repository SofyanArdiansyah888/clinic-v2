import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Plus, Search, ShoppingCart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { apiGet, apiPost } from '@/shared/api/client'
import { BarangSelect, type BarangLite } from '@/shared/components/BarangSelect'
import { DokterSelect } from '@/shared/components/DokterSelect'
import { PasienSelect } from '@/shared/components/PasienSelect'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { Button } from '@/shared/ui/button'
import { formatCurrency, formatDate, todayISO } from '@/shared/lib/formatters'
import { cn } from '@/shared/lib/cn'
import { PembayaranToast } from '@/features/pembayaran/components/PembayaranToast'

type PenjualanRow = {
  id: number
  kode: string
  tanggal: string
  status: string
  total_harga?: number
  keterangan?: string
  pasien?: { nama?: string }
}

const today = todayISO()

export function PenjualanLangsungPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const [form, setForm] = useState({
    tanggal: today,
    pasien_id: '',
    staff_id: '',
    barang_id: '',
    qty: '1',
    harga_jual: '',
  })

  function showToast(message: string, tone: 'success' | 'error' = 'success') {
    setToast({ message, tone })
    window.setTimeout(() => setToast(null), 3200)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['depo-langsung', search],
    queryFn: () =>
      apiGet<PenjualanRow[]>('/penjualan', {
        per_page: 50,
        page: 1,
        search: search || undefined,
        keterangan: 'Penjualan Langsung',
      }),
  })

  const rows = useMemo(
    () => (data?.data ?? []).filter((r) => r.keterangan?.toLowerCase().includes('langsung')),
    [data?.data],
  )

  const submitMutation = useMutation({
    mutationFn: async () => {
      const pasienId = Number(form.pasien_id)
      const staffId = Number(form.staff_id)
      const barangId = Number(form.barang_id)
      const qty = Number(form.qty || 1)
      const harga = Number(form.harga_jual || 0)
      if (!pasienId) throw new Error('Pasien wajib dipilih')
      if (!staffId) throw new Error('Staff depo wajib dipilih')
      if (!barangId) throw new Error('Barang wajib dipilih')
      if (!qty || qty <= 0) throw new Error('Qty tidak valid')

      return apiPost('/penjualan', {
        pasien_id: pasienId,
        staff_id: staffId,
        tanggal: form.tanggal || today,
        status: 'confirmed',
        keterangan: 'Penjualan Langsung',
        details: [{ barang_id: barangId, qty, harga_jual: harga }],
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['depo-langsung'] })
      void queryClient.invalidateQueries({ queryKey: ['pembayaran-produk'] })
      showToast('Penjualan berhasil diproses ke kasir pembayaran!', 'success')
      setForm((f) => ({ ...f, barang_id: '', qty: '1', harga_jual: '' }))
    },
    onError: (err) => showToast(err instanceof Error ? err.message : 'Gagal membuat penjualan', 'error'),
  })

  function handleBarangSelect(val: string, selected?: BarangLite) {
    setForm((f) => ({
      ...f,
      barang_id: val,
      harga_jual: selected?.harga_jual ? String(selected.harga_jual) : f.harga_jual,
    }))
  }

  return (
    <div className="space-y-6">
      {toast ? <PembayaranToast message={toast.message} tone={toast.tone} /> : null}

      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Depo — Penjualan Langsung</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Input penjualan obat/produk tanpa resep. Tagihan otomatis masuk ke kasir produk.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-emerald-50 px-5 py-4">
          <ShoppingCart className="h-5 w-5 text-teal-600" />
          <h3 className="text-sm font-extrabold text-slate-900">Form Penjualan Langsung</h3>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Tanggal</label>
              <input
                type="date"
                value={form.tanggal}
                onChange={(e) => setForm((f) => ({ ...f, tanggal: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Pasien</label>
              <PasienSelect value={form.pasien_id} onChange={(v) => setForm((f) => ({ ...f, pasien_id: v }))} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Staff Depo</label>
              <DokterSelect value={form.staff_id} onChange={(v) => setForm((f) => ({ ...f, staff_id: v }))} required />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Barang / Obat</label>
              <BarangSelect value={form.barang_id} onChange={handleBarangSelect} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Qty</label>
                <input
                  type="number"
                  min={1}
                  value={form.qty}
                  onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-teal-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Harga</label>
                <input
                  type="number"
                  value={form.harga_jual}
                  onChange={(e) => setForm((f) => ({ ...f, harga_jual: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-teal-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              disabled={submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
              className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-xs font-bold text-white"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {submitMutation.isPending ? 'Memproses...' : 'Proses Ke Kasir Pembayaran'}
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-teal-600" />
            <h3 className="text-sm font-extrabold text-slate-900">Riwayat Penjualan Langsung</h3>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kode / invoice..."
              className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pr-3 pl-9 text-xs font-medium focus:border-teal-500 focus:outline-none"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">Memuat data penjualan...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">Belum ada penjualan langsung.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Kode</th>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Pasien</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className={cn('hover:bg-slate-50/60')}>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-teal-700">{row.kode}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{formatDate(row.tanggal)}</td>
                    <td className="px-4 py-3 text-xs font-semibold">{row.pasien?.nama || '-'}</td>
                    <td className="px-4 py-3 text-xs font-bold">{formatCurrency(row.total_harga ?? 0)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
