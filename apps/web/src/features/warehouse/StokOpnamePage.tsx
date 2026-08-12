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

export function StokOpnamePage() {
  return (
    <ResourceListPage<Row>
      title="Stok Opname"
      description="Sesi physical count gudang"
      endpoint="/stok-opname"
      queryKey="stok-opname"
      columns={columns}
      createLabel="Buat Stok Opname"
      createFields={[
        { name: 'tanggal', label: 'Tanggal', type: 'date', required: true },
        { name: 'barang_id', label: 'ID Barang', type: 'number', required: true, placeholder: '1' },
        { name: 'stok_sistem', label: 'Stok Sistem', type: 'number', required: true },
        { name: 'stok_fisik', label: 'Stok Fisik', type: 'number', required: true },
        { name: 'keterangan', label: 'Keterangan' },
      ]}
      transformCreateBody={(v) => ({
        tanggal: v.tanggal || today,
        keterangan: v.keterangan || '',
        details: [
          {
            barang_id: Number(v.barang_id),
            stok_sistem: Number(v.stok_sistem || 0),
            stok_fisik: Number(v.stok_fisik || 0),
          },
        ],
      })}
    />
  )
}
