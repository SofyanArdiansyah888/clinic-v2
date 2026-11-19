import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { MASTERS } from '@/shared/lib/masters'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'

type Supplier = {
  id: number
  kode: string
  nama: string
  no_telp?: string
  email?: string
  alamat?: string
  pic?: string
  is_active: boolean
}

const columns: Column<Supplier>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-rose-700">{r.kode}</span> },
  { key: 'nama', header: 'Nama Supplier', cell: (r) => <span className="font-bold text-slate-900">{r.nama}</span> },
  { key: 'pic', header: 'PIC', cell: (r) => r.pic || '-' },
  { key: 'no_telp', header: 'No. Telp', cell: (r) => <span className="font-mono">{r.no_telp || '-'}</span> },
  { key: 'email', header: 'Email', cell: (r) => r.email || '-' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const formFields = MASTERS.supplier.fields

export function SupplierPage() {
  return (
    <ResourceListPage<Supplier>
      title="Supplier"
      description="Pemasok obat dan alat kesehatan"
      endpoint="/supplier"
      queryKey="supplier"
      columns={columns}
      createLabel="Tambah Supplier"
      createFields={formFields}
      editFields={formFields}
    />
  )
}
