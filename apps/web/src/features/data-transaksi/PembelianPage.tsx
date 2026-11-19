import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Wallet } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { apiPost } from '@/shared/api/client'
import { BankSelect } from '@/shared/components/BankSelect'
import { Dialog } from '@/shared/components/Dialog'
import { JenisPembayaranSelect } from '@/shared/components/JenisPembayaranSelect'
import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { Button } from '@/shared/ui/button'
import { Field, FormAlert } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { FieldErrorsContext, useFormValidation } from '@/shared/lib/validation'
import { cn } from '@/shared/lib/cn'
import { formatCurrency, formatDate, todayISO } from '@/shared/lib/formatters'
import { useAuthStore } from '@/features/auth/store'
import { apiErrorMessage } from '@/features/finance/types'
import { StokDokumenDialog } from '@/features/warehouse/components/StokDokumenDialog'
import { itemsColumn, type StokDokumenDetail } from '@/features/warehouse/components/stokDokumenColumns'
import { RupiahInput } from '@/shared/ui/rupiah-input'

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
        description="Pembelian barang dari supplier"
        endpoint="/pembelian"
        queryKey="pembelian"
        columns={columns}
        enableCreate={false}
        enableEdit={false}
        enableDelete={role === 'admin'}
        customRowActions={(r) =>
          r.status_bayar !== 'lunas' && sisa(r) > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setBayarTarget(r)}>
              <Wallet />
              Bayar
            </Button>
          ) : null
        }
        extraActions={
          canCreate ? (
            <Button type="button" onClick={() => setOpen(true)}>
              <Plus />
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


function BayarSupplierDialog({ target, onClose }: { target: Row | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [tanggal, setTanggal] = useState(todayISO)
  const [jumlah, setJumlah] = useState('')
  const [metode, setMetode] = useState('transfer')
  const [bankId, setBankId] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [error, setError] = useState<string | null>(null)
  const validation = useFormValidation()

  // Clear stale messages each time the dialog opens for a row.
  useEffect(() => {
    if (target) {
      setError(null)
      validation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])
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
      <FieldErrorsContext.Provider value={validation.errors}>
        <form {...validation.formProps} onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tanggal" htmlFor="bs-tgl" required>
              <Input id="bs-tgl" type="date" required value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
            </Field>
            <Field label="Jumlah" htmlFor="bs-jumlah" required>
              <div className="flex gap-1.5">
                <RupiahInput
 className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs placeholder:text-slate-400 focus-visible:border-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                  id="bs-jumlah"
                  required
                  value={jumlah}
                  onValueChange={(v) => setJumlah(v)}
                />
                <Button variant="outline" onClick={() => setJumlah(String(sisaUtang))}>
                  Lunasi
                </Button>
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Metode" htmlFor="bs-metode" required>
              <JenisPembayaranSelect id="bs-metode" value={metode} onChange={setMetode} required />
            </Field>
            {needsBank ? (
              <Field label="Rekening Asal" htmlFor="bs-bank">
                <BankSelect id="bs-bank" value={bankId} onChange={setBankId} />
              </Field>
            ) : null}
          </div>
          <Field label="Keterangan" htmlFor="bs-ket">
            <Input id="bs-ket" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="No. bukti transfer" />
          </Field>
          <FormAlert>{error}</FormAlert>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={mutation.isPending}>Simpan</Button>
          </div>
        </form>
      </FieldErrorsContext.Provider>

    </Dialog>
  )
}
