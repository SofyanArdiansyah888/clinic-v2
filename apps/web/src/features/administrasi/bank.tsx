import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { MASTERS } from '@/shared/lib/masters'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'

type Bank = {
  id: number
  kode: string
  nama: string
  no_rekening?: string
  atas_nama?: string
  is_active: boolean
}

const columns: Column<Bank>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-rose-700">{r.kode}</span> },
  { key: 'nama', header: 'Nama Bank', cell: (r) => <span className="font-bold text-slate-900">{r.nama}</span> },
  { key: 'no_rekening', header: 'No. Rekening', cell: (r) => <span className="font-mono">{r.no_rekening || '-'}</span> },
  { key: 'atas_nama', header: 'Atas Nama', cell: (r) => r.atas_nama || '-' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const formFields = MASTERS.bank.fields

export function BankPage() {
  return (
    <ResourceListPage<Bank>
      title="Rekening Bank"
      description="Rekening untuk pembayaran transfer"
      endpoint="/bank"
      queryKey="bank"
      columns={columns}
      createLabel="Tambah Bank"
      createFields={formFields}
      editFields={formFields}
    />
  )
}
