import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'

type Supplier = {
  id: number
  kode: string
  nama: string
  no_telp?: string
  email?: string
  is_active: boolean
}

const columns: Column<Supplier>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-teal-700">{r.kode}</span> },
  { key: 'nama', header: 'Nama', cell: (r) => <span className="font-bold text-slate-900">{r.nama}</span> },
  { key: 'no_telp', header: 'No. Telp', cell: (r) => r.no_telp || '-' },
  { key: 'email', header: 'Email', cell: (r) => r.email || '-' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

export function SupplierPage() {
  return (
    <ResourceListPage<Supplier>
      title="Supplier"
      description="Master data supplier klinik"
      endpoint="/supplier"
      queryKey="supplier"
      columns={columns}
      createLabel="Tambah Supplier"
      createFields={[
        { name: 'nama', label: 'Nama Supplier', required: true },
        { name: 'no_telp', label: 'No. Telepon', type: 'tel' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'alamat', label: 'Alamat' },
      ]}
    />
  )
}
