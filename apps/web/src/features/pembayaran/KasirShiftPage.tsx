import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Banknote, History, Loader2, LockKeyhole, LockKeyholeOpen, Printer, Wallet } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { apiPost } from '@/shared/api/client'
import { Dialog } from '@/shared/components/Dialog'
import { EmptyState } from '@/shared/components/EmptyState'
import { KpiCard } from '@/shared/components/KpiCard'
import { PageHeader } from '@/shared/components/PageHeader'
import { toast } from '@/shared/components/Toaster'
import { Button, buttonVariants } from '@/shared/ui/button'
import { Field, FormAlert } from '@/shared/ui/field'
import { RupiahInput } from '@/shared/ui/rupiah-input'
import { cn } from '@/shared/lib/cn'
import { formatCurrency, formatDateTime } from '@/shared/lib/formatters'
import { metodeLabel } from '@/shared/lib/pembayaran'
import { openPrintTab } from '@/shared/lib/print'
import { SHIFT_AKTIF_KEY, SUMBER_MUTASI, selisihInfo, useShiftAktif, type KasirShiftDetail } from './kasir-shift'

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-rose-500 focus:outline-none'

function errorMessage(err: unknown, fallback: string) {
  const data = (err as { response?: { data?: { message?: string } } })?.response?.data
  if (data?.message) return data.message
  return err instanceof Error ? err.message : fallback
}

/** Open the cashier with a float, follow what came in per method, and close it by counting the drawer. */
export function KasirShiftPage() {
  const queryClient = useQueryClient()
  const aktif = useShiftAktif()
  const [lastClosed, setLastClosed] = useState<KasirShiftDetail | null>(null)
  const [tutupOpen, setTutupOpen] = useState(false)

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: SHIFT_AKTIF_KEY })
    void queryClient.invalidateQueries({ queryKey: ['kasir-shift-list'] })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buka/Tutup Kasir"
        description="Shift kasir: modal awal, uang masuk/keluar per metode, dan hitung kas saat tutup"
        actions={
          <Link to="/data-transaksi/shift" className={buttonVariants({ variant: 'outline' })}>
            <History />
            Riwayat Shift
          </Link>
        }
      />

      {lastClosed && !aktif.shift ? <ShiftDitutupPanel d={lastClosed} onDismiss={() => setLastClosed(null)} /> : null}

      {aktif.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Memeriksa kasir...
        </p>
      ) : aktif.isError ? (
        <FormAlert>{errorMessage(aktif.error, 'Gagal memuat shift kasir')}</FormAlert>
      ) : aktif.shift ? (
        <>
          <ShiftAktif d={aktif.shift} onTutup={() => setTutupOpen(true)} />
          <TutupKasirDialog
            open={tutupOpen}
            d={aktif.shift}
            onClose={() => setTutupOpen(false)}
            onClosed={(d) => {
              setTutupOpen(false)
              setLastClosed(d)
              refresh()
              toast(`Kasir ${d.shift.kode} ditutup`, 'success')
              openPrintTab(`/cetak/shift/${d.shift.id}`)
            }}
          />
        </>
      ) : (
        <BukaKasirForm
          onOpened={(d) => {
            setLastClosed(null)
            queryClient.setQueryData(SHIFT_AKTIF_KEY, { success: true, data: d })
            refresh()
            toast(`Kasir ${d.shift.kode} dibuka`, 'success')
          }}
        />
      )}
    </div>
  )
}

function BukaKasirForm({ onOpened }: { onOpened: (d: KasirShiftDetail) => void }) {
  const [saldoAwal, setSaldoAwal] = useState('')
  const [catatan, setCatatan] = useState('')
  const buka = useMutation({
    mutationFn: async () => {
      const res = await apiPost<KasirShiftDetail>('/kasir/shift/buka', { saldo_awal: Number(saldoAwal) || 0, catatan })
      if (!res.success) throw new Error(res.message || 'Gagal membuka kasir')
      return res.data
    },
    onSuccess: onOpened,
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    buka.mutate()
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-lg overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-rose-50/40 px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">Kasir belum dibuka</h3>
          <p className="text-xs text-slate-500">Hitung uang di laci, lalu catat sebagai modal awal shift.</p>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <Field label="Saldo Awal Tunai (Rp)" htmlFor="kasir-saldo-awal" hint="Uang kembalian di laci saat shift dimulai">
          <RupiahInput id="kasir-saldo-awal" value={saldoAwal} onValueChange={setSaldoAwal} placeholder="0" className={inputClass} />
        </Field>
        <Field label="Catatan" htmlFor="kasir-catatan-buka">
          <textarea
            id="kasir-catatan-buka"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            rows={2}
            placeholder="Opsional"
            className={cn(inputClass, 'font-normal')}
          />
        </Field>
        <FormAlert>{buka.isError ? errorMessage(buka.error, 'Gagal membuka kasir') : null}</FormAlert>
        <Button type="submit" disabled={buka.isPending} className="w-full">
          {buka.isPending ? <Loader2 className="animate-spin" /> : <LockKeyholeOpen />}
          Buka Kasir
        </Button>
      </div>
    </form>
  )
}

function ShiftAktif({ d, onTutup }: { d: KasirShiftDetail; onTutup: () => void }) {
  const s = d.shift
  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <LockKeyholeOpen className="h-5 w-5" />
          </div>
          <div className="text-xs text-emerald-900">
            <p className="text-sm font-bold">
              Kasir terbuka · <span className="font-mono" data-testid="shift-kode">{s.kode}</span>
            </p>
            <p>
              {s.kasir_nama || '-'}
              {s.cabang_nama ? ` · ${s.cabang_nama}` : ''} · dibuka {formatDateTime(s.opened_at)} · modal awal {formatCurrency(s.saldo_awal)}
            </p>
            {s.catatan_buka ? <p className="italic">{s.catatan_buka}</p> : null}
          </div>
        </div>
        <Button type="button" variant="destructive" onClick={onTutup}>
          <LockKeyhole />
          Tutup Kasir
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Kas Diharapkan (Tunai)"
          value={formatCurrency(d.expected_tunai)}
          icon={<Wallet className="h-5 w-5" />}
          iconClass="bg-rose-50 text-rose-600"
          className="border-rose-200"
        />
        {d.ringkasan.map((r) => (
          <KpiCard
            key={r.jenis_pembayaran}
            label={`${metodeLabel(r.jenis_pembayaran)} · ${r.jumlah} transaksi${r.keluar ? ` · keluar ${formatCurrency(r.keluar)}` : ''}`}
            value={formatCurrency(r.net)}
            icon={<Banknote className="h-5 w-5" />}
            iconClass="bg-emerald-50 text-emerald-600"
          />
        ))}
        {d.ringkasan.length === 0 ? (
          <KpiCard label="Transaksi" value={0} icon={<Banknote className="h-5 w-5" />} iconClass="bg-slate-100 text-slate-500" />
        ) : null}
      </div>
      <p className="-mt-3 text-[11px] text-slate-500">
        Kas diharapkan = modal awal {formatCurrency(s.saldo_awal)} + tunai masuk {formatCurrency(d.tunai_masuk)} − tunai keluar{' '}
        {formatCurrency(d.tunai_keluar)}. Non-tunai tidak masuk laci.
      </p>

      <MutasiTable d={d} />
    </>
  )
}

export function MutasiTable({ d }: { d: KasirShiftDetail }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-3">
        <h3 className="text-sm font-bold text-slate-900">Mutasi Kas</h3>
        <p className="text-xs text-slate-500">
          Masuk <span className="font-bold text-emerald-700">{formatCurrency(d.total_masuk)}</span> · Keluar{' '}
          <span className="font-bold text-red-700">{formatCurrency(d.total_keluar)}</span>
        </p>
      </div>
      {d.mutasi.length === 0 ? (
        <EmptyState title="Belum ada transaksi" description="Pembayaran, deposit dan refund pada shift ini muncul di sini." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3">Sumber</th>
                <th className="px-4 py-3">Referensi</th>
                <th className="px-4 py-3">Metode</th>
                <th className="px-4 py-3 text-right">Masuk</th>
                <th className="px-4 py-3 text-right">Keluar</th>
                <th className="px-4 py-3">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {d.mutasi.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap text-slate-600">{formatDateTime(m.waktu)}</td>
                  <td className="px-4 py-2.5 text-xs font-semibold text-slate-800">{SUMBER_MUTASI[m.source_type] ?? m.source_type}</td>
                  <td className="px-4 py-2.5 font-mono text-xs font-bold text-rose-700">{m.referensi || '-'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {metodeLabel(m.jenis_pembayaran)}
                    {m.bank_nama ? ` (${m.bank_nama})` : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-emerald-700 tabular-nums">{m.masuk ? formatCurrency(m.masuk) : '-'}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-red-700 tabular-nums">{m.keluar ? formatCurrency(m.keluar) : '-'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{m.keterangan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TutupKasirDialog({
  open,
  d,
  onClose,
  onClosed,
}: {
  open: boolean
  d: KasirShiftDetail
  onClose: () => void
  onClosed: (d: KasirShiftDetail) => void
}) {
  const [fisik, setFisik] = useState('')
  const [catatan, setCatatan] = useState('')
  const tutup = useMutation({
    mutationFn: async () => {
      const res = await apiPost<KasirShiftDetail>(`/kasir/shift/${d.shift.id}/tutup`, {
        saldo_akhir_fisik: Number(fisik) || 0,
        catatan,
      })
      if (!res.success) throw new Error(res.message || 'Gagal menutup kasir')
      return res.data
    },
    onSuccess: (res) => {
      setFisik('')
      setCatatan('')
      onClosed(res)
    },
  })

  const diisi = fisik !== ''
  const selisih = (Number(fisik) || 0) - d.expected_tunai
  const info = selisihInfo(selisih)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (diisi) tutup.mutate()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Tutup Kasir" description={`${d.shift.kode} · ${d.shift.kasir_nama || ''}`}>
      <form onSubmit={onSubmit} className="space-y-4 p-5">
        <div className="space-y-1 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-xs">
          <Row label="Modal awal" value={d.shift.saldo_awal} />
          <Row label="Tunai masuk" value={d.tunai_masuk} />
          {d.tunai_keluar ? <Row label="Tunai keluar" value={-d.tunai_keluar} /> : null}
          <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm font-bold text-slate-900">
            <span>Kas diharapkan</span>
            <span data-testid="tutup-expected">{formatCurrency(d.expected_tunai)}</span>
          </div>
        </div>
        <Field label="Uang Tunai di Laci (Rp)" htmlFor="kasir-fisik" required hint="Hitung semua uang tunai fisik, termasuk modal awal">
          <RupiahInput id="kasir-fisik" required autoFocus value={fisik} onValueChange={setFisik} placeholder="0" className={inputClass} />
        </Field>
        {diisi ? (
          <div className={cn('flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-bold', info.bg, info.tone)} data-testid="tutup-selisih">
            <span>Selisih · {info.label}</span>
            <span>{selisih < 0 ? `- ${formatCurrency(-selisih)}` : formatCurrency(selisih)}</span>
          </div>
        ) : null}
        <Field label="Catatan" htmlFor="kasir-catatan-tutup">
          <textarea
            id="kasir-catatan-tutup"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            rows={2}
            placeholder={diisi && Math.abs(selisih) >= 0.01 ? 'Jelaskan selisih kas' : 'Opsional'}
            className={cn(inputClass, 'font-normal')}
          />
        </Field>
        <FormAlert>{tutup.isError ? errorMessage(tutup.error, 'Gagal menutup kasir') : null}</FormAlert>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Batal
          </Button>
          <Button type="submit" variant="destructive" disabled={!diisi || tutup.isPending} className="flex-1">
            {tutup.isPending ? <Loader2 className="animate-spin" /> : <LockKeyhole />}
            Tutup & Cetak
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span className="font-semibold text-slate-800 tabular-nums">{value < 0 ? `- ${formatCurrency(-value)}` : formatCurrency(value)}</span>
    </div>
  )
}

function ShiftDitutupPanel({ d, onDismiss }: { d: KasirShiftDetail; onDismiss: () => void }) {
  const selisih = d.shift.selisih ?? 0
  const info = selisihInfo(selisih)
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between" data-testid="shift-ditutup">
      <div className="text-xs text-slate-600">
        <p className="text-sm font-bold text-slate-900">
          Shift <span className="font-mono">{d.shift.kode}</span> ditutup
        </p>
        <p>
          Kas diharapkan {formatCurrency(d.expected_tunai)} · dihitung {formatCurrency(d.shift.saldo_akhir_fisik ?? 0)} ·{' '}
          <span className={cn('font-bold', info.tone)}>
            selisih {selisih < 0 ? `- ${formatCurrency(-selisih)}` : formatCurrency(selisih)} ({info.label})
          </span>
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => openPrintTab(`/cetak/shift/${d.shift.id}`)}>
          <Printer />
          Cetak Laporan
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          Tutup
        </Button>
      </div>
    </div>
  )
}
