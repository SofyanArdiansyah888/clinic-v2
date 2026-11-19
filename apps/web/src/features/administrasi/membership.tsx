import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/shared/api/client'
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
  { key: 'kode', header: 'Kode Member', cell: (r) => <span className="font-mono font-bold text-rose-700">{r.kode}</span> },
  { key: 'pasien', header: 'Nama Pasien', cell: (r) => <span className="font-bold text-slate-900">{r.pasien?.nama || `Pasien #${r.pasien_id}`}</span> },
  { key: 'tipe', header: 'Tier', cell: (r) => <span className="rounded bg-amber-50 border border-amber-200 px-2 py-1 font-bold text-amber-800 uppercase text-[11px]">{r.tipe || 'Silver'}</span> },
  { key: 'points', header: 'Poin', cell: (r) => <span className="font-mono font-bold text-slate-900">{r.points} pts</span> },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const otherFields: FormField[] = [
  {
    name: 'tipe',
    label: 'Tier',
    type: 'select',
    options: [
      { label: 'Bronze', value: 'Bronze' },
      { label: 'Silver', value: 'Silver' },
      { label: 'Gold', value: 'Gold' },
      { label: 'Platinum', value: 'Platinum' },
    ],
  },
  { name: 'points', label: 'Poin', type: 'number', placeholder: '0' },
]

type PasienLite = { id: number; nama?: string; kode?: string }

export function MembershipPage() {
  // Same query as PasienSelect, so the list is shared from cache.
  const { data } = useQuery({
    queryKey: ['pasien', 'select'],
    queryFn: () => apiGet<PasienLite[]>('/pasien', { per_page: 200, page: 1 }),
  })
  const formFields = useMemo<FormField[]>(
    () => [
      {
        name: 'pasien_id',
        label: 'Pasien',
        type: 'select',
        required: true,
        options: [
          { label: 'Pilih pasien...', value: '' },
          ...(data?.data ?? []).map((p) => ({ label: [p.kode, p.nama].filter(Boolean).join(' · ') || `Pasien #${p.id}`, value: String(p.id) })),
        ],
      },
      ...otherFields,
    ],
    [data?.data],
  )

  return (
    <ResourceListPage<Membership>
      title="Membership"
      description="Tier dan poin member pasien"
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
