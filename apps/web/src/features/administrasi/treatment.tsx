import { ResourceListPage, type FormField } from '@/shared/components/ResourceListPage'
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
  { key: 'nama', header: 'Nama Layanan / Treatment', cell: (r) => <span className="font-bold text-slate-900">{r.nama}</span> },
  { key: 'kategori', header: 'Kategori', cell: (r) => <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">{r.kategori || 'Umum'}</span> },
  { key: 'harga', header: 'Harga Tarif', cell: (r) => <span className="font-semibold text-slate-900">{formatCurrency(r.harga)}</span> },
  { key: 'durasi', header: 'Durasi', cell: (r) => (r.durasi ? `${r.durasi} menit` : '-') },
  {
    key: 'sesi',
    header: 'Sesi Paket',
    cell: (r) => (r.kategori?.toLowerCase().includes('paket') ? `${r.sesi_paket || 1}x` : '-'),
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const formFields: FormField[] = [
  { name: 'nama', label: 'Nama Layanan / Treatment', required: true },
  {
    name: 'kategori',
    label: 'Kategori Treatment',
    type: 'select',
    options: [
      { label: 'Facial & Skin Care', value: 'Skin Care' },
      { label: 'Laser & Light Therapy', value: 'Laser' },
      { label: 'Injeksi & Anti-Aging', value: 'Injeksi' },
      { label: 'Body Treatment & Slimming', value: 'Body' },
      { label: 'Konsultasi Medis', value: 'Konsultasi' },
      { label: 'Tindakan Bedah Ringan', value: 'Tindakan' },
      // Treatments in this category are sold as a package of sessions (see Jumlah Sesi Paket).
      { label: 'Paket Perawatan (beberapa sesi)', value: 'Paket' },
    ],
  },
  { name: 'harga', label: 'Harga Tarif (Rp)', type: 'number', required: true },
  { name: 'durasi', label: 'Durasi Pengerjaan (Menit)', type: 'number', placeholder: '45' },
  { name: 'sesi_paket', label: 'Jumlah Sesi Paket (khusus kategori Paket)', type: 'number', placeholder: '5' },
  { name: 'komisi_dokter', label: 'Komisi Dokter (Rp)', type: 'number', placeholder: '0' },
  { name: 'komisi_terapis', label: 'Komisi Beautician/Terapis (Rp)', type: 'number', placeholder: '0' },
  { name: 'deskripsi', label: 'Deskripsi & Catatan Treatment', type: 'textarea' },
]

export function TreatmentPage() {
  return (
    <ResourceListPage<Treatment>
      title="Treatment & Layanan Klinik"
      description="Master katalog tindakan medis, perawatan estetika, dan komisi staf"
      endpoint="/treatment"
      queryKey="treatment"
      columns={columns}
      createLabel="Tambah Treatment"
      createFields={formFields}
      editFields={formFields}
    />
  )
}
