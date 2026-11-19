// Report shapes the magazine reads (same endpoints as the Laporan and Finance pages),
// period helpers and the division list.

export type Periode = { dari: string; sampai: string }

export type FoData = {
  ringkasan: {
    kunjungan: number
    pasien_baru: number
    transaksi: number
    pendapatan_bruto: number
    diskon: number
    pendapatan_bersih: number
    deposit_masuk: number
  }
  per_jenis_pembayaran: { jenis_pembayaran: string; transaksi: number; total: number }[] | null
  harian: { tanggal: string; kunjungan: number; transaksi: number; pendapatan: number }[] | null
}

export type DmData = {
  ringkasan: { perawatan: number; selesai: number; pasien: number; nilai: number; komisi_dokter: number }
  per_dokter: { staff_id: number; nama: string; perawatan: number; pasien: number; nilai: number; komisi: number }[] | null
  diagnosa: { diagnosa: string; jumlah: number }[] | null
}

export type NurseData = {
  ringkasan: { tindakan: number; nilai: number; komisi_terapis: number; tanpa_terapis: number }
  per_terapis: { staff_id: number; nama: string; tindakan: number; pasien: number; nilai: number; komisi: number }[] | null
  treatment: { treatment_id: number; nama: string; jumlah: number; nilai: number }[] | null
}

export type ApotekData = {
  ringkasan: {
    item_terjual: number
    nilai_penjualan: number
    resep_dibayar: number
    resep_diserahkan: number
    resep_belum_dibayar: number
    stok_menipis: number
  }
  barang_terjual: { barang_id: number; nama: string; satuan: string; qty: number; nilai: number }[] | null
  stok_menipis: { barang_id: number; nama: string; satuan: string; stok_aktual: number; stok_minimal: number }[] | null
}

type Ringkasan = {
  dari: string
  sampai: string
  pendapatan: number
  hpp: number
  laba_kotor: number
  beban_operasional: number
  laba_bersih: number
  margin_kotor: number
  margin_bersih: number
}
type AkunSaldo = { akun: { id: number; kode: string; nama: string }; saldo: number }
export type FinanceData = {
  periode: Ringkasan
  pembanding: Ringkasan
  tahun_lalu: Ringkasan
  posisi: { per: string; kas_bank: number; total_aset: number; total_kewajiban: number; utang_deposit_pasien: number; utang_usaha: number }
  posisi_pembanding: { per: string; kas_bank: number }
  tren: { bulan: string; pendapatan: number; beban: number; laba_bersih: number }[]
  komposisi_pendapatan: AkunSaldo[]
  beban_terbesar: AkunSaldo[]
}

export type DivisiKey = 'fo' | 'dokter' | 'terapis' | 'apotek' | 'finance'

export const DIVISI: { key: DivisiKey; nama: string; tagline: string; endpoint: string; roles: string[] }[] = [
  { key: 'fo', nama: 'Front Office & Kasir', tagline: 'Kunjungan, transaksi, dan pembayaran', endpoint: '/laporan/fo', roles: ['admin', 'staff', 'finance'] },
  { key: 'dokter', nama: 'Dokter', tagline: 'Perawatan, pasien, dan diagnosa', endpoint: '/laporan/dm', roles: ['admin', 'doctor'] },
  { key: 'terapis', nama: 'Terapis & Nurse', tagline: 'Tindakan, treatment, dan komisi', endpoint: '/laporan/nurse', roles: ['admin', 'nurse'] },
  { key: 'apotek', nama: 'Apotek & Depo', tagline: 'Penjualan obat, resep, dan stok', endpoint: '/laporan/apotek', roles: ['admin', 'apoteker', 'finance'] },
  { key: 'finance', nama: 'Keuangan', tagline: 'Laba rugi, margin, dan posisi kas', endpoint: '/finance/laporan/highlights', roles: ['admin', 'finance'] },
]

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const endOfMonth = (y: number, m: number) => new Date(y, m + 1, 0)

/**
 * The period to compare against; mirrors the API's finance highlights rule. A period that
 * starts on the 1st moves back by whole months (1–19 Nov -> 1–19 Okt), any other period
 * moves back by its own length so the two touch.
 */
export function previousPeriode(p: Periode): Periode {
  const dari = parse(p.dari)
  const sampai = parse(p.sampai)
  if (dari.getDate() === 1) {
    const months = (sampai.getFullYear() - dari.getFullYear()) * 12 + (sampai.getMonth() - dari.getMonth()) + 1
    const pd = new Date(dari.getFullYear(), dari.getMonth() - months, 1)
    const last = endOfMonth(sampai.getFullYear(), sampai.getMonth() - months)
    const isMonthEnd = sampai.getDate() === endOfMonth(sampai.getFullYear(), sampai.getMonth()).getDate()
    const ps = isMonthEnd || sampai.getDate() > last.getDate() ? last : new Date(last.getFullYear(), last.getMonth(), sampai.getDate())
    return { dari: iso(pd), sampai: iso(ps) }
  }
  const days = Math.round((sampai.getTime() - dari.getTime()) / 86_400_000) + 1
  return { dari: iso(new Date(dari.getFullYear(), dari.getMonth(), dari.getDate() - days)), sampai: iso(new Date(dari.getFullYear(), dari.getMonth(), dari.getDate() - 1)) }
}

export function periodeLabel(p: Periode) {
  const fmt = (s: string, withYear: boolean) =>
    parse(s).toLocaleDateString('id-ID', withYear ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long' })
  const d = parse(p.dari)
  const s = parse(p.sampai)
  // A whole calendar month reads as "November 2026".
  if (d.getDate() === 1 && s.getDate() === endOfMonth(s.getFullYear(), s.getMonth()).getDate() && d.getMonth() === s.getMonth() && d.getFullYear() === s.getFullYear()) {
    return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  }
  return `${fmt(p.dari, d.getFullYear() !== s.getFullYear())} – ${fmt(p.sampai, true)}`
}

export const todayIso = () => iso(new Date())
export const startOfMonthIso = () => {
  const n = new Date()
  return iso(new Date(n.getFullYear(), n.getMonth(), 1))
}
export const lastMonth = (): Periode => {
  const n = new Date()
  return { dari: iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), sampai: iso(endOfMonth(n.getFullYear(), n.getMonth() - 1)) }
}
