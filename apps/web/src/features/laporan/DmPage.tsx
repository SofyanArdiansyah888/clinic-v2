import { KpiCard } from '@/shared/components/KpiCard'
import { formatCurrency, formatNumber } from '@/shared/lib/formatters'
import { KpiGrid, ReportShell, ReportTable, type ReportColumn } from '@/features/laporan/ReportShell'

type DokterRow = {
  staff_id: number
  nama: string
  jabatan: string
  perawatan: number
  selesai: number
  pasien: number
  nilai: number
  komisi: number
}
type DiagnosaRow = { diagnosa: string; jumlah: number }

type DmLaporan = {
  ringkasan: { perawatan: number; selesai: number; pasien: number; nilai: number; komisi_dokter: number }
  per_dokter: DokterRow[] | null
  diagnosa: DiagnosaRow[] | null
}

const dokterColumns: ReportColumn<DokterRow>[] = [
  { key: 'nama', header: 'Dokter', cell: (r) => <span className="font-semibold">{r.nama}</span>, csv: (r) => r.nama },
  { key: 'jabatan', header: 'Jabatan', cell: (r) => r.jabatan || '-', csv: (r) => r.jabatan },
  { key: 'perawatan', header: 'Perawatan', cell: (r) => formatNumber(r.perawatan), csv: (r) => r.perawatan },
  { key: 'selesai', header: 'Sudah Dibayar', cell: (r) => formatNumber(r.selesai), csv: (r) => r.selesai },
  { key: 'pasien', header: 'Pasien', cell: (r) => formatNumber(r.pasien), csv: (r) => r.pasien },
  { key: 'nilai', header: 'Nilai Tindakan', cell: (r) => formatCurrency(r.nilai), csv: (r) => r.nilai },
  { key: 'komisi', header: 'Komisi', cell: (r) => formatCurrency(r.komisi), csv: (r) => r.komisi },
]

const diagnosaColumns: ReportColumn<DiagnosaRow>[] = [
  { key: 'diagnosa', header: 'Diagnosa', cell: (r) => r.diagnosa, csv: (r) => r.diagnosa },
  { key: 'jumlah', header: 'Jumlah', cell: (r) => formatNumber(r.jumlah), csv: (r) => r.jumlah },
]

export function DmPage() {
  return (
    <ReportShell<DmLaporan>
      title="Laporan DM"
      description="Laporan dokter / medis: perawatan per dokter, komisi, dan diagnosa terbanyak."
      endpoint="/laporan/dm"
    >
      {(d, periode) => (
        <>
          <KpiGrid>
            <KpiCard
              label="Perawatan (dibayar)"
              value={`${formatNumber(d.ringkasan.perawatan)} (${formatNumber(d.ringkasan.selesai)})`}
            />
            <KpiCard label="Pasien Unik" value={formatNumber(d.ringkasan.pasien)} />
            <KpiCard label="Nilai Tindakan" value={formatCurrency(d.ringkasan.nilai)} />
            <KpiCard label="Komisi Dokter" value={formatCurrency(d.ringkasan.komisi_dokter)} valueClass="text-emerald-700" />
          </KpiGrid>
          <p className="text-xs text-slate-500">
            Nilai dan komisi hanya dari perawatan yang sudah dibayar. Komisi = komisi dokter di master Treatment × jumlah
            tindakan.
          </p>
          <ReportTable
            title="Per Dokter"
            columns={dokterColumns}
            rows={d.per_dokter}
            rowKey={(r) => r.staff_id}
            filename="laporan_dm_dokter"
            periode={periode}
          />
          <ReportTable
            title="Diagnosa Terbanyak"
            description="Dikelompokkan berdasarkan teks diagnosa (20 teratas)."
            columns={diagnosaColumns}
            rows={d.diagnosa}
            rowKey={(r) => r.diagnosa}
            filename="laporan_dm_diagnosa"
            periode={periode}
          />
        </>
      )}
    </ReportShell>
  )
}
