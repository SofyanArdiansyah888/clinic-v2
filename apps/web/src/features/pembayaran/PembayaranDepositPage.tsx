import { useMutation } from '@tanstack/react-query'
import { BadgeDollarSign, CreditCard, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { apiPost } from '@/shared/api/client'
import { BankSelect } from '@/shared/components/BankSelect'
import { JenisPembayaranSelect } from '@/shared/components/JenisPembayaranSelect'
import { PasienSelect } from '@/shared/components/PasienSelect'
import { TreatmentSelect } from '@/shared/components/TreatmentSelect'
import { Button } from '@/shared/ui/button'
import { formatCurrency } from '@/shared/lib/formatters'
import { PembayaranToast } from '@/features/pembayaran/components/PembayaranToast'

const JENIS_OPTIONS = [
  { value: 'pembayaran_deposit', label: 'Pembayaran Deposit' },
  { value: 'pembayaran_deposit_treatment', label: 'Pembayaran Deposit Treatment' },
  { value: 'pendaftaran_member', label: 'Pendaftaran Member' },
  { value: 'perpanjangan_member', label: 'Perpanjangan Member' },
]

const today = new Date().toISOString().slice(0, 10)

export function PembayaranDepositPage() {
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const [form, setForm] = useState({
    tanggal: today,
    kwitansi: '',
    pasien_id: '',
    jenis: 'pembayaran_deposit',
    treatment_id: '',
    jenis_pembayaran: '',
    bank_id: '',
    jumlah: '',
    staff_id: '1',
  })

  function showToast(message: string, tone: 'success' | 'error' = 'success') {
    setToast({ message, tone })
    window.setTimeout(() => setToast(null), 3200)
  }

  const needsTreatment = form.jenis === 'pembayaran_deposit_treatment'
  const needsBank = form.jenis_pembayaran === 'transfer' || form.jenis_pembayaran === 'e_money'

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!form.pasien_id) throw new Error('Pasien wajib dipilih')
      if (!form.jenis_pembayaran) throw new Error('Jenis pembayaran wajib dipilih')
      const jumlah = Number(form.jumlah)
      if (!jumlah || jumlah <= 0) throw new Error('Jumlah wajib diisi')

      return apiPost('/pembayaran/deposit', {
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
    },
    onSuccess: () => {
      showToast('Pembayaran deposit berhasil dicatat!', 'success')
      setForm((f) => ({
        ...f,
        kwitansi: '',
        pasien_id: '',
        treatment_id: '',
        jenis_pembayaran: '',
        bank_id: '',
        jumlah: '',
      }))
    },
    onError: (err) => showToast(err instanceof Error ? err.message : 'Gagal memproses deposit', 'error'),
  })

  return (
    <div className="space-y-6">
      {toast ? <PembayaranToast message={toast.message} tone={toast.tone} /> : null}

      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Kasir — Deposit & Member</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Pembayaran deposit pasien, deposit treatment, pendaftaran dan perpanjangan membership.
        </p>
      </div>

      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-teal-50 to-emerald-50 px-5 py-4">
          <div className="flex items-center gap-2">
            <BadgeDollarSign className="h-5 w-5 text-teal-600" />
            <h3 className="text-sm font-extrabold text-slate-900">Pembayaran Deposit / Pendaftaran Member</h3>
          </div>
          <Button
            type="button"
            disabled={submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
            className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-xs font-bold text-white"
          >
            {submitMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CreditCard className="mr-1 h-4 w-4" />}
            Bayar
          </Button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Tanggal</label>
              <input
                type="date"
                value={form.tanggal}
                onChange={(e) => setForm((f) => ({ ...f, tanggal: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Kwitansi</label>
              <input
                type="text"
                value={form.kwitansi}
                onChange={(e) => setForm((f) => ({ ...f, kwitansi: e.target.value }))}
                placeholder="Auto-generate jika kosong"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Pasien</label>
              <PasienSelect value={form.pasien_id} onChange={(v) => setForm((f) => ({ ...f, pasien_id: v }))} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Jenis Transaksi</label>
              <select
                value={form.jenis}
                onChange={(e) => setForm((f) => ({ ...f, jenis: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-teal-500 focus:outline-none"
              >
                {JENIS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {needsTreatment ? (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Untuk Treatment</label>
              <TreatmentSelect
                value={form.treatment_id}
                onChange={(v) => setForm((f) => ({ ...f, treatment_id: v }))}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Jenis Pembayaran</label>
              <JenisPembayaranSelect
                value={form.jenis_pembayaran}
                onChange={(v) => setForm((f) => ({ ...f, jenis_pembayaran: v }))}
                required
              />
            </div>
            {needsBank ? (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Bank</label>
                <BankSelect value={form.bank_id} onChange={(v) => setForm((f) => ({ ...f, bank_id: v }))} />
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total (Rp)</label>
              <input
                type="number"
                value={form.jumlah}
                onChange={(e) => setForm((f) => ({ ...f, jumlah: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-extrabold text-slate-900 focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Staff Kasir ID</label>
              <input
                type="number"
                value={form.staff_id}
                onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          {form.jumlah ? (
            <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4 text-center">
              <p className="text-[11px] font-bold uppercase text-teal-700">Total Pembayaran</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{formatCurrency(Number(form.jumlah))}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
