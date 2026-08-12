import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'

type Membership = {
  id: number
  kode: string
  pasien_id: number
  tipe?: string
  points: number
  is_active: boolean
  pasien?: { nama?: string }
}

const columns: Column<Membership>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-teal-700">{r.kode}</span> },
  { key: 'pasien', header: 'Pasien', cell: (r) => r.pasien?.nama || `#${r.pasien_id}` },
  { key: 'tipe', header: 'Tipe', cell: (r) => r.tipe || '-' },
  { key: 'points', header: 'Poin', cell: (r) => <span className="font-mono font-bold">{r.points}</span> },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

export function MembershipPage() {
  return (
    <ResourceListPage<Membership>
      title="Membership"
      description="Keanggotaan pasien"
      endpoint="/membership"
      queryKey="membership"
      columns={columns}
      createLabel="Tambah Membership"
      createFields={[
        { name: 'pasien_id', label: 'ID Pasien', type: 'number', required: true, placeholder: '1' },
        { name: 'tipe', label: 'Tipe', placeholder: 'silver / gold' },
        { name: 'points', label: 'Poin Awal', type: 'number', placeholder: '0' },
      ]}
      transformCreateBody={(v) => ({
        pasien_id: Number(v.pasien_id),
        tipe: v.tipe,
        points: Number(v.points || 0),
      })}
    />
  )
}
