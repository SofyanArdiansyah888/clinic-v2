import { ArrowDownToLine, ArrowUpFromLine, History, Scale } from 'lucide-react'
import { useState } from 'react'
import { BarangSelect } from '@/shared/components/BarangSelect'
import { KpiCard } from '@/shared/components/KpiCard'
import { FilterBar, FilterField, PeriodeFilter } from '@/shared/components/ListFilters'
import { EMPTY_PERIODE, useListSummary, type Periode } from '@/shared/lib/listFilters'
import { ResourceListPage } from '@/shared/components/ResourceListPage'
import type { Column } from '@/shared/components/DataTable'
import { formatDate, formatNumber } from '@/shared/lib/formatters'

type Row = {
  id: number
  kode: string
  tanggal: string
  keterangan?: string
  referensi?: string
  qty_masuk: number
  qty_keluar: number
  saldo: number
  barang?: { nama?: string; kode?: string; satuan?: string }
}

const columns: Column<Row>[] = [
  { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal) },
  {
    key: 'barang',
    header: 'Barang',
    cell: (r) => (
      <div>
        <p className="font-semibold text-slate-900">{r.barang?.nama || '-'}</p>
        <p className="font-mono text-[11px] text-slate-500">{r.barang?.kode}</p>
      </div>
    ),
  },
  { key: 'keterangan', header: 'Keterangan', cell: (r) => r.keterangan || '-' },
  { key: 'referensi', header: 'Referensi', cell: (r) => <span className="font-mono text-xs">{r.referensi || '-'}</span> },
  {
    key: 'masuk',
    header: 'Masuk',
    cell: (r) => (r.qty_masuk ? <span className="font-semibold text-emerald-700">+{r.qty_masuk}</span> : '-'),
  },
  {
    key: 'keluar',
    header: 'Keluar',
    cell: (r) => (r.qty_keluar ? <span className="font-semibold text-rose-600">−{r.qty_keluar}</span> : '-'),
  },
  {
    key: 'saldo',
    header: 'Saldo',
    cell: (r) => (
      <span className="font-bold text-slate-900">
        {r.saldo} <span className="text-[11px] font-normal text-slate-500">{r.barang?.satuan}</span>
      </span>
    ),
  },
]

type Summary = {
  jumlah_mutasi: number
  jumlah_barang: number
  total_masuk: number
  total_keluar: number
}

export function KartuStokPage() {
  const [barangId, setBarangId] = useState('')
  const [periode, setPeriode] = useState<Periode>(EMPTY_PERIODE)
  const [search, setSearch] = useState('')

  const filterParams = {
    barang_id: barangId || undefined,
    dari: periode.dari || undefined,
    sampai: periode.sampai || undefined,
  }
  const { data: s } = useListSummary<Summary>('/kartu-stok', 'kartu-stok', { ...filterParams, search })
  const net = (s?.total_masuk ?? 0) - (s?.total_keluar ?? 0)

  return (
    <ResourceListPage<Row>
      title="Kartu Stok"
      description="Riwayat keluar-masuk stok per barang"
      endpoint="/kartu-stok"
      queryKey="kartu-stok"
      columns={columns}
      enableCreate={false}
      enableEdit={false}
      enableDelete={false}
      filterParams={filterParams}
      onSearchChange={setSearch}
      emptyDescription="Tidak ada mutasi stok pada filter ini."
      summary={
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Jumlah Mutasi"
              value={formatNumber(s?.jumlah_mutasi ?? 0)}
              icon={<History className="h-5 w-5" />}
              iconClass="bg-indigo-50 text-indigo-600"
            />
            <KpiCard
              label="Total Masuk"
              value={`+${formatNumber(s?.total_masuk ?? 0)}`}
              icon={<ArrowDownToLine className="h-5 w-5" />}
              iconClass="bg-emerald-50 text-emerald-600"
              valueClass="text-emerald-700"
            />
            <KpiCard
              label="Total Keluar"
              value={`−${formatNumber(s?.total_keluar ?? 0)}`}
              icon={<ArrowUpFromLine className="h-5 w-5" />}
              iconClass="bg-rose-50 text-rose-600"
              valueClass="text-rose-600"
            />
            <KpiCard
              label={barangId ? 'Perubahan Bersih' : `Perubahan Bersih · ${formatNumber(s?.jumlah_barang ?? 0)} barang`}
              value={`${net > 0 ? '+' : net < 0 ? '−' : ''}${formatNumber(Math.abs(net))}`}
              icon={<Scale className="h-5 w-5" />}
              iconClass="bg-slate-100 text-slate-600"
            />
          </div>
          <FilterBar
            canReset={Boolean(barangId || periode.dari || periode.sampai)}
            onReset={() => {
              setBarangId('')
              setPeriode(EMPTY_PERIODE)
            }}
          >
            <FilterField label="Barang" htmlFor="kartustokpage-f1" className="min-w-[240px] flex-[2]">
              <BarangSelect id="kartustokpage-f1" value={barangId} onChange={(v) => setBarangId(v)} placeholder="Semua barang" />
            </FilterField>
            <PeriodeFilter idPrefix="ks" value={periode} onChange={setPeriode} />
          </FilterBar>
        </>
      }
    />
  )
}
