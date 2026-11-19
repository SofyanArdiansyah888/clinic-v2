import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { MASTERS } from '@/shared/lib/masters'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { formatCurrency } from '@/shared/lib/formatters'

type Treatment = {
  id: number
  kode: string
  nama: string
  kategori?: string
  harga: number
  durasi?: number
  sesi_paket?: number
  komisi_dokter?: number
  komisi_terapis?: number
  deskripsi?: string
  is_active: boolean
}

const columns: Column<Treatment>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-rose-700">{r.kode}</span> },
  { key: 'nama', header: 'Nama Treatment', cell: (r) => <span className="font-bold text-slate-900">{r.nama}</span> },
  { key: 'kategori', header: 'Kategori', cell: (r) => <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">{r.kategori || 'Umum'}</span> },
  { key: 'harga', header: 'Harga', cell: (r) => <span className="font-semibold text-slate-900">{formatCurrency(r.harga)}</span> },
  { key: 'durasi', header: 'Durasi', cell: (r) => (r.durasi ? `${r.durasi} menit` : '-') },
  {
    key: 'sesi',
    header: 'Sesi',
    cell: (r) => (r.kategori?.toLowerCase().includes('paket') ? `${r.sesi_paket || 1}x` : '-'),
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const formFields = MASTERS.treatment.fields

export function TreatmentPage() {
  return (
    <ResourceListPage<Treatment>
      title="Treatment"
      description="Katalog layanan, tarif dan komisi"
      endpoint="/treatment"
      queryKey="treatment"
      columns={columns}
      createLabel="Tambah Treatment"
      createFields={formFields}
      editFields={formFields}
    />
  )
}
