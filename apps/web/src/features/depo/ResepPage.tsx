import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CheckCheck, CircleDollarSign, Clock, Info, PackageCheck, Stethoscope, Wallet } from 'lucide-react'
import { useState } from 'react'
import { apiPatch } from '@/shared/api/client'
import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { KpiCard } from '@/shared/components/KpiCard'
import { DokterSelect } from '@/shared/components/DokterSelect'
import { FilterBar, FilterField, PeriodeFilter } from '@/shared/components/ListFilters'
import { EMPTY_PERIODE, useListSummary, type Periode } from '@/shared/lib/listFilters'
import type { Column } from '@/shared/components/DataTable'
import { Button, buttonVariants } from '@/shared/ui/button'
import { Tabs } from '@/shared/ui/tabs'
import { formatDate, formatNumber } from '@/shared/lib/formatters'
import { canAccess } from '@/shared/lib/access'
import { useAuthStore } from '@/features/auth/store'

type ResepBarang = {
  id: number
  nama_barang?: string
  jumlah: number
  unit?: string
}

type Row = {
  id: number
  kode: string
  tanggal: string
  status: string
  perawatan_kode?: string
  perawatan_status?: string
  pasien?: { nama?: string; kode?: string }
  staff?: { nama?: string }
  barangs?: ResepBarang[]
}

type Summary = {
  draft: number
  menunggu_kasir: number
  dibayar: number
  diserahkan: number
}

type TabKey = 'dibayar' | 'draft' | 'diserahkan'

const TAB_DESCRIPTION: Record<TabKey, string> = {
  dibayar: 'Sudah dibayar di kasir, siap diserahkan ke pasien',
  draft: 'Resep dari dokter yang tagihannya belum dibayar di kasir',
  diserahkan: 'Resep yang sudah diserahkan ke pasien',
}

const KASIR_PATH = '/pembayaran/perawatan'

const baseColumns: Column<Row>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-rose-700">{r.kode}</span> },
  { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal) },
  { key: 'pasien', header: 'Pasien', cell: (r) => r.pasien?.nama || '-' },
  { key: 'dokter', header: 'Dokter', cell: (r) => r.staff?.nama || '-' },
  {
    key: 'obat',
    header: 'Obat',
    cell: (r) =>
      (r.barangs ?? []).length === 0 ? (
        '-'
      ) : (
        <ul className="space-y-0.5 text-xs">
          {(r.barangs ?? []).map((b) => (
            <li key={b.id}>
              {b.nama_barang || '-'}{' '}
              <span className="text-slate-500">
                × {b.jumlah} {b.unit || ''}
              </span>
            </li>
          ))}
        </ul>
      ),
  },
]

const statusColumn: Column<Row> = { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> }

// Where an unpaid resep is now: the perawatan is either still open at the doctor or
// has been sent to the kasir ("bayar") and is waiting in Pembayaran Perawatan.
const posisiColumn: Column<Row> = {
  key: 'posisi',
  header: 'Posisi Tagihan',
  cell: (r) =>
    r.perawatan_status === 'bayar' ? (
      <div className="space-y-0.5">
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">Menunggu di Kasir</span>
        {r.perawatan_kode ? <p className="font-mono text-[11px] text-slate-500">{r.perawatan_kode}</p> : null}
      </div>
    ) : (
      <div className="space-y-0.5">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">Masih di Dokter</span>
        {r.perawatan_kode ? <p className="font-mono text-[11px] text-slate-500">{r.perawatan_kode}</p> : null}
      </div>
    ),
}

export function ResepPage() {
  const queryClient = useQueryClient()
  const role = useAuthStore((s) => s.user?.role)
  const bisaKeKasir = canAccess(role, KASIR_PATH)
  const [tab, setTab] = useState<TabKey>('dibayar')
  const [error, setError] = useState<string | null>(null)
  const [periode, setPeriode] = useState<Periode>(EMPTY_PERIODE)
  const [dokterId, setDokterId] = useState('')
  const [search, setSearch] = useState('')

  const filterParams = {
    dari: periode.dari || undefined,
    sampai: periode.sampai || undefined,
    staff_id: dokterId || undefined,
  }
  const { data: s } = useListSummary<Summary>('/resep', 'depo-resep', { ...filterParams, search })

  const serahkanMutation = useMutation({
    mutationFn: (id: number) => apiPatch(`/resep/${id}/serahkan`),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['depo-resep'] })
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Gagal menyerahkan resep',
      )
    },
  })

  const columns = tab === 'draft' ? [...baseColumns, posisiColumn] : [...baseColumns, statusColumn]

  const rowAction =
    tab === 'dibayar'
      ? (row: Row) => (
          <Button
            type="button"
            size="sm"
            disabled={serahkanMutation.isPending}
            onClick={() => serahkanMutation.mutate(row.id)}
          >
            <PackageCheck />
            Serahkan
          </Button>
        )
      : tab === 'draft' && bisaKeKasir
        ? (row: Row) =>
            row.perawatan_status === 'bayar' ? (
              <Link to={KASIR_PATH} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                <Wallet />
                Bayar di Kasir
              </Link>
            ) : null
        : undefined

  const tabs = [
    { value: 'dibayar' as const, label: 'Siap Diserahkan', icon: <PackageCheck className="h-4 w-4" />, count: s?.dibayar },
    { value: 'draft' as const, label: 'Belum Dibayar', icon: <Clock className="h-4 w-4" />, count: s?.draft },
    { value: 'diserahkan' as const, label: 'Sudah Diserahkan', icon: <CheckCheck className="h-4 w-4" />, count: s?.diserahkan },
  ]

  return (
    <div className="space-y-4">
      <Tabs value={tab} onChange={setTab} items={tabs} />

      {error ? <div className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</div> : null}

      <ResourceListPage<Row>
        key={tab}
        title="Resep"
        description={TAB_DESCRIPTION[tab]}
        endpoint="/resep"
        queryKey="depo-resep"
        columns={columns}
        enableCreate={false}
        enableEdit={false}
        enableDelete={false}
        filterParams={{ ...filterParams, status: tab }}
        onSearchChange={setSearch}
        customRowActions={rowAction}
        emptyDescription="Tidak ada resep pada tab dan filter ini."
        summary={
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard
                label="Siap Diserahkan"
                value={formatNumber(s?.dibayar ?? 0)}
                icon={<PackageCheck className="h-5 w-5" />}
                iconClass="bg-indigo-50 text-indigo-600"
              />
              <KpiCard
                label="Menunggu di Kasir"
                value={formatNumber(s?.menunggu_kasir ?? 0)}
                icon={<CircleDollarSign className="h-5 w-5" />}
                iconClass="bg-amber-50 text-amber-600"
                valueClass={s?.menunggu_kasir ? 'text-amber-700' : undefined}
              />
              <KpiCard
                label="Masih di Dokter"
                value={formatNumber(Math.max((s?.draft ?? 0) - (s?.menunggu_kasir ?? 0), 0))}
                icon={<Stethoscope className="h-5 w-5" />}
                iconClass="bg-slate-100 text-slate-600"
              />
              <KpiCard
                label="Sudah Diserahkan"
                value={formatNumber(s?.diserahkan ?? 0)}
                icon={<CheckCheck className="h-5 w-5" />}
                iconClass="bg-emerald-50 text-emerald-600"
              />
            </div>

            {tab === 'draft' ? <AlurPembayaranInfo bisaKeKasir={bisaKeKasir} /> : null}

            <FilterBar
              canReset={Boolean(periode.dari || periode.sampai || dokterId)}
              onReset={() => {
                setPeriode(EMPTY_PERIODE)
                setDokterId('')
              }}
            >
              <PeriodeFilter idPrefix="resep-periode" value={periode} onChange={setPeriode} />
              <FilterField label="Dokter" htmlFor="resep-dokter" className="min-w-[220px]">
                <DokterSelect id="resep-dokter" value={dokterId} onChange={setDokterId} placeholder="Semua dokter" />
              </FilterField>
            </FilterBar>
          </>
        }
      />
    </div>
  )
}

function AlurPembayaranInfo({ bisaKeKasir }: { bisaKeKasir: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-xs text-sky-900 sm:flex-row sm:items-start">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
      <div className="flex-1 space-y-1.5">
        <p className="font-bold">Dari mana resep ini, dan di mana dibayar?</p>
        <ol className="list-decimal space-y-0.5 pl-4">
          <li>Dokter menulis resep di halaman Perawatan (EMR) pasien.</li>
          <li>
            Setelah dokter menekan <b>Simpan EMR &amp; Kirim ke Kasir</b>, tagihan perawatan beserta resepnya masuk ke{' '}
            <b>Kasir › Pembayaran Perawatan</b> (posisi “Menunggu di Kasir”).
          </li>
          <li>
            Begitu kasir menerima pembayaran, stok obat dikurangi dan resep pindah ke tab <b>Siap Diserahkan</b>.
          </li>
        </ol>
        {!bisaKeKasir ? (
          <p className="text-sky-800/80">Pembayaran dilakukan oleh kasir/front office, bukan dari halaman depo.</p>
        ) : null}
      </div>
      {bisaKeKasir ? (
        <Link to={KASIR_PATH} className={buttonVariants({ size: 'sm' })}>
          <Wallet />
          Buka Kasir
        </Link>
      ) : null}
    </div>
  )
}
