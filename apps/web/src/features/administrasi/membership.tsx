import { ResourceListPage, type FormField } from '@/shared/components/ResourceListPage'
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
  { key: 'kode', header: 'Kode Member', cell: (r) => <span className="font-mono font-bold text-teal-700">{r.kode}</span> },
  { key: 'pasien', header: 'Nama Pasien', cell: (r) => <span className="font-bold text-slate-900">{r.pasien?.nama || `Pasien #${r.pasien_id}`}</span> },
  { key: 'tipe', header: 'Tier / Level Member', cell: (r) => <span className="rounded bg-amber-50 border border-amber-200 px-2 py-1 font-bold text-amber-800 uppercase text-[11px]">{r.tipe || 'Silver'}</span> },
  { key: 'points', header: 'Poin Reward', cell: (r) => <span className="font-mono font-bold text-slate-900">{r.points} pts</span> },
  { key: 'status', header: 'Status Active', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const formFields: FormField[] = [
  { name: 'pasien_id', label: 'ID Pasien', type: 'number', required: true, placeholder: '1' },
  {
    name: 'tipe',
    label: 'Tier / Level Member',
    type: 'select',
    options: [
      { label: 'Bronze Member', value: 'Bronze' },
      { label: 'Silver Member', value: 'Silver' },
      { label: 'Gold Member', value: 'Gold' },
      { label: 'Platinum VIP', value: 'Platinum' },
    ],
  },
  { name: 'points', label: 'Saldo Poin Reward', type: 'number', placeholder: '0' },
]

export function MembershipPage() {
  return (
    <ResourceListPage<Membership>
      title="Membership & Keanggotaan Pasien"
      description="Pengaturan level keanggotaan member, akumulasi poin reward, dan keuntungan pasien"
      endpoint="/membership"
      queryKey="membership"
      columns={columns}
      createLabel="Tambah Membership"
      createFields={formFields}
      editFields={formFields}
      transformCreateBody={(v) => ({
        pasien_id: Number(v.pasien_id),
        tipe: v.tipe,
        points: Number(v.points || 0),
      })}
      transformEditBody={(v) => ({
        pasien_id: Number(v.pasien_id),
        tipe: v.tipe,
        points: Number(v.points || 0),
      })}
    />
  )
}
