import { useMutation, useQuery } from '@tanstack/react-query'
import { CreditCard, Loader2, Tag } from 'lucide-react'
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

type Tagihan = {
  items: PaymentLineItem[]
  subtotal: number
  diskon_promo: number
  diskon_voucher: number
  total: number
  poin_tersedia: number
  nilai_poin: number
  saldo_deposit: number
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

function errorMessage(err: unknown, fallback: string) {
  const data = (err as { response?: { data?: { message?: string } } })?.response?.data
  if (data?.message) return data.message
  return err instanceof Error ? err.message : fallback
}

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-teal-500 focus:outline-none'
const labelClass = 'text-[11px] font-bold uppercase tracking-wider text-slate-500'

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
  const [promoInput, setPromoInput] = useState('')
  const [voucherInput, setVoucherInput] = useState('')
  const [kode, setKode] = useState({ promo: '', voucher: '' })
  const [poin, setPoin] = useState('')
  const [deposit, setDeposit] = useState('')

  useEffect(() => {
    if (target) {
      setJenisPembayaran('')
      setBankId('')
      setPromoInput('')
      setVoucherInput('')
      setKode({ promo: '', voucher: '' })
      setPoin('')
      setDeposit('')
    }
  }, [target])

  // The server prices the bill (items, promo, voucher, balances); poin and deposit are
  // subtracted locally for a live preview and re-checked by the server on payment.
  const tagihanQuery = useQuery({
    queryKey: ['pembayaran-tagihan', target?.sourceType, target?.sourceId, kode.promo, kode.voucher],
    enabled: open && !!target,
    retry: false,
    queryFn: async () => {
      const res = await apiPost<Tagihan>('/pembayaran/tagihan', {
        source_type: target!.sourceType,
        source_id: target!.sourceId,
        promo_kode: kode.promo || undefined,
        voucher_kode: kode.voucher || undefined,
      })
      return res.data
    },
  })
  const tagihan = tagihanQuery.data
  const tagihanError = tagihanQuery.isError ? errorMessage(tagihanQuery.error, 'Gagal menghitung tagihan') : null

  const poinDipakai = Math.max(0, Math.floor(Number(poin) || 0))
  const depositDipakai = Math.max(0, Number(deposit) || 0)
  const total = tagihan?.total ?? target?.total ?? 0
  const potonganPoin = poinDipakai * (tagihan?.nilai_poin ?? 1)
  const sisaBayar = Math.max(0, total - potonganPoin - depositDipakai)
  const kembalian = Math.max(0, (Number(jumlahBayar) || 0) - sisaBayar)

  useEffect(() => {
    setJumlahBayar(String(sisaBayar))
  }, [sisaBayar])

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error('Data tagihan tidak valid')
      if (!staffId) throw new Error('Staff kasir wajib dipilih')
      if (sisaBayar > 0 && !jenisPembayaran) throw new Error('Jenis pembayaran wajib dipilih')
      const jumlah = Number(jumlahBayar) || 0
      if (sisaBayar > 0 && jumlah < sisaBayar) throw new Error('Jumlah bayar kurang dari sisa tagihan')

      const res = await apiPost('/pembayaran/bayar', {
        source_type: target.sourceType,
        source_id: target.sourceId,
        staff_id: Number(staffId),
        promo_kode: kode.promo || undefined,
        voucher_kode: kode.voucher || undefined,
        poin_dipakai: poinDipakai,
        deposit_dipakai: depositDipakai,
        jenis_pembayaran: sisaBayar > 0 ? jenisPembayaran : undefined,
        bank_id: bankId ? Number(bankId) : null,
        jumlah_bayar: sisaBayar > 0 ? jumlah : 0,
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
      onError(errorMessage(err, 'Gagal memproses pembayaran'))
    },
  })

  const needsBank = jenisPembayaran === 'transfer' || jenisPembayaran === 'e_money'
  const lineItems = tagihan?.items ?? target?.lineItems ?? []
  const melebihi = potonganPoin + depositDipakai > total
  const poinKelebihan = !!tagihan && poinDipakai > tagihan.poin_tersedia
  const depositKelebihan = !!tagihan && depositDipakai > tagihan.saldo_deposit
  const canPay =
    !!tagihan && !tagihanError && !melebihi && !poinKelebihan && !depositKelebihan && !payMutation.isPending

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Proses Pembayaran"
      description={target ? `${target.label} — ${target.pasienNama || 'Pasien'}` : undefined}
      className="max-w-md"
    >
      <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
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

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label className={labelClass}>Kode Promo</label>
            <input
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
              placeholder="PRM-..."
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Kode Voucher</label>
            <input
              value={voucherInput}
              onChange={(e) => setVoucherInput(e.target.value.toUpperCase())}
              placeholder="VCR-..."
              className={inputClass}
            />
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setKode({ promo: promoInput.trim(), voucher: voucherInput.trim() })}
          className="w-full rounded-xl text-xs"
        >
          <Tag className="mr-1.5 h-3.5 w-3.5" />
          Terapkan Promo / Voucher
        </Button>

        {tagihanError ? (
          <div className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{tagihanError}</div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label className={labelClass}>Pakai Poin</label>
            <input
              type="number"
              min={0}
              value={poin}
              onChange={(e) => setPoin(e.target.value)}
              placeholder="0"
              className={inputClass}
            />
            <p className={poinKelebihan ? 'text-[11px] font-semibold text-rose-600' : 'text-[11px] text-slate-500'}>
              Tersedia {(tagihan?.poin_tersedia ?? 0).toLocaleString('id-ID')} poin
            </p>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Pakai Deposit (Rp)</label>
            <input
              type="number"
              min={0}
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              placeholder="0"
              className={inputClass}
            />
            <p className={depositKelebihan ? 'text-[11px] font-semibold text-rose-600' : 'text-[11px] text-slate-500'}>
              Saldo {formatCurrency(tagihan?.saldo_deposit ?? 0)}
            </p>
          </div>
        </div>

        <div className="space-y-1 rounded-2xl border border-teal-100 bg-teal-50/60 p-4 text-xs">
          <SummaryRow label="Subtotal" value={tagihan?.subtotal ?? target?.total ?? 0} />
          {tagihan?.diskon_promo ? <SummaryRow label="Diskon promo" value={-tagihan.diskon_promo} /> : null}
          {tagihan?.diskon_voucher ? <SummaryRow label="Diskon voucher" value={-tagihan.diskon_voucher} /> : null}
          {potonganPoin > 0 ? <SummaryRow label="Potongan poin" value={-potonganPoin} /> : null}
          {depositDipakai > 0 ? <SummaryRow label="Pakai deposit" value={-depositDipakai} /> : null}
          <div className="flex items-center justify-between border-t border-teal-100 pt-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700">Sisa Bayar</span>
            <span className="text-2xl font-extrabold text-slate-900">
              {tagihanQuery.isFetching ? <Loader2 className="h-5 w-5 animate-spin" /> : formatCurrency(sisaBayar)}
            </span>
          </div>
          {melebihi ? (
            <p className="font-semibold text-rose-600">Poin dan deposit melebihi total tagihan.</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Staff Kasir</label>
          <StaffSelect value={staffId} onChange={onStaffIdChange} required />
        </div>

        {sisaBayar > 0 ? (
          <>
            <div className="space-y-1.5">
              <label className={labelClass}>Jenis Pembayaran</label>
              <JenisPembayaranSelect value={jenisPembayaran} onChange={setJenisPembayaran} required />
            </div>

            {needsBank ? (
              <div className="space-y-1.5">
                <label className={labelClass}>Rekening Tujuan</label>
                <BankSelect value={bankId} onChange={setBankId} required />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className={labelClass}>Jumlah Bayar (Rp)</label>
              <input
                type="number"
                value={jumlahBayar}
                onChange={(e) => setJumlahBayar(e.target.value)}
                className={inputClass}
              />
              {kembalian > 0 ? (
                <p className="text-[11px] font-semibold text-emerald-700">Kembalian {formatCurrency(kembalian)}</p>
              ) : null}
            </div>
          </>
        ) : (
          <p className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
            Tagihan lunas dengan poin/deposit — tidak ada pembayaran tambahan.
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1 rounded-xl text-xs">
            Batal
          </Button>
          <Button
            type="button"
            disabled={!canPay}
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

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span className={value < 0 ? 'font-semibold text-rose-600' : 'font-semibold text-slate-900'}>
        {value < 0 ? `- ${formatCurrency(-value)}` : formatCurrency(value)}
      </span>
    </div>
  )
}
