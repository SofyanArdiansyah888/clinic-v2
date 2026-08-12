import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Calendar,
  CirclePlus,
  FileText,
  History,
  Info,
  Phone,
  Plus,
  Search,
  Stethoscope,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { apiDelete, apiGet, apiPost, apiPut } from '@/shared/api/client'
import { BeauticianSelect, type StaffLite } from '@/shared/components/BeauticianSelect'
import { DokterSelect } from '@/shared/components/DokterSelect'
import { PasienSelect } from '@/shared/components/PasienSelect'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { TreatmentSelect, type TreatmentLite } from '@/shared/components/TreatmentSelect'
import { Button } from '@/shared/ui/button'
import { formatCurrency, formatDate } from '@/shared/lib/formatters'
import { cn } from '@/shared/lib/cn'

type AntrianRow = {
  id: number
  kode: string
  pasien_id: number
  staff_id: number
  tanggal: string
  jam?: string
  status: string
  keterangan?: string
  pasien?: { id: number; kode?: string; nama?: string; no_telp?: string }
  staff?: { id: number; nama?: string; jabatan?: string }
}

type PerawatanRow = {
  id: number
  kode: string
  tanggal?: string
  status: string
  biaya?: number
  diagnosa?: string
  pasien?: { id: number; nama?: string; kode?: string }
  staff?: { id: number; nama?: string }
}

type TreatmentRegulerRow = {
  treatment_id: number
  nama_treatment?: string
  jumlah: number
  beautician_id?: number | null
  nama_beautician?: string
  harga: number
  diskon: number
  rp_percent: number
  total: number
}

const today = new Date().toISOString().slice(0, 10)

function calculateRegulerTotal(r: TreatmentRegulerRow): number {
  const jumlah = Number(r.jumlah) || 0
  const harga = Number(r.harga) || 0
  const diskon = Number(r.diskon) || 0
  const subtotal = jumlah * harga
  const totalDiskon = (subtotal * diskon) / 100
  return subtotal - totalDiskon
}

export function PerawatanListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'baru' | 'reguler' | 'data'>('baru')

  // State for Tab 1: Perawatan Baru
  const [baruTanggal, setBaruTanggal] = useState(today)
  const [baruSearch, setBaruSearch] = useState('')

  // State for Tab 2: Treatment Reguler
  const [regulerForm, setRegulerForm] = useState({
    tanggal: today,
    pasien_id: '',
    staff_id: '',
  })
  const [regulerDetails, setRegulerDetails] = useState<TreatmentRegulerRow[]>([])

  // State for Tab 3: Data Perawatan
  const [dataSearch, setDataSearch] = useState('')

  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)

  function showToast(message: string, tone: 'success' | 'error' = 'success') {
    setToast({ message, tone })
    window.setTimeout(() => setToast(null), 3200)
  }

  // Query Tab 1: Antrian Perawatan Baru
  const { data: antrianData, isLoading: loadingAntrian } = useQuery({
    queryKey: ['antrian', 'perawatan-baru', baruTanggal],
    queryFn: () => apiGet<AntrianRow[]>('/antrian', { per_page: 200, page: 1 }),
  })

  // Query Tab 3: Data Perawatan
  const { data: perawatanData, isLoading: loadingPerawatan } = useQuery({
    queryKey: ['perawatan', 'list'],
    queryFn: () => apiGet<PerawatanRow[]>('/perawatan', { per_page: 200, page: 1 }),
  })

  // Filter Tab 1
  const antrianList = useMemo(() => {
    const rows = antrianData?.data ?? []
    const searchLow = baruSearch.trim().toLowerCase()
    return rows.filter((r) => {
      const isStatusMatch = ['menunggu', 'dipanggil', 'menunggu perawatan'].includes(r.status.toLowerCase())
      const isDateMatch = !baruTanggal || r.tanggal.slice(0, 10) === baruTanggal
      const isSearchMatch =
        !searchLow ||
        r.kode.toLowerCase().includes(searchLow) ||
        (r.pasien?.nama ?? '').toLowerCase().includes(searchLow) ||
        (r.pasien?.kode ?? '').toLowerCase().includes(searchLow) ||
        (r.staff?.nama ?? '').toLowerCase().includes(searchLow)
      return isStatusMatch && isDateMatch && isSearchMatch
    })
  }, [antrianData?.data, baruTanggal, baruSearch])

  // Filter Tab 3
  const filteredPerawatan = useMemo(() => {
    const rows = perawatanData?.data ?? []
    const q = dataSearch.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.kode.toLowerCase().includes(q) ||
        (r.pasien?.nama ?? '').toLowerCase().includes(q) ||
        (r.staff?.nama ?? '').toLowerCase().includes(q) ||
        (r.diagnosa ?? '').toLowerCase().includes(q),
    )
  }, [perawatanData?.data, dataSearch])

  // Mutations
  const updateAntrianStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiPut(`/antrian/${id}`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['antrian'] })
      showToast('Status antrian berhasil diperbarui!', 'success')
    },
    onError: () => showToast('Gagal memperbarui status antrian', 'error'),
  })

  const deletePerawatanMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/perawatan/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['perawatan'] })
      showToast('Data perawatan berhasil dihapus', 'success')
    },
    onError: () => showToast('Gagal menghapus data perawatan', 'error'),
  })

  const submitRegulerMutation = useMutation({
    mutationFn: async () => {
      const pasienId = Number(regulerForm.pasien_id)
      const staffId = Number(regulerForm.staff_id)
      if (!pasienId) throw new Error('Pasien wajib dipilih')
      if (!staffId) throw new Error('Dokter wajib dipilih')
      if (regulerDetails.length === 0) throw new Error('Minimal satu treatment harus ditambahkan')

      for (let i = 0; i < regulerDetails.length; i++) {
        if (!regulerDetails[i].treatment_id) {
          throw new Error(`Treatment pada baris ${i + 1} wajib dipilih`)
        }
      }

      const formattedTindakans = regulerDetails.map((d) => ({
        treatment_id: d.treatment_id,
        tanggal: regulerForm.tanggal || today,
        jumlah: d.jumlah || 1,
        beautician_id: d.beautician_id ? Number(d.beautician_id) : null,
        harga: d.harga || 0,
        diskon: d.diskon || 0,
        rp_percent: d.rp_percent || 0,
        total: calculateRegulerTotal(d),
        catatan: d.nama_beautician ? `Beautician: ${d.nama_beautician}` : '',
      }))

      const totalBiaya = formattedTindakans.reduce((sum, t) => sum + t.total, 0)

      return apiPost('/perawatan', {
        pasien_id: pasienId,
        staff_id: staffId,
        tanggal: regulerForm.tanggal || today,
        diagnosa: 'Treatment Reguler',
        biaya: totalBiaya,
        status: 'diproses',
        tindakans: formattedTindakans,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['perawatan'] })
      showToast('Treatment berhasil diproses ke kasir pembayaran!', 'success')
      setRegulerForm({ tanggal: today, pasien_id: '', staff_id: '' })
      setRegulerDetails([])
      setActiveTab('data')
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : 'Gagal memproses treatment reguler', 'error')
    },
  })

  // Handlers for Treatment Reguler rows
  function handleAddRegulerRow() {
    setRegulerDetails((prev) => [
      ...prev,
      {
        treatment_id: 0,
        nama_treatment: '',
        jumlah: 1,
        beautician_id: null,
        nama_beautician: '',
        harga: 0,
        diskon: 0,
        rp_percent: 0,
        total: 0,
      },
    ])
  }

  function handleRemoveRegulerRow(idx: number) {
    setRegulerDetails((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleRegulerTreatmentSelect(idx: number, val: string, selected?: TreatmentLite) {
    if (!selected) return
    setRegulerDetails((prev) => {
      const updated = [...prev]
      const cur = updated[idx]
      const harga = selected.harga || 0
      const jumlah = cur.jumlah || 1
      const updatedRow = {
        ...cur,
        treatment_id: selected.id,
        nama_treatment: selected.nama,
        harga,
        jumlah,
      }
      updatedRow.total = calculateRegulerTotal(updatedRow)
      updated[idx] = updatedRow
      return updated
    })
  }

  function handleRegulerBeauticianSelect(idx: number, val: string, selected?: StaffLite) {
    setRegulerDetails((prev) => {
      const updated = [...prev]
      updated[idx] = {
        ...updated[idx],
        beautician_id: selected ? selected.id : null,
        nama_beautician: selected?.nama || '',
      }
      return updated
    })
  }

  function handleRegulerRowChange(idx: number, field: keyof TreatmentRegulerRow, val: any) {
    setRegulerDetails((prev) => {
      const updated = [...prev]
      const cur = { ...updated[idx], [field]: val }
      cur.total = calculateRegulerTotal(cur)
      updated[idx] = cur
      return updated
    })
  }

  const grandTotalReguler = useMemo(() => {
    return regulerDetails.reduce((sum, item) => sum + calculateRegulerTotal(item), 0)
  }, [regulerDetails])

  return (
    <div className="space-y-6">
      {toast ? (
        <div className="pointer-events-none fixed top-5 right-5 z-[110] max-w-sm">
          <div
            className={cn(
              'pointer-events-auto flex items-center gap-3 rounded-2xl border p-3.5 text-xs font-semibold text-white shadow-xl',
              toast.tone === 'error' ? 'border-rose-800 bg-rose-950' : 'border-emerald-700 bg-slate-950',
            )}
          >
            <span className="flex-1">{toast.message}</span>
          </div>
        </div>
      ) : null}

      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Perawatan (SOAP) & Treatment</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Daftar antrian perawatan baru, form treatment reguler kasir, dan rekam medis pasien.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => navigate({ to: '/perawatan/detail' })}
            className="rounded-xl text-xs bg-rose-600 hover:bg-rose-700 text-white"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Perawatan Baru (SOAP)
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 bg-white p-2 rounded-2xl shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab('baru')}
          className={cn(
            'flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all',
            activeTab === 'baru'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
          )}
        >
          <CirclePlus className="h-4 w-4 text-emerald-600" />
          Perawatan Baru
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reguler')}
          className={cn(
            'flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all',
            activeTab === 'reguler'
              ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
          )}
        >
          <Stethoscope className="h-4 w-4 text-blue-600" />
          Treatment Reguler
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('data')}
          className={cn(
            'flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all',
            activeTab === 'data'
              ? 'bg-purple-50 text-purple-700 border border-purple-200 shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
          )}
        >
          <FileText className="h-4 w-4 text-purple-600" />
          Data Perawatan
        </button>
      </div>

      {/* TAB 1: PERAWATAN BARU */}
      {activeTab === 'baru' ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden space-y-4">
          <div className="flex flex-col items-stretch justify-between gap-3 border-b border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center">
            <h3 className="text-sm font-bold text-slate-900">Antrian Menunggu Perawatan</h3>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <input
                  type="date"
                  value={baruTanggal}
                  onChange={(e) => setBaruTanggal(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium focus:border-rose-500 focus:outline-none"
                />
              </div>
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={baruSearch}
                  onChange={(e) => setBaruSearch(e.target.value)}
                  placeholder="Cari pasien / no. antrian..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {loadingAntrian ? (
            <div className="p-8 text-center text-xs text-slate-500">Memuat antrian perawatan baru...</div>
          ) : antrianList.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              Tidak ada pasien antrian untuk filter tanggal / pencarian ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-center">No Antrian</th>
                    <th className="px-4 py-3">No Member</th>
                    <th className="px-4 py-3">Nama Pasien</th>
                    <th className="px-4 py-3">Dokter</th>
                    <th className="px-4 py-3">Datang</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {antrianList.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 text-center font-mono font-extrabold text-rose-700">
                        <span className="rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1">
                          {row.kode}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">{row.pasien?.kode || '-'}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{row.pasien?.nama || '-'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{row.staff?.nama || '-'}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(row.tanggal)} {row.jam ? `(${row.jam})` : ''}</td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            title="Riwayat Pasien"
                            onClick={() => navigate({ to: '/perawatan/riwayat', search: { pasien_id: String(row.pasien_id) } })}
                            className="rounded-full bg-purple-500 p-1.5 text-white hover:bg-purple-600 transition-colors"
                          >
                            <History className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Panggil Pasien"
                            onClick={() => updateAntrianStatusMutation.mutate({ id: row.id, status: 'dipanggil' })}
                            className="rounded-full bg-blue-500 p-1.5 text-white hover:bg-blue-600 transition-colors"
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Antri Treatment & Resep (Input SOAP)"
                            onClick={() =>
                              navigate({
                                to: '/perawatan/detail',
                                search: { pasien_id: String(row.pasien_id), antrian_id: String(row.id) },
                              })
                            }
                            className="rounded-full bg-emerald-500 p-1.5 text-white hover:bg-emerald-600 transition-colors"
                          >
                            <Stethoscope className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Batalkan Antrian"
                            onClick={() => updateAntrianStatusMutation.mutate({ id: row.id, status: 'batal' })}
                            className="rounded-full bg-rose-500 p-1.5 text-white hover:bg-rose-600 transition-colors"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* TAB 2: TREATMENT REGULER */}
      {activeTab === 'reguler' ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Form Khusus Treatment Reguler</h3>
              <p className="text-xs text-slate-500">Input cepat treatment pasien untuk langsung diproses ke kasir pembayaran.</p>
            </div>
            <Button
              type="button"
              disabled={submitRegulerMutation.isPending}
              onClick={() => submitRegulerMutation.mutate()}
              className="rounded-xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Stethoscope className="h-3.5 w-3.5 mr-1" />
              {submitRegulerMutation.isPending ? 'Memproses...' : 'Proses Ke Kasir Pembayaran'}
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 max-w-4xl">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Tanggal</label>
              <input
                type="date"
                value={regulerForm.tanggal}
                onChange={(e) => setRegulerForm((f) => ({ ...f, tanggal: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium focus:border-rose-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Dokter Penanggung Jawab *</label>
              <DokterSelect
                required
                value={regulerForm.staff_id}
                onChange={(staff_id) => setRegulerForm((f) => ({ ...f, staff_id }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Pasien *</label>
              <PasienSelect
                required
                value={regulerForm.pasien_id}
                onChange={(pasien_id) => setRegulerForm((f) => ({ ...f, pasien_id }))}
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Daftar Tindakan Treatment</span>
              <Button type="button" size="sm" onClick={handleAddRegulerRow} className="rounded-xl text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Tambah Treatment
              </Button>
            </div>

            {regulerDetails.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                Belum ada treatment ditambahkan. Klik <b>Tambah Treatment</b>.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase text-[10px]">
                    <tr>
                      <th className="min-w-[200px] px-3 py-2.5">Tindakan</th>
                      <th className="w-20 px-3 py-2.5">Jumlah</th>
                      <th className="min-w-[180px] px-3 py-2.5">Beautician</th>
                      <th className="w-28 px-3 py-2.5">Harga</th>
                      <th className="w-20 px-3 py-2.5">Diskon %</th>
                      <th className="w-20 px-3 py-2.5">RP %</th>
                      <th className="w-28 px-3 py-2.5 text-right">Total</th>
                      <th className="w-12 px-3 py-2.5 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {regulerDetails.map((row, idx) => (
                      <tr key={idx}>
                        <td className="p-2">
                          <TreatmentSelect
                            value={row.treatment_id ? String(row.treatment_id) : ''}
                            onChange={(val, selected) => handleRegulerTreatmentSelect(idx, val, selected)}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min={1}
                            value={row.jumlah}
                            onChange={(e) => handleRegulerRowChange(idx, 'jumlah', Number(e.target.value))}
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-center font-bold"
                          />
                        </td>
                        <td className="p-2">
                          <BeauticianSelect
                            value={row.beautician_id ? String(row.beautician_id) : ''}
                            onChange={(val, selected) => handleRegulerBeauticianSelect(idx, val, selected)}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min={0}
                            value={row.harga}
                            onChange={(e) => handleRegulerRowChange(idx, 'harga', Number(e.target.value))}
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={row.diskon}
                            onChange={(e) => handleRegulerRowChange(idx, 'diskon', Number(e.target.value))}
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-center font-mono"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={row.rp_percent}
                            onChange={(e) => handleRegulerRowChange(idx, 'rp_percent', Number(e.target.value))}
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-center font-mono"
                          />
                        </td>
                        <td className="p-2 font-mono font-extrabold text-right text-slate-900">
                          {formatCurrency(calculateRegulerTotal(row))}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveRegulerRow(idx)}
                            className="rounded p-1 text-rose-500 hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                    <tr>
                      <td colSpan={6} className="px-3 py-2.5 text-right text-xs text-slate-700">
                        Grand Total Treatment:
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm font-extrabold text-rose-700">
                        {formatCurrency(grandTotalReguler)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-amber-50 p-3 text-[11px] font-semibold text-amber-800 border border-amber-200">
            <span className="text-rose-600 font-bold">*</span> Catatan: Pemberian diskon di sini berpengaruh dengan fee dokter, silakan lihat Settingannya di setting Klinik.
          </div>
        </div>
      ) : null}

      {/* TAB 3: DATA PERAWATAN */}
      {activeTab === 'data' ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden space-y-4">
          <div className="flex flex-col items-stretch justify-between gap-3 border-b border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center">
            <h3 className="text-sm font-bold text-slate-900">List Data Perawatan</h3>

            <div className="relative w-full sm:w-72">
              <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={dataSearch}
                onChange={(e) => setDataSearch(e.target.value)}
                placeholder="Cari kode, pasien, dokter, diagnosa..."
                className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs focus:border-rose-500 focus:outline-none"
              />
            </div>
          </div>

          {loadingPerawatan ? (
            <div className="p-8 text-center text-xs text-slate-500">Memuat data perawatan...</div>
          ) : filteredPerawatan.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              Tidak ada data perawatan yang ditemukan.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Kode</th>
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3">Pasien</th>
                    <th className="px-4 py-3">DPJP / Dokter</th>
                    <th className="px-4 py-3">Diagnosa</th>
                    <th className="px-4 py-3 text-right">Biaya</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPerawatan.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-teal-700">{row.kode}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(row.tanggal)}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{row.pasien?.nama || '-'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{row.staff?.nama || '-'}</td>
                      <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{row.diagnosa || '—'}</td>
                      <td className="px-4 py-3 text-right font-mono font-extrabold text-slate-900">
                        {formatCurrency(row.biaya ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => navigate({ to: '/perawatan/detail', search: { id: String(row.id) } })}
                            className="rounded-lg text-xs"
                          >
                            Detail / Edit
                          </Button>
                          <button
                            type="button"
                            onClick={() => deletePerawatanMutation.mutate(row.id)}
                            className="rounded p-1 text-rose-500 hover:bg-rose-50"
                            title="Hapus data perawatan"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
