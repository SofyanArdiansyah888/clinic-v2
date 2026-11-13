import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { apiPost } from '@/shared/api/client'
import { BarangSelect, type BarangLite } from '@/shared/components/BarangSelect'
import { Dialog } from '@/shared/components/Dialog'
import { StaffSelect } from '@/shared/components/StaffSelect'
import { SupplierSelect } from '@/shared/components/SupplierSelect'
import { Button } from '@/shared/ui/button'
import { formatCurrency, todayISO } from '@/shared/lib/formatters'

// mutasi: konversi & produksi (barang keluar/masuk), opname: physical count, pembelian: stock in from a supplier.
export type StokDokumenVariant = 'mutasi' | 'opname' | 'pembelian'

type Line = {
  key: number
  barangId: string
  barang?: BarangLite
  tipe: 'keluar' | 'masuk'
  qty: string
  harga: string
}

type StokDokumenDialogProps = {
  open: boolean
  onClose: () => void
  title: string
  endpoint: string
  queryKey: string
  variant: StokDokumenVariant
  keluarLabel?: string
  masukLabel?: string
}

let nextKey = 1

function newLine(tipe: Line['tipe'] = 'keluar'): Line {
  return { key: nextKey++, barangId: '', tipe, qty: '', harga: '' }
}

function initialLines(variant: StokDokumenVariant): Line[] {
  return variant === 'mutasi' ? [newLine('keluar'), newLine('masuk')] : [newLine()]
}

const labelClass = 'text-[11px] font-bold uppercase tracking-wider text-slate-500'
const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-rose-500 focus:outline-none'

export function StokDokumenDialog({
  open,
  onClose,
  title,
  endpoint,
  queryKey,
  variant,
  keluarLabel = 'Keluar',
  masukLabel = 'Masuk',
}: StokDokumenDialogProps) {
  const queryClient = useQueryClient()
  const [tanggal, setTanggal] = useState(todayISO)
  const [keterangan, setKeterangan] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [staffId, setStaffId] = useState('')
  const [noInvoice, setNoInvoice] = useState('')
  const [lines, setLines] = useState<Line[]>(() => initialLines(variant))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTanggal(todayISO())
    setKeterangan('')
    setSupplierId('')
    setStaffId('')
    setNoInvoice('')
    setLines(initialLines(variant))
    setError(null)
  }, [open, variant])

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function selectBarang(key: number, barangId: string, barang?: BarangLite) {
    const patch: Partial<Line> = { barangId, barang }
    if (variant === 'pembelian' && barang?.harga_beli) patch.harga = String(barang.harga_beli)
    updateLine(key, patch)
  }

  const total = lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.harga) || 0), 0)

  function buildBody() {
    const filled = lines.filter((l) => l.barangId)
    if (filled.length === 0) throw new Error('Tambahkan minimal satu barang')
    const ids = filled.map((l) => `${l.barangId}:${variant === 'mutasi' ? l.tipe : ''}`)
    if (new Set(ids).size !== ids.length) throw new Error('Barang yang sama tercantum lebih dari sekali')

    if (variant === 'opname') {
      for (const l of filled) {
        if (l.qty === '' || Number(l.qty) < 0) throw new Error(`Stok fisik ${l.barang?.nama ?? ''} wajib diisi (minimal 0)`)
      }
      return {
        tanggal,
        keterangan,
        details: filled.map((l) => ({ barang_id: Number(l.barangId), stok_fisik: Math.floor(Number(l.qty)) })),
      }
    }

    for (const l of filled) {
      if (!(Number(l.qty) > 0)) throw new Error(`Qty ${l.barang?.nama ?? ''} harus lebih dari 0`)
    }

    if (variant === 'pembelian') {
      if (!supplierId) throw new Error('Supplier wajib dipilih')
      if (!staffId) throw new Error('Staff penerima wajib dipilih')
      return {
        supplier_id: Number(supplierId),
        staff_id: Number(staffId),
        tanggal,
        no_invoice: noInvoice.trim(),
        keterangan,
        status: 'received',
        details: filled.map((l) => ({
          barang_id: Number(l.barangId),
          qty: Math.floor(Number(l.qty)),
          harga_beli: Number(l.harga) || 0,
        })),
      }
    }

    if (!filled.some((l) => l.tipe === 'keluar') || !filled.some((l) => l.tipe === 'masuk')) {
      throw new Error(`Isi minimal satu barang ${keluarLabel.toLowerCase()} dan satu ${masukLabel.toLowerCase()}`)
    }
    return {
      tanggal,
      keterangan,
      details: filled.map((l) => ({ barang_id: Number(l.barangId), qty: Math.floor(Number(l.qty)), tipe: l.tipe })),
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => apiPost(endpoint, buildBody()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [queryKey] })
      // Stock levels changed, so barang pickers and the kartu stok view must refetch.
      void queryClient.invalidateQueries({ queryKey: ['barang'] })
      void queryClient.invalidateQueries({ queryKey: ['kartu-stok'] })
      onClose()
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err instanceof Error ? err.message : 'Gagal menyimpan')
      setError(message)
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    saveMutation.mutate()
  }

  function renderLines(tipe?: Line['tipe']) {
    const rows = tipe ? lines.filter((l) => l.tipe === tipe) : lines
    return (
      <div className="space-y-2">
        {rows.map((l) => {
          const stok = l.barang?.stok_aktual
          const selisih = variant === 'opname' && l.qty !== '' && stok !== undefined ? Number(l.qty) - stok : null
          return (
            <div key={l.key} className="grid grid-cols-12 items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-2">
              <div className="col-span-12 md:col-span-6">
                <BarangSelect value={l.barangId} onChange={(v, b) => selectBarang(l.key, v, b)} />
                {stok !== undefined ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Stok sistem: <span className="font-semibold">{stok}</span> {l.barang?.satuan ?? ''}
                  </p>
                ) : null}
              </div>
              <div className={variant === 'pembelian' ? 'col-span-4 md:col-span-2' : 'col-span-6 md:col-span-3'}>
                <input
                  type="number"
                  min={0}
                  value={l.qty}
                  onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                  placeholder={variant === 'opname' ? 'Stok fisik' : 'Qty'}
                  aria-label={variant === 'opname' ? 'Stok fisik' : 'Qty'}
                  className={inputClass}
                />
                {selisih !== null ? (
                  <p
                    className={`mt-1 text-[11px] font-semibold ${
                      selisih === 0 ? 'text-slate-500' : selisih > 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    Selisih {selisih > 0 ? `+${selisih}` : selisih}
                  </p>
                ) : null}
              </div>
              {variant === 'pembelian' ? (
                <div className="col-span-6 md:col-span-3">
                  <input
                    type="number"
                    min={0}
                    value={l.harga}
                    onChange={(e) => updateLine(l.key, { harga: e.target.value })}
                    placeholder="Harga beli"
                    aria-label="Harga beli"
                    className={inputClass}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    {formatCurrency((Number(l.qty) || 0) * (Number(l.harga) || 0))}
                  </p>
                </div>
              ) : null}
              <div className={variant === 'pembelian' ? 'col-span-2 md:col-span-1' : 'col-span-6 md:col-span-3'}>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Hapus baris"
                  onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                  disabled={rows.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setLines((prev) => [...prev, newLine(tipe ?? 'keluar')])}
        >
          <Plus className="h-3.5 w-3.5" />
          Tambah barang
        </Button>
      </div>
    )
  }

  return (
    <Dialog open={open} onClose={onClose} title={title} className="max-w-3xl">
      <form onSubmit={onSubmit} className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className={labelClass} htmlFor="stok-tanggal">
              Tanggal
            </label>
            <input
              id="stok-tanggal"
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          {variant === 'pembelian' ? (
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="stok-invoice">
                No. Invoice Supplier
              </label>
              <input
                id="stok-invoice"
                value={noInvoice}
                onChange={(e) => setNoInvoice(e.target.value)}
                placeholder="Opsional"
                className={inputClass}
              />
            </div>
          ) : null}
          {variant === 'pembelian' ? (
            <>
              <div className="space-y-1.5">
                <label htmlFor="stokdokumendialog-f1" className={labelClass}>Supplier</label>
                <SupplierSelect id="stokdokumendialog-f1" value={supplierId} onChange={setSupplierId} required />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="stokdokumendialog-f2" className={labelClass}>Staff Penerima</label>
                <StaffSelect id="stokdokumendialog-f2" value={staffId} onChange={setStaffId} placeholder="Pilih staff penerima..." required />
              </div>
            </>
          ) : null}
        </div>

        {variant === 'mutasi' ? (
          <>
            <div className="space-y-2">
              <p className={labelClass}>{keluarLabel} (stok berkurang)</p>
              {renderLines('keluar')}
            </div>
            <div className="space-y-2">
              <p className={labelClass}>{masukLabel} (stok bertambah)</p>
              {renderLines('masuk')}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className={labelClass}>{variant === 'opname' ? 'Hasil hitung fisik' : 'Barang diterima'}</p>
            {renderLines()}
          </div>
        )}

        {variant === 'pembelian' ? (
          <div className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50/60 px-4 py-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Total Pembelian</span>
            <span className="text-lg font-extrabold text-slate-900">{formatCurrency(total)}</span>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="stok-keterangan">
            Keterangan
          </label>
          <textarea
            id="stok-keterangan"
            rows={2}
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            className={inputClass}
          />
        </div>

        {error ? <div className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</div> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" disabled={saveMutation.isPending} className="gap-1.5">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
