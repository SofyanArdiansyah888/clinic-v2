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
}

const today = new Date().toISOString().slice(0, 10)

const columns: Column<Row>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-teal-700">{r.kode}</span> },
  { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal) },
  { key: 'total', header: 'Total', cell: (r) => formatCurrency(r.total_harga ?? 0) },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
]

export function PenjualanLangsungPage() {
  return (
    <ResourceListPage<Row>
      title="Depo — Penjualan Langsung"
      description="Penjualan langsung tanpa resep"
      endpoint="/penjualan"
      queryKey="depo-langsung"
      columns={columns}
      createLabel="Penjualan Langsung"
      createFields={[
        { name: 'pasien_id', label: 'ID Pasien', type: 'number', required: true, placeholder: '1' },
        { name: 'staff_id', label: 'ID Staff Depo', type: 'number', required: true, placeholder: '2' },
        { name: 'tanggal', label: 'Tanggal', type: 'date', required: true },
        { name: 'barang_id', label: 'ID Barang', type: 'number', required: true, placeholder: '1' },
        { name: 'qty', label: 'Qty', type: 'number', required: true, placeholder: '1' },
        { name: 'harga_jual', label: 'Harga', type: 'number', required: true },
      ]}
      transformCreateBody={(v) => {
        const qty = Number(v.qty || 1)
        const harga = Number(v.harga_jual || 0)
        return {
          pasien_id: Number(v.pasien_id),
          staff_id: Number(v.staff_id),
          tanggal: v.tanggal || today,
          status: 'paid',
          keterangan: 'Depo penjualan langsung',
          details: [{ barang_id: Number(v.barang_id), qty, harga_jual: harga }],
        }
      }}
    />
  )
}
