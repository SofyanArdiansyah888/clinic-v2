import { ResourceListPage, type FormField } from '@/shared/components/ResourceListPage'
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
  { key: 'nama', header: 'Nama Supplier / Vendor', cell: (r) => <span className="font-bold text-slate-900">{r.nama}</span> },
  { key: 'pic', header: 'PIC / Kontak', cell: (r) => r.pic || '-' },
  { key: 'no_telp', header: 'No. Telp', cell: (r) => <span className="font-mono">{r.no_telp || '-'}</span> },
  { key: 'email', header: 'Email', cell: (r) => r.email || '-' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const formFields: FormField[] = [
  { name: 'nama', label: 'Nama Supplier / Perusahaan Vendor', required: true },
  { name: 'pic', label: 'Nama PIC / Person in Charge' },
  { name: 'no_telp', label: 'No. Telepon / WhatsApp', type: 'tel' },
  { name: 'email', label: 'Email Kantor', type: 'email' },
  { name: 'alamat', label: 'Alamat Kantor / Gudang Supplier', type: 'textarea' },
]

export function SupplierPage() {
  return (
    <ResourceListPage<Supplier>
      title="Supplier & Vendor"
      description="Master data pemasok obat, alat kesehatan, dan perlengkapan klinik"
      endpoint="/supplier"
      queryKey="supplier"
      columns={columns}
      createLabel="Tambah Supplier"
      createFields={formFields}
      editFields={formFields}
    />
  )
}
