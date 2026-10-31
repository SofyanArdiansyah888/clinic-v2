import { KpiCard } from '@/shared/components/KpiCard'
import { formatCurrency, formatNumber } from '@/shared/lib/formatters'
import { KpiGrid, ReportShell, ReportTable, type ReportColumn } from '@/features/laporan/ReportShell'

type BarangRow = { barang_id: number; kode: string; nama: string; satuan: string; qty: number; nilai: number; stok: number }
type MenipisRow = { barang_id: number; kode: string; nama: string; satuan: string; stok_aktual: number; stok_minimal: number }

type ApotekLaporan = {
  ringkasan: {
    item_terjual: number
    nilai_penjualan: number
    resep_dibayar: number
    resep_diserahkan: number
    resep_belum_dibayar: number
    stok_menipis: number
  }
  barang_terjual: BarangRow[] | null
  stok_menipis: MenipisRow[] | null
}

const barangColumns: ReportColumn<BarangRow>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono text-xs">{r.kode}</span>, csv: (r) => r.kode },
  { key: 'nama', header: 'Barang', cell: (r) => r.nama, csv: (r) => r.nama },
  { key: 'qty', header: 'Qty Terjual', cell: (r) => `${formatNumber(r.qty)} ${r.satuan}`, csv: (r) => r.qty },
  { key: 'nilai', header: 'Nilai', cell: (r) => formatCurrency(r.nilai), csv: (r) => r.nilai },
  { key: 'stok', header: 'Stok Saat Ini', cell: (r) => formatNumber(r.stok), csv: (r) => r.stok },
]

const menipisColumns: ReportColumn<MenipisRow>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono text-xs">{r.kode}</span>, csv: (r) => r.kode },
  { key: 'nama', header: 'Barang', cell: (r) => r.nama, csv: (r) => r.nama },
  {
    key: 'stok',
    header: 'Stok',
    cell: (r) => <span className="font-semibold text-rose-600">{`${formatNumber(r.stok_aktual)} ${r.satuan}`}</span>,
    csv: (r) => r.stok_aktual,
  },
  { key: 'minimal', header: 'Stok Minimal', cell: (r) => formatNumber(r.stok_minimal), csv: (r) => r.stok_minimal },
]

export function ApotekPage() {
  return (
    <ReportShell<ApotekLaporan>
      title="Laporan Apotek"
      description="Penjualan obat/produk yang sudah lunas, status resep, dan stok yang perlu dipesan ulang."
      endpoint="/laporan/apotek"
    >
      {(d, periode) => (
        <>
          <KpiGrid>
            <KpiCard label="Item Terjual" value={formatNumber(d.ringkasan.item_terjual)} />
            <KpiCard label="Nilai Penjualan Barang" value={formatCurrency(d.ringkasan.nilai_penjualan)} valueClass="text-teal-700" />
            <KpiCard
              label="Resep Siap / Diserahkan"
              value={`${formatNumber(d.ringkasan.resep_dibayar)} / ${formatNumber(d.ringkasan.resep_diserahkan)}`}
            />
            <KpiCard
              label="Stok Menipis"
              value={formatNumber(d.ringkasan.stok_menipis)}
              valueClass={d.ringkasan.stok_menipis > 0 ? 'text-rose-600' : 'text-slate-900'}
            />
          </KpiGrid>
          {d.ringkasan.resep_belum_dibayar > 0 ? (
            <p className="text-xs text-slate-500">
              {formatNumber(d.ringkasan.resep_belum_dibayar)} resep pada periode ini belum dibayar di kasir.
            </p>
          ) : null}
          <ReportTable
            title="Barang Terlaris"
            description="Nilai sebelum diskon transaksi (promo/voucher dihitung per transaksi, bukan per barang)."
            columns={barangColumns}
            rows={d.barang_terjual}
            rowKey={(r) => r.barang_id}
            filename="laporan_apotek_barang_terjual"
            periode={periode}
          />
          <ReportTable
            title="Stok Menipis"
            description="Barang aktif dengan stok di bawah atau sama dengan stok minimal (kondisi saat ini)."
            columns={menipisColumns}
            rows={d.stok_menipis}
            rowKey={(r) => r.barang_id}
            filename="laporan_apotek_stok_menipis"
            periode={periode}
          />
        </>
      )}
    </ReportShell>
  )
}
