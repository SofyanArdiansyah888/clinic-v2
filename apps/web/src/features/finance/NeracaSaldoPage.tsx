import { formatCurrency } from '@/shared/lib/formatters'
import { ReportShell, ReportTable, type ReportColumn } from '@/features/laporan/ReportShell'
import { TIPE_LABEL, type Akun } from '@/features/finance/types'

type Row = { akun: Akun; debit: number; kredit: number }
type NeracaSaldo = { sampai: string; rows: Row[]; total_debit: number; total_kredit: number }

const columns: ReportColumn<Row>[] = [
  {
    key: 'kode',
    header: 'Kode',
    cell: (r) => <span className="font-mono text-xs text-teal-700">{r.akun.kode}</span>,
    csv: (r) => r.akun.kode,
  },
  { key: 'nama', header: 'Akun', cell: (r) => r.akun.nama, csv: (r) => r.akun.nama },
  { key: 'tipe', header: 'Tipe', cell: (r) => TIPE_LABEL[r.akun.tipe], csv: (r) => TIPE_LABEL[r.akun.tipe] },
  { key: 'debit', header: 'Debit', className: 'text-right', cell: (r) => (r.debit ? formatCurrency(r.debit) : ''), csv: (r) => r.debit },
  { key: 'kredit', header: 'Kredit', className: 'text-right', cell: (r) => (r.kredit ? formatCurrency(r.kredit) : ''), csv: (r) => r.kredit },
]

export function NeracaSaldoPage() {
  return (
    <ReportShell<NeracaSaldo>
      title="Neraca Saldo"
      description="Saldo setiap akun per tanggal. Total debit dan kredit harus sama."
      endpoint="/finance/laporan/neraca-saldo"
      mode="per"
    >
      {(d, periode) => {
        const seimbang = Math.round(d.total_debit * 100) === Math.round(d.total_kredit * 100)
        return (
          <>
            <div
              className={
                seimbang
                  ? 'flex flex-wrap justify-between gap-2 rounded-xl bg-teal-50 p-3 text-xs font-semibold text-teal-800'
                  : 'flex flex-wrap justify-between gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700'
              }
            >
              <span>
                Total Debit {formatCurrency(d.total_debit)} · Total Kredit {formatCurrency(d.total_kredit)}
              </span>
              <span>{seimbang ? 'Seimbang' : 'Tidak seimbang'}</span>
            </div>
            <ReportTable
              title={`Neraca Saldo per ${d.sampai}`}
              columns={columns}
              rows={d.rows}
              rowKey={(r) => r.akun.id}
              filename="neraca_saldo"
              periode={periode}
            />
          </>
        )
      }}
    </ReportShell>
  )
}
