import { useMutation } from '@tanstack/react-query'
import { ArrowRight, BadgeDollarSign, CreditCard, History, Info, Loader2, Users } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { apiPost } from '@/shared/api/client'
import { BankSelect } from '@/shared/components/BankSelect'
import { JenisPembayaranSelect } from '@/shared/components/JenisPembayaranSelect'
import { PasienSelect } from '@/shared/components/PasienSelect'
import { StaffSelect } from '@/shared/components/StaffSelect'
import { TreatmentSelect } from '@/shared/components/TreatmentSelect'
import { Button } from '@/shared/ui/button'
import { formatCurrency, todayISO } from '@/shared/lib/formatters'
import { PembayaranToast } from '@/features/pembayaran/components/PembayaranToast'

const JENIS_OPTIONS = [
  { value: 'pembayaran_deposit', label: 'Pembayaran Deposit' },
  { value: 'pembayaran_deposit_treatment', label: 'Pembayaran Deposit Treatment' },
  { value: 'pendaftaran_member', label: 'Pendaftaran Member' },
  { value: 'perpanjangan_member', label: 'Perpanjangan Member' },
]

const JENIS_INFO: Record<string, { title: string; desc: string; output: string }> = {
  pembayaran_deposit: {
    title: 'Pembayaran Deposit',
    desc: 'Pasien setor uang muka (saldo kredit) untuk digunakan di kunjungan berikutnya.',
    output: 'Tercatat di Riwayat Deposit',
  },
  pembayaran_deposit_treatment: {
    title: 'Deposit Treatment',
    desc: 'Bayar di muka untuk treatment tertentu yang akan digunakan nanti.',
    output: 'Tercatat di Riwayat Deposit + link treatment',
  },
  pendaftaran_member: {
    title: 'Pendaftaran Member',
    desc: 'Daftar membership baru untuk pasien — membuat record di data membership.',
    output: 'Riwayat Deposit + Administrasi Membership',
  },
  perpanjangan_member: {
    title: 'Perpanjangan Member',
    desc: 'Perpanjang membership aktif pasien yang sudah terdaftar.',
    output: 'Riwayat Deposit + update Membership',
  },
}

const today = todayISO()

export function PembayaranDepositPage() {
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
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

  function showToast(message: string, tone: 'success' | 'error' = 'success') {
    setToast({ message, tone })
    window.setTimeout(() => setToast(null), 3200)
  }

  const needsTreatment = form.jenis === 'pembayaran_deposit_treatment'
  const needsBank = form.jenis_pembayaran === 'transfer' || form.jenis_pembayaran === 'e_money'
  const isMemberJenis = form.jenis === 'pendaftaran_member' || form.jenis === 'perpanjangan_member'
  const jenisInfo = JENIS_INFO[form.jenis]

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!form.pasien_id) throw new Error('Pasien wajib dipilih')
      if (!form.staff_id) throw new Error('Staff kasir wajib dipilih')
      if (!form.jenis_pembayaran) throw new Error('Jenis pembayaran wajib dipilih')
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
      setLastSuccessJenis(form.jenis)
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

      <div className="flex items-start gap-3 rounded-2xl border border-teal-100 bg-teal-50/60 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
        <div className="text-xs text-teal-900">
          <p className="font-bold">Input → Proses → Output</p>
          <p className="mt-1 text-teal-800">
            Semua transaksi disimpan ke tabel deposit. Transaksi member juga membuat/memperbarui data di menu
            Administrasi → Membership. Lihat riwayat lengkap di Data Transaksi → Deposit.
          </p>
        </div>
      </div>

      {lastSuccessJenis ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-emerald-900">Transaksi berhasil! Data tersimpan.</p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/data-transaksi/deposit"
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
            >
              <History className="h-3 w-3" />
              Lihat riwayat deposit
            </Link>
            {lastSuccessJenis === 'pendaftaran_member' || lastSuccessJenis === 'perpanjangan_member' ? (
              <Link
                to="/administrasi/membership"
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50"
              >
                <Users className="h-3 w-3" />
                Lihat membership
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

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
          {jenisInfo ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-xs">
              <p className="font-bold text-slate-800">{jenisInfo.title}</p>
              <p className="mt-1 text-slate-600">{jenisInfo.desc}</p>
              <p className="mt-2 flex items-center gap-1 font-semibold text-teal-700">
                <ArrowRight className="h-3 w-3" />
                Output: {jenisInfo.output}
              </p>
            </div>
          ) : null}

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

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Staff Kasir</label>
            <StaffSelect value={form.staff_id} onChange={(v) => setForm((f) => ({ ...f, staff_id: v }))} required />
          </div>

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

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total (Rp)</label>
            <input
              type="number"
              value={form.jumlah}
              onChange={(e) => setForm((f) => ({ ...f, jumlah: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-extrabold text-slate-900 focus:border-teal-500 focus:outline-none"
            />
          </div>

          {form.jumlah ? (
            <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4 text-center">
              <p className="text-[11px] font-bold uppercase text-teal-700">Total Pembayaran</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{formatCurrency(Number(form.jumlah))}</p>
            </div>
          ) : null}

          {isMemberJenis ? (
            <p className="text-center text-[11px] text-slate-500">
              Setelah bayar, cek data pasien di{' '}
              <Link to="/administrasi/membership" className="font-bold text-teal-600 hover:underline">
                Administrasi → Membership
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
