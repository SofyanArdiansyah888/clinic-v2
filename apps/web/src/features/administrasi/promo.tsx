import { ResourceListPage, type FormField } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { formatCurrency } from '@/shared/lib/formatters'

type Promo = {
  id: number
  kode: string
  nama: string
  tipe_diskon?: string
  nilai_diskon: number
  deskripsi?: string
  tanggal_mulai?: string
  tanggal_selesai?: string
  is_active: boolean
}

const columns: Column<Promo>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-rose-700">{r.kode}</span> },
  { key: 'nama', header: 'Nama Promo', cell: (r) => <span className="font-bold text-slate-900">{r.nama}</span> },
  { key: 'tipe', header: 'Tipe', cell: (r) => (r.tipe_diskon === 'percent' ? 'Persentase (%)' : 'Nominal (Rp)') },
  {
    key: 'nilai',
    header: 'Nilai',
    cell: (r) =>
      r.tipe_diskon === 'percent' ? `${r.nilai_diskon}%` : formatCurrency(r.nilai_diskon),
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const formFields: FormField[] = [
  { name: 'nama', label: 'Nama Promo', required: true },
  { name: 'deskripsi', label: 'Deskripsi', type: 'textarea' },
  {
    name: 'tipe_diskon',
    label: 'Tipe Diskon',
    type: 'select',
    options: [
      { label: 'Nominal (Rp)', value: 'nominal' },
      { label: 'Persentase (%)', value: 'percent' },
    ],
  },
  { name: 'nilai_diskon', label: 'Nilai Diskon', type: 'number', required: true },
  { name: 'tanggal_mulai', label: 'Tanggal Mulai', type: 'date' },
  { name: 'tanggal_selesai', label: 'Tanggal Selesai', type: 'date' },
]

export function PromoPage() {
  return (
    <ResourceListPage<Promo>
      title="Promo"
      description="Diskon perawatan dan produk"
      endpoint="/promo"
      queryKey="promo"
      columns={columns}
      createLabel="Tambah Promo"
      createFields={formFields}
      editFields={formFields}
      transformCreateBody={(v) => ({
        nama: v.nama,
        deskripsi: v.deskripsi,
        tipe_diskon: v.tipe_diskon,
        nilai_diskon: Number(v.nilai_diskon || 0),
        tanggal_mulai: v.tanggal_mulai || null,
        tanggal_selesai: v.tanggal_selesai || null,
      })}
      transformEditBody={(v) => ({
        nama: v.nama,
        deskripsi: v.deskripsi,
        tipe_diskon: v.tipe_diskon,
        nilai_diskon: Number(v.nilai_diskon || 0),
        tanggal_mulai: v.tanggal_mulai || null,
        tanggal_selesai: v.tanggal_selesai || null,
      })}
    />
  )
}
