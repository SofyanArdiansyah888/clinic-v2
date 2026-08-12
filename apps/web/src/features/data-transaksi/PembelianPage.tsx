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
  supplier?: { nama?: string }
}

const today = new Date().toISOString().slice(0, 10)

const columns: Column<Row>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-teal-700">{r.kode}</span> },
  { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal) },
  { key: 'supplier', header: 'Supplier', cell: (r) => r.supplier?.nama || '-' },
  { key: 'total', header: 'Total', cell: (r) => formatCurrency(r.total_harga ?? 0) },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
]

export function PembelianPage() {
  return (
    <ResourceListPage<Row>
      title="Data Pembelian"
      description="Pembelian barang dari supplier"
      endpoint="/pembelian"
      queryKey="pembelian"
      columns={columns}
      createLabel="Buat Pembelian"
      createFields={[
        { name: 'supplier_id', label: 'ID Supplier', type: 'number', required: true, placeholder: '1' },
        { name: 'staff_id', label: 'ID Staff', type: 'number', required: true, placeholder: '1' },
        { name: 'tanggal', label: 'Tanggal', type: 'date', required: true },
        { name: 'barang_id', label: 'ID Barang', type: 'number', required: true, placeholder: '1' },
        { name: 'qty', label: 'Qty', type: 'number', required: true, placeholder: '10' },
        { name: 'harga_beli', label: 'Harga Beli', type: 'number', required: true, placeholder: '50000' },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { label: 'Draft', value: 'draft' },
            { label: 'Received', value: 'received' },
          ],
        },
        { name: 'keterangan', label: 'Keterangan' },
      ]}
      transformCreateBody={(v) => {
        const qty = Number(v.qty || 1)
        const harga = Number(v.harga_beli || 0)
        return {
          supplier_id: Number(v.supplier_id),
          staff_id: Number(v.staff_id),
          tanggal: v.tanggal || today,
          status: v.status || 'draft',
          keterangan: v.keterangan || '',
          details: [
            {
              barang_id: Number(v.barang_id),
              qty,
              harga_beli: harga,
            },
          ],
        }
      }}
    />
  )
}
