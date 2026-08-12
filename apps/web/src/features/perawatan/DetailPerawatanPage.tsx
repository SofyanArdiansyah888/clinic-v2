import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Calendar,
  FileText,
  Image as ImageIcon,
  Plus,
  Printer,
  Save,
  Stethoscope,
  Trash2,
  User,
  UserCheck,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { apiGet, apiPost, apiPut } from '@/shared/api/client'
import { BeauticianSelect, type StaffLite } from '@/shared/components/BeauticianSelect'
import { DokterSelect } from '@/shared/components/DokterSelect'
import { PasienSelect } from '@/shared/components/PasienSelect'
import { TreatmentSelect, type TreatmentLite } from '@/shared/components/TreatmentSelect'
import { Button } from '@/shared/ui/button'
import { formatCurrency, formatDate } from '@/shared/lib/formatters'
import { cn } from '@/shared/lib/cn'
import { ResepModal, type ResepItem } from './ResepModal'
import { ConsentDocumentModal } from './ConsentDocumentModal'

type PerawatanTindakanItem = {
  treatment_id: number
  nama_treatment?: string
  tanggal?: string
  jumlah: number
  beautician_id?: number | null
  nama_beautician?: string
  harga: number
  diskon: number
  rp_percent: number
  total: number
  status?: string
  catatan?: string
}

type PerawatanResepItem = {
  antrian_id?: number | null
  tanggal?: string
  status?: string
  barangs: Array<{
    barang_id: number
    kode_barang: string
    nama_barang: string
    jumlah: number
    unit: string
    harga: number
    total: number
  }>
}

type PerawatanDetailResponse = {
  id: number
  kode: string
  pasien_id: number
  staff_id: number
  antrian_id?: number | null
  tanggal: string
  status: string
  anamnesis?: string
  pemeriksaan_awal?: string
  pemeriksaan?: string
  diagnosa?: string
  tindakan?: string
  catatan?: string
  biaya?: number
  kunjungan_berikutnya?: string
  foto_perawatan?: string[] | null
  foto_sebelum?: string[] | null
  foto_sesudah?: string[] | null
  pasien?: { id: number; nama?: string; kode?: string }
  staff?: { id: number; nama?: string }
  tindakans?: PerawatanTindakanItem[]
  reseps?: PerawatanResepItem[]
}

const today = new Date().toISOString().slice(0, 10)

function calculateTindakanTotal(t: PerawatanTindakanItem): number {
  const jumlah = Number(t.jumlah) || 0
  const harga = Number(t.harga) || 0
  const diskon = Number(t.diskon) || 0
  const rp_percent = Number(t.rp_percent) || 0

  const subtotal = jumlah * harga
  const totalDiskon = (subtotal * diskon) / 100
  const totalRpPercent = (subtotal * rp_percent) / 100
  const total = subtotal - totalDiskon - totalRpPercent
  return total > 0 ? total : 0
}

export function DetailPerawatanPage() {
  const navigate = useNavigate()
  const searchParams = useSearch({ strict: false }) as {
    id?: string
    pasien_id?: string
    antrian_id?: string
    no_member?: string
  }

  const perawatanId = searchParams.id ? Number(searchParams.id) : null
  const queryAntrianId = searchParams.antrian_id ? Number(searchParams.antrian_id) : null
  const queryPasienId = searchParams.pasien_id ? Number(searchParams.pasien_id) : null

  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'pasien' | 'soap' | 'tindakan'>('pasien')

  const [form, setForm] = useState({
    pasien_id: '',
    staff_id: '',
    antrian_id: queryAntrianId ? String(queryAntrianId) : '',
    tanggal: today,
    kunjungan_berikutnya: '',
    anamnesis: '',
    pemeriksaan_awal: '',
    pemeriksaan: '',
    diagnosa: '',
    catatan: '',
    foto_perawatan: '' as string,
    foto_sebelum: '' as string,
    foto_sesudah: '' as string,
  })

  const [tindakans, setTindakans] = useState<PerawatanTindakanItem[]>([])
  const [reseps, setReseps] = useState<PerawatanResepItem[]>([])
  const [resepModalOpen, setResepModalOpen] = useState(false)
  const [consentModalOpen, setConsentModalOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)

  // Fetch existing treatment detail if ID is provided
  const { data: existingPerawatan, isLoading: loadingExisting } = useQuery({
    queryKey: ['perawatan', 'detail', perawatanId],
    queryFn: () => apiGet<PerawatanDetailResponse>(`/perawatan/${perawatanId}`),
    enabled: Boolean(perawatanId),
  })

  // Prefill form from existing treatment
  useEffect(() => {
    if (existingPerawatan?.data) {
      const d = existingPerawatan.data
      setForm({
        pasien_id: String(d.pasien_id || ''),
        staff_id: String(d.staff_id || ''),
        antrian_id: d.antrian_id ? String(d.antrian_id) : '',
        tanggal: d.tanggal ? d.tanggal.slice(0, 10) : today,
        kunjungan_berikutnya: d.kunjungan_berikutnya ? d.kunjungan_berikutnya.slice(0, 10) : '',
        anamnesis: d.anamnesis || '',
        pemeriksaan_awal: d.pemeriksaan_awal || '',
        pemeriksaan: d.pemeriksaan || '',
        diagnosa: d.diagnosa || '',
        catatan: d.catatan || '',
        foto_perawatan: Array.isArray(d.foto_perawatan) ? d.foto_perawatan[0] || '' : '',
        foto_sebelum: Array.isArray(d.foto_sebelum) ? d.foto_sebelum[0] || '' : '',
        foto_sesudah: Array.isArray(d.foto_sesudah) ? d.foto_sesudah[0] || '' : '',
      })

      if (d.tindakans && d.tindakans.length > 0) {
        setTindakans(
          d.tindakans.map((t) => ({
            ...t,
            total: calculateTindakanTotal(t),
          })),
        )
      }

      if (d.reseps && d.reseps.length > 0) {
        setReseps(d.reseps)
      }
    } else if (queryPasienId) {
      setForm((f) => ({ ...f, pasien_id: String(queryPasienId) }))
    }
  }, [existingPerawatan, queryPasienId])

  function showToast(message: string, tone: 'success' | 'error' = 'success') {
    setToast({ message, tone })
    window.setTimeout(() => setToast(null), 3200)
  }

  const grandTotalTindakan = useMemo(() => {
    return tindakans.reduce((sum, item) => sum + calculateTindakanTotal(item), 0)
  }, [tindakans])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const pasienId = Number(form.pasien_id)
      const staffId = Number(form.staff_id)

      if (!pasienId) throw new Error('Pasien wajib dipilih')
      if (!staffId) throw new Error('Dokter / Staff wajib dipilih')

      const formattedTindakans = tindakans.map((t) => ({
        treatment_id: Number(t.treatment_id),
        tanggal: form.tanggal || today,
        jumlah: Number(t.jumlah) || 1,
        beautician_id: t.beautician_id ? Number(t.beautician_id) : null,
        harga: Number(t.harga) || 0,
        diskon: Number(t.diskon) || 0,
        rp_percent: Number(t.rp_percent) || 0,
        total: calculateTindakanTotal(t),
        status: t.status || 'draft',
        catatan: t.catatan || '',
      }))

      const payload = {
        pasien_id: pasienId,
        staff_id: staffId,
        antrian_id: form.antrian_id ? Number(form.antrian_id) : null,
        tanggal: form.tanggal || today,
        diagnosa: form.diagnosa || '',
        anamnesis: form.anamnesis || '',
        pemeriksaan_awal: form.pemeriksaan_awal || '',
        pemeriksaan: form.pemeriksaan || '',
        catatan: form.catatan || '',
        kunjungan_berikutnya: form.kunjungan_berikutnya || '',
        foto_perawatan: form.foto_perawatan ? [form.foto_perawatan] : null,
        foto_sebelum: form.foto_sebelum ? [form.foto_sebelum] : null,
        foto_sesudah: form.foto_sesudah ? [form.foto_sesudah] : null,
        biaya: grandTotalTindakan,
        tindakans: formattedTindakans,
        reseps: reseps,
      }

      if (perawatanId) {
        return apiPut(`/perawatan/${perawatanId}`, payload)
      }
      return apiPost('/perawatan', payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['perawatan'] })
      showToast(perawatanId ? 'Perawatan berhasil diupdate!' : 'Perawatan berhasil disimpan!', 'success')
      window.setTimeout(() => {
        navigate({ to: '/perawatan' })
      }, 1000)
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan perawatan', 'error')
    },
  })

  function handleAddTindakanRow() {
    setTindakans((prev) => [
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
        catatan: '',
      },
    ])
  }

  function handleRemoveTindakanRow(index: number) {
    setTindakans((prev) => prev.filter((_, i) => i !== index))
  }

  function handleTreatmentSelect(index: number, val: string, selected?: TreatmentLite) {
    if (!selected) return
    setTindakans((prev) => {
      const updated = [...prev]
      const cur = updated[index]
      const harga = selected.harga || 0
      const jumlah = cur.jumlah || 1
      const updatedRow = {
        ...cur,
        treatment_id: selected.id,
        nama_treatment: selected.nama,
        harga,
        jumlah,
      }
      updatedRow.total = calculateTindakanTotal(updatedRow)
      updated[index] = updatedRow
      return updated
    })
  }

  function handleBeauticianSelect(index: number, val: string, selected?: StaffLite) {
    setTindakans((prev) => {
      const updated = [...prev]
      updated[index] = {
        ...updated[index],
        beautician_id: selected ? selected.id : null,
        nama_beautician: selected?.nama || '',
      }
      return updated
    })
  }

  function handleTindakanFieldChange(index: number, field: keyof PerawatanTindakanItem, val: any) {
    setTindakans((prev) => {
      const updated = [...prev]
      const cur = { ...updated[index], [field]: val }
      cur.total = calculateTindakanTotal(cur)
      updated[index] = cur
      return updated
    })
  }

  function handleAddResepData(resepData: { barangs: ResepItem[] }) {
    setReseps((prev) => [
      ...prev,
      {
        antrian_id: form.antrian_id ? Number(form.antrian_id) : null,
        tanggal: today,
        status: 'draft',
        barangs: resepData.barangs,
      },
    ])
    showToast('Resep dokter berhasil ditambahkan', 'success')
  }

  function handleRemoveResepGroup(groupIdx: number) {
    setReseps((prev) => prev.filter((_, i) => i !== groupIdx))
  }

  if (loadingExisting) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-slate-500">
        Memuat detail rekam medis perawatan...
      </div>
    )
  }

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

      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: '/perawatan' })}
            className="rounded-xl text-xs"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Kembali
          </Button>
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
              {perawatanId ? `Edit Perawatan (${existingPerawatan?.data?.kode || `#${perawatanId}`})` : 'Detail & Rekam Medis Perawatan'}
            </h2>
            <p className="text-xs text-slate-500">Form pengisian rekam medis SOAP, foto medis, resep, dan tindakan pasien.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="rounded-xl text-xs bg-rose-600 hover:bg-rose-700 text-white"
          >
            <Save className="h-4 w-4 mr-1.5" />
            {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Perawatan'}
          </Button>
        </div>
      </div>

      {/* Multi Tab Header */}
      <div className="flex gap-2 border-b border-slate-200 bg-white p-2 rounded-2xl shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab('pasien')}
          className={cn(
            'flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all',
            activeTab === 'pasien'
              ? 'bg-rose-50 text-rose-700 border border-rose-200 shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
          )}
        >
          <User className="h-4 w-4" />
          Data Pasien & Foto
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('soap')}
          className={cn(
            'flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all',
            activeTab === 'soap'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
          )}
        >
          <Stethoscope className="h-4 w-4" />
          Catatan Pemeriksaan (SOAP) & Resep
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('tindakan')}
          className={cn(
            'flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all',
            activeTab === 'tindakan'
              ? 'bg-purple-50 text-purple-700 border border-purple-200 shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
          )}
        >
          <FileText className="h-4 w-4" />
          Tindakan Medis ({tindakans.length})
        </button>
      </div>

      {/* TAB 1: DATA PASIEN */}
      {activeTab === 'pasien' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              <UserCheck className="h-4 w-4 text-rose-600" />
              Informasi Pasien
            </h3>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Pasien *</label>
              <PasienSelect
                required
                value={form.pasien_id}
                onChange={(pasien_id) => setForm((f) => ({ ...f, pasien_id }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Dokter Penanggung Jawab (DPJP) *</label>
              <DokterSelect
                required
                value={form.staff_id}
                onChange={(staff_id) => setForm((f) => ({ ...f, staff_id }))}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Tanggal Perawatan</label>
                <input
                  type="date"
                  value={form.tanggal}
                  onChange={(e) => setForm((f) => ({ ...f, tanggal: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium focus:border-rose-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Kunjungan Berikutnya</label>
                <input
                  type="date"
                  value={form.kunjungan_berikutnya}
                  onChange={(e) => setForm((f) => ({ ...f, kunjungan_berikutnya: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Catatan Khusus Pasien</label>
              <textarea
                rows={3}
                value={form.catatan}
                onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
                placeholder="Catatan tambahan seperti alergi, riwayat pengobatan, atau preferensi..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConsentModalOpen(true)}
                className="w-full justify-center rounded-xl text-xs"
              >
                <FileText className="h-4 w-4 mr-1.5 text-rose-600" />
                Upload / Lampirkan Dokumen Informed Consent
              </Button>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              <ImageIcon className="h-4 w-4 text-rose-600" />
              Dokumentasi Foto Perawatan
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Foto Perawatan (URL Image)</label>
                <input
                  type="text"
                  value={form.foto_perawatan}
                  onChange={(e) => setForm((f) => ({ ...f, foto_perawatan: e.target.value }))}
                  placeholder="https://example.com/foto-perawatan.jpg"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Foto Sebelum Treatment (Before)</label>
                <input
                  type="text"
                  value={form.foto_sebelum}
                  onChange={(e) => setForm((f) => ({ ...f, foto_sebelum: e.target.value }))}
                  placeholder="https://example.com/foto-before.jpg"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Foto Sesudah Treatment (After)</label>
                <input
                  type="text"
                  value={form.foto_sesudah}
                  onChange={(e) => setForm((f) => ({ ...f, foto_sesudah: e.target.value }))}
                  placeholder="https://example.com/foto-after.jpg"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
              <ImagePreview label="Foto Perawatan" url={form.foto_perawatan} />
              <ImagePreview label="Before" url={form.foto_sebelum} />
              <ImagePreview label="After" url={form.foto_sesudah} />
            </div>
          </div>
        </div>
      ) : null}

      {/* TAB 2: CATATAN PEMERIKSAAN (SOAP) */}
      {activeTab === 'soap' ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              <Stethoscope className="h-4 w-4 text-emerald-600" />
              Catatan Rekam Medis (S — O — A)
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Subjective (S) — Anamnesis / Keluhan Pasien
                </label>
                <textarea
                  rows={4}
                  value={form.anamnesis}
                  onChange={(e) => setForm((f) => ({ ...f, anamnesis: e.target.value }))}
                  placeholder="Keluhan utama pasien, riwayat penyakit, gejalan klinis..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Pemeriksaan Awal</label>
                <textarea
                  rows={4}
                  value={form.pemeriksaan_awal}
                  onChange={(e) => setForm((f) => ({ ...f, pemeriksaan_awal: e.target.value }))}
                  placeholder="Tanda vital, tensi, suhu, kondisi umum..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Objective (O) — Hasil Pemeriksaan Dokter / Fisik
                </label>
                <textarea
                  rows={4}
                  value={form.pemeriksaan}
                  onChange={(e) => setForm((f) => ({ ...f, pemeriksaan: e.target.value }))}
                  placeholder="Hasil inspeksi kulit, lesi, palpasi, analisis visual..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Assessment (A) — Diagnosa Dokter
                </label>
                <textarea
                  rows={4}
                  value={form.diagnosa}
                  onChange={(e) => setForm((f) => ({ ...f, diagnosa: e.target.value }))}
                  placeholder="Diagnosa penyakit / kondisi kulit..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Resep Dokter Section */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <FileText className="h-4 w-4 text-emerald-600" />
                Resep Dokter & Obat Apotek
              </h3>
              <Button
                type="button"
                onClick={() => setResepModalOpen(true)}
                className="rounded-xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Input Resep Dokter
              </Button>
            </div>

            {reseps.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                Belum ada resep obat diinput. Klik <b>Input Resep Dokter</b> untuk menambahkan obat.
              </div>
            ) : (
              <div className="space-y-3">
                {reseps.map((group, groupIdx) => (
                  <div key={groupIdx} className="rounded-xl border border-slate-200 p-4 bg-slate-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        Resep #{groupIdx + 1} — Tanggal: {group.tanggal || today}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveResepGroup(groupIdx)}
                        className="text-xs font-bold text-rose-600 hover:underline"
                      >
                        Hapus Resep
                      </button>
                    </div>

                    <table className="w-full text-left text-xs bg-white rounded-lg border border-slate-200 overflow-hidden">
                      <thead className="bg-slate-100 font-bold text-slate-600 text-[10px] uppercase">
                        <tr>
                          <th className="px-3 py-2">Kode</th>
                          <th className="px-3 py-2">Nama Barang / Obat</th>
                          <th className="px-3 py-2 text-center">Jumlah</th>
                          <th className="px-3 py-2">Unit</th>
                          <th className="px-3 py-2 text-right">Harga</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {group.barangs.map((b, bIdx) => (
                          <tr key={bIdx}>
                            <td className="px-3 py-1.5 font-mono text-slate-500">{b.kode_barang}</td>
                            <td className="px-3 py-1.5 font-semibold text-slate-900">{b.nama_barang}</td>
                            <td className="px-3 py-1.5 text-center font-bold">{b.jumlah}</td>
                            <td className="px-3 py-1.5 text-slate-500">{b.unit}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(b.harga)}</td>
                            <td className="px-3 py-1.5 text-right font-mono font-bold">{formatCurrency(b.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* TAB 3: TINDAKAN MEDIS (P) */}
      {activeTab === 'tindakan' ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <FileText className="h-4 w-4 text-purple-600" />
                Plan (P) — Daftar Tindakan & Treatment Pasien
              </h3>
              <p className="text-xs text-slate-500">Pilih tindakan, beautician pelaksana, jumlah, dan diskon.</p>
            </div>
            <Button
              type="button"
              onClick={handleAddTindakanRow}
              className="rounded-xl text-xs bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Tambah Tindakan
            </Button>
          </div>

          {tindakans.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-xs text-slate-500">
              Belum ada tindakan ditambahkan. Klik <b>Tambah Tindakan</b> untuk memasukkan tindakan medis.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase text-[10px]">
                  <tr>
                    <th className="min-w-[200px] px-3 py-2.5">Tindakan / Treatment</th>
                    <th className="w-20 px-3 py-2.5">Qty</th>
                    <th className="min-w-[180px] px-3 py-2.5">Beautician</th>
                    <th className="w-28 px-3 py-2.5">Harga (Rp)</th>
                    <th className="w-20 px-3 py-2.5">Diskon %</th>
                    <th className="w-20 px-3 py-2.5">RP %</th>
                    <th className="w-28 px-3 py-2.5 text-right">Nilai Total</th>
                    <th className="min-w-[140px] px-3 py-2.5">Catatan</th>
                    <th className="w-12 px-3 py-2.5 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tindakans.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-2">
                        <TreatmentSelect
                          value={item.treatment_id ? String(item.treatment_id) : ''}
                          onChange={(val, selected) => handleTreatmentSelect(idx, val, selected)}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={1}
                          value={item.jumlah}
                          onChange={(e) => handleTindakanFieldChange(idx, 'jumlah', Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-center font-bold"
                        />
                      </td>
                      <td className="p-2">
                        <BeauticianSelect
                          value={item.beautician_id ? String(item.beautician_id) : ''}
                          onChange={(val, selected) => handleBeauticianSelect(idx, val, selected)}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={0}
                          value={item.harga}
                          onChange={(e) => handleTindakanFieldChange(idx, 'harga', Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={item.diskon}
                          onChange={(e) => handleTindakanFieldChange(idx, 'diskon', Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-center font-mono"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={item.rp_percent}
                          onChange={(e) => handleTindakanFieldChange(idx, 'rp_percent', Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-center font-mono"
                        />
                      </td>
                      <td className="p-2 font-mono font-extrabold text-right text-slate-900">
                        {formatCurrency(calculateTindakanTotal(item))}
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={item.catatan || ''}
                          onChange={(e) => handleTindakanFieldChange(idx, 'catatan', e.target.value)}
                          placeholder="Catatan..."
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveTindakanRow(idx)}
                          className="rounded p-1 text-rose-500 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200 font-bold">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-right text-xs text-slate-700">
                      Total Biaya Tindakan:
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-sm font-extrabold text-rose-700">
                      {formatCurrency(grandTotalTindakan)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="rounded-xl bg-amber-50 p-3 text-[11px] font-semibold text-amber-800 border border-amber-200">
            <span className="text-rose-600 font-bold">*</span> Catatan: Pemberian diskon di sini berpengaruh dengan fee dokter / beautician, silakan sesuaikan dengan komisi yang diatur di sistem Klinik.
          </div>
        </div>
      ) : null}

      {/* Modals */}
      <ResepModal
        isOpen={resepModalOpen}
        onClose={() => setResepModalOpen(false)}
        onSave={handleAddResepData}
      />
      <ConsentDocumentModal
        isOpen={consentModalOpen}
        onClose={() => setConsentModalOpen(false)}
      />
    </div>
  )
}

function ImagePreview({ label, url }: { label: string; url?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
      <span className="text-[11px] font-bold text-slate-700 mb-2">{label}</span>
      {url ? (
        <img
          src={url}
          alt={label}
          className="h-28 w-full rounded-lg object-cover border border-slate-200 shadow-sm"
          onError={(e) => {
            ;(e.target as HTMLImageElement).src =
              'https://via.placeholder.com/150?text=Gambar+Tidak+Ditemukan'
          }}
        />
      ) : (
        <div className="flex h-28 w-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-slate-400">
          <ImageIcon className="h-8 w-8" />
        </div>
      )}
    </div>
  )
}
