import { ArrowDownToLine, ArrowUpFromLine, Boxes, ClipboardList, Plus, TrendingDown, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { ResourceListPage } from '@/shared/components/ResourceListPage'
import type { Column } from '@/shared/components/DataTable'
import { BarangSelect } from '@/shared/components/BarangSelect'
import { KpiCard } from '@/shared/components/KpiCard'
import { FilterBar, FilterField, PeriodeFilter } from '@/shared/components/ListFilters'
import { EMPTY_PERIODE, useListSummary, type Periode } from '@/shared/lib/listFilters'
import { Button } from '@/shared/ui/button'
import { formatDate, formatNumber } from '@/shared/lib/formatters'
import { StokDokumenDialog, type StokDokumenVariant } from '@/features/warehouse/components/StokDokumenDialog'
import { itemsColumn, type StokDokumenRow } from '@/features/warehouse/components/stokDokumenColumns'

type StokDokumenPageProps = {
  title: string
  description?: string
  endpoint: string
  queryKey: string
  createLabel: string
  variant: StokDokumenVariant
  keluarLabel?: string
  masukLabel?: string
}

type Summary = {
  jumlah_dokumen: number
  jumlah_barang: number
  qty_masuk: number
  qty_keluar: number
  selisih_plus: number
  selisih_minus: number
  item_selisih: number
}

// List + create page for stock documents (konversi, produksi, stok opname).
// Deleting a document reverses its stock movement on the server.
export function StokDokumenPage({
  title,
  description,
  endpoint,
  queryKey,
  createLabel,
  variant,
  keluarLabel = 'Keluar',
  masukLabel = 'Masuk',
}: StokDokumenPageProps) {
  const [open, setOpen] = useState(false)
  const [periode, setPeriode] = useState<Periode>(EMPTY_PERIODE)
  const [barangId, setBarangId] = useState('')
  const [search, setSearch] = useState('')

  const filterParams = {
    dari: periode.dari || undefined,
    sampai: periode.sampai || undefined,
    barang_id: barangId || undefined,
  }
  const { data: s } = useListSummary<Summary>(endpoint, queryKey, { ...filterParams, search })
  const idPrefix = queryKey

  const columns: Column<StokDokumenRow>[] = [
    { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-rose-700">{r.kode}</span> },
    { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal) },
    itemsColumn<StokDokumenRow>(variant),
    { key: 'keterangan', header: 'Keterangan', cell: (r) => r.keterangan || '-' },
  ]

  const docCard = (
    <KpiCard
      label="Jumlah Dokumen"
      value={formatNumber(s?.jumlah_dokumen ?? 0)}
      icon={<ClipboardList className="h-5 w-5" />}
      iconClass="bg-rose-50 text-rose-600"
    />
  )
  const barangCard = (
    <KpiCard
      label={
        variant === 'opname' ? `Barang Terlibat · ${formatNumber(s?.item_selisih ?? 0)} berselisih` : 'Barang Terlibat'
      }
      value={formatNumber(s?.jumlah_barang ?? 0)}
      icon={<Boxes className="h-5 w-5" />}
      iconClass="bg-indigo-50 text-indigo-600"
    />
  )

  return (
    <>
      <ResourceListPage<StokDokumenRow>
        title={title}
        description={description}
        endpoint={endpoint}
        queryKey={queryKey}
        columns={columns}
        enableCreate={false}
        enableEdit={false}
        filterParams={filterParams}
        onSearchChange={setSearch}
        emptyDescription="Tidak ada dokumen pada periode / filter ini."
        extraActions={
          <Button type="button" onClick={() => setOpen(true)}>
            <Plus />
            {createLabel}
          </Button>
        }
        summary={
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {docCard}
              {barangCard}
              {variant === 'opname' ? (
                <>
                  <KpiCard
                    label="Selisih Lebih (+)"
                    value={formatNumber(s?.selisih_plus ?? 0)}
                    icon={<TrendingUp className="h-5 w-5" />}
                    iconClass="bg-emerald-50 text-emerald-600"
                  />
                  <KpiCard
                    label="Selisih Kurang (−)"
                    value={formatNumber(s?.selisih_minus ?? 0)}
                    icon={<TrendingDown className="h-5 w-5" />}
                    iconClass="bg-amber-50 text-amber-600"
                    valueClass={s?.selisih_minus ? 'text-amber-700' : undefined}
                  />
                </>
              ) : (
                <>
                  <KpiCard
                    label={`Qty ${keluarLabel}`}
                    value={formatNumber(s?.qty_keluar ?? 0)}
                    icon={<ArrowUpFromLine className="h-5 w-5" />}
                    iconClass="bg-amber-50 text-amber-600"
                  />
                  <KpiCard
                    label={`Qty ${masukLabel}`}
                    value={formatNumber(s?.qty_masuk ?? 0)}
                    icon={<ArrowDownToLine className="h-5 w-5" />}
                    iconClass="bg-emerald-50 text-emerald-600"
                  />
                </>
              )}
            </div>
            <FilterBar
              canReset={Boolean(periode.dari || periode.sampai || barangId)}
              onReset={() => {
                setPeriode(EMPTY_PERIODE)
                setBarangId('')
              }}
            >
              <PeriodeFilter idPrefix={`${idPrefix}-periode`} value={periode} onChange={setPeriode} />
              <FilterField label="Barang" htmlFor={`${idPrefix}-barang`} className="min-w-[220px]">
                <BarangSelect id={`${idPrefix}-barang`} value={barangId} onChange={setBarangId} placeholder="Semua barang" />
              </FilterField>
            </FilterBar>
          </>
        }
      />
      <StokDokumenDialog
        open={open}
        onClose={() => setOpen(false)}
        title={createLabel}
        endpoint={endpoint}
        queryKey={queryKey}
        variant={variant}
        keluarLabel={keluarLabel}
        masukLabel={masukLabel}
      />
    </>
  )
}
