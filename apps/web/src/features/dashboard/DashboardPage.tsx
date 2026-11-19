import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CalendarClock, ChevronRight, Coins, Plus, UserPlus, Users } from 'lucide-react'
import { apiGet } from '@/shared/api/client'
import { KpiCard } from '@/shared/components/KpiCard'
import { PageHeader } from '@/shared/components/PageHeader'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { formatCurrency, formatNumber, todayISO } from '@/shared/lib/formatters'
import type { DashboardKpi } from '@/shared/types/api'
import { buttonVariants } from '@/shared/ui/button'
import { Tabs } from '@/shared/ui/tabs'
import { DashboardCharts, type TrenHari } from './DashboardCharts'

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
  const [hari, setHari] = useState<TrenHari>('7')
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

  const pending = kpi?.pending_queue ?? 0
  const show = (value: string) => (kpiQuery.isLoading || !kpi ? '-' : value)

  const quickLinks = [
    { to: '/pembayaran/perawatan', label: 'Kasir Pembayaran' },
    { to: '/warehouse/barang', label: 'Stok Barang' },
    { to: '/warehouse/stok-opname', label: 'Stok Opname' },
  ] as const

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Ringkasan operasional hari ini"
        actions={
          <>
            <Tabs<TrenHari>
              value={hari}
              onChange={setHari}
              items={[
                { value: '7', label: '7 Hari' },
                { value: '30', label: '30 Hari' },
              ]}
            />
            <Link to="/resepsionis/kunjungan" className={buttonVariants({ variant: 'outline' })}>
              Papan Antrian
            </Link>
            <Link to="/administrasi/pasien" className={buttonVariants()}>
              <Plus />
              Registrasi Pasien
            </Link>
          </>
        }
      />

      {kpiQuery.isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">Gagal memuat KPI.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <KpiCard
            label="Pendapatan"
            value={show(formatCurrency(kpi?.revenue_today ?? 0))}
            icon={<Coins className="h-5 w-5" />}
            iconClass="bg-rose-50 text-rose-700"
          />
          <KpiCard
            label="Kunjungan"
            value={show(formatNumber(kpi?.visits_today ?? 0))}
            icon={<Users className="h-5 w-5" />}
            iconClass="bg-sky-50 text-sky-700"
          />
          <KpiCard
            label="Pasien Baru"
            value={show(formatNumber(kpi?.new_patients_today ?? 0))}
            icon={<UserPlus className="h-5 w-5" />}
            iconClass="bg-amber-50 text-amber-700"
          />
          <KpiCard
            label="Menunggu"
            value={show(formatNumber(pending))}
            valueClass={pending > 0 ? 'text-rose-600' : 'text-slate-900'}
            icon={<CalendarClock className="h-5 w-5" />}
            iconClass="bg-rose-50 text-rose-700"
          />
        </div>
      )}

      <DashboardCharts hari={hari} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900">Antrian Aktif</h3>
            <Link to="/resepsionis/kunjungan" className="text-xs font-semibold text-rose-700 hover:underline">
              Lihat semua
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  <th className="px-4 py-3">No.</th>
                  <th className="px-4 py-3">Pasien</th>
                  <th className="px-4 py-3">Dokter</th>
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
                      <td className="px-4 py-3 text-right">
                        <Link to="/perawatan" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
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

        <div className="self-start rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-slate-900">Akses Cepat</h3>
          <div className="space-y-2 text-xs">
            {quickLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-semibold text-slate-900 hover:border-rose-300"
              >
                {link.label}
                <ChevronRight className="h-4 w-4 text-rose-700" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
