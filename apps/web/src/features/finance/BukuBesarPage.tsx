import { useState } from 'react'
import { KpiCard } from '@/shared/components/KpiCard'
import { formatCurrency, formatDate } from '@/shared/lib/formatters'
import { KpiGrid, ReportShell, ReportTable, type ReportColumn } from '@/features/laporan/ReportShell'
import { AkunSelect } from '@/features/finance/components/AkunSelect'
import { SOURCE_LABEL, type Akun } from '@/features/finance/types'

type Row = {
  jurnal_id: number
  kode: string
  tanggal: string
  referensi: string
  source_type: string
  keterangan: string
  debit: number
  kredit: number
  saldo: number
}

type BukuBesar = {
  akun: Akun
  saldo_awal: number
  rows: Row[]
  total_debit: number
  total_kredit: number
  saldo_akhir: number
}

const columns: ReportColumn<Row>[] = [
  { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal), csv: (r) => r.tanggal.slice(0, 10) },
  { key: 'kode', header: 'Jurnal', cell: (r) => <span className="font-mono text-xs text-teal-700">{r.kode}</span>, csv: (r) => r.kode },
  { key: 'sumber', header: 'Sumber', cell: (r) => SOURCE_LABEL[r.source_type] ?? r.source_type, csv: (r) => r.source_type },
  {
    key: 'ket',
    header: 'Keterangan',
    cell: (r) => (
      <div>
        <p>{r.keterangan}</p>
        {r.referensi ? <p className="font-mono text-[10px] text-slate-500">{r.referensi}</p> : null}
      </div>
    ),
    csv: (r) => r.keterangan,
  },
  { key: 'debit', header: 'Debit', className: 'text-right', cell: (r) => (r.debit ? formatCurrency(r.debit) : ''), csv: (r) => r.debit },
  { key: 'kredit', header: 'Kredit', className: 'text-right', cell: (r) => (r.kredit ? formatCurrency(r.kredit) : ''), csv: (r) => r.kredit },
  { key: 'saldo', header: 'Saldo', className: 'text-right font-semibold', cell: (r) => formatCurrency(r.saldo), csv: (r) => r.saldo },
]

export function BukuBesarPage() {
  const [akunId, setAkunId] = useState('')

  return (
    <ReportShell<BukuBesar>
      title="Buku Besar"
      description="Mutasi satu akun dengan saldo awal dan saldo berjalan."
      endpoint="/finance/laporan/buku-besar"
      params={{ akun_id: akunId }}
      enabled={!!akunId}
      filters={
        <div className="w-full space-y-1.5 sm:w-80">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Akun</span>
          <AkunSelect value={akunId} onChange={setAkunId} />
        </div>
      }
    >
      {(d, periode) => (
        <>
          <KpiGrid>
            <KpiCard label="Saldo Awal" value={formatCurrency(d.saldo_awal)} />
            <KpiCard label="Total Debit" value={formatCurrency(d.total_debit)} />
            <KpiCard label="Total Kredit" value={formatCurrency(d.total_kredit)} />
            <KpiCard label="Saldo Akhir" value={formatCurrency(d.saldo_akhir)} valueClass="text-teal-700" />
          </KpiGrid>
          <ReportTable
            title={`${d.akun.kode} · ${d.akun.nama}`}
            description={`Saldo normal ${d.akun.saldo_normal}`}
            columns={columns}
            rows={d.rows}
            rowKey={(r) => `${r.jurnal_id}-${r.debit}-${r.kredit}`}
            filename={`buku_besar_${d.akun.kode}`}
            periode={periode}
          />
        </>
      )}
    </ReportShell>
  )
}
