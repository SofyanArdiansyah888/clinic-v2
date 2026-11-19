import { AlertTriangle, Boxes, PackageX, Wallet } from 'lucide-react'
import { useState } from 'react'
import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { MASTERS } from '@/shared/lib/masters'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { KpiCard } from '@/shared/components/KpiCard'
import { FilterBar, FilterField, FilterSelect } from '@/shared/components/ListFilters'
import { useListSummary } from '@/shared/lib/listFilters'
import type { Column } from '@/shared/components/DataTable'
import { formatCurrency, formatNumber } from '@/shared/lib/formatters'

type Row = {
  id: number
  kode: string
  nama: string
  kategori?: string
  satuan?: string
  harga_jual: number
  stok_aktual: number
  stok_minimal: number
  is_active: boolean
}

type Summary = {
  total: number
  aktif: number
  menipis: number
  habis: number
  nilai_stok: number
  kategoris: string[]
}

function stokCell(r: Row) {
  const tone =
    r.stok_aktual <= 0
      ? 'bg-rose-100 text-rose-700'
      : r.stok_aktual <= r.stok_minimal
        ? 'bg-amber-100 text-amber-800'
        : 'text-slate-900'
  return (
    <div className="space-y-0.5">
      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>
        {r.stok_aktual} <span className="font-normal">{r.satuan || ''}</span>
      </span>
      {r.stok_minimal > 0 ? <p className="text-[11px] text-slate-500">Min. {r.stok_minimal}</p> : null}
    </div>
  )
}

const columns: Column<Row>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => r.kode },
  { key: 'nama', header: 'Nama', cell: (r) => r.nama },
  { key: 'kategori', header: 'Kategori', cell: (r) => r.kategori || '-' },
  { key: 'satuan', header: 'Satuan', cell: (r) => r.satuan || '-' },
  { key: 'harga', header: 'Harga Jual', cell: (r) => formatCurrency(r.harga_jual) },
  { key: 'stok', header: 'Stok', cell: stokCell },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const STOK_OPTIONS = [
  { value: '', label: 'Semua stok' },
  { value: 'menipis', label: 'Menipis (≤ stok minimal)' },
  { value: 'habis', label: 'Habis' },
  { value: 'aman', label: 'Aman' },
]

const STATUS_OPTIONS = [
  { value: '', label: 'Semua status' },
  { value: 'aktif', label: 'Aktif' },
  { value: 'nonaktif', label: 'Nonaktif' },
]

export function BarangPage() {
  const [kategori, setKategori] = useState('')
  const [stok, setStok] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')

  const filterParams = { kategori: kategori || undefined, stok: stok || undefined, status: status || undefined }
  const { data: summary } = useListSummary<Summary>('/barang', 'barang', {
    kategori,
    status,
    search,
  })

  return (
    <ResourceListPage<Row>
      title="Barang"
      description="Master barang dan stok"
      endpoint="/barang"
      queryKey="barang"
      columns={columns}
      createLabel="Tambah Barang"
      createFields={MASTERS.barang.fields}
      filterParams={filterParams}
      onSearchChange={setSearch}
      emptyDescription="Tidak ada barang yang cocok dengan filter."
      summary={
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Total Item"
              value={formatNumber(summary?.total ?? 0)}
              icon={<Boxes className="h-5 w-5" />}
              iconClass="bg-indigo-50 text-indigo-600"
            />
            <KpiCard
              label="Stok Menipis"
              value={formatNumber(summary?.menipis ?? 0)}
              icon={<AlertTriangle className="h-5 w-5" />}
              iconClass="bg-amber-50 text-amber-600"
              valueClass={summary?.menipis ? 'text-amber-700' : undefined}
            />
            <KpiCard
              label="Stok Habis"
              value={formatNumber(summary?.habis ?? 0)}
              icon={<PackageX className="h-5 w-5" />}
              iconClass="bg-rose-50 text-rose-600"
              valueClass={summary?.habis ? 'text-rose-700' : undefined}
            />
            <KpiCard
              label="Nilai Stok (harga beli)"
              value={formatCurrency(summary?.nilai_stok ?? 0)}
              icon={<Wallet className="h-5 w-5" />}
              iconClass="bg-emerald-50 text-emerald-600"
            />
          </div>
          <FilterBar
            canReset={Boolean(kategori || stok || status)}
            onReset={() => {
              setKategori('')
              setStok('')
              setStatus('')
            }}
          >
            <FilterField label="Kategori" htmlFor="barang-kategori">
              <FilterSelect
                id="barang-kategori"
                value={kategori}
                onChange={setKategori}
                options={[{ value: '', label: 'Semua kategori' }, ...(summary?.kategoris ?? []).map((k) => ({ value: k, label: k }))]}
              />
            </FilterField>
            <FilterField label="Stok" htmlFor="barang-stok">
              <FilterSelect id="barang-stok" value={stok} onChange={setStok} options={STOK_OPTIONS} />
            </FilterField>
            <FilterField label="Status" htmlFor="barang-status">
              <FilterSelect id="barang-status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
            </FilterField>
          </FilterBar>
        </>
      }
    />
  )
}
