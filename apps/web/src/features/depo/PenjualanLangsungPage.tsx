import { toast as pushToast } from '@/shared/components/Toaster'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { apiGet, apiPost } from '@/shared/api/client'
import { BarangSelect, type BarangLite } from '@/shared/components/BarangSelect'
import { EmptyState } from '@/shared/components/EmptyState'
import { PageHeader } from '@/shared/components/PageHeader'
import { StaffSelect } from '@/shared/components/StaffSelect'
import { PasienSelect } from '@/shared/components/PasienSelect'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { Button } from '@/shared/ui/button'
import { Field } from '@/shared/ui/field'
import { FieldErrorsContext, useFormValidation } from '@/shared/lib/validation'
import { formatCurrency, formatDate, todayISO } from '@/shared/lib/formatters'
import { RupiahInput } from '@/shared/ui/rupiah-input'

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
  const [form, setForm] = useState({
    tanggal: today,
    pasien_id: '',
    staff_id: '',
    barang_id: '',
    qty: '1',
    harga_jual: '',
  })
  const validation = useFormValidation()

  function showToast(message: string, tone: 'success' | 'error' = 'success') {
    pushToast(message, tone)
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
      validation.reset()
    },
    onError: (err) => showToast(err instanceof Error ? err.message : 'Gagal membuat penjualan', 'error'),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    submitMutation.mutate()
  }

  function handleBarangSelect(val: string, selected?: BarangLite) {
    setForm((f) => ({
      ...f,
      barang_id: val,
      harga_jual: selected?.harga_jual ? String(selected.harga_jual) : f.harga_jual,
    }))
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Penjualan Langsung" description="Penjualan obat tanpa resep" />

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-bold text-slate-900">Form Penjualan</h3>
        </div>
        <FieldErrorsContext.Provider value={validation.errors}>
          <form {...validation.formProps} onSubmit={onSubmit} className="space-y-4 p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Tanggal" htmlFor="penjualanlangsungpage-f1">
                <input id="penjualanlangsungpage-f1"
                  type="date"
                  value={form.tanggal}
                  onChange={(e) => setForm((f) => ({ ...f, tanggal: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-rose-500 focus:outline-none"
                />
              </Field>
              <Field label="Pasien" htmlFor="penjualanlangsungpage-f2" required>
                <PasienSelect id="penjualanlangsungpage-f2" value={form.pasien_id} onChange={(v) => setForm((f) => ({ ...f, pasien_id: v }))} required />
              </Field>
              <Field label="Staff Depo" htmlFor="penjualanlangsungpage-f3" required>
                <StaffSelect id="penjualanlangsungpage-f3" value={form.staff_id} onChange={(v) => setForm((f) => ({ ...f, staff_id: v }))} placeholder="Cari & pilih staff..." required />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Barang / Obat" htmlFor="penjualanlangsungpage-f4" required className="sm:col-span-2">
                <BarangSelect id="penjualanlangsungpage-f4" value={form.barang_id} onChange={handleBarangSelect} required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Qty" htmlFor="penjualanlangsungpage-f5" required>
                  <input id="penjualanlangsungpage-f5"
                    type="number"
                    required
                    min={1}
                    value={form.qty}
                    onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-rose-500 focus:outline-none"
                  />
                </Field>
                <Field label="Harga" htmlFor="penjualanlangsungpage-f6">
                  <RupiahInput id="penjualanlangsungpage-f6"
                    value={form.harga_jual}
                    onValueChange={(v) => setForm((f) => ({ ...f, harga_jual: v }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-rose-500 focus:outline-none"
                  />
                </Field>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={submitMutation.isPending}>
                <Plus />
                {submitMutation.isPending ? 'Memproses...' : 'Kirim ke Kasir'}
              </Button>
            </div>
          </form>
        </FieldErrorsContext.Provider>

      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-bold text-slate-900">Riwayat Penjualan</h3>
          <div className="relative w-full sm:w-72">
            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kode / invoice"
              className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pr-3 pl-9 text-xs font-medium focus:border-rose-500 focus:outline-none"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">Memuat data penjualan...</div>
        ) : rows.length === 0 ? (
          <EmptyState title="Belum ada penjualan" />
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
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-rose-700">{row.kode}</td>
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
