import { ResourceListPage, type FormField } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'

type Cabang = {
  id: number
  kode: string
  nama: string
  no_telp?: string
  alamat?: string
  is_active: boolean
}

const columns: Column<Cabang>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-rose-700">{r.kode}</span> },
  { key: 'nama', header: 'Nama Cabang', cell: (r) => <span className="font-bold text-slate-900">{r.nama}</span> },
  { key: 'no_telp', header: 'No. Telp', cell: (r) => <span className="font-mono">{r.no_telp || '-'}</span> },
  { key: 'alamat', header: 'Alamat', cell: (r) => r.alamat || '-' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const formFields: FormField[] = [
  { name: 'nama', label: 'Nama Unit Cabang', required: true },
  { name: 'no_telp', label: 'No. Telepon', type: 'tel' },
  { name: 'alamat', label: 'Alamat Cabang', type: 'textarea' },
]

export function CabangPage() {
  return (
    <ResourceListPage<Cabang>
      title="Unit Cabang Klinik"
      description="Daftar unit cabang dan outlet operasional klinik"
      endpoint="/cabang"
      queryKey="cabang"
      columns={columns}
      createLabel="Tambah Cabang"
      createFields={formFields}
      editFields={formFields}
    />
  )
}
