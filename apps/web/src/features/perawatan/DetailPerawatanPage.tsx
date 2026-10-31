import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Calendar,
  FileText,
  Image as ImageIcon,
  Plus,
  Save,
  Sparkles,
  Stethoscope,
  Trash2,
  User,
  UserCheck,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/shared/api/client'
import { BeauticianSelect, type StaffLite } from '@/shared/components/BeauticianSelect'
import { Dialog } from '@/shared/components/Dialog'
import { DokterSelect } from '@/shared/components/DokterSelect'
import { FotoUploadField } from '@/shared/components/FotoUploadField'
import { PasienSelect } from '@/shared/components/PasienSelect'
import { TreatmentSelect, type TreatmentLite } from '@/shared/components/TreatmentSelect'
import { Button } from '@/shared/ui/button'
import { formatCurrency, formatDate, todayISO } from '@/shared/lib/formatters'
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

const today = todayISO()

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
  const [activeTab, setActiveTab] = useState<'soap' | 'tindakan' | 'pasien'>('soap')

  const [form, setForm] = useState({
    pasien_id: queryPasienId ? String(queryPasienId) : '',
    staff_id: '',
    antrian_id: queryAntrianId ? String(queryAntrianId) : '',
    tanggal: today,
    kunjungan_berikutnya: '',
    anamnesis: '',
    pemeriksaan_awal: '',
    pemeriksaan: '',
    diagnosa: '',
    catatan: '',
    foto_perawatan: [] as string[],
    foto_sebelum: [] as string[],
    foto_sesudah: [] as string[],
  })

  const [tindakans, setTindakans] = useState<PerawatanTindakanItem[]>([])
  const [reseps, setReseps] = useState<PerawatanResepItem[]>([])
  const [resepModalOpen, setResepModalOpen] = useState(false)
  const [consentModalOpen, setConsentModalOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
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
        foto_perawatan: Array.isArray(d.foto_perawatan) ? d.foto_perawatan.filter(Boolean) : [],
        foto_sebelum: Array.isArray(d.foto_sebelum) ? d.foto_sebelum.filter(Boolean) : [],
        foto_sesudah: Array.isArray(d.foto_sesudah) ? d.foto_sesudah.filter(Boolean) : [],
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

  // Mark antrian as "diproses" when starting SOAP from queue
  useEffect(() => {
    if (!queryAntrianId || perawatanId) return
    void apiPatch(`/antrian/${queryAntrianId}/status`, { status: 'diproses' })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['antrian'] })
      })
      .catch(() => {
        /* non-blocking: status sync may fail if antrian already moved */
      })
  }, [queryAntrianId, perawatanId, queryClient])

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

      const antrianId = form.antrian_id ? Number(form.antrian_id) : null

      const payload = {
        pasien_id: pasienId,
        staff_id: staffId,
        antrian_id: antrianId,
        tanggal: form.tanggal || today,
        diagnosa: form.diagnosa || '',
        anamnesis: form.anamnesis || '',
        pemeriksaan_awal: form.pemeriksaan_awal || '',
        pemeriksaan: form.pemeriksaan || '',
        catatan: form.catatan || '',
        kunjungan_berikutnya: form.kunjungan_berikutnya || '',
        // "Kirim ke Kasir" → perawatan + antrian status bayar
        status: 'bayar',
        foto_perawatan: form.foto_perawatan.length ? form.foto_perawatan : null,
        foto_sebelum: form.foto_sebelum.length ? form.foto_sebelum : null,
        foto_sesudah: form.foto_sesudah.length ? form.foto_sesudah : null,
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
      void queryClient.invalidateQueries({ queryKey: ['antrian'] })
      showToast(
        perawatanId
          ? 'EMR diupdate & antrian dikirim ke kasir!'
          : 'EMR disimpan & antrian dikirim ke kasir!',
        'success',
      )
      window.setTimeout(() => {
        navigate({ to: '/perawatan' })
      }, 1000)
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan perawatan', 'error')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/perawatan/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['perawatan'] })
      void queryClient.invalidateQueries({ queryKey: ['antrian'] })
      showToast('Data perawatan berhasil dihapus', 'success')
      window.setTimeout(() => navigate({ to: '/perawatan' }), 800)
    },
    onError: () => showToast('Gagal menghapus data perawatan', 'error'),
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

  function handleTreatmentSelect(index: number, _val: string, selected?: TreatmentLite) {
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

  function handleBeauticianSelect(index: number, _val: string, selected?: StaffLite) {
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
      <div className="flex h-64 items-center justify-center text-xs text-slate-500 font-medium">
        Memuat rekam medis perawatan...
      </div>
    )
  }

  const patientName = existingPerawatan?.data?.pasien?.nama || 'Pasien Perawatan'
  const patientCode = existingPerawatan?.data?.pasien?.kode || (form.pasien_id ? `ID-${form.pasien_id}` : '-')
  const doctorName = existingPerawatan?.data?.staff?.nama || 'Dokter Spesialis'

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

      {/* Page Title & Actions */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: '/perawatan' })}
            className="rounded-xl text-xs border-slate-200 hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Kembali
          </Button>
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
              {perawatanId
                ? `Edit EMR Perawatan (${existingPerawatan?.data?.kode || `#${perawatanId}`})`
                : 'Form Digital EMR & SOAP Beauty Care'}
            </h2>
            <p className="text-xs text-slate-500">
              Rekam medis klinis estetika, pengamatan fisik, rencana tindakan, foto medis, dan resep dokter.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {perawatanId ? (
            <Button
              type="button"
              variant="outline"
              disabled={deleteMutation.isPending || saveMutation.isPending}
              onClick={() => setDeleteConfirmOpen(true)}
              className="rounded-xl text-xs border-rose-200 text-rose-700 hover:bg-rose-50"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Hapus
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="rounded-xl text-xs bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white font-bold shadow-md shadow-rose-600/20 active:scale-95 transition-all"
          >
            <Save className="h-4 w-4 mr-1.5" />
            {saveMutation.isPending ? 'Menyimpan...' : 'Simpan EMR & Kirim ke Kasir'}
          </Button>
        </div>
      </div>

      {/* Patient Info Banner Summary */}
      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:grid-cols-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 font-extrabold">
            <User className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PASIEN / MEMBER</p>
            <h4 className="text-xs font-extrabold text-slate-900">{patientName}</h4>
            <p className="font-mono text-[11px] font-semibold text-rose-600">{patientCode}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-slate-100 pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 font-extrabold">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">DOKTER PEMERIKSA (DPJP)</p>
            <h4 className="text-xs font-extrabold text-slate-900">{doctorName}</h4>
            <p className="text-[11px] font-medium text-slate-500">Aesthetic Dermatologist</p>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-slate-100 pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 font-extrabold">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">TANGGAL SESSION</p>
            <h4 className="text-xs font-extrabold text-slate-900">{formatDate(form.tanggal)}</h4>
            <p className="font-mono text-[11px] text-slate-500">{form.antrian_id ? `Antrian #${form.antrian_id}` : 'Direct Entry'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-slate-100 pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 font-extrabold">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ESTIMASI TOTAL BIAYA</p>
            <h4 className="text-sm font-black text-emerald-700">{formatCurrency(grandTotalTindakan)}</h4>
            <p className="text-[10px] font-bold text-emerald-600">{tindakans.length} Tindakan Medis</p>
          </div>
        </div>
      </div>

      {/* Sub-Tab Segment Bar */}
      <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab('soap')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs font-extrabold transition-all',
            activeTab === 'soap'
              ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-600/20'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
          )}
        >
          <Stethoscope className="h-4 w-4" />
          <span>Catatan Pemeriksaan (SOAP) & Resep Dokter</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tindakan')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs font-bold transition-all',
            activeTab === 'tindakan'
              ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-600/20'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
          )}
        >
          <FileText className="h-4 w-4" />
          <span>Tindakan Medis Plan (P) ({tindakans.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pasien')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs font-bold transition-all',
            activeTab === 'pasien'
              ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-600/20'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
          )}
        >
          <User className="h-4 w-4" />
          <span>Data Pasien, Foto & Consent</span>
        </button>
      </div>

      {/* TAB 1: CATATAN PEMERIKSAAN (SOAP) */}
      {activeTab === 'soap' ? (
        <div className="space-y-6">
          <div className="space-y-6 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                <Stethoscope className="h-4 w-4 text-rose-600" />
                Rekam Medis Digital SOAP (Subjective, Objective, Assessment, Plan)
              </h3>
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
                Clinical Examination
              </span>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* S: SUBJECTIVE */}
              <div className="space-y-2.5 rounded-2xl border border-rose-100 bg-rose-50/20 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-600 text-xs font-black text-white">
                    S
                  </span>
                  <label className="text-xs font-extrabold text-slate-900">
                    SUBJECTIVE (Keluhan Utama Pasien / Anamnesis)
                  </label>
                </div>
                <textarea
                  rows={4}
                  value={form.anamnesis}
                  onChange={(e) => setForm((f) => ({ ...f, anamnesis: e.target.value }))}
                  placeholder="Pasien mengeluh flek hitam di pipi kanan/kiri, kulit kusam dan terasa kering..."
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium focus:border-rose-500 focus:outline-none"
                />
              </div>

              {/* O: OBJECTIVE */}
              <div className="space-y-2.5 rounded-2xl border border-amber-100 bg-amber-50/20 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500 text-xs font-black text-white">
                    O
                  </span>
                  <label className="text-xs font-extrabold text-slate-900">
                    OBJECTIVE (Hasil Examination & Skin Analyzer)
                  </label>
                </div>
                <div className="space-y-2">
                  <textarea
                    rows={2}
                    value={form.pemeriksaan_awal}
                    onChange={(e) => setForm((f) => ({ ...f, pemeriksaan_awal: e.target.value }))}
                    placeholder="Pemeriksaan awal / vital signs..."
                    className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-medium focus:border-amber-500 focus:outline-none"
                  />
                  <textarea
                    rows={2}
                    value={form.pemeriksaan}
                    onChange={(e) => setForm((f) => ({ ...f, pemeriksaan: e.target.value }))}
                    placeholder="Hasil pengamatan fisik / skin barrier / pigment index..."
                    className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-medium focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* A: ASSESSMENT */}
              <div className="space-y-2.5 rounded-2xl border border-indigo-100 bg-indigo-50/20 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-xs font-black text-white">
                    A
                  </span>
                  <label className="text-xs font-extrabold text-slate-900">
                    ASSESSMENT (Diagnosa Estetika & Spesialis)
                  </label>
                </div>
                <textarea
                  rows={4}
                  value={form.diagnosa}
                  onChange={(e) => setForm((f) => ({ ...f, diagnosa: e.target.value }))}
                  placeholder="Contoh: Melasma Epidermal + Skin Barrier Impaired, Acne Vulgaris Grade II..."
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* P: PLAN */}
              <div className="space-y-2.5 rounded-2xl border border-emerald-100 bg-emerald-50/20 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600 text-xs font-black text-white">
                    P
                  </span>
                  <label className="text-xs font-extrabold text-slate-900">
                    PLAN (Rencana Tindakan Medis & Homecare)
                  </label>
                </div>
                <textarea
                  rows={4}
                  value={form.catatan}
                  onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
                  placeholder="Rencana tindakan laser, injeksi, frekuensi kontrol ulang..."
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-bold text-emerald-800 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Resep Dokter Section */}
          <div className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <FileText className="h-4 w-4 text-emerald-600" />
                Resep Dokter & Skincare Homecare
              </h3>
              <Button
                type="button"
                onClick={() => setResepModalOpen(true)}
                className="rounded-xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
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
                  <div key={groupIdx} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
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

                    <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-left text-xs">
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

      {/* TAB 2: TINDAKAN MEDIS (P) */}
      {activeTab === 'tindakan' ? (
        <div className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <FileText className="h-4 w-4 text-purple-600" />
                Rincian Tindakan Injeksi / Laser & Treatment
              </h3>
              <p className="text-xs text-slate-500">Pilih tindakan, beautician pelaksana, jumlah, dan diskon.</p>
            </div>
            <Button
              type="button"
              onClick={handleAddTindakanRow}
              className="rounded-xl text-xs bg-purple-600 hover:bg-purple-700 text-white font-bold"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Tambah Tindakan
            </Button>
          </div>

          {tindakans.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-xs text-slate-500">
              Belum ada tindakan ditambahkan. Klik <b>Tambah Tindakan</b> untuk memasukkan tindakan medis.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50/50">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-600 uppercase text-[10px]">
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
                <tbody className="divide-y divide-slate-200 bg-white">
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
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center text-xs font-bold"
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
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={item.diskon}
                          onChange={(e) => handleTindakanFieldChange(idx, 'diskon', Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center font-mono text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={item.rp_percent}
                          onChange={(e) => handleTindakanFieldChange(idx, 'rp_percent', Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center font-mono text-xs"
                        />
                      </td>
                      <td className="p-2 text-right font-mono font-extrabold text-slate-900">
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
                          className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 transition-all hover:bg-rose-100"
                          title="Hapus tindakan"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
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

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800">
            <span className="font-bold text-rose-600">*</span> Catatan: Pemberian diskon di sini berpengaruh dengan fee
            dokter / beautician, silakan sesuaikan dengan komisi yang diatur di sistem Klinik.
          </div>
        </div>
      ) : null}

      {/* TAB 3: DATA PASIEN, FOTO & CONSENT */}
      {activeTab === 'pasien' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 border-b border-slate-100 pb-3 text-sm font-bold text-slate-900">
              <UserCheck className="h-4 w-4 text-rose-600" />
              Informasi Pasien & Dokter DPJP
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
              <Button
                type="button"
                variant="outline"
                onClick={() => setConsentModalOpen(true)}
                className="w-full justify-center rounded-xl text-xs"
              >
                <FileText className="mr-1.5 h-4 w-4 text-rose-600" />
                Upload / Lampirkan Dokumen Informed Consent
              </Button>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 border-b border-slate-100 pb-3 text-sm font-bold text-slate-900">
              <ImageIcon className="h-4 w-4 text-rose-600" />
              Dokumentasi Foto Perawatan
            </h3>

            <div className="space-y-5">
              <FotoUploadField
                label="Foto Perawatan"
                folder="foto-perawatan"
                value={form.foto_perawatan}
                onChange={(urls) => setForm((f) => ({ ...f, foto_perawatan: urls }))}
              />
              <FotoUploadField
                label="Foto Sebelum Treatment (Before)"
                folder="foto-sebelum"
                value={form.foto_sebelum}
                onChange={(urls) => setForm((f) => ({ ...f, foto_sebelum: urls }))}
              />
              <FotoUploadField
                label="Foto Sesudah Treatment (After)"
                folder="foto-sesudah"
                value={form.foto_sesudah}
                onChange={(urls) => setForm((f) => ({ ...f, foto_sesudah: urls }))}
              />
            </div>
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

      <Dialog
        open={deleteConfirmOpen}
        onClose={() => {
          if (!deleteMutation.isPending) setDeleteConfirmOpen(false)
        }}
        title="Hapus Data Perawatan"
        description="Data EMR yang dihapus tidak dapat dikembalikan."
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Yakin hapus perawatan{' '}
            <span className="font-bold text-slate-900">
              {existingPerawatan?.data?.kode || `#${perawatanId}`}
            </span>
            ?
          </p>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl text-xs"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-rose-600 text-xs text-white hover:bg-rose-700"
              disabled={deleteMutation.isPending || !perawatanId}
              onClick={() => {
                if (perawatanId) deleteMutation.mutate(perawatanId)
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {deleteMutation.isPending ? 'Menghapus...' : 'Ya, Hapus'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

