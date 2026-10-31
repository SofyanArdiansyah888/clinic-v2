import { KpiCard } from '@/shared/components/KpiCard'
import { formatCurrency, formatNumber } from '@/shared/lib/formatters'
import { KpiGrid, ReportShell, ReportTable, type ReportColumn } from '@/features/laporan/ReportShell'

type TerapisRow = {
  staff_id: number
  nama: string
  jabatan: string
  tindakan: number
  pasien: number
  nilai: number
  komisi: number
}
type TreatmentRow = { treatment_id: number; nama: string; kategori: string; jumlah: number; nilai: number }

type NurseLaporan = {
  ringkasan: { tindakan: number; nilai: number; komisi_terapis: number; tanpa_terapis: number }
  per_terapis: TerapisRow[] | null
  treatment: TreatmentRow[] | null
}

const terapisColumns: ReportColumn<TerapisRow>[] = [
  { key: 'nama', header: 'Terapis / Nurse', cell: (r) => <span className="font-semibold">{r.nama}</span>, csv: (r) => r.nama },
  { key: 'jabatan', header: 'Jabatan', cell: (r) => r.jabatan || '-', csv: (r) => r.jabatan },
  { key: 'tindakan', header: 'Tindakan', cell: (r) => formatNumber(r.tindakan), csv: (r) => r.tindakan },
  { key: 'pasien', header: 'Pasien', cell: (r) => formatNumber(r.pasien), csv: (r) => r.pasien },
  { key: 'nilai', header: 'Nilai Tindakan', cell: (r) => formatCurrency(r.nilai), csv: (r) => r.nilai },
  { key: 'komisi', header: 'Komisi', cell: (r) => formatCurrency(r.komisi), csv: (r) => r.komisi },
]

const treatmentColumns: ReportColumn<TreatmentRow>[] = [
  { key: 'nama', header: 'Treatment', cell: (r) => r.nama, csv: (r) => r.nama },
  { key: 'kategori', header: 'Kategori', cell: (r) => r.kategori || '-', csv: (r) => r.kategori },
  { key: 'jumlah', header: 'Jumlah', cell: (r) => formatNumber(r.jumlah), csv: (r) => r.jumlah },
  { key: 'nilai', header: 'Nilai', cell: (r) => formatCurrency(r.nilai), csv: (r) => r.nilai },
]

export function NursePage() {
  return (
    <ReportShell<NurseLaporan>
      title="Laporan Nurse"
      description="Tindakan per terapis/nurse dan komisinya, dari perawatan yang sudah dibayar."
      endpoint="/laporan/nurse"
    >
      {(d, periode) => (
        <>
          <KpiGrid>
            <KpiCard label="Tindakan" value={formatNumber(d.ringkasan.tindakan)} />
            <KpiCard label="Nilai Tindakan" value={formatCurrency(d.ringkasan.nilai)} />
            <KpiCard label="Komisi Terapis" value={formatCurrency(d.ringkasan.komisi_terapis)} valueClass="text-teal-700" />
            <KpiCard
              label="Tindakan Tanpa Terapis"
              value={formatNumber(d.ringkasan.tanpa_terapis)}
              valueClass={d.ringkasan.tanpa_terapis > 0 ? 'text-amber-600' : 'text-slate-900'}
            />
          </KpiGrid>
          <p className="text-xs text-slate-500">
            Komisi = komisi terapis di master Treatment × jumlah tindakan. Tindakan tanpa terapis tidak menghasilkan komisi.
          </p>
          <ReportTable
            title="Per Terapis / Nurse"
            columns={terapisColumns}
            rows={d.per_terapis}
            rowKey={(r) => r.staff_id}
            filename="laporan_nurse_terapis"
            periode={periode}
          />
          <ReportTable
            title="Treatment Terbanyak"
            columns={treatmentColumns}
            rows={d.treatment}
            rowKey={(r) => r.treatment_id}
            filename="laporan_nurse_treatment"
            periode={periode}
          />
        </>
      )}
    </ReportShell>
  )
}
