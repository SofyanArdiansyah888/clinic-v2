import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { formatDate } from '@/shared/lib/formatters'

type Row = {
  id: number
  kode: string
  tanggal: string
  status: string
  pasien?: { nama?: string }
}

const columns: Column<Row>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => r.kode },
  { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal) },
  { key: 'pasien', header: 'Pasien', cell: (r) => r.pasien?.nama || '-' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
]

export function ResepPage() {
  return (
    <ResourceListPage<Row>
      title="Resep"
      description="Resep dari perawatan untuk depo"
      endpoint="/perawatan"
      queryKey="depo-resep"
      columns={columns}
      enableCreate={false}
    />
  )
}
