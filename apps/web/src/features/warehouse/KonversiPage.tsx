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

export function KonversiPage() {
  return (
    <ResourceListPage<Row>
      title="Konversi Stok"
      description="Konversi antar satuan / item stok"
      endpoint="/konversi-stok"
      queryKey="konversi-stok"
      columns={columns}
      createLabel="Buat Konversi"
      createFields={[
        { name: 'tanggal', label: 'Tanggal', type: 'date', required: true },
        { name: 'barang_keluar_id', label: 'ID Barang Keluar', type: 'number', required: true },
        { name: 'qty_keluar', label: 'Qty Keluar', type: 'number', required: true },
        { name: 'barang_masuk_id', label: 'ID Barang Masuk', type: 'number', required: true },
        { name: 'qty_masuk', label: 'Qty Masuk', type: 'number', required: true },
        { name: 'keterangan', label: 'Keterangan' },
      ]}
      transformCreateBody={(v) => ({
        tanggal: v.tanggal || today,
        keterangan: v.keterangan || '',
        details: [
          { barang_id: Number(v.barang_keluar_id), qty: Number(v.qty_keluar), tipe: 'keluar' },
          { barang_id: Number(v.barang_masuk_id), qty: Number(v.qty_masuk), tipe: 'masuk' },
        ],
      })}
    />
  )
}
