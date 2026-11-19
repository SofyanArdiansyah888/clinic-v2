import { useQuery } from '@tanstack/react-query'
import { Plus, Receipt, Search, Users, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { apiGet } from '@/shared/api/client'
import { EmptyState } from '@/shared/components/EmptyState'
import { KpiCard } from '@/shared/components/KpiCard'
import { PageHeader } from '@/shared/components/PageHeader'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { buttonVariants } from '@/shared/ui/button'
import { formatCurrency, formatDate } from '@/shared/lib/formatters'

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
  { value: '', label: 'Semua Jenis' },
  { value: 'pembayaran_deposit', label: 'Pembayaran Deposit' },
  { value: 'pembayaran_deposit_treatment', label: 'Deposit Treatment' },
  { value: 'pendaftaran_member', label: 'Pendaftaran Member' },
  { value: 'perpanjangan_member', label: 'Perpanjangan Member' },
  { value: 'pemakaian_deposit', label: 'Pemakaian Deposit' },
]

export function DepositPage() {
  const [search, setSearch] = useState('')
  const [jenis, setJenis] = useState('')
  const [tanggal, setTanggal] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['deposit-riwayat', search, jenis, tanggal],
    queryFn: () =>
      apiGet<DepositRow[]>('/pembayaran/deposit', {
        per_page: 200,
        page: 1,
        search: search || undefined,
        jenis: jenis || undefined,
        tanggal: tanggal || undefined,
      }),
  })

  const rows = data?.data ?? []

  const stats = useMemo(() => {
    const total = rows.reduce((sum, r) => sum + (r.jumlah ?? 0), 0)
    const memberCount = rows.filter((r) =>
      ['pendaftaran_member', 'perpanjangan_member'].includes(r.jenis),
    ).length
    return { count: rows.length, total, memberCount }
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
          value={stats.count}
          icon={<Receipt className="h-5 w-5" />}
          iconClass="bg-rose-50 text-rose-600"
        />
        <KpiCard
          label="Total Nilai"
          value={formatCurrency(stats.total)}
          icon={<Wallet className="h-5 w-5" />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          label="Transaksi Member"
          value={stats.memberCount}
          icon={<Users className="h-5 w-5" />}
          iconClass="bg-indigo-50 text-indigo-600"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="text-sm font-bold text-slate-900">Log Transaksi</h3>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium focus:border-rose-500 focus:outline-none"
            />
            <select
              value={jenis}
              onChange={(e) => setJenis(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium focus:border-rose-500 focus:outline-none"
            >
              {JENIS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="relative w-full sm:w-56">
              <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari pasien / kode"
                className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pr-3 pl-9 text-xs font-medium focus:border-rose-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">Memuat riwayat deposit...</div>
        ) : isError ? (
          <div className="p-12 text-center text-xs text-rose-600">Gagal memuat data deposit.</div>
        ) : rows.length === 0 ? (
          <EmptyState title="Belum ada transaksi" description="Input transaksi di Kasir → Deposit & Member." />
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
                    <td className="px-4 py-3 text-xs capitalize text-slate-500">{row.jenis_pembayaran || '-'}</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-slate-900">
                      {formatCurrency(row.jumlah ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
