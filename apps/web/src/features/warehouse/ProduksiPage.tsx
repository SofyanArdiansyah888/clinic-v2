import { ResourceListPage } from '@/shared/components/ResourceListPage'
import type { Column } from '@/shared/components/DataTable'
import { formatDate } from '@/shared/lib/formatters'

type Row = {
  id: number
  kode: string
  tanggal: string
  keterangan?: string
}

const today = new Date().toISOString().slice(0, 10)

const columns: Column<Row>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-teal-700">{r.kode}</span> },
  { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal) },
  { key: 'keterangan', header: 'Keterangan', cell: (r) => r.keterangan || '-' },
]

export function ProduksiPage() {
  return (
    <ResourceListPage<Row>
      title="Produksi Barang"
      description="Produksi / racikan barang"
      endpoint="/produksi-barang"
      queryKey="produksi-barang"
      columns={columns}
      createLabel="Buat Produksi"
      createFields={[
        { name: 'tanggal', label: 'Tanggal', type: 'date', required: true },
        { name: 'bahan_id', label: 'ID Bahan (keluar)', type: 'number', required: true },
        { name: 'qty_bahan', label: 'Qty Bahan', type: 'number', required: true },
        { name: 'hasil_id', label: 'ID Hasil (masuk)', type: 'number', required: true },
        { name: 'qty_hasil', label: 'Qty Hasil', type: 'number', required: true },
        { name: 'keterangan', label: 'Keterangan' },
      ]}
      transformCreateBody={(v) => ({
        tanggal: v.tanggal || today,
        keterangan: v.keterangan || '',
        details: [
          { barang_id: Number(v.bahan_id), qty: Number(v.qty_bahan), tipe: 'keluar' },
          { barang_id: Number(v.hasil_id), qty: Number(v.qty_hasil), tipe: 'masuk' },
        ],
      })}
    />
  )
}
