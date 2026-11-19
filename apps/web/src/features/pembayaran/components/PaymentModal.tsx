import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, CreditCard, Loader2, Printer, Tag } from 'lucide-react'
import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { apiPost } from '@/shared/api/client'
import { BankSelect } from '@/shared/components/BankSelect'
import { Dialog } from '@/shared/components/Dialog'
import { JenisPembayaranSelect } from '@/shared/components/JenisPembayaranSelect'
import { StaffSelect } from '@/shared/components/StaffSelect'
import { Button } from '@/shared/ui/button'
import { Field, FormAlert } from '@/shared/ui/field'
import { FieldErrorsContext, useFormValidation } from '@/shared/lib/validation'
import { formatCurrency, todayISO } from '@/shared/lib/formatters'
import { RupiahInput } from '@/shared/ui/rupiah-input'
import { openPrintTab } from '@/shared/lib/print'

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

type PaidPenjualan = {
  id: number
  no_invoice: string
  kembalian: number
  jumlah_bayar: number
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

const today = todayISO()

function errorMessage(err: unknown, fallback: string) {
  const data = (err as { response?: { data?: { message?: string } } })?.response?.data
  if (data?.message) return data.message
  return err instanceof Error ? err.message : fallback
}

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-rose-500 focus:outline-none'

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
  const [paid, setPaid] = useState<PaidPenjualan | null>(null)
  const validation = useFormValidation()

  useEffect(() => {
    if (target) {
      validation.reset()
      setPaid(null)
      setJenisPembayaran('')
      setBankId('')
      setPromoInput('')
      setVoucherInput('')
      setKode({ promo: '', voucher: '' })
      setPoin('')
      setDeposit('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  // The server prices the bill (items, promo, voucher, balances); poin and deposit are
  // subtracted locally for a live preview and re-checked by the server on payment.
  const tagihanQuery = useQuery({
    queryKey: ['pembayaran-tagihan', target?.sourceType, target?.sourceId, kode.promo, kode.voucher],
    enabled: open && !!target && !paid,
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
      const jumlah = Number(jumlahBayar) || 0
      if (sisaBayar > 0 && jumlah < sisaBayar) throw new Error('Jumlah bayar kurang dari sisa tagihan')

      const res = await apiPost<PaidPenjualan>('/pembayaran/bayar', {
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
    onSuccess: (res) => {
      // Stay open on a success panel so the kasir can print the receipt.
      setPaid(res.data ?? null)
      onSuccess()
      if (!res.data) onClose()
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

  function applyKode() {
    setKode({ promo: promoInput.trim(), voucher: voucherInput.trim() })
  }

  // Enter in a code box applies the code instead of submitting the payment.
  function onKodeKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    applyKode()
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (canPay) payMutation.mutate()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Proses Pembayaran"
      description={target ? `${target.label} — ${target.pasienNama || 'Pasien'}` : undefined}
      className="max-w-4xl"
    >
      {paid ? (
        <div className="space-y-5 py-2 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <div>
            <p className="text-lg font-bold text-slate-900">Pembayaran berhasil</p>
            <p className="font-mono text-sm font-bold text-rose-700" data-testid="paid-invoice">
              {paid.no_invoice}
            </p>
          </div>
          {paid.kembalian > 0 ? (
            <p className="mx-auto w-fit rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
              Kembalian {formatCurrency(paid.kembalian)}
            </p>
          ) : null}
          <div className="mx-auto flex max-w-sm gap-2">
            <Button type="button" variant="outline" onClick={() => openPrintTab(`/cetak/kwitansi/${paid.id}`)} className="flex-1">
              <Printer />
              Cetak Kwitansi
            </Button>
            <Button type="button" onClick={onClose} className="flex-1">
              Selesai
            </Button>
          </div>
        </div>
      ) : (
      <FieldErrorsContext.Provider value={validation.errors}>
        {/* Left: what is billed and what reduces it. Right: what is paid, by whom, and the action. */}
        <form {...validation.formProps} onSubmit={onSubmit} className="grid gap-5 md:grid-cols-[1.1fr_1fr]">
          <div className="min-w-0 space-y-4">
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
            <Field label="Kode Promo" htmlFor="paymentmodal-f1">
              <input id="paymentmodal-f1"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                onKeyDown={onKodeKeyDown}
                placeholder="PRM-..."
                className={inputClass}
              />
            </Field>
            <Field label="Kode Voucher" htmlFor="paymentmodal-f2">
              <input id="paymentmodal-f2"
                value={voucherInput}
                onChange={(e) => setVoucherInput(e.target.value.toUpperCase())}
                onKeyDown={onKodeKeyDown}
                placeholder="VCR-..."
                className={inputClass}
              />
            </Field>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={applyKode}
            className="w-full"
          >
            <Tag />
            Terapkan Kode
          </Button>

          {tagihanError ? (
            <FormAlert>{tagihanError}</FormAlert>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Pakai Poin"
              htmlFor="paymentmodal-f3"
              error={poinKelebihan ? `Melebihi poin tersedia (${(tagihan?.poin_tersedia ?? 0).toLocaleString('id-ID')})` : undefined}
              hint={`Tersedia ${(tagihan?.poin_tersedia ?? 0).toLocaleString('id-ID')} poin`}
            >
              <input id="paymentmodal-f3"
                type="number"
                min={0}
                value={poin}
                onChange={(e) => setPoin(e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </Field>
            <Field
              label="Pakai Deposit (Rp)"
              htmlFor="paymentmodal-f4"
              error={depositKelebihan ? `Melebihi saldo deposit (${formatCurrency(tagihan?.saldo_deposit ?? 0)})` : undefined}
              hint={`Saldo ${formatCurrency(tagihan?.saldo_deposit ?? 0)}`}
            >
              <RupiahInput id="paymentmodal-f4"
                value={deposit}
                onValueChange={(v) => setDeposit(v)}
                placeholder="0"
                className={inputClass}
              />
            </Field>
          </div>

          </div>

          <div className="min-w-0 space-y-4 md:border-l md:border-slate-100 md:pl-5">
          <div className="space-y-1 rounded-2xl border border-rose-100 bg-rose-50/60 p-4 text-xs">
            <SummaryRow label="Subtotal" value={tagihan?.subtotal ?? target?.total ?? 0} />
            {tagihan?.diskon_promo ? <SummaryRow label="Diskon promo" value={-tagihan.diskon_promo} /> : null}
            {tagihan?.diskon_voucher ? <SummaryRow label="Diskon voucher" value={-tagihan.diskon_voucher} /> : null}
            {potonganPoin > 0 ? <SummaryRow label="Potongan poin" value={-potonganPoin} /> : null}
            {depositDipakai > 0 ? <SummaryRow label="Pakai deposit" value={-depositDipakai} /> : null}
            <div className="flex items-center justify-between border-t border-rose-100 pt-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Sisa Bayar</span>
              <span className="text-2xl font-bold text-slate-900">
                {tagihanQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : formatCurrency(sisaBayar)}
              </span>
            </div>
            {melebihi ? (
              <p className="font-semibold text-rose-600">Poin dan deposit melebihi total tagihan.</p>
            ) : null}
          </div>

          <Field label="Staff Kasir" htmlFor="paymentmodal-f5" required>
            <StaffSelect id="paymentmodal-f5" value={staffId} onChange={onStaffIdChange} required />
          </Field>

          {sisaBayar > 0 ? (
            <>
              <Field label="Jenis Pembayaran" htmlFor="paymentmodal-f6" required>
                <JenisPembayaranSelect id="paymentmodal-f6" value={jenisPembayaran} onChange={setJenisPembayaran} required />
              </Field>

              {needsBank ? (
                <Field label="Rekening Tujuan" htmlFor="paymentmodal-f7" required>
                  <BankSelect id="paymentmodal-f7" value={bankId} onChange={setBankId} required />
                </Field>
              ) : null}

              <Field label="Jumlah Bayar (Rp)" htmlFor="paymentmodal-f8" required>
                <RupiahInput id="paymentmodal-f8"
                  required
                  value={jumlahBayar}
                  onValueChange={(v) => setJumlahBayar(v)}
                  className={inputClass}
                />
                {kembalian > 0 ? (
                  <p className="text-[11px] font-semibold text-emerald-700">Kembalian {formatCurrency(kembalian)}</p>
                ) : null}
              </Field>
            </>
          ) : (
            <p className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
              Lunas dengan poin/deposit.
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Batal
            </Button>
            <Button type="submit" disabled={!canPay} className="flex-1">
              {payMutation.isPending ? <Loader2 className="animate-spin" /> : <CreditCard />}
              Bayar & Selesai
            </Button>
          </div>
          </div>
        </form>
      </FieldErrorsContext.Provider>
      )}
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
