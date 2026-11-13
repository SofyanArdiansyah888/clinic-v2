import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Dialog } from '@/shared/components/Dialog'
import { BarangSelect, type BarangLite } from '@/shared/components/BarangSelect'
import { Button } from '@/shared/ui/button'
import { formatCurrency } from '@/shared/lib/formatters'

export type ResepItem = {
  barang_id: number
  kode_barang: string
  nama_barang: string
  jumlah: number
  unit: string
  harga: number
  total: number
}

type ResepModalProps = {
  isOpen: boolean
  onClose: () => void
  onSave: (resepData: { barangs: ResepItem[] }) => void
}

export function ResepModal({ isOpen, onClose, onSave }: ResepModalProps) {
  const [barangs, setBarangs] = useState<ResepItem[]>([])

  function handleAddRow() {
    setBarangs((prev) => [
      ...prev,
      {
        barang_id: 0,
        kode_barang: '',
        nama_barang: '',
        jumlah: 1,
        unit: 'pcs',
        harga: 0,
        total: 0,
      },
    ])
  }

  function handleRemoveRow(index: number) {
    setBarangs((prev) => prev.filter((_, i) => i !== index))
  }

  function handleBarangSelect(index: number, _val: string, selected?: BarangLite) {
    if (!selected) return
    setBarangs((prev) => {
      const updated = [...prev]
      const current = updated[index]
      const jumlah = current?.jumlah || 1
      const harga = selected.harga_jual || 0
      updated[index] = {
        ...current,
        barang_id: selected.id,
        kode_barang: selected.kode || '',
        nama_barang: selected.nama || '',
        unit: selected.satuan || 'pcs',
        harga,
        jumlah,
        total: jumlah * harga,
      }
      return updated
    })
  }

  function handleJumlahChange(index: number, val: number) {
    const qty = val > 0 ? val : 1
    setBarangs((prev) => {
      const updated = [...prev]
      const current = updated[index]
      updated[index] = {
        ...current,
        jumlah: qty,
        total: qty * (current.harga || 0),
      }
      return updated
    })
  }

  function handleHargaChange(index: number, val: number) {
    const harga = val >= 0 ? val : 0
    setBarangs((prev) => {
      const updated = [...prev]
      const current = updated[index]
      updated[index] = {
        ...current,
        harga,
        total: (current.jumlah || 1) * harga,
      }
      return updated
    })
  }

  function handleSubmit() {
    const validBarangs = barangs.filter((b) => b.barang_id > 0)
    if (validBarangs.length === 0) return
    onSave({ barangs: validBarangs })
    setBarangs([])
    onClose()
  }

  return (
    <Dialog
      open={isOpen}
      onClose={() => {
        setBarangs([])
        onClose()
      }}
      title="Input Resep Dokter"
      description="Tambahkan item obat / alkes dari apotek untuk resep pasien."
      className="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-xs font-bold text-slate-700">Daftar Obat / Alkes Resep</p>
          <Button type="button" onClick={handleAddRow} className="rounded-xl text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Tambah Barang
          </Button>
        </div>

        {barangs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
            Belum ada barang ditambahkan. Klik tombol <b>Tambah Barang</b> untuk menambah resep.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase text-[11px]">
                <tr>
                  <th className="px-3 py-2">Barang / Obat</th>
                  <th className="w-20 px-3 py-2">Qty</th>
                  <th className="w-20 px-3 py-2">Unit</th>
                  <th className="w-32 px-3 py-2">Harga</th>
                  <th className="w-32 px-3 py-2 text-right">Total</th>
                  <th className="w-12 px-3 py-2 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {barangs.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="p-2 min-w-[200px]">
                      <BarangSelect
                        value={item.barang_id ? String(item.barang_id) : ''}
                        onChange={(val, selected) => handleBarangSelect(idx, val, selected)}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={1}
                        value={item.jumlah}
                        onChange={(e) => handleJumlahChange(idx, Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-center font-bold"
                      />
                    </td>
                    <td className="p-2 font-mono text-[11px] text-slate-500 uppercase">{item.unit}</td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        value={item.harga}
                        onChange={(e) => handleHargaChange(idx, Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono"
                      />
                    </td>
                    <td className="p-2 font-mono font-bold text-right text-slate-900">
                      {formatCurrency(item.total)}
                    </td>
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(idx)}
                        className="rounded p-1 text-rose-500 hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setBarangs([])
              onClose()
            }}
            className="rounded-xl text-xs"
          >
            Batal
          </Button>
          <Button
            type="button"
            disabled={barangs.filter((b) => b.barang_id > 0).length === 0}
            onClick={handleSubmit}
            className="rounded-xl text-xs"
          >
            Masukkan ke Resep
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
