import { ResourceListPage, type FormField } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'

type Perusahaan = {
  id: number
  kode: string
  nama: string
  no_telp?: string
  email?: string
  alamat?: string
  is_active: boolean
}

const columns: Column<Perusahaan>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-rose-700">{r.kode}</span> },
  { key: 'nama', header: 'Nama Perusahaan / Mitra', cell: (r) => <span className="font-bold text-slate-900">{r.nama}</span> },
  { key: 'no_telp', header: 'No. Telp', cell: (r) => <span className="font-mono">{r.no_telp || '-'}</span> },
  { key: 'email', header: 'Email', cell: (r) => r.email || '-' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const formFields: FormField[] = [
  { name: 'nama', label: 'Nama Perusahaan / Instansi Mitra', required: true },
  { name: 'no_telp', label: 'No. Telepon', type: 'tel' },
  { name: 'email', label: 'Email Resmi', type: 'email' },
  { name: 'alamat', label: 'Alamat Perusahaan', type: 'textarea' },
]

export function PerusahaanPage() {
  return (
    <ResourceListPage<Perusahaan>
      title="Perusahaan & Corporate Partner"
      description="Data instansi / perusahaan kerja sama penjaminan medis"
      endpoint="/perusahaan"
      queryKey="perusahaan"
      columns={columns}
      createLabel="Tambah Perusahaan"
      createFields={formFields}
      editFields={formFields}
    />
  )
}
