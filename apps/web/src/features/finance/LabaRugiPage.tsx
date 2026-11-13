import { KpiCard } from '@/shared/components/KpiCard'
import { formatCurrency, formatDate } from '@/shared/lib/formatters'
import { KpiGrid, ReportShell } from '@/features/laporan/ReportShell'
import { Rp, StatementCard, StatementSection } from '@/features/finance/components/Statement'
import { saldoCsv, type AkunSaldo } from '@/features/finance/types'

type LabaRugi = {
  dari: string
  sampai: string
  pendapatan: AkunSaldo[]
  beban: AkunSaldo[]
  total_pendapatan: number
  total_beban: number
  laba_bersih: number
}

export function LabaRugiPage() {
  return (
    <ReportShell<LabaRugi>
      title="Laba Rugi"
      description="Pendapatan setelah diskon dan refund, dikurangi HPP dan beban pada periode terpilih."
      endpoint="/finance/laporan/laba-rugi"
    >
      {(d) => (
        <>
          <KpiGrid cols={3}>
            <KpiCard label="Pendapatan Bersih" value={formatCurrency(d.total_pendapatan)} valueClass="text-emerald-700" />
            <KpiCard label="Total Beban" value={formatCurrency(d.total_beban)} />
            <KpiCard
              label={d.laba_bersih >= 0 ? 'Laba Bersih' : 'Rugi Bersih'}
              value={formatCurrency(Math.abs(d.laba_bersih))}
              valueClass={d.laba_bersih >= 0 ? 'text-emerald-700' : 'text-rose-600'}
            />
          </KpiGrid>
          <StatementCard
            title={`Laporan Laba Rugi ${formatDate(d.dari)} – ${formatDate(d.sampai)}`}
            csv={{
              filename: `laba_rugi_${d.dari}_${d.sampai}`,
              headers: ['Bagian', 'Kode', 'Akun', 'Saldo'],
              rows: [...saldoCsv('Pendapatan', d.pendapatan), ...saldoCsv('Beban', d.beban), ['Laba Bersih', '', '', d.laba_bersih]],
            }}
          >
            <StatementSection title="Pendapatan" rows={d.pendapatan} total={d.total_pendapatan} totalLabel="Total Pendapatan" />
            <StatementSection title="Beban" rows={d.beban} total={d.total_beban} totalLabel="Total Beban" />
            <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-sm font-extrabold text-white">
              <span>{d.laba_bersih >= 0 ? 'LABA BERSIH' : 'RUGI BERSIH'}</span>
              <Rp value={d.laba_bersih} className={d.laba_bersih < 0 ? 'text-rose-300' : ''} />
            </div>
          </StatementCard>
        </>
      )}
    </ReportShell>
  )
}
