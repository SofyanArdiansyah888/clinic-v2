import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { formatCurrency, formatDate } from '@/shared/lib/formatters'

type Row = {
  id: number
  kode: string
  tanggal: string
  status: string
  total_harga?: number
  pasien?: { nama?: string }
}

const today = new Date().toISOString().slice(0, 10)

const columns: Column<Row>[] = [
  { key: 'kode', header: 'Invoice', cell: (r) => <span className="font-mono font-bold text-teal-700">{r.kode}</span> },
  { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal) },
  { key: 'pasien', header: 'Pasien', cell: (r) => r.pasien?.nama || '-' },
  { key: 'total', header: 'Total', cell: (r) => formatCurrency(r.total_harga ?? 0) },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
]

export function PembayaranPerawatanPage() {
  return (
    <ResourceListPage<Row>
      title="Kasir — Pembayaran Perawatan"
      description="Tagihan perawatan pasien"
      endpoint="/penjualan"
      queryKey="pembayaran-perawatan"
      columns={columns}
      createLabel="Buat Tagihan"
      createFields={[
        { name: 'pasien_id', label: 'ID Pasien', type: 'number', required: true, placeholder: '1' },
        { name: 'staff_id', label: 'ID Staff Kasir', type: 'number', required: true, placeholder: '2' },
        { name: 'tanggal', label: 'Tanggal', type: 'date', required: true },
        { name: 'barang_id', label: 'ID Barang / Item', type: 'number', required: true, placeholder: '1' },
        { name: 'qty', label: 'Qty', type: 'number', required: true, placeholder: '1' },
        { name: 'harga_jual', label: 'Harga', type: 'number', required: true, placeholder: '150000' },
        {
          name: 'status',
          label: 'Status Bayar',
          type: 'select',
          options: [
            { label: 'Draft / Belum Bayar', value: 'draft' },
            { label: 'Paid / Lunas', value: 'paid' },
          ],
        },
      ]}
      transformCreateBody={(v) => {
        const qty = Number(v.qty || 1)
        const harga = Number(v.harga_jual || 0)
        return {
          pasien_id: Number(v.pasien_id),
          staff_id: Number(v.staff_id),
          tanggal: v.tanggal || today,
          status: v.status || 'draft',
          keterangan: 'Pembayaran perawatan',
          details: [{ barang_id: Number(v.barang_id), qty, harga_jual: harga }],
        }
      }}
    />
  )
}
