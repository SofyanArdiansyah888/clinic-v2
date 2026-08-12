import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'

type User = {
  id: number
  name: string
  username: string
  email: string
  role: string
  is_active: boolean
}

const columns: Column<User>[] = [
  { key: 'name', header: 'Nama', cell: (r) => <span className="font-bold text-slate-900">{r.name}</span> },
  { key: 'username', header: 'Username', cell: (r) => <span className="font-mono">{r.username}</span> },
  { key: 'email', header: 'Email', cell: (r) => r.email },
  { key: 'role', header: 'Role', cell: (r) => r.role },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

export function UserPage() {
  return (
    <ResourceListPage<User>
      title="User Akses"
      description="Akun login staf klinik"
      endpoint="/user"
      queryKey="user"
      columns={columns}
      createLabel="Tambah User"
      createFields={[
        { name: 'name', label: 'Nama Lengkap', required: true },
        { name: 'username', label: 'Username', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        {
          name: 'role',
          label: 'Role',
          type: 'select',
          options: [
            { label: 'Admin', value: 'admin' },
            { label: 'Staff', value: 'staff' },
            { label: 'Doctor', value: 'doctor' },
          ],
        },
      ]}
    />
  )
}
