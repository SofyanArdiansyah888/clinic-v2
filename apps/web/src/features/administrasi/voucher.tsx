import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { formatCurrency } from '@/shared/lib/formatters'

type Voucher = {
  id: number
  kode: string
  nama: string
  tipe_diskon?: string
  nilai_diskon: number
  is_active: boolean
}

const columns: Column<Voucher>[] = [
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

export function VoucherPage() {
  return (
    <ResourceListPage<Voucher>
      title="Voucher"
      description="Voucher diskon transaksi"
      endpoint="/voucher"
      queryKey="voucher"
      columns={columns}
      createLabel="Tambah Voucher"
      createFields={[
        { name: 'nama', label: 'Nama Voucher', required: true },
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
        { name: 'min_pembelian', label: 'Min. Pembelian', type: 'number' },
        { name: 'tanggal_mulai', label: 'Tanggal Mulai', type: 'date' },
        { name: 'tanggal_selesai', label: 'Tanggal Selesai', type: 'date' },
      ]}
      transformCreateBody={(v) => ({
        nama: v.nama,
        tipe_diskon: v.tipe_diskon,
        nilai_diskon: Number(v.nilai_diskon || 0),
        min_pembelian: Number(v.min_pembelian || 0),
        tanggal_mulai: v.tanggal_mulai || null,
        tanggal_selesai: v.tanggal_selesai || null,
      })}
    />
  )
}
