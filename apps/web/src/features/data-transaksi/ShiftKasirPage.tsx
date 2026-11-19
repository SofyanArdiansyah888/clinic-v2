import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, LockKeyholeOpen, Printer, Search, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { apiGet } from '@/shared/api/client'
import { useAuthStore } from '@/features/auth/store'
import { EmptyState } from '@/shared/components/EmptyState'
import { KpiCard } from '@/shared/components/KpiCard'
import { PageHeader } from '@/shared/components/PageHeader'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn'
import { formatCurrency, formatDateTime } from '@/shared/lib/formatters'
import { openPrintTab } from '@/shared/lib/print'
import { selisihInfo, type KasirShift } from '@/features/pembayaran/kasir-shift'

const filterClass =
  'rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium focus:border-rose-500 focus:outline-none'

const rp = (v: number) => (v < 0 ? `- ${formatCurrency(-v)}` : formatCurrency(v || 0))

/** Read-only history of cashier shifts; the kasir sees their own, admin and finance see all. */
export function ShiftKasirPage() {
  const role = useAuthStore((s) => s.user?.role)
  const semua = role === 'admin' || role === 'finance'
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['kasir-shift-list', search, status, dari, sampai],
    queryFn: () =>
      apiGet<KasirShift[]>('/kasir/shift', {
        per_page: 100,
        page: 1,
        search: search || undefined,
        status: status || undefined,
        dari: dari || undefined,
        sampai: sampai || undefined,
      }),
  })
  const rows = useMemo(() => data?.data ?? [], [data])

  const stats = useMemo(() => {
    const closed = rows.filter((r) => r.status === 'closed')
    return {
      terbuka: rows.length - closed.length,
      selisih: closed.reduce((sum, r) => sum + (r.selisih ?? 0), 0),
      bermasalah: closed.filter((r) => Math.abs(r.selisih ?? 0) >= 0.01).length,
    }
  }, [rows])

  return (
    <div className="space-y-6">
      <PageHeader title="Riwayat Shift Kasir" description={semua ? 'Semua shift kasir dan selisih kas saat tutup' : 'Shift kasir Anda'} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Shift terbuka" value={stats.terbuka} icon={<LockKeyholeOpen className="h-5 w-5" />} iconClass="bg-emerald-50 text-emerald-600" />
        <KpiCard
          label="Shift dengan selisih"
          value={stats.bermasalah}
          icon={<AlertTriangle className="h-5 w-5" />}
          iconClass="bg-amber-50 text-amber-600"
        />
        <KpiCard
          label="Total selisih (ditutup)"
          value={rp(stats.selisih)}
          valueClass={selisihInfo(stats.selisih).tone}
          icon={<Wallet className="h-5 w-5" />}
          iconClass="bg-rose-50 text-rose-600"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="text-sm font-bold text-slate-900">Shift</h3>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input type="date" aria-label="Dari tanggal" value={dari} onChange={(e) => setDari(e.target.value)} className={filterClass} />
            <input type="date" aria-label="Sampai tanggal" value={sampai} onChange={(e) => setSampai(e.target.value)} className={filterClass} />
            <select aria-label="Status shift" value={status} onChange={(e) => setStatus(e.target.value)} className={filterClass}>
              <option value="">Semua Status</option>
              <option value="open">Terbuka</option>
              <option value="closed">Ditutup</option>
            </select>
            <div className="relative w-full sm:w-56">
              <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari kode / kasir"
                className={cn(filterClass, 'w-full py-1.5 pr-3 pl-9')}
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">Memuat shift kasir...</div>
        ) : isError ? (
          <div className="p-12 text-center text-xs text-rose-600">Gagal memuat shift kasir.</div>
        ) : rows.length === 0 ? (
          <EmptyState title="Belum ada shift" description="Shift dibuat dari Kasir › Buka/Tutup Kasir." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Kode</th>
                  <th className="px-4 py-3">Kasir</th>
                  <th className="px-4 py-3">Dibuka</th>
                  <th className="px-4 py-3">Ditutup</th>
                  <th className="px-4 py-3 text-right">Modal Awal</th>
                  <th className="px-4 py-3 text-right">Diharapkan</th>
                  <th className="px-4 py-3 text-right">Fisik</th>
                  <th className="px-4 py-3 text-right">Selisih</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const closed = r.status === 'closed'
                  const sel = r.selisih ?? 0
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-rose-700">{r.kode}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-800">{r.kasir_nama || '-'}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-600">{formatDateTime(r.opened_at)}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-600">{r.closed_at ? formatDateTime(r.closed_at) : '-'}</td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums">{formatCurrency(r.saldo_awal)}</td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums">{closed ? formatCurrency(r.expected_tunai ?? 0) : '-'}</td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums">{closed ? formatCurrency(r.saldo_akhir_fisik ?? 0) : '-'}</td>
                      <td className={cn('px-4 py-3 text-right text-xs font-bold tabular-nums', closed ? selisihInfo(sel).tone : 'text-slate-400')}>
                        {closed ? rp(sel) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={closed ? 'Ditutup' : 'Terbuka'} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button type="button" size="sm" variant="outline" onClick={() => openPrintTab(`/cetak/shift/${r.id}`)}>
                          <Printer />
                          Cetak
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
