import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { formatCurrency } from '@/shared/lib/formatters'

type Promo = {
  id: number
  kode: string
  nama: string
  tipe_diskon?: string
  nilai_diskon: number
  is_active: boolean
}

const columns: Column<Promo>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-teal-700">{r.kode}</span> },
  { key: 'nama', header: 'Nama', cell: (r) => <span className="font-bold text-slate-900">{r.nama}</span> },
  { key: 'tipe', header: 'Tipe', cell: (r) => r.tipe_diskon || '-' },
  {
    key: 'nilai',
    header: 'Nilai',
    cell: (r) =>
      r.tipe_diskon === 'percent' ? `${r.nilai_diskon}%` : formatCurrency(r.nilai_diskon),
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

export function PromoPage() {
  return (
    <ResourceListPage<Promo>
      title="Promo"
      description="Promo perawatan / produk"
      endpoint="/promo"
      queryKey="promo"
      columns={columns}
      createLabel="Tambah Promo"
      createFields={[
        { name: 'nama', label: 'Nama Promo', required: true },
        { name: 'deskripsi', label: 'Deskripsi' },
        {
          name: 'tipe_diskon',
          label: 'Tipe Diskon',
          type: 'select',
          options: [
            { label: 'Nominal (Rp)', value: 'nominal' },
            { label: 'Persen (%)', value: 'percent' },
          ],
        },
        { name: 'nilai_diskon', label: 'Nilai Diskon', type: 'number', required: true },
        { name: 'tanggal_mulai', label: 'Tanggal Mulai', type: 'date' },
        { name: 'tanggal_selesai', label: 'Tanggal Selesai', type: 'date' },
      ]}
      transformCreateBody={(v) => ({
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
