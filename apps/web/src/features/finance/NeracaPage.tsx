import { formatCurrency, formatDate } from '@/shared/lib/formatters'
import { ReportShell } from '@/features/laporan/ReportShell'
import { Rp, StatementCard, StatementSection } from '@/features/finance/components/Statement'
import { saldoCsv, type AkunSaldo } from '@/features/finance/types'

type Neraca = {
  per: string
  aset: AkunSaldo[]
  kewajiban: AkunSaldo[]
  ekuitas: AkunSaldo[]
  laba_berjalan: number
  total_aset: number
  total_kewajiban: number
  total_ekuitas: number
  total_pasiva: number
  seimbang: boolean
}

export function NeracaPage() {
  return (
    <ReportShell<Neraca>
      title="Neraca"
      description="Posisi aset, kewajiban, dan ekuitas per tanggal. Laba berjalan dihitung dari semua pendapatan dan beban sampai tanggal itu."
      endpoint="/finance/laporan/neraca"
      mode="per"
    >
      {(d) => (
        <>
          {d.seimbang ? (
            <div className="flex flex-wrap justify-between gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
              <span>Total Aset {formatCurrency(d.total_aset)} · Total Kewajiban + Ekuitas {formatCurrency(d.total_pasiva)}</span>
              <span>✓ Seimbang</span>
            </div>
          ) : (
            <div className="flex flex-wrap justify-between gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              <span>Neraca tidak seimbang. Periksa jurnal manual dan saldo awal.</span>
              <span>Selisih {formatCurrency(Math.abs(d.total_aset - d.total_pasiva))}</span>
            </div>
          )}
          <StatementCard
            title={`Neraca per ${formatDate(d.per)}`}
            csv={{
              filename: `neraca_${d.per}`,
              headers: ['Bagian', 'Kode', 'Akun', 'Saldo'],
              rows: [
                ...saldoCsv('Aset', d.aset),
                ...saldoCsv('Kewajiban', d.kewajiban),
                ...saldoCsv('Ekuitas', d.ekuitas),
                ['Ekuitas', '', 'Laba Tahun Berjalan', d.laba_berjalan],
              ],
            }}
          >
            <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-slate-200">
              <div className="flex flex-col">
                <StatementSection title="Aset" rows={d.aset} total={d.total_aset} totalLabel="Total Aset" />
                {/* Mirrors the pasiva total so both sides of the balance line up at the bottom. */}
                <div className="mt-auto flex items-center justify-between bg-slate-900 px-4 py-3 text-xs font-extrabold text-white">
                  <span>TOTAL ASET</span>
                  <Rp value={d.total_aset} />
                </div>
              </div>
              <div>
                <StatementSection title="Kewajiban" rows={d.kewajiban} total={d.total_kewajiban} totalLabel="Total Kewajiban" />
                <StatementSection
                  title="Ekuitas"
                  rows={d.ekuitas}
                  extra={[{ label: 'Laba Tahun Berjalan', value: d.laba_berjalan }]}
                  total={d.total_ekuitas}
                  totalLabel="Total Ekuitas"
                />
                <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-xs font-extrabold text-white">
                  <span>TOTAL KEWAJIBAN + EKUITAS</span>
                  <Rp value={d.total_pasiva} />
                </div>
              </div>
            </div>
          </StatementCard>
        </>
      )}
    </ReportShell>
  )
}
