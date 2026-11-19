import { Award, Crown, UserCheck, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/shared/api/client'
import { ResourceListPage, type FormField } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { KpiCard } from '@/shared/components/KpiCard'
import { FilterBar, FilterField, FilterSelect, PeriodeFilter } from '@/shared/components/ListFilters'
import { EMPTY_PERIODE, useListSummary, type Periode } from '@/shared/lib/listFilters'
import { formatDate, formatNumber } from '@/shared/lib/formatters'

type Membership = {
  id: number
  kode: string
  pasien_id: number
  tipe?: string
  points: number
  is_active: boolean
  created_at?: string
  pasien?: { nama?: string }
}

type Summary = {
  total: number
  aktif: number
  total_poin: number
  per_tipe: Record<string, number>
}

const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum']

const columns: Column<Membership>[] = [
  { key: 'kode', header: 'Kode Member', cell: (r) => <span className="font-mono font-bold text-rose-700">{r.kode}</span> },
  { key: 'pasien', header: 'Nama Pasien', cell: (r) => <span className="font-bold text-slate-900">{r.pasien?.nama || `Pasien #${r.pasien_id}`}</span> },
  { key: 'tipe', header: 'Tier', cell: (r) => <span className="rounded bg-amber-50 border border-amber-200 px-2 py-1 font-bold text-amber-800 uppercase text-[11px]">{r.tipe || 'Silver'}</span> },
  { key: 'points', header: 'Poin', cell: (r) => <span className="font-mono font-bold text-slate-900">{r.points} pts</span> },
  { key: 'terdaftar', header: 'Terdaftar', cell: (r) => (r.created_at ? formatDate(r.created_at) : '-') },
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

  const [tipe, setTipe] = useState('')
  const [status, setStatus] = useState('')
  const [periode, setPeriode] = useState<Periode>(EMPTY_PERIODE)
  const [search, setSearch] = useState('')
  const filterParams = {
    tipe: tipe || undefined,
    status: status || undefined,
    dari: periode.dari || undefined,
    sampai: periode.sampai || undefined,
  }
  const { data: s } = useListSummary<Summary>('/membership', 'membership', { ...filterParams, search })
  const tierTeratas = TIERS.filter((t) => (s?.per_tipe?.[t] ?? 0) > 0)
    .map((t) => `${t} ${s?.per_tipe?.[t]}`)
    .join(' · ')

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
      filterParams={filterParams}
      onSearchChange={setSearch}
      emptyDescription="Tidak ada member yang cocok dengan filter."
      summary={
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Total Member"
              value={formatNumber(s?.total ?? 0)}
              icon={<Users className="h-5 w-5" />}
              iconClass="bg-rose-50 text-rose-600"
            />
            <KpiCard
              label="Member Aktif"
              value={formatNumber(s?.aktif ?? 0)}
              icon={<UserCheck className="h-5 w-5" />}
              iconClass="bg-emerald-50 text-emerald-600"
            />
            <KpiCard
              label="Total Poin Beredar"
              value={`${formatNumber(s?.total_poin ?? 0)} pts`}
              icon={<Award className="h-5 w-5" />}
              iconClass="bg-amber-50 text-amber-600"
            />
            <KpiCard
              label="Gold & Platinum"
              value={formatNumber((s?.per_tipe?.Gold ?? 0) + (s?.per_tipe?.Platinum ?? 0))}
              icon={<Crown className="h-5 w-5" />}
              iconClass="bg-indigo-50 text-indigo-600"
            />
          </div>
          {tierTeratas ? <p className="text-[11px] text-slate-500">Per tier: {tierTeratas}</p> : null}
          <FilterBar
            canReset={Boolean(tipe || status || periode.dari || periode.sampai)}
            onReset={() => {
              setTipe('')
              setStatus('')
              setPeriode(EMPTY_PERIODE)
            }}
          >
            <PeriodeFilter idPrefix="membership-periode" label="Tanggal Daftar" value={periode} onChange={setPeriode} />
            <FilterField label="Tier" htmlFor="membership-tier">
              <FilterSelect
                id="membership-tier"
                value={tipe}
                onChange={setTipe}
                options={[{ value: '', label: 'Semua tier' }, ...TIERS.map((t) => ({ value: t, label: t }))]}
              />
            </FilterField>
            <FilterField label="Status" htmlFor="membership-status">
              <FilterSelect
                id="membership-status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: '', label: 'Semua status' },
                  { value: 'aktif', label: 'Aktif' },
                  { value: 'nonaktif', label: 'Nonaktif' },
                ]}
              />
            </FilterField>
          </FilterBar>
        </>
      }
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
