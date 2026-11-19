import { toast as pushToast } from '@/shared/components/Toaster'
import { useConfirm } from '@/shared/components/ConfirmDialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard,
  Edit3,
  FileText,
  Gift,
  Plus,
  RotateCcw,
  Search,
  Stethoscope,
  Trash2,
  Users,
  Volume2,
  XCircle,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/shared/api/client'
import { BeauticianSelect, type StaffLite } from '@/shared/components/BeauticianSelect'
import { Dialog } from '@/shared/components/Dialog'
import { DokterSelect } from '@/shared/components/DokterSelect'
import { PasienSelect } from '@/shared/components/PasienSelect'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { TreatmentSelect, type TreatmentLite } from '@/shared/components/TreatmentSelect'
import { KpiCard } from '@/shared/components/KpiCard'
import { PageHeader } from '@/shared/components/PageHeader'
import { Button } from '@/shared/ui/button'
import { Tabs } from '@/shared/ui/tabs'
import { Field, FormAlert } from '@/shared/ui/field'
import { FieldErrorsContext, useFormValidation } from '@/shared/lib/validation'
import { formatCurrency, formatDate, todayISO } from '@/shared/lib/formatters'
import { RupiahInput } from '@/shared/ui/rupiah-input'

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
  const [confirm, confirmDialog] = useConfirm()
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
  const [regulerError, setRegulerError] = useState<string | null>(null)
  const regulerValidation = useFormValidation()

  // State for Tab 3: Treatment Paket
  const [paketForm, setPaketForm] = useState({
    tanggal: today,
    pasien_id: '',
    staff_id: '',
  })
  const [paketDetails, setPaketDetails] = useState<TreatmentRegulerRow[]>([])
  const [paketError, setPaketError] = useState<string | null>(null)
  const paketValidation = useFormValidation()

  // State for Tab 4: Data Perawatan
  const [dataSearch, setDataSearch] = useState('')
  const [dataTanggal, setDataTanggal] = useState('')
  const [dataStatus, setDataStatus] = useState('all')
  const [dataDokterId, setDataDokterId] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<PerawatanRow | null>(null)

  function showToast(message: string, tone: 'success' | 'error' = 'success') {
    pushToast(message, tone)
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
    return { waitingCount, activeCount, completedCount }
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
      setRegulerError(null)
      regulerValidation.reset()
      setActiveTab('data')
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Gagal memproses treatment reguler'
      setRegulerError(message)
      showToast(message, 'error')
    },
  })

  // Handlers for Treatment Reguler rows
  function handleAddRegulerRow() {
    setRegulerError(null)
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
      setPaketError(null)
      paketValidation.reset()
      setActiveTab('data')
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Gagal memproses treatment paket'
      setPaketError(message)
      showToast(message, 'error')
    },
  })

  function handleAddPaketRow() {
    setPaketError(null)
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

  // Fields are checked by the form's native constraints; only the row-count rule is left here.
  function handleRegulerSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (e.target !== e.currentTarget) return
    if (regulerDetails.length === 0) {
      setRegulerError('Minimal satu treatment harus ditambahkan')
      return
    }
    setRegulerError(null)
    submitRegulerMutation.mutate()
  }

  function handlePaketSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (e.target !== e.currentTarget) return
    if (paketDetails.length === 0) {
      setPaketError('Minimal satu paket treatment harus ditambahkan')
      return
    }
    setPaketError(null)
    submitPaketMutation.mutate()
  }

  function handleTabChange(tab: typeof activeTab) {
    regulerValidation.reset()
    paketValidation.reset()
    setRegulerError(null)
    setPaketError(null)
    setActiveTab(tab)
  }

  return (
    <div className="space-y-6">
      {confirmDialog}

      <PageHeader
        title="Perawatan"
        description="Antrian, treatment, dan rekam medis"
        actions={
          <Button type="button" onClick={() => navigate({ to: '/perawatan/detail' })}>
            <Plus />
            Perawatan Baru
          </Button>
        }
      />

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <KpiCard
          label="Menunggu"
          value={stats.waitingCount}
          valueClass="text-amber-600"
          icon={<Users className="h-5 w-5" />}
          iconClass="bg-amber-50 text-amber-600"
        />
        <KpiCard
          label="Dilayani"
          value={stats.activeCount}
          valueClass="text-indigo-600"
          icon={<Stethoscope className="h-5 w-5" />}
          iconClass="bg-indigo-50 text-indigo-600"
        />
        <KpiCard
          label="Selesai"
          value={stats.completedCount}
          valueClass="text-emerald-600"
          icon={<FileText className="h-5 w-5" />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
      </div>

      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        fullWidth
        items={[
          { value: 'baru', label: 'Antrian', icon: <Users />, count: antrianList.length },
          { value: 'reguler', label: 'Reguler', icon: <Stethoscope /> },
          { value: 'paket', label: 'Paket', icon: <Gift /> },
          { value: 'data', label: 'Data EMR', icon: <FileText /> },
        ]}
      />

      {/* SUB-TAB 1: PERAWATAN BARU / ANTRIAN MENUNGGU PERAWATAN */}
      {activeTab === 'baru' ? (
        <div className="space-y-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          {/* Table Header Controls */}
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-bold text-slate-900">Antrian Perawatan</h3>

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
                  placeholder="Cari pasien / antrian..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pr-3 pl-9 text-xs font-medium focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Queue Table */}
          {loadingAntrian ? (
            <div className="p-8 text-center text-xs text-slate-500">Memuat antrian...</div>
          ) : antrianList.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">Tidak ada antrian.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-sticky-actions w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  <tr>
                    <th className="w-36 px-4 py-3.5 text-center">No Antrian</th>
                    <th className="px-4 py-3.5">No RM</th>
                    <th className="px-4 py-3.5">Pasien</th>
                    <th className="px-4 py-3.5">Dokter</th>
                    <th className="px-4 py-3.5">Datang</th>
                    <th className="px-4 py-3.5 text-center">Status</th>
                    <th className="w-36 px-4 py-3.5 text-center">Aksi</th>
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
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Riwayat EMR"
                            aria-label="Riwayat EMR"
                            onClick={() =>
                              navigate({
                                to: '/perawatan/riwayat',
                                search: { pasien_id: String(row.pasien_id) },
                              })
                            }
                          >
                            <RotateCcw />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Panggil Pasien"
                            aria-label="Panggil Pasien"
                            onClick={() =>
                              updateAntrianStatusMutation.mutate({ id: row.id, status: 'dipanggil' })
                            }
                          >
                            <Volume2 />
                          </Button>
                          <Button
                            size="sm"
                            title="Input SOAP & Treatment"
                            onClick={() =>
                              navigate({
                                to: '/perawatan/detail',
                                search: { pasien_id: String(row.pasien_id), antrian_id: String(row.id) },
                              })
                            }
                          >
                            <Stethoscope />
                            SOAP
                          </Button>
                          <Button
                            variant="ghost-danger"
                            size="icon-sm"
                            title="Batalkan antrian"
                            aria-label="Batalkan antrian"
                            onClick={async () => {
                              const ok = await confirm({
                                title: `Batalkan antrian ${row.kode}?`,
                                description: 'Pasien akan keluar dari antrian.',
                                confirmLabel: 'Ya, batalkan',
                                destructive: true,
                              })
                              if (ok) updateAntrianStatusMutation.mutate({ id: row.id, status: 'batal' })
                            }}
                          >
                            <XCircle />
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
      ) : null}

      {/* SUB-TAB 2: FORM TREATMENT REGULER (FAST-TRACK KASIR) */}
      {activeTab === 'reguler' ? (
        <div className="space-y-6">
          <FieldErrorsContext.Provider value={regulerValidation.errors}>
            <form
              {...regulerValidation.formProps}
              onSubmit={handleRegulerSubmit}
              className="space-y-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Treatment Reguler</h3>
                  <p className="text-xs text-slate-500">Tanpa SOAP, langsung ke kasir</p>
                </div>

                <Button type="submit" disabled={submitRegulerMutation.isPending}>
                  <CreditCard />
                  {submitRegulerMutation.isPending ? 'Memproses...' : 'Kirim ke Kasir'}
                </Button>
              </div>

              <FormAlert>{regulerError}</FormAlert>

              {/* 3 Column Selectors */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Tanggal" htmlFor="perawatanlistpage-f1" required>
                  <input id="perawatanlistpage-f1"
                    type="date"
                    required
                    value={regulerForm.tanggal}
                    onChange={(e) => setRegulerForm((f) => ({ ...f, tanggal: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-800 focus:border-rose-500 focus:outline-none"
                  />
                </Field>
                <Field label="Dokter" htmlFor="perawatanlistpage-f2" required>
                  <DokterSelect id="perawatanlistpage-f2"
                    required
                    value={regulerForm.staff_id}
                    onChange={(staff_id) => setRegulerForm((f) => ({ ...f, staff_id }))}
                  />
                </Field>
                <Field label="Pasien" htmlFor="perawatanlistpage-f3" required>
                  <PasienSelect id="perawatanlistpage-f3"
                    required
                    value={regulerForm.pasien_id}
                    onChange={(pasien_id) => setRegulerForm((f) => ({ ...f, pasien_id }))}
                  />
                </Field>
              </div>

              {/* Treatment Items Builder Area */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">Daftar Treatment</h4>
                  <Button type="button" size="sm" variant="outline" onClick={handleAddRegulerRow}>
                    <Plus />
                    Tambah Treatment
                  </Button>
                </div>

                {regulerDetails.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                    Belum ada treatment.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50/50">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-100 font-bold tracking-wider text-slate-600 uppercase">
                        <tr>
                          <th className="px-4 py-3 min-w-[200px]">Treatment</th>
                          <th className="w-20 px-4 py-3 text-center">Qty</th>
                          <th className="px-4 py-3 min-w-[180px]">Beautician</th>
                          <th className="w-32 px-4 py-3">Harga</th>
                          <th className="w-24 px-4 py-3 text-center">Diskon %</th>
                          <th className="w-24 px-4 py-3 text-center">RP %</th>
                          <th className="w-36 px-4 py-3 text-right">Subtotal</th>
                          <th className="w-12 px-4 py-3 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {regulerDetails.map((row, idx) => (
                          <tr key={idx}>
                            <td className="p-2">
                              <TreatmentSelect
                                id={`reguler-treatment-${idx}`}
                                required
                                value={row.treatment_id ? String(row.treatment_id) : ''}
                                onChange={(val, selected) => handleRegulerTreatmentSelect(idx, val, selected)}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                id={`reguler-qty-${idx}`}
                                aria-label="Qty"
                                type="number"
                                required
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
                              <RupiahInput
                                id={`reguler-harga-${idx}`}
                                value={row.harga}
                                onValueChange={(v) => handleRegulerRowChange(idx, 'harga', Number(v))}
                                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                id={`reguler-diskon-${idx}`}
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
                                id={`reguler-rp-percent-${idx}`}
                                type="number"
                                min={0}
                                max={100}
                                value={row.rp_percent}
                                onChange={(e) => handleRegulerRowChange(idx, 'rp_percent', Number(e.target.value))}
                                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center font-mono text-xs"
                              />
                            </td>
                            <td className="p-2 text-right font-mono font-bold text-slate-900">
                              {formatCurrency(calculateRegulerTotal(row))}
                            </td>
                            <td className="p-2 text-center">
                              <Button
                                variant="ghost-danger"
                                size="icon-sm"
                                onClick={() => handleRemoveRegulerRow(idx)}
                                title="Hapus tindakan"
                                aria-label="Hapus tindakan"
                              >
                                <Trash2 />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Calculation Summary */}
                <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 md:flex-row">
                  <p className="text-xs text-slate-500">Diskon memengaruhi fee dokter (lihat Setting Klinik).</p>

                  <div className="w-full text-right md:w-auto">
                    <p className="text-xs font-medium text-slate-500">Total</p>
                    <p className="text-xl font-bold text-slate-900">{formatCurrency(grandTotalReguler)}</p>
                  </div>
                </div>
              </div>
            </form>
          </FieldErrorsContext.Provider>
        </div>
      ) : null}

      {/* SUB-TAB 3: FORM TREATMENT PAKET */}
      {activeTab === 'paket' ? (
        <div className="space-y-6">
          <FieldErrorsContext.Provider value={paketValidation.errors}>
            <form
              {...paketValidation.formProps}
              onSubmit={handlePaketSubmit}
              className="space-y-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Treatment Paket</h3>
                  <p className="text-xs text-slate-500">Paket multi-sesi, dibayar di kasir</p>
                </div>

                <Button type="submit" disabled={submitPaketMutation.isPending}>
                  <CreditCard />
                  {submitPaketMutation.isPending ? 'Memproses...' : 'Kirim ke Kasir'}
                </Button>
              </div>

              <FormAlert>{paketError}</FormAlert>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Tanggal" htmlFor="perawatanlistpage-f4" required>
                  <input id="perawatanlistpage-f4"
                    type="date"
                    required
                    value={paketForm.tanggal}
                    onChange={(e) => setPaketForm((f) => ({ ...f, tanggal: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-800 focus:border-violet-500 focus:outline-none"
                  />
                </Field>
                <Field label="Dokter" htmlFor="perawatanlistpage-f5" required>
                  <DokterSelect id="perawatanlistpage-f5"
                    required
                    value={paketForm.staff_id}
                    onChange={(staff_id) => setPaketForm((f) => ({ ...f, staff_id }))}
                  />
                </Field>
                <Field label="Pasien" htmlFor="perawatanlistpage-f6" required>
                  <PasienSelect id="perawatanlistpage-f6"
                    required
                    value={paketForm.pasien_id}
                    onChange={(pasien_id) => setPaketForm((f) => ({ ...f, pasien_id }))}
                  />
                </Field>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">Daftar Paket</h4>
                  <Button type="button" size="sm" variant="outline" onClick={handleAddPaketRow}>
                    <Plus />
                    Tambah Paket
                  </Button>
                </div>

                {paketDetails.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                    Belum ada paket. Hanya treatment kategori &quot;paket&quot;.
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
                          <th className="w-24 px-4 py-3 text-center">Diskon %</th>
                          <th className="w-36 px-4 py-3 text-right">Subtotal</th>
                          <th className="w-12 px-4 py-3 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {paketDetails.map((row, idx) => (
                          <tr key={idx}>
                            <td className="p-2">
                              <TreatmentSelect
                                id={`paket-treatment-${idx}`}
                                required
                                kategoriFilter="paket"
                                placeholder="Pilih paket treatment..."
                                value={row.treatment_id ? String(row.treatment_id) : ''}
                                onChange={(val, selected) => handlePaketTreatmentSelect(idx, val, selected)}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                id={`paket-qty-${idx}`}
                                aria-label="Qty"
                                type="number"
                                required
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
                              <RupiahInput
                                id={`paket-harga-${idx}`}
                                value={row.harga}
                                onValueChange={(v) => handlePaketRowChange(idx, 'harga', Number(v))}
                                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                id={`paket-diskon-${idx}`}
                                type="number"
                                min={0}
                                max={100}
                                value={row.diskon}
                                onChange={(e) => handlePaketRowChange(idx, 'diskon', Number(e.target.value))}
                                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center font-mono text-xs"
                              />
                            </td>
                            <td className="p-2 text-right font-mono font-bold text-slate-900">
                              {formatCurrency(calculateRegulerTotal(row))}
                            </td>
                            <td className="p-2 text-center">
                              <Button
                                variant="ghost-danger"
                                size="icon-sm"
                                onClick={() => handleRemovePaketRow(idx)}
                                title="Hapus paket"
                                aria-label="Hapus paket"
                              >
                                <Trash2 />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex flex-col items-center justify-end gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 md:flex-row">
                  <div className="w-full text-right md:w-auto">
                    <p className="text-xs font-medium text-slate-500">Total</p>
                    <p className="text-xl font-bold text-slate-900">{formatCurrency(grandTotalPaket)}</p>
                  </div>
                </div>
              </div>
            </form>
          </FieldErrorsContext.Provider>
        </div>
      ) : null}

      {/* SUB-TAB 4: DATA PERAWATAN & EMR HISTORY */}
      {activeTab === 'data' ? (
        <div className="space-y-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Data Perawatan</h3>

              {(dataTanggal || dataStatus !== 'all' || dataDokterId || dataSearch) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDataTanggal('')
                    setDataStatus('all')
                    setDataDokterId('')
                    setDataSearch('')
                  }}
                >
                  <RotateCcw />
                  Reset Filter
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="perawatanlistpage-f7" className="mb-1 block text-[11px] font-bold text-slate-500 uppercase">Tanggal</label>
                <input id="perawatanlistpage-f7"
                  type="date"
                  value={dataTanggal}
                  onChange={(e) => setDataTanggal(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="perawatanlistpage-f8" className="mb-1 block text-[11px] font-bold text-slate-500 uppercase">Status</label>
                <select id="perawatanlistpage-f8"
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
                <label htmlFor="perawatanlistpage-f9" className="mb-1 block text-[11px] font-bold text-slate-500 uppercase">Dokter</label>
                <DokterSelect id="perawatanlistpage-f9"
                  value={dataDokterId}
                  onChange={(val) => setDataDokterId(val)}
                  placeholder="Semua Dokter..."
                />
              </div>

              <div>
                <label htmlFor="perawatanlistpage-f10" className="mb-1 block text-[11px] font-bold text-slate-500 uppercase">Cari</label>
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input id="perawatanlistpage-f10"
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
            <div className="p-12 text-center text-xs text-slate-400">Tidak ada data perawatan.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-sticky-actions w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3.5 text-center">Kode</th>
                    <th className="px-4 py-3.5">Tanggal</th>
                    <th className="px-4 py-3.5">Pasien</th>
                    <th className="px-4 py-3.5">Dokter</th>
                    <th className="px-4 py-3.5">Diagnosa</th>
                    <th className="px-4 py-3.5 text-right">Biaya</th>
                    <th className="px-4 py-3.5 text-center">Status</th>
                    <th className="px-4 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredPerawatan.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="px-4 py-3 text-center font-mono font-bold text-rose-700">{row.kode}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{formatDate(row.tanggal)}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-bold text-slate-900">{row.pasien?.nama || '-'}</div>
                        <div className="font-mono text-[11px] text-slate-400">{row.pasien?.kode || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700">{row.staff?.nama || '-'}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-xs text-slate-500">{row.diagnosa || '—'}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(row.biaya ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            title="Detail / Edit EMR"
                            onClick={() =>
                              navigate({ to: '/perawatan/detail', search: { id: String(row.id) } })
                            }
                          >
                            <Edit3 />
                            Detail
                          </Button>
                          <Button
                            variant="ghost-danger"
                            size="icon-sm"
                            onClick={() => setDeleteTarget(row)}
                            title="Hapus perawatan"
                            aria-label="Hapus perawatan"
                          >
                            <Trash2 />
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
      ) : null}

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!deletePerawatanMutation.isPending) setDeleteTarget(null)
        }}
        title="Hapus Data Perawatan"
        description="Data yang dihapus tidak dapat dikembalikan."
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
              disabled={deletePerawatanMutation.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletePerawatanMutation.isPending || !deleteTarget}
              onClick={() => {
                if (deleteTarget) deletePerawatanMutation.mutate(deleteTarget.id)
              }}
            >
              <Trash2 />
              {deletePerawatanMutation.isPending ? 'Menghapus...' : 'Ya, Hapus'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
