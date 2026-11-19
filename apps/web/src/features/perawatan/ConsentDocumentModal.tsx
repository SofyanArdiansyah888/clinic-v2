import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, FileText, Loader2, PenLine, Printer, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { apiGet, apiPost } from '@/shared/api/client'
import { useAuthStore } from '@/features/auth/store'
import { Dialog } from '@/shared/components/Dialog'
import { DokterSelect } from '@/shared/components/DokterSelect'
import { SearchableSelect } from '@/shared/components/SearchableSelect'
import { SignaturePad, type SignaturePadHandle } from '@/shared/components/SignaturePad'
import { toast as pushToast } from '@/shared/components/Toaster'
import { Button } from '@/shared/ui/button'
import { Field, FormAlert } from '@/shared/ui/field'
import { formatDateTime } from '@/shared/lib/formatters'
import { openPrintTab } from '@/shared/lib/print'
import {
  HUBUNGAN_OPTIONS,
  postConsent,
  previewIsi,
  uploadSignature,
  type ConsentBody,
  type PendingConsent,
  type PerawatanConsent,
} from './consent'

type Template = { id: number; judul: string; kategori?: string; isi: string; is_active?: boolean }

type ConsentDocumentModalProps = {
  isOpen: boolean
  onClose: () => void
  /** Saved perawatan: consents are stored right away. Null: kept as pending until the EMR is saved. */
  perawatanId: number | null
  /** Values for the live preview of template placeholders. */
  preview: Record<string, string | undefined>
  pending: PendingConsent[]
  onPendingChange: (pending: PendingConsent[]) => void
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium focus:border-rose-500 focus:outline-none'

function errorMessage(err: unknown, fallback: string) {
  const data = (err as { response?: { data?: { message?: string } } })?.response?.data
  return data?.message || (err instanceof Error ? err.message : fallback)
}

export function ConsentDocumentModal({ isOpen, onClose, perawatanId, preview, pending, onPendingChange }: ConsentDocumentModalProps) {
  const queryClient = useQueryClient()
  const role = useAuthStore((s) => s.user?.role)
  const canBatal = role === 'admin' || role === 'doctor'

  const [templateId, setTemplateId] = useState('')
  const [nama, setNama] = useState('')
  const [hubungan, setHubungan] = useState(HUBUNGAN_OPTIONS[0])
  const [saksi, setSaksi] = useState('')
  const [dokterId, setDokterId] = useState('')
  const [hasTtdPasien, setHasTtdPasien] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [batalId, setBatalId] = useState<number | null>(null)
  const [alasan, setAlasan] = useState('')
  const ttdPasien = useRef<SignaturePadHandle>(null)
  const ttdDokter = useRef<SignaturePadHandle>(null)

  const templatesQuery = useQuery({
    queryKey: ['template-informed-consent', 'aktif'],
    queryFn: () => apiGet<Template[]>('/template-informed-consent', { is_active: 'true', per_page: 100 }),
    enabled: isOpen,
  })
  const templates = useMemo(() => templatesQuery.data?.data ?? [], [templatesQuery.data])
  const template = templates.find((t) => String(t.id) === templateId)

  const listKey = ['perawatan-consent', perawatanId]
  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: () => apiGet<PerawatanConsent[]>(`/perawatan/${perawatanId}/consent`),
    enabled: isOpen && Boolean(perawatanId),
  })
  const consents = listQuery.data?.data ?? []

  const namaPenandatangan = nama || preview.nama_pasien || ''

  function resetForm() {
    setTemplateId('')
    setNama('')
    setHubungan(HUBUNGAN_OPTIONS[0])
    setSaksi('')
    setDokterId('')
    setError(null)
    ttdPasien.current?.clear()
    ttdDokter.current?.clear()
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!template) throw new Error('Pilih template consent')
      if (!namaPenandatangan.trim()) throw new Error('Nama penandatangan wajib diisi')
      const blobPasien = await ttdPasien.current?.toBlob()
      if (!blobPasien) throw new Error('Tanda tangan penandatangan wajib diisi')
      const body: ConsentBody = {
        template_id: template.id,
        nama_penandatangan: namaPenandatangan.trim(),
        hubungan,
        ttd_pasien_url: await uploadSignature(blobPasien, namaPenandatangan),
        dokter_id: dokterId ? Number(dokterId) : null,
        saksi: saksi.trim(),
      }
      const blobDokter = await ttdDokter.current?.toBlob()
      if (blobDokter) body.ttd_dokter_url = await uploadSignature(blobDokter, 'dokter')
      if (perawatanId) {
        await postConsent(perawatanId, body)
        return 'saved' as const
      }
      onPendingChange([...pending, { key: `${Date.now()}-${pending.length}`, judul: previewIsi(template.judul, preview), body }])
      return 'pending' as const
    },
    onSuccess: (result) => {
      resetForm()
      if (result === 'saved') {
        void queryClient.invalidateQueries({ queryKey: ['perawatan-consent', perawatanId] })
        pushToast('Informed consent tersimpan', 'success')
      } else {
        pushToast('Consent ditandatangani; tersimpan saat EMR disimpan', 'success')
      }
    },
    onError: (err) => setError(errorMessage(err, 'Gagal menyimpan consent')),
  })

  const batalMutation = useMutation({
    mutationFn: ({ id, alasan }: { id: number; alasan: string }) => apiPost(`/perawatan-consent/${id}/batal`, { alasan }),
    onSuccess: () => {
      setBatalId(null)
      setAlasan('')
      void queryClient.invalidateQueries({ queryKey: ['perawatan-consent', perawatanId] })
      pushToast('Consent dibatalkan', 'success')
    },
    onError: (err) => pushToast(errorMessage(err, 'Gagal membatalkan consent'), 'error'),
  })

  const templateOptions = templates.map((t) => ({ value: String(t.id), label: t.judul, description: t.kategori }))
  const isiPreview = template ? previewIsi(template.isi, preview) : ''

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Informed Consent"
      description="Persetujuan tindakan ditandatangani langsung di layar dan disimpan bersama perawatan"
      className="max-w-4xl"
    >
      {/* No <form>: this dialog is portalled inside the EMR form, and submit events would reach it. */}
      <div className="grid gap-5 md:grid-cols-[1.15fr_1fr]">
        <div className="min-w-0 space-y-3">
          <Field label="Template" htmlFor="consent-template" required>
            <SearchableSelect
              id="consent-template"
              value={templateId}
              onChange={setTemplateId}
              options={templateOptions}
              loading={templatesQuery.isLoading}
              placeholder="Pilih template consent..."
              emptyText="Belum ada template aktif"
            />
          </Field>
          {template ? (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs leading-relaxed text-slate-700">
              <p className="mb-1 font-bold text-slate-900">{previewIsi(template.judul, preview)}</p>
              <p className="whitespace-pre-wrap">{isiPreview}</p>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nama Penandatangan" htmlFor="consent-nama" required>
              <input
                id="consent-nama"
                value={namaPenandatangan}
                onChange={(e) => setNama(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Hubungan dengan Pasien" htmlFor="consent-hubungan">
              <select id="consent-hubungan" value={hubungan} onChange={(e) => setHubungan(e.target.value)} className={inputClass}>
                {HUBUNGAN_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Dokter" htmlFor="consent-dokter">
              <DokterSelect id="consent-dokter" value={dokterId} onChange={setDokterId} />
            </Field>
            <Field label="Saksi" htmlFor="consent-saksi">
              <input id="consent-saksi" value={saksi} onChange={(e) => setSaksi(e.target.value)} placeholder="Nama saksi" className={inputClass} />
            </Field>
          </div>
          <SignaturePad ref={ttdPasien} id="consent-ttd-pasien" label="Tanda Tangan Pasien / Wali" required onChange={setHasTtdPasien} />
          <SignaturePad ref={ttdDokter} id="consent-ttd-dokter" label="Tanda Tangan Dokter" />
          <FormAlert>{error}</FormAlert>
          <Button
            type="button"
            className="w-full"
            disabled={!template || !hasTtdPasien || saveMutation.isPending}
            onClick={() => {
              setError(null)
              saveMutation.mutate()
            }}
          >
            {saveMutation.isPending ? <Loader2 className="animate-spin" /> : <PenLine />}
            Simpan Consent
          </Button>
        </div>

        <div className="min-w-0 space-y-2 md:border-l md:border-slate-100 md:pl-5">
          <p className="text-sm font-bold text-slate-900">Consent Perawatan Ini</p>
          {!perawatanId && pending.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-400">
              Belum ada consent. Consent yang ditandatangani disimpan saat EMR disimpan.
            </p>
          ) : null}
          {perawatanId && listQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
          {perawatanId && !listQuery.isLoading && consents.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-400">Belum ada consent.</p>
          ) : null}

          <ul className="max-h-[28rem] space-y-2 overflow-y-auto" data-testid="consent-list">
            {pending.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-900">{p.judul}</p>
                  <p className="text-[11px] text-amber-700">
                    {p.body.nama_penandatangan} · menunggu EMR disimpan
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost-danger"
                  size="icon-sm"
                  title="Hapus consent"
                  aria-label="Hapus consent"
                  onClick={() => onPendingChange(pending.filter((x) => x.key !== p.key))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
            {consents.map((c) => (
              <li key={c.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 gap-2">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-900">{c.judul}</p>
                      <p className="text-[11px] text-slate-500">
                        {c.nama_penandatangan} ({c.hubungan}) · {formatDateTime(c.signed_at)}
                      </p>
                      {c.status === 'dibatalkan' ? (
                        <p className="text-[11px] font-semibold text-red-600">Dibatalkan: {c.alasan_batal}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="ghost" size="icon-sm" title="Cetak consent" aria-label="Cetak consent" onClick={() => openPrintTab(`/cetak/consent/${c.id}`)}>
                      <Printer />
                    </Button>
                    {canBatal && c.status === 'aktif' ? (
                      <Button
                        type="button"
                        variant="ghost-danger"
                        size="icon-sm"
                        title="Batalkan consent"
                        aria-label="Batalkan consent"
                        onClick={() => {
                          setBatalId(c.id)
                          setAlasan('')
                        }}
                      >
                        <Ban />
                      </Button>
                    ) : null}
                  </div>
                </div>
                {batalId === c.id ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={alasan}
                      onChange={(e) => setAlasan(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.preventDefault()
                      }}
                      placeholder="Alasan pembatalan"
                      aria-label="Alasan pembatalan"
                      className={inputClass}
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={!alasan.trim() || batalMutation.isPending}
                      onClick={() => batalMutation.mutate({ id: c.id, alasan: alasan.trim() })}
                    >
                      Batalkan
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setBatalId(null)}>
                      Tutup
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
        <Button type="button" variant="outline" onClick={onClose}>
          Tutup
        </Button>
      </div>
    </Dialog>
  )
}
