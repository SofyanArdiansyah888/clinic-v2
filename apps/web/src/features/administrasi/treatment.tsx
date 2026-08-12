import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { formatCurrency } from '@/shared/lib/formatters'

type Treatment = {
  id: number
  kode: string
  nama: string
  kategori?: string
  harga: number
  durasi?: number
  is_active: boolean
}

const columns: Column<Treatment>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => r.kode },
  { key: 'nama', header: 'Nama', cell: (r) => r.nama },
  { key: 'kategori', header: 'Kategori', cell: (r) => r.kategori || '-' },
  { key: 'harga', header: 'Harga', cell: (r) => formatCurrency(r.harga) },
  { key: 'durasi', header: 'Durasi (mnt)', cell: (r) => r.durasi ?? '-' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

export function TreatmentPage() {
  return (
    <ResourceListPage<Treatment>
      title="Treatment"
      description="Master tindakan / perawatan"
      endpoint="/treatment"
      queryKey="treatment"
      columns={columns}
      createLabel="Tambah Treatment"
      createFields={[
        { name: 'nama', label: 'Nama', required: true },
        { name: 'kategori', label: 'Kategori' },
        { name: 'harga', label: 'Harga', type: 'number', required: true },
        { name: 'durasi', label: 'Durasi (menit)', type: 'number' },
        { name: 'deskripsi', label: 'Deskripsi' },
      ]}
    />
  )
}
