import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'

type Perusahaan = {
  id: number
  kode: string
  nama: string
  no_telp?: string
  email?: string
  is_active: boolean
}

const columns: Column<Perusahaan>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-teal-700">{r.kode}</span> },
  { key: 'nama', header: 'Nama', cell: (r) => <span className="font-bold text-slate-900">{r.nama}</span> },
  { key: 'no_telp', header: 'No. Telp', cell: (r) => r.no_telp || '-' },
  { key: 'email', header: 'Email', cell: (r) => r.email || '-' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

export function PerusahaanPage() {
  return (
    <ResourceListPage<Perusahaan>
      title="Perusahaan"
      description="Data perusahaan / badan usaha"
      endpoint="/perusahaan"
      queryKey="perusahaan"
      columns={columns}
      createLabel="Tambah Perusahaan"
      createFields={[
        { name: 'nama', label: 'Nama Perusahaan', required: true },
        { name: 'no_telp', label: 'No. Telepon', type: 'tel' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'alamat', label: 'Alamat' },
      ]}
    />
  )
}
