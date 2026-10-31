import { KpiCard } from '@/shared/components/KpiCard'
import { formatCurrency, formatDate, formatNumber } from '@/shared/lib/formatters'
import { KpiGrid, ReportShell, ReportTable, type ReportColumn } from '@/features/laporan/ReportShell'

type JenisRow = { jenis_pembayaran: string; transaksi: number; total: number }
type HarianRow = { tanggal: string; kunjungan: number; transaksi: number; pendapatan: number }
type StatusRow = { status: string; jumlah: number }

type FoLaporan = {
  ringkasan: {
    kunjungan: number
    pasien_baru: number
    appointment: number
    transaksi: number
    pendapatan_bruto: number
    diskon: number
    pendapatan_bersih: number
    poin_dipakai: number
    deposit_masuk: number
    deposit_dipakai: number
  }
  per_jenis_pembayaran: JenisRow[] | null
  harian: HarianRow[] | null
  status_appointment: StatusRow[] | null
}

const JENIS_LABEL: Record<string, string> = {
  tunai: 'Tunai',
  transfer: 'Transfer Bank',
  kartu_debit: 'Kartu Debit',
  kartu_kredit: 'Kartu Kredit',
  e_money: 'E-Money',
  deposit_poin: 'Deposit / Poin',
}

const jenisColumns: ReportColumn<JenisRow>[] = [
  {
    key: 'jenis',
    header: 'Jenis Pembayaran',
    cell: (r) => JENIS_LABEL[r.jenis_pembayaran] ?? r.jenis_pembayaran,
    csv: (r) => JENIS_LABEL[r.jenis_pembayaran] ?? r.jenis_pembayaran,
  },
  { key: 'transaksi', header: 'Transaksi', cell: (r) => formatNumber(r.transaksi), csv: (r) => r.transaksi },
  { key: 'total', header: 'Total (bersih)', cell: (r) => formatCurrency(r.total), csv: (r) => r.total },
]

const harianColumns: ReportColumn<HarianRow>[] = [
  { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal), csv: (r) => r.tanggal },
  { key: 'kunjungan', header: 'Kunjungan', cell: (r) => formatNumber(r.kunjungan), csv: (r) => r.kunjungan },
  { key: 'transaksi', header: 'Transaksi', cell: (r) => formatNumber(r.transaksi), csv: (r) => r.transaksi },
  { key: 'pendapatan', header: 'Pendapatan (bersih)', cell: (r) => formatCurrency(r.pendapatan), csv: (r) => r.pendapatan },
]

const statusColumns: ReportColumn<StatusRow>[] = [
  { key: 'status', header: 'Status', cell: (r) => r.status, csv: (r) => r.status },
  { key: 'jumlah', header: 'Jumlah', cell: (r) => formatNumber(r.jumlah), csv: (r) => r.jumlah },
]

export function FoPage() {
  return (
    <ReportShell<FoLaporan>
      title="Laporan FO"
      description="Kunjungan, pasien baru, dan pendapatan kasir (setelah diskon) per periode."
      endpoint="/laporan/fo"
    >
      {(d, periode) => (
        <>
          <KpiGrid>
            <KpiCard label="Kunjungan" value={formatNumber(d.ringkasan.kunjungan)} />
            <KpiCard label="Pasien Baru" value={formatNumber(d.ringkasan.pasien_baru)} />
            <KpiCard label="Appointment" value={formatNumber(d.ringkasan.appointment)} />
            <KpiCard label="Transaksi Lunas" value={formatNumber(d.ringkasan.transaksi)} />
            <KpiCard label="Pendapatan Bruto" value={formatCurrency(d.ringkasan.pendapatan_bruto)} />
            <KpiCard label="Diskon Promo & Voucher" value={formatCurrency(d.ringkasan.diskon)} valueClass="text-rose-600" />
            <KpiCard
              label="Pendapatan Bersih"
              value={formatCurrency(d.ringkasan.pendapatan_bersih)}
              valueClass="text-teal-700"
            />
            <KpiCard
              label="Deposit Masuk / Dipakai"
              value={`${formatCurrency(d.ringkasan.deposit_masuk)} / ${formatCurrency(d.ringkasan.deposit_dipakai)}`}
              valueClass="text-base text-slate-900"
            />
          </KpiGrid>
          <p className="text-xs text-slate-500">
            Pendapatan bersih = bruto − diskon. Dari pendapatan itu, {formatNumber(d.ringkasan.poin_dipakai)} poin dan{' '}
            {formatCurrency(d.ringkasan.deposit_dipakai)} deposit dipakai sebagai alat bayar; tabel per jenis pembayaran
            menghitung nilai penuh tiap transaksi menurut jenis pembayaran utamanya.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <ReportTable
              title="Per Jenis Pembayaran"
              columns={jenisColumns}
              rows={d.per_jenis_pembayaran}
              rowKey={(r) => r.jenis_pembayaran}
              filename="laporan_fo_jenis_pembayaran"
              periode={periode}
            />
            <ReportTable
              title="Status Appointment"
              columns={statusColumns}
              rows={d.status_appointment}
              rowKey={(r) => r.status}
              filename="laporan_fo_appointment"
              periode={periode}
            />
          </div>
          <ReportTable
            title="Harian"
            columns={harianColumns}
            rows={d.harian}
            rowKey={(r) => r.tanggal}
            filename="laporan_fo_harian"
            periode={periode}
          />
        </>
      )}
    </ReportShell>
  )
}
