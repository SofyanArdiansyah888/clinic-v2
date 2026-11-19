import { toast as pushToast } from '@/shared/components/Toaster'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CreditCard, History, Loader2, Users } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { apiPost } from '@/shared/api/client'
import { BankSelect } from '@/shared/components/BankSelect'
import { JenisPembayaranSelect } from '@/shared/components/JenisPembayaranSelect'
import { PageHeader } from '@/shared/components/PageHeader'
import { PasienSelect } from '@/shared/components/PasienSelect'
import { StaffSelect } from '@/shared/components/StaffSelect'
import { TreatmentSelect } from '@/shared/components/TreatmentSelect'
import { Button, buttonVariants } from '@/shared/ui/button'
import { Field } from '@/shared/ui/field'
import { FieldErrorsContext, useFormValidation } from '@/shared/lib/validation'
import { formatCurrency, todayISO } from '@/shared/lib/formatters'
import { RupiahInput } from '@/shared/ui/rupiah-input'
import { DepositSidePanel } from './components/DepositSidePanel'
import { ShiftBelumDibukaAlert } from './components/ShiftBelumDibukaAlert'
import { SHIFT_AKTIF_KEY, useShiftAktif } from './kasir-shift'

const JENIS_OPTIONS = [
  { value: 'pembayaran_deposit', label: 'Pembayaran Deposit' },
  { value: 'pembayaran_deposit_treatment', label: 'Deposit Treatment' },
  { value: 'pendaftaran_member', label: 'Pendaftaran Member' },
  { value: 'perpanjangan_member', label: 'Perpanjangan Member' },
]

const today = todayISO()

export function PembayaranDepositPage() {
  const [lastSuccessJenis, setLastSuccessJenis] = useState<string | null>(null)
  const [form, setForm] = useState({
    tanggal: today,
    kwitansi: '',
    pasien_id: '',
    jenis: 'pembayaran_deposit',
    treatment_id: '',
    jenis_pembayaran: '',
    bank_id: '',
    jumlah: '',
    staff_id: '',
  })
  const validation = useFormValidation()
  const queryClient = useQueryClient()
  const shiftAktif = useShiftAktif()
  const shiftKurang = shiftAktif.checked && !shiftAktif.isOpen

  function showToast(message: string, tone: 'success' | 'error' = 'success') {
    pushToast(message, tone)
  }

  const needsTreatment = form.jenis === 'pembayaran_deposit_treatment'
  const needsBank = form.jenis_pembayaran === 'transfer' || form.jenis_pembayaran === 'e_money'

  const submitMutation = useMutation({
    mutationFn: async () => {
      const jumlah = Number(form.jumlah)
      if (!jumlah || jumlah <= 0) throw new Error('Jumlah wajib diisi')

      const res = await apiPost('/pembayaran/deposit', {
        pasien_id: Number(form.pasien_id),
        staff_id: Number(form.staff_id),
        tanggal: form.tanggal,
        kwitansi: form.kwitansi,
        jenis: form.jenis,
        treatment_id: needsTreatment && form.treatment_id ? Number(form.treatment_id) : null,
        jenis_pembayaran: form.jenis_pembayaran,
        bank_id: form.bank_id ? Number(form.bank_id) : null,
        jumlah,
      })
      if (!res.success) throw new Error(res.message || 'Gagal memproses deposit')
      return res
    },
    onSuccess: () => {
      // The history, balance and membership next to the form show the new transaction.
      for (const key of ['deposit-riwayat', 'deposit-saldo', 'membership']) void queryClient.invalidateQueries({ queryKey: [key] })
      void queryClient.invalidateQueries({ queryKey: SHIFT_AKTIF_KEY })
      setLastSuccessJenis(form.jenis)
      showToast('Pembayaran deposit berhasil dicatat!', 'success')
      validation.reset()
      setForm((f) => ({
        ...f,
        kwitansi: '',
        treatment_id: '',
        jenis_pembayaran: '',
        bank_id: '',
        jumlah: '',
      }))
    },
    onError: (err) => showToast(err instanceof Error ? err.message : 'Gagal memproses deposit', 'error'),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (shiftKurang) return
    submitMutation.mutate()
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Deposit & Member" description="Deposit pasien dan membership" />

      {shiftKurang ? <ShiftBelumDibukaAlert /> : null}

      {lastSuccessJenis ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-emerald-900">Transaksi berhasil disimpan.</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/data-transaksi/deposit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <History />
              Riwayat
            </Link>
            {lastSuccessJenis === 'pendaftaran_member' || lastSuccessJenis === 'perpanjangan_member' ? (
              <Link to="/administrasi/membership" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                <Users />
                Membership
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <FieldErrorsContext.Provider value={validation.errors}>
        <form
          {...validation.formProps}
          onSubmit={onSubmit}
          className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 className="text-sm font-bold text-slate-900">Form Transaksi</h3>
            <Button type="submit" disabled={submitMutation.isPending || shiftKurang}>
              {submitMutation.isPending ? <Loader2 className="animate-spin" /> : <CreditCard />}
              Bayar
            </Button>
          </div>

          <div className="space-y-4 p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tanggal" htmlFor="pembayarandepositpage-f1" required>
                <input id="pembayarandepositpage-f1"
                  type="date"
                  required
                  value={form.tanggal}
                  onChange={(e) => setForm((f) => ({ ...f, tanggal: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-rose-500 focus:outline-none"
                />
              </Field>
              <Field label="Kwitansi" htmlFor="pembayarandepositpage-f2">
                <input id="pembayarandepositpage-f2"
                  type="text"
                  value={form.kwitansi}
                  onChange={(e) => setForm((f) => ({ ...f, kwitansi: e.target.value }))}
                  placeholder="Otomatis jika kosong"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-rose-500 focus:outline-none"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Pasien" htmlFor="pembayarandepositpage-f3" required>
                <PasienSelect id="pembayarandepositpage-f3" value={form.pasien_id} onChange={(v) => setForm((f) => ({ ...f, pasien_id: v }))} required />
              </Field>
              <Field label="Jenis Transaksi" htmlFor="pembayarandepositpage-f4">
                <select id="pembayarandepositpage-f4"
                  value={form.jenis}
                  onChange={(e) => setForm((f) => ({ ...f, jenis: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-rose-500 focus:outline-none"
                >
                  {JENIS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {needsTreatment ? (
              <Field label="Treatment" htmlFor="pembayarandepositpage-f5">
                <TreatmentSelect id="pembayarandepositpage-f5"
                  value={form.treatment_id}
                  onChange={(v) => setForm((f) => ({ ...f, treatment_id: v }))}
                />
              </Field>
            ) : null}

            <Field label="Staff Kasir" htmlFor="pembayarandepositpage-f6" required>
              <StaffSelect id="pembayarandepositpage-f6" value={form.staff_id} onChange={(v) => setForm((f) => ({ ...f, staff_id: v }))} required />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Jenis Pembayaran" htmlFor="pembayarandepositpage-f7" required>
                <JenisPembayaranSelect id="pembayarandepositpage-f7"
                  value={form.jenis_pembayaran}
                  onChange={(v) => setForm((f) => ({ ...f, jenis_pembayaran: v }))}
                  required
                />
              </Field>
              {needsBank ? (
                <Field label="Bank" htmlFor="pembayarandepositpage-f8">
                  <BankSelect id="pembayarandepositpage-f8" value={form.bank_id} onChange={(v) => setForm((f) => ({ ...f, bank_id: v }))} />
                </Field>
              ) : null}
            </div>

            <Field label="Total (Rp)" htmlFor="pembayarandepositpage-f9" required>
              <RupiahInput id="pembayarandepositpage-f9"
                required
                value={form.jumlah}
                onValueChange={(v) => setForm((f) => ({ ...f, jumlah: v }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900 focus:border-rose-500 focus:outline-none"
              />
            </Field>

            {form.jumlah ? (
              <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 text-center">
                <p className="text-[11px] font-bold uppercase text-rose-700">Total Pembayaran</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(Number(form.jumlah))}</p>
              </div>
            ) : null}
          </div>
        </form>
      </FieldErrorsContext.Provider>

      <DepositSidePanel pasienId={form.pasien_id} />
      </div>
    </div>

  )
}
