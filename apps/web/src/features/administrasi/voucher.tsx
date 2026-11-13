import { ResourceListPage, type FormField } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { formatCurrency } from '@/shared/lib/formatters'

type Voucher = {
  id: number
  kode: string
  nama: string
  tipe_diskon?: string
  nilai_diskon: number
  min_pembelian?: number
  tanggal_mulai?: string
  tanggal_selesai?: string
  is_active: boolean
}

const columns: Column<Voucher>[] = [
  { key: 'kode', header: 'Kode Voucher', cell: (r) => <span className="font-mono font-bold text-rose-700">{r.kode}</span> },
  { key: 'nama', header: 'Nama Voucher', cell: (r) => <span className="font-bold text-slate-900">{r.nama}</span> },
  { key: 'tipe', header: 'Tipe Diskon', cell: (r) => (r.tipe_diskon === 'percent' ? 'Persentase (%)' : 'Nominal (Rp)') },
  {
    key: 'nilai',
    header: 'Nilai Diskon',
    cell: (r) =>
      r.tipe_diskon === 'percent' ? `${r.nilai_diskon}%` : formatCurrency(r.nilai_diskon),
  },
  {
    key: 'min',
    header: 'Min. Transaksi',
    cell: (r) => (r.min_pembelian ? formatCurrency(r.min_pembelian) : '-'),
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const formFields: FormField[] = [
  { name: 'nama', label: 'Nama Voucher', required: true },
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
  { name: 'min_pembelian', label: 'Min. Pembelian Transaksi (Rp)', type: 'number', placeholder: '0' },
  { name: 'tanggal_mulai', label: 'Tanggal Berlaku Mulai', type: 'date' },
  { name: 'tanggal_selesai', label: 'Tanggal Kadaluarsa', type: 'date' },
]

export function VoucherPage() {
  return (
    <ResourceListPage<Voucher>
      title="Voucher Diskon Transaksi"
      description="Pengaturan kupon voucher dan potongan harga pembayaran pasien"
      endpoint="/voucher"
      queryKey="voucher"
      columns={columns}
      createLabel="Tambah Voucher"
      createFields={formFields}
      editFields={formFields}
      transformCreateBody={(v) => ({
        nama: v.nama,
        tipe_diskon: v.tipe_diskon,
        nilai_diskon: Number(v.nilai_diskon || 0),
        min_pembelian: Number(v.min_pembelian || 0),
        tanggal_mulai: v.tanggal_mulai || null,
        tanggal_selesai: v.tanggal_selesai || null,
      })}
      transformEditBody={(v) => ({
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
