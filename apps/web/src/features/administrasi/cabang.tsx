import { ResourceListPage, type FormField } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'

type Cabang = {
  id: number
  kode: string
  nama: string
  no_telp?: string
  alamat?: string
  singkatan?: string
  is_utama?: boolean
  is_active: boolean
}

const columns: Column<Cabang>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-rose-700">{r.kode}</span> },
  {
    key: 'nama',
    header: 'Nama Cabang',
    cell: (r) => (
      <span className="flex items-center gap-2 font-bold text-slate-900">
        {r.nama}
        {r.is_utama ? <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">Utama</span> : null}
      </span>
    ),
  },
  { key: 'singkatan', header: 'Singkatan', cell: (r) => <span className="font-mono font-bold">{r.singkatan || '-'}</span> },
  { key: 'no_telp', header: 'No. Telp', cell: (r) => <span className="font-mono">{r.no_telp || '-'}</span> },
  { key: 'alamat', header: 'Alamat', cell: (r) => r.alamat || '-' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const formFields: FormField[] = [
  { name: 'nama', label: 'Nama Cabang', required: true },
  { name: 'singkatan', label: 'Singkatan (prefix nomor dokumen)', placeholder: 'mis. JKS — kosongkan untuk dibuat otomatis' },
  { name: 'is_utama', label: 'Cabang utama', type: 'boolean' },
  { name: 'no_telp', label: 'No. Telepon', type: 'tel' },
  { name: 'alamat', label: 'Alamat', type: 'textarea' },
]

export function CabangPage() {
  return (
    <ResourceListPage<Cabang>
      title="Cabang"
      endpoint="/cabang"
      queryKey="cabang"
      columns={columns}
      createLabel="Tambah Cabang"
      createFields={formFields}
      editFields={formFields}
    />
  )
}
