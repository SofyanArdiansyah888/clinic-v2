import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { Loader2, Printer } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { apiGet } from '@/shared/api/client'
import { useAuthStore } from '@/features/auth/store'
import { KopSurat } from '@/shared/components/print/PrintDocument'
import type { Klinik } from '@/shared/components/print/useKlinik'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn'
import { formatCurrency, formatDate, formatDateTime, terbilang } from '@/shared/lib/formatters'
import { PAGE_CSS, pageCss80mm, printDocument, waitForImages } from '@/shared/lib/print'
import { metodeLabel } from '@/shared/lib/pembayaran'

type KwitansiItem = { nama: string; jenis: string; qty: number; harga: number; subtotal: number }
type KwitansiPaket = { kode: string; nama: string; total_sesi: number; sisa_sesi: number; status: string }

export type Kwitansi = {
  id: number
  kode: string
  no_invoice: string
  tanggal: string
  dibayar_at: string
  status: string
  pasien_nama: string
  pasien_kode: string
  kasir_nama: string
  perawatan_kode: string
  jenis_pembayaran: string
  bank_nama: string
  items: KwitansiItem[]
  subtotal: number
  promo_kode: string
  diskon_promo: number
  voucher_kode: string
  diskon_voucher: number
  total: number
  poin_dipakai: number
  potongan_poin: number
  deposit_dipakai: number
  sisa_bayar: number
  jumlah_bayar: number
  kembalian: number
  paket: KwitansiPaket[]
  alasan_batal?: string
  klinik: Klinik
}

type Format = 'A5' | '80mm'
const FORMAT_KEY = 'clinic_kwitansi_format'

function storedFormat(): Format {
  try {
    return localStorage.getItem(FORMAT_KEY) === '80mm' ? '80mm' : 'A5'
  } catch {
    return 'A5'
  }
}

/** Receipt for a paid sale, A5 by default or 80mm thermal; opened in its own tab and printed once loaded. */
export function KwitansiPrintPage() {
  const { id } = useParams({ strict: false }) as { id?: string }
  const search = useSearch({ strict: false }) as { format?: string }
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const format: Format = search.format === '80mm' ? '80mm' : search.format === 'A5' ? 'A5' : storedFormat()

  const query = useQuery({
    queryKey: ['kwitansi', id],
    queryFn: () => apiGet<Kwitansi>(`/penjualan/${id}/kwitansi`),
    enabled: Boolean(id),
    retry: false,
  })
  const k = query.data?.data

  const receiptRef = useRef<HTMLDivElement>(null)
  const cetak = (no: string) => printDocument(`Kwitansi ${no}`, format === '80mm' ? pageCss80mm(receiptRef.current) : PAGE_CSS[format])

  const printed = useRef(false)
  useEffect(() => {
    if (!k || printed.current) return
    printed.current = true
    void waitForImages().then(() => cetak(k.no_invoice))
    // cetak only reads the ref and format at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, format])

  function setFormat(next: Format) {
    try {
      localStorage.setItem(FORMAT_KEY, next)
    } catch {
      // Private mode: the choice just isn't remembered.
    }
    void navigate({ to: '.', search: { format: next }, replace: true })
  }

  const errorMessage = (query.error as Error | null)?.message

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      {format === 'A5' ? <style>{PAGE_CSS.A5}</style> : null}
      <div className="print-hide mx-auto mb-4 flex max-w-xl flex-wrap items-center justify-between gap-2 px-4">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
          {(['A5', '80mm'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              aria-pressed={format === f}
              className={cn(
                'rounded-lg px-3 py-1 text-xs font-bold',
                format === f ? 'bg-rose-600 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {f === 'A5' ? 'A5' : 'Thermal 80mm'}
            </button>
          ))}
        </div>
        <Button type="button" size="sm" disabled={!k} onClick={() => k && cetak(k.no_invoice)}>
          <Printer />
          Cetak
        </Button>
      </div>

      {query.isLoading ? (
        <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat kwitansi...
        </p>
      ) : !k ? (
        <p className="mx-auto max-w-md rounded-xl bg-white p-6 text-center text-sm font-semibold text-rose-700">
          {errorMessage || 'Kwitansi tidak ditemukan.'}
        </p>
      ) : (
        <div
          ref={receiptRef}
          className={cn(
            'relative mx-auto overflow-hidden bg-white text-slate-900 shadow-sm print:shadow-none',
            format === 'A5' ? 'w-[148mm] p-[8mm] text-[11px] print:w-auto print:p-0' : 'w-[80mm] p-[3mm] text-[10px] print:w-auto print:p-0',
          )}
        >
          {k.status === 'cancelled' ? <StempelBatal alasan={k.alasan_batal} /> : null}
          {format === 'A5' ? <IsiA5 k={k} /> : <Isi80 k={k} />}
          <p className={cn('mt-3 text-slate-500', format === '80mm' ? 'text-center text-[9px]' : 'text-[9px]')}>
            Dicetak oleh {user?.name || user?.username || '-'} pada {formatDateTime(new Date())}
          </p>
        </div>
      )}
    </div>
  )
}

function StempelBatal({ alasan }: { alasan?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="-rotate-[20deg] rounded-lg border-4 border-red-600/70 px-6 py-2 text-center text-red-600/70">
        <p className="text-3xl font-black tracking-[0.2em]">DIBATALKAN</p>
        {alasan ? <p className="max-w-[90mm] text-[10px] font-bold">{alasan}</p> : null}
      </div>
    </div>
  )
}

function Ringkasan({ k, rowClass }: { k: Kwitansi; rowClass: string }) {
  const rows: [string, number][] = [['Subtotal', k.subtotal]]
  if (k.diskon_promo) rows.push([`Diskon promo${k.promo_kode ? ` (${k.promo_kode})` : ''}`, -k.diskon_promo])
  if (k.diskon_voucher) rows.push([`Diskon voucher${k.voucher_kode ? ` (${k.voucher_kode})` : ''}`, -k.diskon_voucher])
  return (
    <>
      {rows.map(([label, v]) => (
        <Row key={label} className={rowClass} label={label} value={v} />
      ))}
      <Row className={cn(rowClass, 'border-t border-slate-400 pt-1 font-bold')} label="Total" value={k.total} />
      {k.potongan_poin ? <Row className={rowClass} label={`Poin dipakai (${k.poin_dipakai.toLocaleString('id-ID')})`} value={-k.potongan_poin} /> : null}
      {k.deposit_dipakai ? <Row className={rowClass} label="Deposit dipakai" value={-k.deposit_dipakai} /> : null}
      {k.potongan_poin || k.deposit_dipakai ? <Row className={cn(rowClass, 'font-bold')} label="Sisa dibayar" value={k.sisa_bayar} /> : null}
      <Row
        className={rowClass}
        label={`Bayar · ${metodeLabel(k.jenis_pembayaran)}${k.bank_nama ? ` (${k.bank_nama})` : ''}`}
        value={k.jumlah_bayar}
      />
      {k.kembalian ? <Row className={rowClass} label="Kembalian" value={k.kembalian} /> : null}
    </>
  )
}

function Row({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={cn('flex justify-between gap-3', className)}>
      <span>{label}</span>
      <span className="whitespace-nowrap tabular-nums">{value < 0 ? `- ${formatCurrency(-value)}` : formatCurrency(value)}</span>
    </div>
  )
}

function PaketList({ paket }: { paket: KwitansiPaket[] }) {
  if (paket.length === 0) return null
  return (
    <div className="mt-2 rounded border border-slate-300 p-1.5">
      <p className="font-bold">Paket perawatan</p>
      {paket.map((p) => (
        <p key={p.kode}>
          {p.nama} <span className="font-mono">({p.kode})</span> — sisa {p.sisa_sesi} dari {p.total_sesi} sesi
        </p>
      ))}
    </div>
  )
}

function Catatan({ k }: { k: Kwitansi }) {
  const notes = [k.klinik.catatan_invoice, k.klinik.garansi].filter(Boolean)
  if (notes.length === 0) return null
  return (
    <div className="mt-2 space-y-0.5 text-[9px] text-slate-600">
      {notes.map((n, i) => (
        <p key={i} className="whitespace-pre-line">
          {n}
        </p>
      ))}
    </div>
  )
}

function IsiA5({ k }: { k: Kwitansi }) {
  return (
    <>
      <KopSurat klinik={k.klinik} />
      <div className="mt-3 flex items-start justify-between">
        <div>
          <p className="text-base font-black tracking-widest">KWITANSI</p>
          <p className="font-mono font-bold">{k.no_invoice}</p>
        </div>
        <table className="text-[10px]">
          <tbody>
            <InfoRow label="Tanggal" value={formatDateTime(k.dibayar_at)} />
            <InfoRow label="Pasien" value={`${k.pasien_nama}${k.pasien_kode ? ` (${k.pasien_kode})` : ''}`} />
            {k.perawatan_kode ? <InfoRow label="Perawatan" value={k.perawatan_kode} /> : null}
            <InfoRow label="Kasir" value={k.kasir_nama || '-'} />
          </tbody>
        </table>
      </div>

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className="border-y border-slate-700 text-left">
            <th className="py-1 font-bold">Item</th>
            <th className="py-1 text-right font-bold">Qty</th>
            <th className="py-1 text-right font-bold">Harga</th>
            <th className="py-1 text-right font-bold">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {k.items.map((it, i) => (
            <tr key={i} className="border-b border-slate-200">
              <td className="py-1">{it.nama}</td>
              <td className="py-1 text-right tabular-nums">{it.qty}</td>
              <td className="py-1 text-right tabular-nums">{formatCurrency(it.harga)}</td>
              <td className="py-1 text-right tabular-nums">{formatCurrency(it.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 ml-auto w-[70mm] space-y-0.5">
        <Ringkasan k={k} rowClass="" />
      </div>
      <p className="mt-2 rounded bg-slate-100 px-2 py-1 italic">Terbilang: {terbilang(k.total)}</p>
      <PaketList paket={k.paket} />

      <div className="mt-3 flex items-end justify-between gap-6">
        <Catatan k={k} />
        <div className="shrink-0 text-center">
          <p>Hormat kami,</p>
          <div className="mt-10 border-t border-slate-500 px-6 pt-0.5">{k.kasir_nama || 'Kasir'}</div>
        </div>
      </div>
      <p className="mt-1 text-[9px] text-slate-500">Tanggal transaksi {formatDate(k.tanggal)}</p>
    </>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="pr-2 text-slate-500">{label}</td>
      <td className="font-semibold">{value}</td>
    </tr>
  )
}

function Isi80({ k }: { k: Kwitansi }) {
  return (
    <>
      <KopSurat klinik={k.klinik} compact />
      <div className="mt-1.5 text-center">
        <p className="font-black tracking-widest">KWITANSI</p>
        <p className="font-mono font-bold">{k.no_invoice}</p>
      </div>
      <div className="mt-1.5 space-y-0.5 border-b border-dashed border-slate-500 pb-1.5">
        <p>{formatDateTime(k.dibayar_at)}</p>
        <p>
          Pasien: {k.pasien_nama}
          {k.pasien_kode ? ` (${k.pasien_kode})` : ''}
        </p>
        <p>Kasir: {k.kasir_nama || '-'}</p>
      </div>
      <div className="space-y-1 border-b border-dashed border-slate-500 py-1.5">
        {k.items.map((it, i) => (
          <div key={i}>
            <p>{it.nama}</p>
            <div className="flex justify-between tabular-nums">
              <span>
                {it.qty} x {formatCurrency(it.harga)}
              </span>
              <span>{formatCurrency(it.subtotal)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-0.5 py-1.5">
        <Ringkasan k={k} rowClass="" />
      </div>
      <p className="italic">{terbilang(k.total)}</p>
      <PaketList paket={k.paket} />
      <Catatan k={k} />
      <p className="mt-2 text-center font-semibold">Terima kasih</p>
    </>
  )
}
