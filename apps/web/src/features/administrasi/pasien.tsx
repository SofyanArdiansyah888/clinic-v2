import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'

type Pasien = {
  id: number
  kode: string
  nama: string
  no_telp?: string
  email?: string
  jenis_kelamin?: string
  is_active: boolean
}

const columns: Column<Pasien>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => r.kode },
  { key: 'nama', header: 'Nama', cell: (r) => r.nama },
  { key: 'no_telp', header: 'No. Telp', cell: (r) => r.no_telp || '-' },
  { key: 'email', header: 'Email', cell: (r) => r.email || '-' },
  { key: 'jk', header: 'JK', cell: (r) => r.jenis_kelamin || '-' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

export function PasienPage() {
  return (
    <ResourceListPage<Pasien>
      title="Pasien"
      description="Master data pasien klinik"
      endpoint="/pasien"
      queryKey="pasien"
      columns={columns}
      createLabel="Tambah Pasien"
      createFields={[
        { name: 'nama', label: 'Nama', required: true },
        { name: 'no_telp', label: 'No. Telepon', type: 'tel' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'alamat', label: 'Alamat' },
        {
          name: 'jenis_kelamin',
          label: 'Jenis Kelamin',
          type: 'select',
          options: [
            { label: 'Laki-laki', value: 'L' },
            { label: 'Perempuan', value: 'P' },
          ],
        },
        { name: 'tanggal_lahir', label: 'Tanggal Lahir', type: 'date' },
      ]}
    />
  )
}
