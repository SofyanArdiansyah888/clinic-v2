import { toast as pushToast } from '@/shared/components/Toaster'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { apiGet, apiPost } from '@/shared/api/client'
import { BankSelect } from '@/shared/components/BankSelect'
import { Dialog } from '@/shared/components/Dialog'
import { EmptyState } from '@/shared/components/EmptyState'
import { JenisPembayaranSelect } from '@/shared/components/JenisPembayaranSelect'
import { PageHeader } from '@/shared/components/PageHeader'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { Button } from '@/shared/ui/button'
import { Field, FormAlert } from '@/shared/ui/field'
import { FieldErrorsContext, useFormValidation } from '@/shared/lib/validation'
import { formatCurrency, formatDate } from '@/shared/lib/formatters'
import { RupiahInput } from '@/shared/ui/rupiah-input'
import { ShiftBelumDibukaAlert } from './components/ShiftBelumDibukaAlert'
import { SHIFT_AKTIF_KEY, useShiftAktif } from './kasir-shift'

type PaketRow = {
  id: number
  kode: string
  tanggal_beli: string
  total_sesi: number
  sisa_sesi: number
  harga_total?: number
  status: string
  pasien?: { id: number; nama?: string }
  staff?: { id: number; nama?: string }
  treatment?: { id: number; nama?: string }
}

export function PembatalanPaketPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [cancelTarget, setCancelTarget] = useState<PaketRow | null>(null)
  const [keterangan, setKeterangan] = useState('')
  const [refund, setRefund] = useState('')
  const [metodeRefund, setMetodeRefund] = useState('tunai')
  const [bankId, setBankId] = useState('')
  const needsBank = metodeRefund === 'transfer' || metodeRefund === 'e_money' || metodeRefund === 'kartu_debit'
  const validation = useFormValidation()
  const shiftAktif = useShiftAktif()

  function showToast(message: string, tone: 'success' | 'error' = 'success') {
    pushToast(message, tone)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['pembayaran-paket-sisa', search],
    queryFn: () => apiGet<PaketRow[]>('/pembayaran/paket/sisa', { per_page: 200, page: 1, search: search || undefined }),
  })

  const rows = data?.data ?? []

  const cancelMutation = useMutation({
    mutationFn: (payload: { id: number; keterangan: string; refund: number }) =>
      apiPost(`/pembayaran/paket/${payload.id}/batal`, {
        keterangan: payload.keterangan,
        refund: payload.refund,
        jenis_pembayaran: metodeRefund,
        bank_id: needsBank && bankId ? Number(bankId) : null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pembayaran-paket-sisa'] })
      void queryClient.invalidateQueries({ queryKey: SHIFT_AKTIF_KEY })
      setCancelTarget(null)
      setKeterangan('')
      setRefund('')
      setMetodeRefund('tunai')
      setBankId('')
      showToast('Paket perawatan berhasil dibatalkan', 'success')
    },
  })
  const cancelError = cancelMutation.error
    ? ((cancelMutation.error as { response?: { data?: { message?: string } } }).response?.data?.message ??
      (cancelMutation.error instanceof Error ? cancelMutation.error.message : 'Gagal membatalkan paket'))
    : null

  // A refund pays money out of the drawer, so it needs an open shift; a cancellation without refund does not.
  const shiftKurang = Number(refund) > 0 && shiftAktif.checked && !shiftAktif.isOpen

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!cancelTarget || shiftKurang) return
    cancelMutation.mutate({
      id: cancelTarget.id,
      keterangan,
      refund: Number(refund) || 0,
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Batal Paket" description="Paket treatment dengan sisa sesi" />

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-bold text-slate-900">Paket Aktif</h3>
          <div className="relative w-full sm:w-72">
            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari pasien / kode"
              className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pr-3 pl-9 text-xs font-medium focus:border-rose-500 focus:outline-none"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">Memuat data paket...</div>
        ) : rows.length === 0 ? (
          <EmptyState title="Belum ada paket" description="Paket muncul setelah dibayar di kasir." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Tgl Beli</th>
                  <th className="px-4 py-3">Pasien</th>
                  <th className="px-4 py-3">Dokter</th>
                  <th className="px-4 py-3">Paket</th>
                  <th className="px-4 py-3">Sisa Sesi</th>
                  <th className="px-4 py-3">Nilai</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-xs text-slate-600">{formatDate(row.tanggal_beli)}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-800">{row.pasien?.nama || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{row.staff?.nama || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{row.treatment?.nama || row.kode}</td>
                    <td className="px-4 py-3 text-xs font-bold text-rose-600">
                      {row.sisa_sesi} / {row.total_sesi}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold">{formatCurrency(row.harga_total ?? 0)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCancelTarget(row)
                          setRefund('')
                          setKeterangan('')
                          cancelMutation.reset()
                          validation.reset()
                        }}
                      >
                        Batalkan
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Batalkan Paket"
        description={cancelTarget ? `${cancelTarget.pasien?.nama} — ${cancelTarget.treatment?.nama || cancelTarget.kode}` : undefined}
      >
        <FieldErrorsContext.Provider value={validation.errors}>
          <form {...validation.formProps} onSubmit={onSubmit} className="space-y-4 p-5">
            <p className="text-xs text-slate-500">
              Sisa <strong className="text-slate-900">{cancelTarget?.sisa_sesi}</strong> dari{' '}
              <strong className="text-slate-900">{cancelTarget?.total_sesi}</strong> sesi akan dibatalkan.
            </p>
            <Field label="Refund (Rp)" htmlFor="pembatalanpaketpage-f1">
              <RupiahInput id="pembatalanpaketpage-f1"
                value={refund}
                onValueChange={(v) => setRefund(v)}
                placeholder="0 jika tanpa refund"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-rose-500 focus:outline-none"
              />
            </Field>
            {Number(refund) > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Metode Refund" htmlFor="pembatalanpaketpage-f2" required>
                  <JenisPembayaranSelect id="pembatalanpaketpage-f2" value={metodeRefund} onChange={setMetodeRefund} required />
                </Field>
                {needsBank ? (
                  <Field label="Rekening Asal" htmlFor="pembatalanpaketpage-f3">
                    <BankSelect id="pembatalanpaketpage-f3" value={bankId} onChange={setBankId} />
                  </Field>
                ) : null}
              </div>
            ) : null}
            <Field label="Keterangan" htmlFor="pembatalanpaketpage-f4">
              <textarea id="pembatalanpaketpage-f4"
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-rose-500 focus:outline-none"
                placeholder="Alasan pembatalan"
              />
            </Field>
            {shiftKurang ? <ShiftBelumDibukaAlert /> : null}
            <FormAlert>{cancelError}</FormAlert>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setCancelTarget(null)} className="flex-1">
                Batal
              </Button>
              <Button type="submit" variant="destructive" disabled={cancelMutation.isPending || shiftKurang} className="flex-1">
                Batalkan Paket
              </Button>
            </div>
          </form>
        </FieldErrorsContext.Provider>
      </Dialog>

    </div>
  )
}
