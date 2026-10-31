import { X } from 'lucide-react'
import { useState } from 'react'
import { BarangSelect } from '@/shared/components/BarangSelect'
import { ResourceListPage } from '@/shared/components/ResourceListPage'
import type { Column } from '@/shared/components/DataTable'
import { Button } from '@/shared/ui/button'
import { formatDate } from '@/shared/lib/formatters'

type Row = {
  id: number
  kode: string
  tanggal: string
  keterangan?: string
  referensi?: string
  qty_masuk: number
  qty_keluar: number
  saldo: number
  barang?: { nama?: string; kode?: string; satuan?: string }
}

const columns: Column<Row>[] = [
  { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal) },
  {
    key: 'barang',
    header: 'Barang',
    cell: (r) => (
      <div>
        <p className="font-semibold text-slate-900">{r.barang?.nama || '-'}</p>
        <p className="font-mono text-[11px] text-slate-500">{r.barang?.kode}</p>
      </div>
    ),
  },
  { key: 'keterangan', header: 'Keterangan', cell: (r) => r.keterangan || '-' },
  { key: 'referensi', header: 'Referensi', cell: (r) => <span className="font-mono text-xs">{r.referensi || '-'}</span> },
  {
    key: 'masuk',
    header: 'Masuk',
    cell: (r) => (r.qty_masuk ? <span className="font-semibold text-emerald-700">+{r.qty_masuk}</span> : '-'),
  },
  {
    key: 'keluar',
    header: 'Keluar',
    cell: (r) => (r.qty_keluar ? <span className="font-semibold text-rose-600">−{r.qty_keluar}</span> : '-'),
  },
  {
    key: 'saldo',
    header: 'Saldo',
    cell: (r) => (
      <span className="font-bold text-slate-900">
        {r.saldo} <span className="text-[11px] font-normal text-slate-500">{r.barang?.satuan}</span>
      </span>
    ),
  },
]

const inputClass =
  'rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-teal-500 focus:outline-none'

export function KartuStokPage() {
  const [barangId, setBarangId] = useState('')
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')

  const filterParams = {
    barang_id: barangId || undefined,
    dari: dari || undefined,
    sampai: sampai || undefined,
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Barang</label>
          <BarangSelect value={barangId} onChange={(v) => setBarangId(v)} placeholder="Semua barang" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500" htmlFor="ks-dari">
            Dari tanggal
          </label>
          <input id="ks-dari" type="date" value={dari} onChange={(e) => setDari(e.target.value)} className={`w-full ${inputClass}`} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500" htmlFor="ks-sampai">
            Sampai tanggal
          </label>
          <input
            id="ks-sampai"
            type="date"
            value={sampai}
            onChange={(e) => setSampai(e.target.value)}
            className={`w-full ${inputClass}`}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          disabled={!barangId && !dari && !sampai}
          onClick={() => {
            setBarangId('')
            setDari('')
            setSampai('')
          }}
        >
          <X className="h-4 w-4" />
          Reset
        </Button>
      </div>

      <ResourceListPage<Row>
        title="Kartu Stok"
        description="Riwayat keluar-masuk stok per barang: pembelian, penjualan, resep, konversi, produksi, dan stok opname."
        endpoint="/kartu-stok"
        queryKey="kartu-stok"
        columns={columns}
        enableCreate={false}
        enableEdit={false}
        enableDelete={false}
        filterParams={filterParams}
      />
    </div>
  )
}
