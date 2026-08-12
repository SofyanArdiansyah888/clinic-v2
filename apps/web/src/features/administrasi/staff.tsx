import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'

type Staff = {
  id: number
  kode: string
  nama: string
  jabatan?: string
  no_telp?: string
  email?: string
  is_active: boolean
}

const columns: Column<Staff>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => r.kode },
  { key: 'nama', header: 'Nama', cell: (r) => r.nama },
  { key: 'jabatan', header: 'Jabatan', cell: (r) => r.jabatan || '-' },
  { key: 'no_telp', header: 'No. Telp', cell: (r) => r.no_telp || '-' },
  { key: 'email', header: 'Email', cell: (r) => r.email || '-' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

export function StaffPage() {
  return (
    <ResourceListPage<Staff>
      title="Staff"
      description="Data tenaga medis dan karyawan"
      endpoint="/staff"
      queryKey="staff"
      columns={columns}
      createLabel="Tambah Staff"
      createFields={[
        { name: 'nama', label: 'Nama', required: true },
        { name: 'jabatan', label: 'Jabatan' },
        { name: 'no_telp', label: 'No. Telepon', type: 'tel' },
        { name: 'email', label: 'Email', type: 'email' },
      ]}
    />
  )
}
