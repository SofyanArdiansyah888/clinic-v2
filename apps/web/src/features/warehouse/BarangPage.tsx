import { ResourceListPage } from '@/shared/components/ResourceListPage'
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
      title="Gudang / Barang"
      description="Master barang dan stok"
      endpoint="/barang"
      queryKey="barang"
      columns={columns}
      createLabel="Tambah Barang"
      createFields={[
        { name: 'nama', label: 'Nama', required: true },
        { name: 'kategori', label: 'Kategori' },
        { name: 'satuan', label: 'Satuan' },
        { name: 'harga_beli', label: 'Harga Beli', type: 'number' },
        { name: 'harga_jual', label: 'Harga Jual', type: 'number', required: true },
        { name: 'stok_minimal', label: 'Stok Minimal', type: 'number' },
        { name: 'stok_aktual', label: 'Stok Awal', type: 'number' },
        { name: 'lokasi_barang', label: 'Lokasi' },
      ]}
      transformCreateBody={(v) => ({
        nama: v.nama,
        kategori: v.kategori,
        satuan: v.satuan,
        harga_beli: Number(v.harga_beli || 0),
        harga_jual: Number(v.harga_jual || 0),
        stok_minimal: Number(v.stok_minimal || 0),
        stok_aktual: Number(v.stok_aktual || 0),
        lokasi_barang: v.lokasi_barang,
      })}
    />
  )
}
