import { useMutation } from '@tanstack/react-query'
import { CreditCard, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiPost } from '@/shared/api/client'
import { BankSelect } from '@/shared/components/BankSelect'
import { Dialog } from '@/shared/components/Dialog'
import { JenisPembayaranSelect } from '@/shared/components/JenisPembayaranSelect'
import { StaffSelect } from '@/shared/components/StaffSelect'
import { Button } from '@/shared/ui/button'
import { formatCurrency } from '@/shared/lib/formatters'

export type PaymentLineItem = {
  nama: string
  qty: number
  subtotal: number
}

export type PaymentTarget = {
  sourceType: 'perawatan' | 'penjualan'
  sourceId: number
  label: string
  pasienNama?: string
  total: number
  lineItems?: PaymentLineItem[]
}

type PaymentModalProps = {
  open: boolean
  onClose: () => void
  target: PaymentTarget | null
  staffId: string
  onStaffIdChange: (value: string) => void
  onSuccess: () => void
  onError: (message: string) => void
}

const today = new Date().toISOString().slice(0, 10)

export function PaymentModal({
  open,
  onClose,
  target,
  staffId,
  onStaffIdChange,
  onSuccess,
  onError,
}: PaymentModalProps) {
  const [jenisPembayaran, setJenisPembayaran] = useState('')
  const [bankId, setBankId] = useState('')
  const [jumlahBayar, setJumlahBayar] = useState('')

  useEffect(() => {
    if (target) {
      setJumlahBayar(String(target.total || 0))
      setJenisPembayaran('')
      setBankId('')
    }
  }, [target])

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error('Data tagihan tidak valid')
      if (!jenisPembayaran) throw new Error('Jenis pembayaran wajib dipilih')
      if (!staffId) throw new Error('Staff kasir wajib dipilih')
      const jumlah = Number(jumlahBayar)
      if (!jumlah || jumlah <= 0) throw new Error('Jumlah bayar tidak valid')

      const res = await apiPost('/pembayaran/bayar', {
        source_type: target.sourceType,
        source_id: target.sourceId,
        staff_id: Number(staffId),
        jenis_pembayaran: jenisPembayaran,
        bank_id: bankId ? Number(bankId) : null,
        jumlah_bayar: jumlah,
        tanggal: today,
      })
      if (!res.success) {
        throw new Error(res.message || 'Gagal memproses pembayaran')
      }
      return res
    },
    onSuccess: () => {
      onSuccess()
      onClose()
    },
    onError: (err) => {
      onError(err instanceof Error ? err.message : 'Gagal memproses pembayaran')
    },
  })

  const needsBank = jenisPembayaran === 'transfer' || jenisPembayaran === 'e_money'
  const lineItems = target?.lineItems ?? []

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Proses Pembayaran"
      description={target ? `${target.label} — ${target.pasienNama || 'Pasien'}` : undefined}
      className="max-w-md"
    >
      <div className="space-y-4 p-5">
        {lineItems.length > 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Rincian Tagihan</p>
            <ul className="space-y-1.5">
              {lineItems.map((item, idx) => (
                <li key={idx} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">
                    {item.nama} <span className="text-slate-400">×{item.qty}</span>
                  </span>
                  <span className="font-bold text-slate-900">{formatCurrency(item.subtotal)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">Total Tagihan</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{formatCurrency(target?.total ?? 0)}</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Staff Kasir</label>
          <StaffSelect value={staffId} onChange={onStaffIdChange} required />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Jenis Pembayaran</label>
          <JenisPembayaranSelect value={jenisPembayaran} onChange={setJenisPembayaran} required />
        </div>

        {needsBank ? (
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Rekening Tujuan</label>
            <BankSelect value={bankId} onChange={setBankId} required />
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Jumlah Bayar (Rp)</label>
          <input
            type="number"
            value={jumlahBayar}
            onChange={(e) => setJumlahBayar(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-teal-500 focus:outline-none"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1 rounded-xl text-xs">
            Batal
          </Button>
          <Button
            type="button"
            disabled={payMutation.isPending}
            onClick={() => payMutation.mutate()}
            className="flex-1 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-xs font-bold text-white hover:from-teal-700 hover:to-emerald-700"
          >
            {payMutation.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="mr-1.5 h-4 w-4" />
            )}
            Bayar & Selesai
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
