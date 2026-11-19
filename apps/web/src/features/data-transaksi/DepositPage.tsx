import { useQuery } from '@tanstack/react-query'
import { ArrowDownToLine, CreditCard, Plus, Receipt, Search, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { apiGet } from '@/shared/api/client'
import { EmptyState } from '@/shared/components/EmptyState'
import { KpiCard } from '@/shared/components/KpiCard'
import { FilterBar, FilterField, FilterSelect, PeriodeFilter } from '@/shared/components/ListFilters'
import { PageHeader } from '@/shared/components/PageHeader'
import { Pagination } from '@/shared/components/Pagination'
import { PasienSelect } from '@/shared/components/PasienSelect'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { PaginationMeta } from '@/shared/types/api'
import { buttonVariants } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { formatCurrency, formatDate, formatNumber } from '@/shared/lib/formatters'
import { EMPTY_PERIODE, useListSummary, type Periode } from '@/shared/lib/listFilters'
import { JENIS_PEMBAYARAN, metodeLabel } from '@/shared/lib/pembayaran'

type DepositRow = {
  id: number
  kode: string
  tanggal: string
  jenis: string
  jumlah: number
  kwitansi?: string
  jenis_pembayaran?: string
  pasien?: { id: number; nama?: string }
  staff?: { id: number; nama?: string }
  treatment?: { id: number; nama?: string }
}

const JENIS_LABELS: Record<string, string> = {
  pembayaran_deposit: 'Pembayaran Deposit',
  pembayaran_deposit_treatment: 'Deposit Treatment',
  pendaftaran_member: 'Pendaftaran Member',
  perpanjangan_member: 'Perpanjangan Member',
  pemakaian_deposit: 'Pemakaian Deposit',
}

const JENIS_OPTIONS = [
  { value: '', label: 'Semua jenis' },
  ...Object.entries(JENIS_LABELS).map(([value, label]) => ({ value, label })),
]

const METODE_OPTIONS = [{ value: '', label: 'Semua metode' }, ...JENIS_PEMBAYARAN]

type Summary = {
  jumlah: number
  total_masuk: number
  total_pemakaian: number
  transaksi_member: number
}

// The API caps per_page at 100 (anything above falls back to 20), so the log pages.
const PER_PAGE = 25

export function DepositPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [jenis, setJenis] = useState('')
  const [periode, setPeriode] = useState<Periode>(EMPTY_PERIODE)
  const [metode, setMetode] = useState('')
  const [pasienId, setPasienId] = useState('')
  const [page, setPage] = useState(1)

  // Search as you type, like the other list pages.
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => window.clearTimeout(id)
  }, [searchInput])

  // Any filter change starts again from the first page.
  useEffect(() => {
    setPage(1)
  }, [search, jenis, periode, metode, pasienId])

  const filters = {
    search: search || undefined,
    jenis: jenis || undefined,
    jenis_pembayaran: metode || undefined,
    dari: periode.dari || undefined,
    sampai: periode.sampai || undefined,
    pasien_id: pasienId || undefined,
  }
  // Same key prefix as the log so a new transaction refreshes the cards too.
  const { data: s } = useListSummary<Summary>('/pembayaran/deposit', 'deposit-riwayat', filters)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['deposit-riwayat', filters, page],
    queryFn: () => apiGet<DepositRow[]>('/pembayaran/deposit', { per_page: PER_PAGE, page, ...filters }),
  })

  const rows = useMemo(() => data?.data ?? [], [data?.data])
  const meta = data?.meta as PaginationMeta | undefined
  return (
    <div className="space-y-6">
      <PageHeader
        title="Riwayat Deposit"
        description="Deposit dan transaksi member"
        actions={
          <Link to="/pembayaran/deposit" className={buttonVariants()}>
            <Plus />
            Transaksi Baru
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Transaksi"
          value={formatNumber(s?.jumlah ?? 0)}
          icon={<Receipt className="h-5 w-5" />}
          iconClass="bg-rose-50 text-rose-600"
        />
        <KpiCard
          label="Uang Masuk"
          value={formatCurrency(s?.total_masuk ?? 0)}
          icon={<ArrowDownToLine className="h-5 w-5" />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          label="Deposit Terpakai"
          value={formatCurrency(s?.total_pemakaian ?? 0)}
          icon={<CreditCard className="h-5 w-5" />}
          iconClass="bg-amber-50 text-amber-600"
        />
        <KpiCard
          label="Transaksi Member"
          value={formatNumber(s?.transaksi_member ?? 0)}
          icon={<Users className="h-5 w-5" />}
          iconClass="bg-indigo-50 text-indigo-600"
        />
      </div>

      <FilterBar
        canReset={Boolean(searchInput || jenis || metode || periode.dari || periode.sampai || pasienId)}
        onReset={() => {
          setSearchInput('')
          setJenis('')
          setPeriode(EMPTY_PERIODE)
          setMetode('')
          setPasienId('')
        }}
      >
        <FilterField label="Cari" htmlFor="deposit-cari" className="min-w-[170px]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              id="deposit-cari"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Pasien / kode"
              className="pl-9"
            />
          </div>
        </FilterField>
        <PeriodeFilter idPrefix="deposit-periode" value={periode} onChange={setPeriode} />
        <FilterField label="Jenis" htmlFor="deposit-jenis" className="min-w-[140px]">
          <FilterSelect id="deposit-jenis" value={jenis} onChange={setJenis} options={JENIS_OPTIONS} />
        </FilterField>
        <FilterField label="Metode" htmlFor="deposit-metode" className="min-w-[140px]">
          <FilterSelect id="deposit-metode" value={metode} onChange={setMetode} options={METODE_OPTIONS} />
        </FilterField>
        <FilterField label="Pasien" htmlFor="deposit-pasien" className="min-w-[180px]">
          <PasienSelect id="deposit-pasien" value={pasienId} onChange={setPasienId} placeholder="Semua pasien" />
        </FilterField>
      </FilterBar>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">Log Transaksi</h3>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">Memuat riwayat deposit...</div>
        ) : isError ? (
          <div className="p-12 text-center text-xs text-rose-600">Gagal memuat data deposit.</div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Tidak ada transaksi"
            description="Ubah filter, atau input transaksi baru di Kasir → Deposit & Member."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Kode</th>
                  <th className="px-4 py-3">Pasien</th>
                  <th className="px-4 py-3">Jenis</th>
                  <th className="px-4 py-3">Treatment</th>
                  <th className="px-4 py-3">Staff</th>
                  <th className="px-4 py-3">Metode</th>
                  <th className="px-4 py-3 text-right">Jumlah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-xs text-slate-600">{formatDate(row.tanggal)}</td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-rose-700">{row.kode}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-800">{row.pasien?.nama || '-'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={JENIS_LABELS[row.jenis] || row.jenis} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{row.treatment?.nama || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{row.staff?.nama || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{metodeLabel(row.jenis_pembayaran)}</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-slate-900">
                      {formatCurrency(row.jumlah ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={meta} onPageChange={setPage} />
      </div>
    </div>
  )
}
