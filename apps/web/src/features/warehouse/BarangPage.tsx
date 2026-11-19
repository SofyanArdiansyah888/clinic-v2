import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { MASTERS } from '@/shared/lib/masters'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { formatCurrency } from '@/shared/lib/formatters'

type Row = {
  id: number
  kode: string
  nama: string
  kategori?: string
  satuan?: string
  harga_jual: number
  stok_aktual: number
  is_active: boolean
}

const columns: Column<Row>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => r.kode },
  { key: 'nama', header: 'Nama', cell: (r) => r.nama },
  { key: 'kategori', header: 'Kategori', cell: (r) => r.kategori || '-' },
  { key: 'satuan', header: 'Satuan', cell: (r) => r.satuan || '-' },
  { key: 'harga', header: 'Harga Jual', cell: (r) => formatCurrency(r.harga_jual) },
  { key: 'stok', header: 'Stok', cell: (r) => r.stok_aktual },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

export function BarangPage() {
  return (
    <ResourceListPage<Row>
      title="Barang"
      description="Master barang dan stok"
      endpoint="/barang"
      queryKey="barang"
      columns={columns}
      createLabel="Tambah Barang"
      createFields={MASTERS.barang.fields}
    />
  )
}
