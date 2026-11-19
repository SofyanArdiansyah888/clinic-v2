import { useQuery } from '@tanstack/react-query'
import { Plus, Receipt, Search, Users, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { apiGet } from '@/shared/api/client'
import { EmptyState } from '@/shared/components/EmptyState'
import { KpiCard } from '@/shared/components/KpiCard'
import { FilterBar, FilterField, FilterSelect } from '@/shared/components/ListFilters'
import { PageHeader } from '@/shared/components/PageHeader'
import { Pagination } from '@/shared/components/Pagination'
import { PasienSelect } from '@/shared/components/PasienSelect'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { PaginationMeta } from '@/shared/types/api'
import { buttonVariants } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { formatCurrency, formatDate, formatNumber } from '@/shared/lib/formatters'
import { metodeLabel } from '@/shared/lib/pembayaran'

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

// The API caps per_page at 100 (anything above falls back to 20), so the log pages.
const PER_PAGE = 25

export function DepositPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [jenis, setJenis] = useState('')
  const [tanggal, setTanggal] = useState('')
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
  }, [search, jenis, tanggal, pasienId])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['deposit-riwayat', search, jenis, tanggal, pasienId, page],
    queryFn: () =>
      apiGet<DepositRow[]>('/pembayaran/deposit', {
        per_page: PER_PAGE,
        page,
        search: search || undefined,
        jenis: jenis || undefined,
        tanggal: tanggal || undefined,
        pasien_id: pasienId || undefined,
      }),
  })

  const rows = useMemo(() => data?.data ?? [], [data?.data])
  const meta = data?.meta as PaginationMeta | undefined
  const multiPage = (meta?.total_pages ?? 1) > 1

  const stats = useMemo(() => {
    const total = rows.reduce((sum, r) => sum + (r.jumlah ?? 0), 0)
    const memberCount = rows.filter((r) => ['pendaftaran_member', 'perpanjangan_member'].includes(r.jenis)).length
    return { total, memberCount }
  }, [rows])

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Transaksi"
          value={formatNumber(meta?.total ?? rows.length)}
          icon={<Receipt className="h-5 w-5" />}
          iconClass="bg-rose-50 text-rose-600"
        />
        <KpiCard
          label={multiPage ? 'Total Nilai (halaman ini)' : 'Total Nilai'}
          value={formatCurrency(stats.total)}
          icon={<Wallet className="h-5 w-5" />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          label={multiPage ? 'Transaksi Member (halaman ini)' : 'Transaksi Member'}
          value={formatNumber(stats.memberCount)}
          icon={<Users className="h-5 w-5" />}
          iconClass="bg-indigo-50 text-indigo-600"
        />
      </div>

      <FilterBar
        canReset={Boolean(searchInput || jenis || tanggal || pasienId)}
        onReset={() => {
          setSearchInput('')
          setJenis('')
          setTanggal('')
          setPasienId('')
        }}
      >
        <FilterField label="Cari" htmlFor="deposit-cari" className="min-w-[200px]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              id="deposit-cari"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Kode / no. kwitansi"
              className="pl-9"
            />
          </div>
        </FilterField>
        <FilterField label="Tanggal" htmlFor="deposit-tanggal" className="min-w-[160px] flex-none sm:w-44">
          <Input id="deposit-tanggal" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
        </FilterField>
        <FilterField label="Jenis" htmlFor="deposit-jenis">
          <FilterSelect id="deposit-jenis" value={jenis} onChange={setJenis} options={JENIS_OPTIONS} />
        </FilterField>
        <FilterField label="Pasien" htmlFor="deposit-pasien" className="min-w-[220px]">
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
