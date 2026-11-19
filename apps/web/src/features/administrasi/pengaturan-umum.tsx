import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Save } from 'lucide-react'
import { apiGet, apiPut } from '@/shared/api/client'
import { PageHeader } from '@/shared/components/PageHeader'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Field, FormAlert } from '@/shared/ui/field'
import { FieldErrorsContext, useFormValidation } from '@/shared/lib/validation'

type KlinikForm = {
  nama: string
  telepon: string
  email: string
  alamat: string
  garansi: string
  catatan_invoice: string
}

const emptyForm: KlinikForm = {
  nama: '',
  telepon: '',
  email: '',
  alamat: '',
  garansi: '',
  catatan_invoice: '',
}

export function PengaturanUmumPage() {
  const queryClient = useQueryClient()
  const [klinikForm, setKlinikForm] = useState<KlinikForm>(emptyForm)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const validation = useFormValidation()

  const { data, isLoading } = useQuery({
    queryKey: ['pengaturan-klinik'],
    queryFn: () => apiGet<KlinikForm>('/pengaturan/klinik'),
  })

  useEffect(() => {
    if (!data?.data) return
    const k = data.data
    setKlinikForm({
      nama: k.nama ?? '',
      telepon: k.telepon ?? '',
      email: k.email ?? '',
      alamat: k.alamat ?? '',
      garansi: k.garansi ?? '',
      catatan_invoice: k.catatan_invoice ?? '',
    })
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (body: KlinikForm) => apiPut<KlinikForm>('/pengaturan/klinik', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pengaturan-klinik'] })
      setSaveError(null)
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 3000)
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Gagal menyimpan pengaturan'
      setSaveError(message)
    },
  })

  function handleSaveKlinik(e: React.FormEvent) {
    e.preventDefault()
    saveMutation.mutate(klinikForm)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Pengaturan Umum" description="Identitas dan kontak klinik" />

      <div>
        <Card className="p-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <span className="rounded-xl bg-rose-50 p-2 text-rose-600">
              <Building2 className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Identitas Klinik</h3>
              <p className="text-xs text-slate-500">Tampil di invoice dan kwitansi</p>
            </div>
          </div>

          <FieldErrorsContext.Provider value={validation.errors}>
            <form {...validation.formProps} onSubmit={handleSaveKlinik} className="mt-6 space-y-4 max-w-2xl">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nama Klinik" htmlFor="nama" required>
                  <Input
                    id="nama"
                    value={klinikForm.nama}
                    onChange={(e) => setKlinikForm({ ...klinikForm, nama: e.target.value })}
                    required
                  />
                </Field>

                <Field label="No. Telepon" htmlFor="telepon">
                  <Input
                    id="telepon"
                    value={klinikForm.telepon}
                    onChange={(e) => setKlinikForm({ ...klinikForm, telepon: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="Email Klinik" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  value={klinikForm.email}
                  onChange={(e) => setKlinikForm({ ...klinikForm, email: e.target.value })}
                />
              </Field>

              <Field label="Alamat Lengkap" htmlFor="alamat">
                <textarea
                  id="alamat"
                  rows={2}
                  className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                  value={klinikForm.alamat}
                  onChange={(e) => setKlinikForm({ ...klinikForm, alamat: e.target.value })}
                />
              </Field>

              <Field label="Catatan Garansi" htmlFor="garansi">
                <Input
                  id="garansi"
                  value={klinikForm.garansi}
                  onChange={(e) => setKlinikForm({ ...klinikForm, garansi: e.target.value })}
                />
              </Field>

              <Field label="Catatan Invoice" htmlFor="catatanInvoice">
                <textarea
                  id="catatanInvoice"
                  rows={2}
                  className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                  value={klinikForm.catatan_invoice}
                  onChange={(e) => setKlinikForm({ ...klinikForm, catatan_invoice: e.target.value })}
                />
              </Field>

              <FormAlert>{saveError}</FormAlert>

              {savedSuccess ? (
                <div className="rounded-md bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
                  Pengaturan klinik berhasil disimpan!
                </div>
              ) : null}

              <div className="pt-2">
                <Button type="submit" disabled={isLoading || saveMutation.isPending}>
                  <Save />
                  {saveMutation.isPending ? 'Menyimpan...' : 'Simpan'}
                </Button>
              </div>
            </form>
          </FieldErrorsContext.Provider>
        </Card>
      </div>
    </div>
  )
}
