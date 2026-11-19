import { Ban, Clock, Receipt, Wallet } from 'lucide-react'
import { KpiCard } from '@/shared/components/KpiCard'
import { FilterBar, FilterField, FilterSelect, PeriodeFilter } from '@/shared/components/ListFilters'
import { EMPTY_PERIODE, useListSummary } from '@/shared/lib/listFilters'
import type { PenjualanFilters } from '@/features/data-transaksi/components/usePenjualanFilters'
import { PasienSelect } from '@/shared/components/PasienSelect'
import { formatCurrency, formatNumber } from '@/shared/lib/formatters'

type Summary = {
  jumlah: number
  nilai_lunas: number
  jumlah_lunas: number
  belum_lunas: number
  nilai_belum_lunas: number
  batal: number
}

const STATUS_OPTIONS = [
  { value: '', label: 'Semua status' },
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Menunggu Bayar' },
  { value: 'paid', label: 'Lunas' },
  { value: 'cancelled', label: 'Dibatalkan' },
]

export function PenjualanOverview({ filters: f }: { filters: PenjualanFilters }) {
  const { data: s } = useListSummary<Summary>('/penjualan', 'penjualan', { ...f.params, search: f.search })
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Total Transaksi"
          value={formatNumber(s?.jumlah ?? 0)}
          icon={<Receipt className="h-5 w-5" />}
          iconClass="bg-rose-50 text-rose-600"
        />
        <KpiCard
          label={`Nilai Lunas · ${formatNumber(s?.jumlah_lunas ?? 0)} transaksi`}
          value={formatCurrency(s?.nilai_lunas ?? 0)}
          icon={<Wallet className="h-5 w-5" />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          label={`Belum Dibayar · ${formatNumber(s?.belum_lunas ?? 0)} transaksi`}
          value={formatCurrency(s?.nilai_belum_lunas ?? 0)}
          icon={<Clock className="h-5 w-5" />}
          iconClass="bg-amber-50 text-amber-600"
          valueClass={s?.nilai_belum_lunas ? 'text-amber-700' : undefined}
        />
        <KpiCard
          label="Dibatalkan"
          value={formatNumber(s?.batal ?? 0)}
          icon={<Ban className="h-5 w-5" />}
          iconClass="bg-slate-100 text-slate-600"
        />
      </div>
      <FilterBar
        canReset={Boolean(f.periode.dari || f.periode.sampai || f.status || f.pasienId)}
        onReset={() => {
          f.setPeriode(EMPTY_PERIODE)
          f.setStatus('')
          f.setPasienId('')
        }}
      >
        <PeriodeFilter idPrefix="penjualan-periode" value={f.periode} onChange={f.setPeriode} />
        <FilterField label="Status" htmlFor="penjualan-status">
          <FilterSelect id="penjualan-status" value={f.status} onChange={f.setStatus} options={STATUS_OPTIONS} />
        </FilterField>
        <FilterField label="Pasien" htmlFor="penjualan-pasien" className="min-w-[220px]">
          <PasienSelect id="penjualan-pasien" value={f.pasienId} onChange={f.setPasienId} placeholder="Semua pasien" />
        </FilterField>
      </FilterBar>
    </>
  )
}
