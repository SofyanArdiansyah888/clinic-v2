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

const columns: Column<Row>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => r.kode },
  { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal) },
  { key: 'pasien', header: 'Pasien', cell: (r) => r.pasien?.nama || '-' },
  { key: 'total', header: 'Total', cell: (r) => formatCurrency(r.total_harga) },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
]

const riwayatFilters = { status: 'selesai' }

export function RiwayatPage() {
  return (
    <ResourceListPage<Row>
      title="Riwayat Perawatan"
      description="Riwayat perawatan pasien"
      endpoint="/perawatan"
      queryKey="perawatan-riwayat"
      columns={columns}
      enableCreate={false}
      filterParams={riwayatFilters}
    />
  )
}
