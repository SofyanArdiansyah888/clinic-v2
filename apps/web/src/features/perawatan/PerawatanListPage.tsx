import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CreditCard,
  Edit3,
  FileText,
  Gift,
  HandCoins,
  Plus,
  RotateCcw,
  Search,
  Stethoscope,
  Trash2,
  Users,
  Volume2,
  XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/shared/api/client'
import { BeauticianSelect, type StaffLite } from '@/shared/components/BeauticianSelect'
import { Dialog } from '@/shared/components/Dialog'
import { DokterSelect } from '@/shared/components/DokterSelect'
import { PasienSelect } from '@/shared/components/PasienSelect'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { TreatmentSelect, type TreatmentLite } from '@/shared/components/TreatmentSelect'
import { KpiCard } from '@/shared/components/KpiCard'
import { Button } from '@/shared/ui/button'
import { formatCurrency, formatDate, todayISO } from '@/shared/lib/formatters'
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

const today = todayISO()

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
  const [activeTab, setActiveTab] = useState<'baru' | 'reguler' | 'paket' | 'data'>('baru')

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

  // State for Tab 3: Treatment Paket
  const [paketForm, setPaketForm] = useState({
    tanggal: today,
    pasien_id: '',
    staff_id: '',
  })
  const [paketDetails, setPaketDetails] = useState<TreatmentRegulerRow[]>([])

  // State for Tab 4: Data Perawatan
  const [dataSearch, setDataSearch] = useState('')
  const [dataTanggal, setDataTanggal] = useState('')
  const [dataStatus, setDataStatus] = useState('all')
  const [dataDokterId, setDataDokterId] = useState('')

  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PerawatanRow | null>(null)

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
      const isStatusMatch = ['menunggu', 'dipanggil', 'menunggu perawatan', 'diproses'].includes(
        r.status.toLowerCase(),
      )
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

  // Stats calculation
  const stats = useMemo(() => {
    const allAntrian = antrianData?.data ?? []
    const allPerawatan = perawatanData?.data ?? []

    const waitingCount = allAntrian.filter((a) => a.status.toLowerCase() === 'menunggu').length
    const activeCount = allAntrian.filter((a) => ['dipanggil', 'diproses'].includes(a.status.toLowerCase())).length
    const completedCount = allPerawatan.filter((p) => p.status.toLowerCase() === 'selesai' || p.biaya).length
    const estimatedRevenue = allPerawatan.reduce((sum, p) => sum + (p.biaya || 0), 0)

    return { waitingCount, activeCount, completedCount, estimatedRevenue }
  }, [antrianData?.data, perawatanData?.data])

  // Filter Tab 3
  const filteredPerawatan = useMemo(() => {
    const rows = perawatanData?.data ?? []
    const q = dataSearch.trim().toLowerCase()
    return rows.filter((r) => {
      const isDateMatch = !dataTanggal || (r.tanggal && r.tanggal.slice(0, 10) === dataTanggal)
      const isStatusMatch =
        dataStatus === 'all' || (r.status && r.status.toLowerCase() === dataStatus.toLowerCase())
      const isDokterMatch = !dataDokterId || (r.staff?.id && String(r.staff.id) === dataDokterId)
      const isSearchMatch =
        !q ||
        r.kode.toLowerCase().includes(q) ||
        (r.pasien?.nama ?? '').toLowerCase().includes(q) ||
        (r.pasien?.kode ?? '').toLowerCase().includes(q) ||
        (r.staff?.nama ?? '').toLowerCase().includes(q) ||
        (r.diagnosa ?? '').toLowerCase().includes(q)

      return isDateMatch && isStatusMatch && isDokterMatch && isSearchMatch
    })
  }, [perawatanData?.data, dataSearch, dataTanggal, dataStatus, dataDokterId])

  // Mutations
  const updateAntrianStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiPatch(`/antrian/${id}/status`, { status }),
    onSuccess: (_res, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['antrian'] })
      showToast(
        vars.status === 'batal' ? 'Antrian dibatalkan' : 'Status antrian berhasil diperbarui!',
        'success',
      )
    },
    onError: () => showToast('Gagal memperbarui status antrian', 'error'),
  })

  const deletePerawatanMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/perawatan/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['perawatan'] })
      void queryClient.invalidateQueries({ queryKey: ['antrian'] })
      setDeleteTarget(null)
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
        status: 'bayar',
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

  function handleRegulerTreatmentSelect(idx: number, _val: string, selected?: TreatmentLite) {
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

  function handleRegulerBeauticianSelect(idx: number, _val: string, selected?: StaffLite) {
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

  const submitPaketMutation = useMutation({
    mutationFn: async () => {
      const pasienId = Number(paketForm.pasien_id)
      const staffId = Number(paketForm.staff_id)
      if (!pasienId) throw new Error('Pasien wajib dipilih')
      if (!staffId) throw new Error('Dokter wajib dipilih')
      if (paketDetails.length === 0) throw new Error('Minimal satu paket treatment harus ditambahkan')

      for (let i = 0; i < paketDetails.length; i++) {
        if (!paketDetails[i].treatment_id) {
          throw new Error(`Paket treatment pada baris ${i + 1} wajib dipilih`)
        }
      }

      const formattedTindakans = paketDetails.map((d) => ({
        treatment_id: d.treatment_id,
        tanggal: paketForm.tanggal || today,
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
        tanggal: paketForm.tanggal || today,
        diagnosa: 'Perawatan Paket',
        biaya: totalBiaya,
        status: 'bayar',
        tindakans: formattedTindakans,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['perawatan'] })
      void queryClient.invalidateQueries({ queryKey: ['pembayaran-perawatan'] })
      showToast('Paket treatment berhasil diproses ke kasir pembayaran!', 'success')
      setPaketForm({ tanggal: today, pasien_id: '', staff_id: '' })
      setPaketDetails([])
      setActiveTab('data')
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : 'Gagal memproses treatment paket', 'error')
    },
  })

  function handleAddPaketRow() {
    setPaketDetails((prev) => [
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

  function handleRemovePaketRow(idx: number) {
    setPaketDetails((prev) => prev.filter((_, i) => i !== idx))
  }

  function handlePaketTreatmentSelect(idx: number, _val: string, selected?: TreatmentLite) {
    if (!selected) return
    setPaketDetails((prev) => {
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

  function handlePaketBeauticianSelect(idx: number, _val: string, selected?: StaffLite) {
    setPaketDetails((prev) => {
      const updated = [...prev]
      updated[idx] = {
        ...updated[idx],
        beautician_id: selected ? selected.id : null,
        nama_beautician: selected?.nama || '',
      }
      return updated
    })
  }

  function handlePaketRowChange(idx: number, field: keyof TreatmentRegulerRow, val: unknown) {
    setPaketDetails((prev) => {
      const updated = [...prev]
      const cur = { ...updated[idx], [field]: val }
      cur.total = calculateRegulerTotal(cur)
      updated[idx] = cur
      return updated
    })
  }

  const grandTotalPaket = useMemo(() => {
    return paketDetails.reduce((sum, item) => sum + calculateRegulerTotal(item), 0)
  }, [paketDetails])

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

      {/* Header Title Bar */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Perawatan (SOAP) & Treatment</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Daftar antrian perawatan baru, form treatment reguler kasir, dan rekam medis (EMR) pasien kecantikan.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={() => navigate({ to: '/perawatan/detail' })}
            className="rounded-xl text-xs bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white font-bold shadow-md shadow-rose-600/20 active:scale-95 transition-all"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            + Perawatan Baru (SOAP)
          </Button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Menunggu Treatment"
          value={`${stats.waitingCount} Pasien`}
          valueClass="text-amber-600"
          icon={<Users className="h-5 w-5" />}
          iconClass="bg-amber-50 text-amber-600"
        />
        <KpiCard
          label="Sedang Treatment"
          value={`${stats.activeCount} Pasien`}
          valueClass="text-rose-600"
          icon={<Stethoscope className="h-5 w-5" />}
          iconClass="bg-rose-50 text-rose-600"
        />
        <KpiCard
          label="Selesai SOAP"
          value={`${stats.completedCount} Pasien`}
          valueClass="text-emerald-600"
          icon={<FileText className="h-5 w-5" />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          label="Estimasi Revenue"
          value={formatCurrency(stats.estimatedRevenue)}
          valueClass="text-slate-900"
          icon={<HandCoins className="h-5 w-5" />}
          iconClass="bg-indigo-50 text-indigo-600"
        />
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab('baru')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs font-extrabold transition-all',
            activeTab === 'baru'
              ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-600/20'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
          )}
        >
          <Plus className="h-4 w-4" />
          <span>Perawatan Baru (Antrian)</span>
          <span
            className={cn(
              'ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
              activeTab === 'baru' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700',
            )}
          >
            {antrianList.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reguler')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs font-bold transition-all',
            activeTab === 'reguler'
              ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-600/20'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
          )}
        >
          <Stethoscope className="h-4 w-4" />
          <span>Treatment Reguler</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('paket')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs font-bold transition-all',
            activeTab === 'paket'
              ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-600/20'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
          )}
        >
          <Gift className="h-4 w-4" />
          <span>Treatment Paket</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('data')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs font-bold transition-all',
            activeTab === 'data'
              ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-600/20'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
          )}
        >
          <FileText className="h-4 w-4" />
          <span>Data Perawatan & EMR History</span>
        </button>
      </div>

      {/* SUB-TAB 1: PERAWATAN BARU / ANTRIAN MENUNGGU PERAWATAN */}
      {activeTab === 'baru' ? (
        <div className="space-y-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          {/* Table Header Controls */}
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-slate-900">Antrian Menunggu Perawatan & Input SOAP</h3>
              <span className="rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">
                Beauty Lounge
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Date Filter Picker */}
              <div className="relative">
                <input
                  type="date"
                  value={baruTanggal}
                  onChange={(e) => setBaruTanggal(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 focus:border-rose-500 focus:outline-none"
                />
              </div>

              {/* Search Filter */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={baruSearch}
                  onChange={(e) => setBaruSearch(e.target.value)}
                  placeholder="Cari pasien / no. antrian..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pr-3 pl-9 text-xs font-medium focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Queue Table */}
          {loadingAntrian ? (
            <div className="p-8 text-center text-xs text-slate-500">Memuat antrian perawatan baru...</div>
          ) : antrianList.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              Tidak ada pasien antrian untuk filter tanggal / pencarian ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  <tr>
                    <th className="w-36 px-4 py-3.5 text-center">NO ANTRIAN</th>
                    <th className="px-4 py-3.5">NO MEMBER / RM</th>
                    <th className="px-4 py-3.5">NAMA PASIEN</th>
                    <th className="px-4 py-3.5">DOKTER / BEAUTICIAN</th>
                    <th className="px-4 py-3.5">JAM DATANG</th>
                    <th className="px-4 py-3.5 text-center">STATUS</th>
                    <th className="w-36 px-4 py-3.5 text-center">AKSI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {antrianList.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="px-4 py-3 text-center">
                        <span className="inline-block rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 font-mono text-sm font-bold tracking-wide text-rose-800">
                          {row.kode}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-semibold text-slate-600">
                          {row.pasien?.kode || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-bold text-slate-900">{row.pasien?.nama || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-700">{row.staff?.nama || '-'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {formatDate(row.tanggal)} {row.jam ? `(${row.jam})` : ''}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            title="Riwayat EMR Pasien"
                            onClick={() =>
                              navigate({
                                to: '/perawatan/riwayat',
                                search: { pasien_id: String(row.pasien_id) },
                              })
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-purple-200 bg-purple-50 text-purple-700 transition-all hover:bg-purple-100"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Panggil Pasien"
                            onClick={() =>
                              updateAntrianStatusMutation.mutate({ id: row.id, status: 'dipanggil' })
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 transition-all hover:bg-blue-100"
                          >
                            <Volume2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Input SOAP & Treatment"
                            onClick={() =>
                              navigate({
                                to: '/perawatan/detail',
                                search: { pasien_id: String(row.pasien_id), antrian_id: String(row.id) },
                              })
                            }
                            className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:from-rose-700 hover:to-pink-700"
                          >
                            <Stethoscope className="h-3.5 w-3.5" />
                            <span>SOAP</span>
                          </button>
                          <button
                            type="button"
                            title="Batalkan Antrian (Cancel)"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Batalkan antrian ${row.kode}? Pasien tidak akan dilayani.`,
                                )
                              ) {
                                updateAntrianStatusMutation.mutate({ id: row.id, status: 'batal' })
                              }
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-400 transition-all hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700"
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

      {/* SUB-TAB 2: FORM TREATMENT REGULER (FAST-TRACK KASIR) */}
      {activeTab === 'reguler' ? (
        <div className="space-y-6">
          <div className="space-y-6 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-rose-50 p-2.5 text-rose-600 shadow-sm">
                  <Stethoscope className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Form Khusus Treatment Reguler</h3>
                  <p className="text-xs text-slate-500">
                    Input cepat treatment pasien tanpa SOAP untuk langsung diproses ke kasir pembayaran.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                disabled={submitRegulerMutation.isPending}
                onClick={() => submitRegulerMutation.mutate()}
                className="rounded-xl text-xs bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
              >
                <CreditCard className="h-4 w-4 mr-1.5" />
                {submitRegulerMutation.isPending ? 'Memproses...' : 'Proses Ke Kasir Pembayaran'}
              </Button>
            </div>

            {/* 3 Column Selectors */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">Tanggal Treatment *</label>
                <input
                  type="date"
                  value={regulerForm.tanggal}
                  onChange={(e) => setRegulerForm((f) => ({ ...f, tanggal: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-800 focus:border-rose-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">Dokter Penanggung Jawab *</label>
                <DokterSelect
                  required
                  value={regulerForm.staff_id}
                  onChange={(staff_id) => setRegulerForm((f) => ({ ...f, staff_id }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">Pasien / Member *</label>
                <PasienSelect
                  required
                  value={regulerForm.pasien_id}
                  onChange={(pasien_id) => setRegulerForm((f) => ({ ...f, pasien_id }))}
                />
              </div>
            </div>

            {/* Treatment Items Builder Area */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold tracking-wider text-slate-800 uppercase">
                  Daftar Tindakan Treatment & Produk
                </h4>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddRegulerRow}
                  className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold transition-all"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Tambah Treatment
                </Button>
              </div>

              {regulerDetails.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                  Belum ada treatment ditambahkan. Klik tombol <b>Tambah Treatment</b>.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50/50">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-100 font-bold tracking-wider text-slate-600 uppercase">
                      <tr>
                        <th className="px-4 py-3 min-w-[200px]">Nama Treatment / Produk</th>
                        <th className="w-20 px-4 py-3 text-center">Qty</th>
                        <th className="px-4 py-3 min-w-[180px]">Beautician</th>
                        <th className="w-32 px-4 py-3">Harga Satuan</th>
                        <th className="w-24 px-4 py-3 text-center">Diskon (%)</th>
                        <th className="w-24 px-4 py-3 text-center">RP (%)</th>
                        <th className="w-36 px-4 py-3 text-right">Subtotal</th>
                        <th className="w-12 px-4 py-3 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
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
                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center text-xs font-bold"
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
                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={row.diskon}
                              onChange={(e) => handleRegulerRowChange(idx, 'diskon', Number(e.target.value))}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center font-mono text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={row.rp_percent}
                              onChange={(e) => handleRegulerRowChange(idx, 'rp_percent', Number(e.target.value))}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center font-mono text-xs"
                            />
                          </td>
                          <td className="p-2 text-right font-mono font-extrabold text-slate-900">
                            {formatCurrency(calculateRegulerTotal(row))}
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRegulerRow(idx)}
                              className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 transition-all hover:bg-rose-100"
                              title="Hapus tindakan"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Calculation Summary */}
              <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-rose-100 bg-rose-50/50 p-4 md:flex-row">
                <div className="flex items-center gap-2 text-xs font-medium text-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>
                    <b>Catatan:</b> Pemberian diskon di sini berpengaruh dengan pembagian fee dokter, silakan lihat
                    settingannya di menu Setting Klinik.
                  </span>
                </div>

                <div className="w-full text-right md:w-auto">
                  <p className="text-xs font-medium text-slate-500">Total Estimasi Tagihan:</p>
                  <p className="text-xl font-black text-rose-900">{formatCurrency(grandTotalReguler)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* SUB-TAB 3: FORM TREATMENT PAKET */}
      {activeTab === 'paket' ? (
        <div className="space-y-6">
          <div className="flex items-start gap-3 rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
            <Gift className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
            <div className="text-xs text-violet-900">
              <p className="font-bold">Pembelian Paket Treatment</p>
              <p className="mt-1 text-violet-800">
                Pasien membeli paket multi-sesi (mis. Facial 5x). Setelah Proses Ke Kasir, bayar di menu Kasir → tab
                Perawatan Paket. Sesi tercatat otomatis setelah pembayaran.
              </p>
            </div>
          </div>

          <div className="space-y-6 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-violet-50 p-2.5 text-violet-600 shadow-sm">
                  <Gift className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Form Treatment Paket</h3>
                  <p className="text-xs text-slate-500">
                    Hanya treatment kategori paket. Setelah dibayar, sesi aktif bisa dibatalkan di Batal Paket.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                disabled={submitPaketMutation.isPending}
                onClick={() => submitPaketMutation.mutate()}
                className="rounded-xl text-xs bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold shadow-md shadow-violet-600/20 active:scale-95 transition-all"
              >
                <CreditCard className="h-4 w-4 mr-1.5" />
                {submitPaketMutation.isPending ? 'Memproses...' : 'Proses Ke Kasir Pembayaran'}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">Tanggal *</label>
                <input
                  type="date"
                  value={paketForm.tanggal}
                  onChange={(e) => setPaketForm((f) => ({ ...f, tanggal: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-800 focus:border-violet-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">Dokter Penanggung Jawab *</label>
                <DokterSelect
                  required
                  value={paketForm.staff_id}
                  onChange={(staff_id) => setPaketForm((f) => ({ ...f, staff_id }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">Pasien / Member *</label>
                <PasienSelect
                  required
                  value={paketForm.pasien_id}
                  onChange={(pasien_id) => setPaketForm((f) => ({ ...f, pasien_id }))}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold tracking-wider text-slate-800 uppercase">Daftar Paket Treatment</h4>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddPaketRow}
                  className="rounded-xl border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 text-xs font-bold transition-all"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Tambah Paket
                </Button>
              </div>

              {paketDetails.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                  Belum ada paket ditambahkan. Pastikan treatment di master data memiliki kategori &quot;paket&quot;.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50/50">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-100 font-bold tracking-wider text-slate-600 uppercase">
                      <tr>
                        <th className="px-4 py-3 min-w-[200px]">Nama Paket</th>
                        <th className="w-20 px-4 py-3 text-center">Qty</th>
                        <th className="px-4 py-3 min-w-[180px]">Beautician</th>
                        <th className="w-32 px-4 py-3">Harga</th>
                        <th className="w-24 px-4 py-3 text-center">Diskon (%)</th>
                        <th className="w-36 px-4 py-3 text-right">Subtotal</th>
                        <th className="w-12 px-4 py-3 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {paketDetails.map((row, idx) => (
                        <tr key={idx}>
                          <td className="p-2">
                            <TreatmentSelect
                              kategoriFilter="paket"
                              placeholder="Pilih paket treatment..."
                              value={row.treatment_id ? String(row.treatment_id) : ''}
                              onChange={(val, selected) => handlePaketTreatmentSelect(idx, val, selected)}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={1}
                              value={row.jumlah}
                              onChange={(e) => handlePaketRowChange(idx, 'jumlah', Number(e.target.value))}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center text-xs font-bold"
                            />
                          </td>
                          <td className="p-2">
                            <BeauticianSelect
                              value={row.beautician_id ? String(row.beautician_id) : ''}
                              onChange={(val, selected) => handlePaketBeauticianSelect(idx, val, selected)}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={0}
                              value={row.harga}
                              onChange={(e) => handlePaketRowChange(idx, 'harga', Number(e.target.value))}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={row.diskon}
                              onChange={(e) => handlePaketRowChange(idx, 'diskon', Number(e.target.value))}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center font-mono text-xs"
                            />
                          </td>
                          <td className="p-2 text-right font-mono font-extrabold text-slate-900">
                            {formatCurrency(calculateRegulerTotal(row))}
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemovePaketRow(idx)}
                              className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 transition-all hover:bg-rose-100"
                              title="Hapus paket"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-4 md:flex-row">
                <p className="text-xs text-violet-800">
                  Setelah bayar di kasir, paket aktif muncul di menu <strong>Batal Paket Perawatan</strong> jika perlu
                  refund sisa sesi.
                </p>
                <div className="w-full text-right md:w-auto">
                  <p className="text-xs font-medium text-slate-500">Total Tagihan Paket:</p>
                  <p className="text-xl font-black text-violet-900">{formatCurrency(grandTotalPaket)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* SUB-TAB 4: DATA PERAWATAN & EMR HISTORY */}
      {activeTab === 'data' ? (
        <div className="space-y-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold text-slate-900">List Data Perawatan & Rekam Medis (EMR)</h3>
                <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                  Archive Log
                </span>
              </div>

              {(dataTanggal || dataStatus !== 'all' || dataDokterId || dataSearch) && (
                <button
                  type="button"
                  onClick={() => {
                    setDataTanggal('')
                    setDataStatus('all')
                    setDataDokterId('')
                    setDataSearch('')
                  }}
                  className="flex items-center gap-1 text-xs font-bold text-rose-600 hover:underline"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset Filter
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase">Filter Tanggal</label>
                <input
                  type="date"
                  value={dataTanggal}
                  onChange={(e) => setDataTanggal(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase">Filter Status</label>
                <select
                  value={dataStatus}
                  onChange={(e) => setDataStatus(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 focus:border-rose-500 focus:outline-none"
                >
                  <option value="all">Semua Status</option>
                  <option value="draft">Draft</option>
                  <option value="diproses">Diproses</option>
                  <option value="selesai">Selesai</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase">Filter Dokter</label>
                <DokterSelect
                  value={dataDokterId}
                  onChange={(val) => setDataDokterId(val)}
                  placeholder="Semua Dokter..."
                />
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase">Pencarian</label>
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={dataSearch}
                    onChange={(e) => setDataSearch(e.target.value)}
                    placeholder="Cari kode, pasien, diagnosa..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pr-3 pl-9 text-xs font-medium focus:border-rose-500 focus:outline-none"
                  />
                </div>
              </div>
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
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3.5 text-center">KODE EMR</th>
                    <th className="px-4 py-3.5">TANGGAL</th>
                    <th className="px-4 py-3.5">PASIEN & RM</th>
                    <th className="px-4 py-3.5">DOKTER SPESIALIS</th>
                    <th className="px-4 py-3.5">DIAGNOSA KULIT (A)</th>
                    <th className="px-4 py-3.5 text-right">BIAYA</th>
                    <th className="px-4 py-3.5 text-center">STATUS</th>
                    <th className="px-4 py-3.5 text-right">DETAIL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredPerawatan.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="px-4 py-3 text-center font-mono font-bold text-teal-700">{row.kode}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{formatDate(row.tanggal)}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-bold text-slate-900">{row.pasien?.nama || '-'}</div>
                        <div className="font-mono text-[10px] text-slate-400">{row.pasien?.kode || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700">{row.staff?.nama || '-'}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-xs text-slate-500">{row.diagnosa || '—'}</td>
                      <td className="px-4 py-3 text-right font-mono font-extrabold text-slate-900">
                        {formatCurrency(row.biaya ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            title="Detail / Edit EMR"
                            onClick={() =>
                              navigate({ to: '/perawatan/detail', search: { id: String(row.id) } })
                            }
                            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Detail EMR</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(row)}
                            className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition-all hover:bg-rose-100"
                            title="Hapus data perawatan"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Hapus</span>
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

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!deletePerawatanMutation.isPending) setDeleteTarget(null)
        }}
        title="Hapus Data Perawatan"
        description="Data EMR yang dihapus tidak dapat dikembalikan."
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Hapus perawatan{' '}
            <span className="font-bold text-slate-900">{deleteTarget?.kode}</span>
            {deleteTarget?.pasien?.nama ? (
              <>
                {' '}
                untuk pasien <span className="font-bold text-slate-900">{deleteTarget.pasien.nama}</span>
              </>
            ) : null}
            ?
          </p>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl text-xs"
              disabled={deletePerawatanMutation.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-rose-600 text-xs text-white hover:bg-rose-700"
              disabled={deletePerawatanMutation.isPending || !deleteTarget}
              onClick={() => {
                if (deleteTarget) deletePerawatanMutation.mutate(deleteTarget.id)
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {deletePerawatanMutation.isPending ? 'Menghapus...' : 'Ya, Hapus'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
