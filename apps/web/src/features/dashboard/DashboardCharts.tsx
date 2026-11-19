import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useAuthStore } from '@/features/auth/store'
import { apiGet } from '@/shared/api/client'
import { BarChart, type BarDatum } from '@/shared/components/charts/BarChart'
import { BarList } from '@/shared/components/charts/BarList'
import { SERIES } from '@/shared/components/charts/palette'
import { formatCurrency, formatDate, formatNumber } from '@/shared/lib/formatters'
import { jenisPembayaranLabel } from '@/shared/lib/pembayaran'
import { statusLabel } from '@/shared/lib/status'
import { Skeleton } from '@/shared/ui/skeleton'
import { Tabs } from '@/shared/ui/tabs'

export type TrenHari = '7' | '30'

type Tren = {
  harian: { tanggal: string; kunjungan: number; pendapatan?: number }[]
  top_treatment: { nama: string; jumlah: number }[]
  status_appointment: { status: string; jumlah: number }[]
  per_jenis_pembayaran?: { jenis_pembayaran: string; total: number }[]
}

// Mirrors canSeeRevenue in api/internal/modules/dashboard; the API also omits the data.
const REVENUE_ROLES = ['admin', 'staff', 'finance']

type Metric = 'pendapatan' | 'kunjungan'

function ChartCard({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm ${className ?? ''}`}>
      <div className="mb-4 flex min-h-8 items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export function DashboardCharts({ hari }: { hari: TrenHari }) {
  const role = useAuthStore((s) => s.user?.role)
  const revenue = REVENUE_ROLES.includes(role ?? '')
  const [metric, setMetric] = useState<Metric>(revenue ? 'pendapatan' : 'kunjungan')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'tren', hari],
    queryFn: () => apiGet<Tren>('/dashboard/tren', { hari }),
  })
  const tren = data?.data
  const activeMetric: Metric = revenue ? metric : 'kunjungan'

  if (isError) {
    return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">Gagal memuat grafik.</div>
  }

  const bars: BarDatum[] = (tren?.harian ?? []).map((d) => ({
    key: d.tanggal,
    label: formatDate(d.tanggal, 'd MMM'),
    value: activeMetric === 'pendapatan' ? (d.pendapatan ?? 0) : d.kunjungan,
  }))
  const loading = isLoading || !tren
  const listSkeleton = (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-7 bg-slate-100" />
      ))}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard
          title="Tren Harian"
          className="lg:col-span-2"
          action={
            revenue ? (
              <Tabs<Metric>
                value={metric}
                onChange={setMetric}
                items={[
                  { value: 'pendapatan', label: 'Pendapatan' },
                  { value: 'kunjungan', label: 'Kunjungan' },
                ]}
              />
            ) : null
          }
        >
          {loading ? (
            <Skeleton className="h-56 bg-slate-100" />
          ) : (
            <BarChart
              data={bars}
              color={activeMetric === 'pendapatan' ? SERIES.pendapatan : SERIES.kunjungan}
              formatValue={activeMetric === 'pendapatan' ? formatCurrency : (v) => `${formatNumber(v)} kunjungan`}
              formatLabel={(d) => formatDate(d.key, 'EEE, d MMM')}
            />
          )}
        </ChartCard>

        <ChartCard title="Top Treatment">
          {loading ? (
            listSkeleton
          ) : (
            <BarList
              items={tren.top_treatment.map((t) => ({ key: t.nama, label: t.nama, value: t.jumlah }))}
              formatValue={(v) => `${formatNumber(v)}x`}
            />
          )}
        </ChartCard>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${revenue ? 'md:grid-cols-2' : ''}`}>
        {revenue ? (
          <ChartCard title="Metode Pembayaran">
            {loading ? (
              listSkeleton
            ) : (
              <BarList
                items={(tren.per_jenis_pembayaran ?? []).map((j) => ({
                  key: j.jenis_pembayaran,
                  label: jenisPembayaranLabel(j.jenis_pembayaran),
                  value: j.total,
                }))}
                formatValue={formatCurrency}
              />
            )}
          </ChartCard>
        ) : null}

        <ChartCard title="Status Appointment">
          {loading ? (
            listSkeleton
          ) : (
            <BarList
              items={tren.status_appointment.map((s) => ({ key: s.status, label: statusLabel(s.status), value: s.jumlah }))}
              formatValue={formatNumber}
            />
          )}
        </ChartCard>
      </div>
    </div>
  )
}
