import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Wallet } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { apiPost } from '@/shared/api/client'
import { BankSelect } from '@/shared/components/BankSelect'
import { Dialog } from '@/shared/components/Dialog'
import { JenisPembayaranSelect } from '@/shared/components/JenisPembayaranSelect'
import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { cn } from '@/shared/lib/cn'
import { formatCurrency, formatDate, todayISO } from '@/shared/lib/formatters'
import { useAuthStore } from '@/features/auth/store'
import { apiErrorMessage } from '@/features/finance/types'
import { StokDokumenDialog } from '@/features/warehouse/components/StokDokumenDialog'
import { itemsColumn, type StokDokumenDetail } from '@/features/warehouse/components/stokDokumenColumns'

type Row = {
  id: number
  kode: string
  tanggal: string
  no_invoice?: string
  status: string
  total_harga?: number
  jumlah_dibayar?: number
  status_bayar?: string
  supplier?: { nama?: string }
  details?: StokDokumenDetail[]
}

const BAYAR_STYLE: Record<string, { label: string; className: string }> = {
  lunas: { label: 'Lunas', className: 'bg-teal-100 text-teal-800' },
  sebagian: { label: 'Sebagian', className: 'bg-amber-100 text-amber-800' },
  belum: { label: 'Belum Dibayar', className: 'bg-rose-100 text-rose-700' },
}

function sisa(r: Row) {
  return Math.max((r.total_harga ?? 0) - (r.jumlah_dibayar ?? 0), 0)
}

const columns: Column<Row>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-teal-700">{r.kode}</span> },
  { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal) },
  { key: 'supplier', header: 'Supplier', cell: (r) => r.supplier?.nama || '-' },
  { key: 'invoice', header: 'No. Invoice', cell: (r) => r.no_invoice || '-' },
  itemsColumn<Row>('pembelian'),
  { key: 'total', header: 'Total', cell: (r) => formatCurrency(r.total_harga ?? 0) },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
  {
    key: 'bayar',
    header: 'Pembayaran',
    cell: (r) => {
      const s = BAYAR_STYLE[r.status_bayar ?? 'belum'] ?? BAYAR_STYLE.belum
      return (
        <div className="space-y-0.5">
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', s.className)}>{s.label}</span>
          {r.status_bayar !== 'lunas' ? <p className="text-[11px] text-slate-500">Sisa {formatCurrency(sisa(r))}</p> : null}
        </div>
      )
    },
  },
]

export function PembelianPage() {
  const role = useAuthStore((s) => s.user?.role)
  const [open, setOpen] = useState(false)
  const [bayarTarget, setBayarTarget] = useState<Row | null>(null)
  const canCreate = role === 'admin' || role === 'apoteker'

  return (
    <>
      <ResourceListPage<Row>
        title="Data Pembelian"
        description="Pembelian barang dari supplier. Stok bertambah saat disimpan dan utang supplier tercatat sampai dibayar."
        endpoint="/pembelian"
        queryKey="pembelian"
        columns={columns}
        enableCreate={false}
        enableEdit={false}
        enableDelete={role === 'admin'}
        customRowActions={(r) =>
          r.status_bayar !== 'lunas' && sisa(r) > 0 ? (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setBayarTarget(r)}>
              <Wallet className="h-3.5 w-3.5" />
              Bayar
            </Button>
          ) : null
        }
        extraActions={
          canCreate ? (
            <Button type="button" onClick={() => setOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Buat Pembelian
            </Button>
          ) : null
        }
      />
      <StokDokumenDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Buat Pembelian"
        endpoint="/pembelian"
        queryKey="pembelian"
        variant="pembelian"
      />
      <BayarSupplierDialog target={bayarTarget} onClose={() => setBayarTarget(null)} />
    </>
  )
}

const fieldLabel = 'text-[11px] font-bold uppercase tracking-wider text-slate-500'

function BayarSupplierDialog({ target, onClose }: { target: Row | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [tanggal, setTanggal] = useState(todayISO)
  const [jumlah, setJumlah] = useState('')
  const [metode, setMetode] = useState('transfer')
  const [bankId, setBankId] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [error, setError] = useState<string | null>(null)
  const needsBank = metode === 'transfer' || metode === 'e_money' || metode === 'kartu_debit'
  const sisaUtang = target ? sisa(target) : 0

  const mutation = useMutation({
    mutationFn: () =>
      apiPost(`/pembelian/${target?.id}/bayar`, {
        tanggal,
        jumlah: Number(jumlah),
        jenis_pembayaran: metode,
        bank_id: needsBank && bankId ? Number(bankId) : null,
        keterangan,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pembelian'] })
      setJumlah('')
      setKeterangan('')
      onClose()
    },
    onError: (err) => setError(apiErrorMessage(err, 'Gagal menyimpan pembayaran')),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  return (
    <Dialog
      open={Boolean(target)}
      onClose={onClose}
      title="Bayar Supplier"
      description={target ? `${target.kode} · ${target.supplier?.nama ?? ''} · sisa ${formatCurrency(sisaUtang)}` : undefined}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={fieldLabel} htmlFor="bs-tgl">Tanggal</label>
            <Input id="bs-tgl" type="date" required value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className={fieldLabel} htmlFor="bs-jumlah">Jumlah</label>
            <div className="flex gap-1.5">
              <Input
                id="bs-jumlah"
                type="number"
                min={1}
                max={sisaUtang}
                step="0.01"
                required
                value={jumlah}
                onChange={(e) => setJumlah(e.target.value)}
              />
              <Button variant="outline" size="sm" className="h-10" onClick={() => setJumlah(String(sisaUtang))}>
                Lunasi
              </Button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <span className={fieldLabel}>Metode</span>
            <JenisPembayaranSelect value={metode} onChange={setMetode} required />
          </div>
          {needsBank ? (
            <div className="space-y-1.5">
              <span className={fieldLabel}>Rekening Asal</span>
              <BankSelect value={bankId} onChange={setBankId} />
            </div>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <label className={fieldLabel} htmlFor="bs-ket">Keterangan</label>
          <Input id="bs-ket" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="No. bukti transfer, dll." />
        </div>
        {error ? <div className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={mutation.isPending || !Number(jumlah)}>Simpan Pembayaran</Button>
        </div>
      </form>
    </Dialog>
  )
}
