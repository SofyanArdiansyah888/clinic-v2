import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, CalendarClock, Coins, Plus, UserPlus, Users } from 'lucide-react'
import { apiGet } from '@/shared/api/client'
import { PageHeader } from '@/shared/components/PageHeader'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { formatCurrency, formatNumber, todayISO } from '@/shared/lib/formatters'
import type { DashboardKpi } from '@/shared/types/api'
import { Skeleton } from '@/shared/ui/skeleton'

type AntrianRow = {
  id: number
  kode: string
  status: string
  jam?: string
  pasien?: { nama?: string; kode?: string }
  staff?: { nama?: string }
}

const ACTIVE_STATUSES = ['menunggu', 'dipanggil', 'diproses', 'bayar']

export function DashboardPage() {
  const kpiQuery = useQuery({
    queryKey: ['dashboard-kpi'],
    queryFn: () => apiGet<DashboardKpi>('/dashboard/kpi'),
  })

  const today = todayISO()
  const antrianQuery = useQuery({
    queryKey: ['dashboard-antrian', today],
    queryFn: () => apiGet<AntrianRow[]>('/antrian', { page: 1, per_page: 50, tanggal: today }),
  })

  const kpi = kpiQuery.data?.data
  // "Live" = today's queue that still needs someone to act on it.
  const rows = (antrianQuery.data?.data ?? [])
    .filter((r) => ACTIVE_STATUSES.includes(r.status.toLowerCase()))
    .slice(0, 8)

  const cards = [
    {
      title: 'Pendapatan Hari Ini',
      value: kpi ? formatCurrency(kpi.revenue_today) : null,
      hint: 'Revenue penjualan lunas',
      icon: Coins,
      iconClass: 'bg-rose-50 text-rose-700',
    },
    {
      title: 'Kunjungan / Antrian',
      value: kpi ? `${formatNumber(kpi.visits_today)} Orang` : null,
      hint: `${formatNumber(kpi?.pending_queue ?? 0)} menunggu`,
      icon: Users,
      iconClass: 'bg-sky-50 text-sky-700',
    },
    {
      title: 'Pasien Baru',
      value: kpi ? formatNumber(kpi.new_patients_today) : null,
      hint: 'Registrasi hari ini',
      icon: UserPlus,
      iconClass: 'bg-amber-50 text-amber-700',
    },
    {
      title: 'Antrian Menunggu',
      value: kpi ? formatNumber(kpi.pending_queue) : null,
      hint: 'Perlu diproses',
      icon: CalendarClock,
      iconClass: 'bg-rose-50 text-rose-700',
      danger: true,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Operasional Klinik"
        description="Ringkasan antrian live, status rekam medis, dan alert stok hari ini."
        actions={
          <>
            <Link
              to="/administrasi/pasien"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-4 text-xs font-semibold text-white shadow-lg shadow-rose-600/25 transition-all hover:from-rose-700 hover:to-rose-600"
            >
              <Plus className="h-4 w-4" />
              Registrasi Pasien
            </Link>
            <Link
              to="/resepsionis/kunjungan"
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50"
            >
              Papan Antrian
            </Link>
          </>
        }
      />

      {kpiQuery.isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
          Gagal memuat KPI dashboard. Periksa koneksi API.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.title}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold tracking-wider sm:text-xs text-slate-500 uppercase">{card.title}</span>
                  <span className={`rounded-md p-1.5 ${card.iconClass}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                  {kpiQuery.isLoading || !card.value ? (
                    <Skeleton className="h-8 w-28" />
                  ) : (
                    <span
                      className={`kpi-val text-xl sm:text-2xl font-bold tabular-nums ${card.danger && (kpi?.pending_queue ?? 0) > 0 ? 'text-rose-600' : 'text-slate-900'}`}
                    >
                      {card.value}
                    </span>
                  )}
                  <span className="text-[11px] font-medium text-slate-500">{card.hint}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Daftar Antrian Live</h3>
              <p className="text-xs text-slate-500">Pasien menunggu panggilan dan dalam ruang periksa.</p>
            </div>
            <Link
              to="/resepsionis/kunjungan"
              className="text-xs font-semibold text-rose-700 hover:underline"
            >
              Lihat semua →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  <th className="px-4 py-3">No. Antrian</th>
                  <th className="px-4 py-3">Pasien</th>
                  <th className="px-4 py-3">Staff</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                {antrianQuery.isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      Memuat antrian...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                      Belum ada antrian hari ini.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50">
                      <td className="queue-no whitespace-nowrap px-4 py-3 font-mono text-sm font-bold text-slate-900">{row.kode}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{row.pasien?.nama ?? '-'}</div>
                        <div className="font-mono text-[11px] text-slate-500">{row.pasien?.kode ?? ''}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.staff?.nama ?? '-'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="space-x-1 px-4 py-3 text-right">
                        <Link
                          to="/perawatan"
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                        >
                          Buka
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-xs font-bold tracking-wider text-slate-900 uppercase">Akses Cepat</h4>
            </div>
            <div className="space-y-2 text-xs">
              <Link
                to="/pembayaran/perawatan"
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2.5 hover:border-rose-300"
              >
                <span className="font-bold text-slate-900">Kasir Pembayaran</span>
                <span className="text-rose-700">→</span>
              </Link>
              <Link
                to="/warehouse/barang"
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2.5 hover:border-rose-300"
              >
                <span className="font-bold text-slate-900">Warehouse Stok</span>
                <span className="text-rose-700">→</span>
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 border-l-4 border-l-rose-500 bg-white p-4 shadow-sm">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wider text-slate-900 uppercase">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
              Alert Operasional
            </h4>
            <p className="text-xs text-slate-600">
              Pantau antrian menunggu dan stok kritis di warehouse setiap shift.
            </p>
            <Link to="/warehouse/stok-opname" className="mt-2 inline-block text-xs font-medium text-rose-700 hover:underline">
              Cek Stok Opname →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
