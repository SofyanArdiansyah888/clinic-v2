import { toast as pushToast } from '@/shared/components/Toaster'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Calendar,
  FileText,
  Plus,
  Save,
  Sparkles,
  Stethoscope,
  Trash2,
  User,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/shared/api/client'
import { BeauticianSelect, type StaffLite } from '@/shared/components/BeauticianSelect'
import { Dialog } from '@/shared/components/Dialog'
import { DokterSelect } from '@/shared/components/DokterSelect'
import { FotoUploadField } from '@/shared/components/FotoUploadField'
import { PasienSelect } from '@/shared/components/PasienSelect'
import { TreatmentSelect, type TreatmentLite } from '@/shared/components/TreatmentSelect'
import { PageHeader } from '@/shared/components/PageHeader'
import { Button } from '@/shared/ui/button'
import { Tabs } from '@/shared/ui/tabs'
import { Field, FormAlert } from '@/shared/ui/field'
import { FieldErrorsContext, useFormValidation } from '@/shared/lib/validation'
import { formatCurrency, formatDate, todayISO } from '@/shared/lib/formatters'
import { ResepModal, type ResepItem } from './ResepModal'
import { ConsentDocumentModal } from './ConsentDocumentModal'
import { RupiahInput } from '@/shared/ui/rupiah-input'

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
  const [saveError, setSaveError] = useState<string | null>(null)
  const validation = useFormValidation()
  // Set by a submit attempt so the effect below can reveal an error hidden in another tab.
  const jumpToError = useRef(false)

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
    pushToast(message, tone)
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

  // Opened from the queue: the antrian already names the patient's dokter, so use it.
  const { data: antrianData } = useQuery({
    queryKey: ['antrian', 'detail', queryAntrianId],
    queryFn: () => apiGet<{ pasien_id: number; staff_id: number }>(`/antrian/${queryAntrianId}`),
    enabled: Boolean(queryAntrianId) && !perawatanId,
  })
  useEffect(() => {
    const a = antrianData?.data
    if (!a) return
    setForm((f) => ({
      ...f,
      staff_id: f.staff_id || (a.staff_id ? String(a.staff_id) : ''),
      pasien_id: f.pasien_id || (a.pasien_id ? String(a.pasien_id) : ''),
    }))
  }, [antrianData])

  // Tabs stay mounted (hidden) so native validation sees every field. When all
  // errors sit in hidden tabs, switch to the first one and focus its control.
  useEffect(() => {
    if (!jumpToError.current) return
    jumpToError.current = false
    const keys = Object.keys(validation.errors)
    if (keys.length === 0) return
    const panels = keys.map((k) => document.getElementById(k)?.closest<HTMLElement>('[data-tab]'))
    const visible = keys.find((_, i) => !panels[i]?.hidden)
    if (visible) {
      document.getElementById(visible)?.focus()
      return
    }
    const tab = panels[0]?.dataset.tab as 'soap' | 'tindakan' | 'pasien' | undefined
    if (!tab) return
    setActiveTab(tab)
    window.setTimeout(() => document.getElementById(keys[0])?.focus())
  }, [validation.errors])

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
      const message = err instanceof Error ? err.message : 'Gagal menyimpan perawatan'
      setSaveError(message)
      showToast(message, 'error')
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

  // Fields are checked by the form's native constraints before this runs.
  function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (e.target !== e.currentTarget) return
    setSaveError(null)
    saveMutation.mutate()
  }

  // Enter in a single-line input must not send the EMR to the kasir.
  function preventEnterSubmit(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault()
  }

  if (loadingExisting) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-slate-500 font-medium">
        Memuat rekam medis...
      </div>
    )
  }

  const patientName = existingPerawatan?.data?.pasien?.nama || '-'
  const patientCode = existingPerawatan?.data?.pasien?.kode || (form.pasien_id ? `ID-${form.pasien_id}` : '-')
  const doctorName = existingPerawatan?.data?.staff?.nama || '-'

  return (
    <FieldErrorsContext.Provider value={validation.errors}>
      <form
        {...validation.formProps}
        onSubmitCapture={(e) => {
          if (e.target === e.currentTarget) jumpToError.current = true
          validation.formProps.onSubmitCapture(e)
        }}
        onSubmit={handleSave}
        onKeyDown={preventEnterSubmit}
        className="space-y-6"
      >
        <PageHeader
          title={perawatanId ? `Edit EMR ${existingPerawatan?.data?.kode || `#${perawatanId}`}` : 'Perawatan Baru'}
          description="SOAP, tindakan, resep, dan foto"
          actions={
            <>
              <Button type="button" variant="outline" onClick={() => navigate({ to: '/perawatan' })}>
                <ArrowLeft />
                Kembali
              </Button>
              {perawatanId ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={deleteMutation.isPending || saveMutation.isPending}
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 />
                  Hapus
                </Button>
              ) : null}
              <Button type="submit" disabled={saveMutation.isPending}>
                <Save />
                {saveMutation.isPending ? 'Menyimpan...' : 'Simpan EMR & Kirim ke Kasir'}
              </Button>
            </>
          }
        />

        <FormAlert>{saveError}</FormAlert>

        {/* Patient Info Summary */}
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:grid-cols-4">
          <div className="flex items-center gap-3">
            <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 sm:flex">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500">Pasien</p>
              <p className="truncate text-sm font-bold text-slate-900">{patientName}</p>
              <p className="font-mono text-[11px] text-slate-500">{patientCode}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 sm:flex">
              <Stethoscope className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500">Dokter</p>
              <p className="truncate text-sm font-bold text-slate-900">{doctorName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 sm:flex">
              <Calendar className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500">Tanggal</p>
              <p className="text-sm font-bold text-slate-900">{formatDate(form.tanggal)}</p>
              {form.antrian_id ? (
                <p className="font-mono text-[11px] text-slate-500">Antrian #{form.antrian_id}</p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 sm:flex">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500">Estimasi Biaya</p>
              <p className="text-sm font-bold text-emerald-700">{formatCurrency(grandTotalTindakan)}</p>
              <p className="text-[11px] text-slate-500">{tindakans.length} tindakan</p>
            </div>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          fullWidth
          items={[
            { value: 'soap', label: 'SOAP & Resep', icon: <Stethoscope /> },
            { value: 'tindakan', label: 'Tindakan', icon: <FileText />, count: tindakans.length },
            { value: 'pasien', label: 'Pasien & Foto', icon: <User /> },
          ]}
        />

        {/* TAB 1: CATATAN PEMERIKSAAN (SOAP) */}
        <div data-tab="soap" hidden={activeTab !== 'soap'}>
          <div className="space-y-6">
            <div className="space-y-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <h3 className="border-b border-slate-100 pb-3 text-sm font-bold text-slate-900">Catatan SOAP</h3>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* S: SUBJECTIVE */}
                <div className="space-y-2.5 rounded-2xl border border-rose-100 bg-rose-50/20 p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-600 text-xs font-bold text-white">
                      S
                    </span>
                    <label htmlFor="detailperawatanpage-f1" className="text-xs font-bold text-slate-900">
                      Keluhan Utama
                    </label>
                  </div>
                  <textarea id="detailperawatanpage-f1"
                    rows={4}
                    value={form.anamnesis}
                    onChange={(e) => setForm((f) => ({ ...f, anamnesis: e.target.value }))}
                    placeholder="Keluhan pasien..."
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium focus:border-rose-500 focus:outline-none"
                  />
                </div>

                {/* O: OBJECTIVE */}
                <div className="space-y-2.5 rounded-2xl border border-amber-100 bg-amber-50/20 p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500 text-xs font-bold text-white">
                      O
                    </span>
                    <label className="text-xs font-bold text-slate-900">Pemeriksaan</label>
                  </div>
                  <div className="space-y-2">
                    <textarea
                      rows={2}
                      value={form.pemeriksaan_awal}
                      onChange={(e) => setForm((f) => ({ ...f, pemeriksaan_awal: e.target.value }))}
                      placeholder="Pemeriksaan awal / vital sign..."
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-medium focus:border-amber-500 focus:outline-none"
                    />
                    <textarea
                      rows={2}
                      value={form.pemeriksaan}
                      onChange={(e) => setForm((f) => ({ ...f, pemeriksaan: e.target.value }))}
                      placeholder="Hasil pemeriksaan fisik..."
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-medium focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* A: ASSESSMENT */}
                <div className="space-y-2.5 rounded-2xl border border-indigo-100 bg-indigo-50/20 p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
                      A
                    </span>
                    <label htmlFor="detailperawatanpage-f2" className="text-xs font-bold text-slate-900">
                      Diagnosa
                    </label>
                  </div>
                  <textarea id="detailperawatanpage-f2"
                    rows={4}
                    value={form.diagnosa}
                    onChange={(e) => setForm((f) => ({ ...f, diagnosa: e.target.value }))}
                    placeholder="Contoh: Melasma, Acne Grade II..."
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                {/* P: PLAN */}
                <div className="space-y-2.5 rounded-2xl border border-emerald-100 bg-emerald-50/20 p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
                      P
                    </span>
                    <label htmlFor="detailperawatanpage-f3" className="text-xs font-bold text-slate-900">
                      Rencana Tindakan
                    </label>
                  </div>
                  <textarea id="detailperawatanpage-f3"
                    rows={4}
                    value={form.catatan}
                    onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
                    placeholder="Rencana tindakan & kontrol..."
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-bold text-emerald-800 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Resep Dokter Section */}
            <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">Resep Dokter</h3>
                <Button type="button" size="sm" variant="outline" onClick={() => setResepModalOpen(true)}>
                  <Plus />
                  Input Resep Dokter
                </Button>
              </div>

              {reseps.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                  Belum ada resep.
                </div>
              ) : (
                <div className="space-y-3">
                  {reseps.map((group, groupIdx) => (
                    <div key={groupIdx} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">
                          Resep #{groupIdx + 1} · {group.tanggal || today}
                        </span>
                        <Button
                          type="button"
                          variant="ghost-danger"
                          size="icon-sm"
                          title="Hapus resep"
                          aria-label="Hapus resep"
                          onClick={() => handleRemoveResepGroup(groupIdx)}
                        >
                          <Trash2 />
                        </Button>
                      </div>

                      <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-left text-xs">
                        <thead className="bg-slate-100 font-bold text-slate-600 text-[11px] uppercase">
                          <tr>
                            <th className="px-3 py-2">Kode</th>
                            <th className="px-3 py-2">Barang</th>
                            <th className="px-3 py-2 text-center">Qty</th>
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
        </div>

        {/* TAB 2: TINDAKAN MEDIS (P) */}
        <div data-tab="tindakan" hidden={activeTab !== 'tindakan'}>
          <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Tindakan</h3>
              <Button type="button" size="sm" variant="outline" onClick={handleAddTindakanRow}>
                <Plus />
                Tambah Tindakan
              </Button>
            </div>

            {tindakans.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-xs text-slate-500">
                Belum ada tindakan.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50/50">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-600 uppercase text-[11px]">
                    <tr>
                      <th className="min-w-[200px] px-3 py-2.5">Treatment</th>
                      <th className="w-20 px-3 py-2.5">Qty</th>
                      <th className="min-w-[180px] px-3 py-2.5">Beautician</th>
                      <th className="w-28 px-3 py-2.5">Harga</th>
                      <th className="w-20 px-3 py-2.5">Diskon %</th>
                      <th className="w-20 px-3 py-2.5">RP %</th>
                      <th className="w-28 px-3 py-2.5 text-right">Total</th>
                      <th className="min-w-[140px] px-3 py-2.5">Catatan</th>
                      <th className="w-12 px-3 py-2.5 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {tindakans.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2">
                          <TreatmentSelect
                            id={`tindakan-treatment-${idx}`}
                            required
                            value={item.treatment_id ? String(item.treatment_id) : ''}
                            onChange={(val, selected) => handleTreatmentSelect(idx, val, selected)}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            id={`tindakan-qty-${idx}`}
                            aria-label="Qty"
                            type="number"
                            required
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
                          <RupiahInput
                            id={`tindakan-harga-${idx}`}
                            value={item.harga}
                            onValueChange={(v) => handleTindakanFieldChange(idx, 'harga', Number(v))}
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            id={`tindakan-diskon-${idx}`}
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
                            id={`tindakan-rp-percent-${idx}`}
                            type="number"
                            min={0}
                            max={100}
                            value={item.rp_percent}
                            onChange={(e) => handleTindakanFieldChange(idx, 'rp_percent', Number(e.target.value))}
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center font-mono text-xs"
                          />
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-slate-900">
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
                          <Button
                            type="button"
                            variant="ghost-danger"
                            size="icon-sm"
                            onClick={() => handleRemoveTindakanRow(idx)}
                            title="Hapus tindakan"
                            aria-label="Hapus tindakan"
                          >
                            <Trash2 />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-right text-xs text-slate-700">
                        Total
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm font-bold text-slate-900">
                        {formatCurrency(grandTotalTindakan)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <p className="text-xs text-slate-500">Diskon memengaruhi fee dokter / beautician.</p>
          </div>
        </div>

        {/* TAB 3: DATA PASIEN, FOTO & CONSENT */}
        <div data-tab="pasien" hidden={activeTab !== 'pasien'}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <h3 className="border-b border-slate-100 pb-3 text-sm font-bold text-slate-900">Pasien & Dokter</h3>

              <Field label="Pasien" htmlFor="detailperawatanpage-f4" required>
                <PasienSelect id="detailperawatanpage-f4"
                  required
                  value={form.pasien_id}
                  onChange={(pasien_id) => setForm((f) => ({ ...f, pasien_id }))}
                />
              </Field>

              <Field label="Dokter (DPJP)" htmlFor="detailperawatanpage-f5" required>
                <DokterSelect id="detailperawatanpage-f5"
                  required
                  value={form.staff_id}
                  onChange={(staff_id) => setForm((f) => ({ ...f, staff_id }))}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Tanggal" htmlFor="detailperawatanpage-f6">
                  <input id="detailperawatanpage-f6"
                    type="date"
                    value={form.tanggal}
                    onChange={(e) => setForm((f) => ({ ...f, tanggal: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium focus:border-rose-500 focus:outline-none"
                  />
                </Field>
                <Field label="Kunjungan Berikutnya" htmlFor="detailperawatanpage-f7">
                  <input id="detailperawatanpage-f7"
                    type="date"
                    value={form.kunjungan_berikutnya}
                    onChange={(e) => setForm((f) => ({ ...f, kunjungan_berikutnya: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium focus:border-rose-500 focus:outline-none"
                  />
                </Field>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => setConsentModalOpen(true)}
                className="w-full"
              >
                <FileText />
                Informed Consent
              </Button>
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <h3 className="border-b border-slate-100 pb-3 text-sm font-bold text-slate-900">Dokumentasi Foto</h3>

              <div className="space-y-5">
                <FotoUploadField
                  label="Foto Perawatan"
                  folder="foto-perawatan"
                  value={form.foto_perawatan}
                  onChange={(urls) => setForm((f) => ({ ...f, foto_perawatan: urls }))}
                />
                <FotoUploadField
                  label="Foto Sebelum"
                  folder="foto-sebelum"
                  value={form.foto_sebelum}
                  onChange={(urls) => setForm((f) => ({ ...f, foto_sebelum: urls }))}
                />
                <FotoUploadField
                  label="Foto Sesudah"
                  folder="foto-sesudah"
                  value={form.foto_sesudah}
                  onChange={(urls) => setForm((f) => ({ ...f, foto_sesudah: urls }))}
                />
              </div>
            </div>
          </div>
        </div>

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
          description="Data yang dihapus tidak dapat dikembalikan."
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
                disabled={deleteMutation.isPending}
                onClick={() => setDeleteConfirmOpen(false)}
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteMutation.isPending || !perawatanId}
                onClick={() => {
                  if (perawatanId) deleteMutation.mutate(perawatanId)
                }}
              >
                <Trash2 />
                {deleteMutation.isPending ? 'Menghapus...' : 'Ya, Hapus'}
              </Button>
            </div>
          </div>
        </Dialog>
      </form>
    </FieldErrorsContext.Provider>
  )
}
