import type { CsvValue } from '@/shared/lib/csv'

export type TipeAkun = 'aset' | 'kewajiban' | 'ekuitas' | 'pendapatan' | 'beban'

export type Akun = {
  id: number
  kode: string
  nama: string
  tipe: TipeAkun
  saldo_normal: 'debit' | 'kredit'
  parent_id: number | null
  is_header: boolean
  is_system: boolean
  is_active: boolean
  keterangan?: string
}

export type JurnalDetail = {
  id: number
  akun_id: number
  debit: number
  kredit: number
  keterangan?: string
  akun?: Akun
}

export type Jurnal = {
  id: number
  kode: string
  tanggal: string
  keterangan: string
  referensi: string
  source_type: string
  source_id: number
  reversal_of_id: number | null
  is_reversed: boolean
  total_debit: number
  total_kredit: number
  details?: JurnalDetail[]
}

export type MappingItem = {
  key: string
  label: string
  grup: string
  keterangan: string
  akun_id: number | null
}

export type BankMapping = {
  bank_id: number
  kode: string
  nama: string
  key: string
  akun_id: number | null
}

export type MappingResponse = { items: MappingItem[]; banks: BankMapping[] }

export type AkunSaldo = { akun: Akun; saldo: number }

export const TIPE_LABEL: Record<TipeAkun, string> = {
  aset: 'Aset',
  kewajiban: 'Kewajiban',
  ekuitas: 'Ekuitas',
  pendapatan: 'Pendapatan',
  beban: 'Beban',
}

export const SOURCE_LABEL: Record<string, string> = {
  penjualan: 'Penjualan',
  deposit: 'Deposit / Member',
  paket: 'Refund Paket',
  pembelian: 'Pembelian',
  pelunasan_pembelian: 'Bayar Supplier',
  stok_opname: 'Stok Opname',
  manual: 'Jurnal Manual',
}

export function apiErrorMessage(err: unknown, fallback = 'Terjadi kesalahan') {
  const msg = (err as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
  if (msg) return msg
  return err instanceof Error ? err.message : fallback
}

export function saldoCsv(section: string, rows: AkunSaldo[]): CsvValue[][] {
  return rows.map((r) => [section, r.akun.kode, r.akun.nama, r.saldo])
}

// ── Report payloads (/finance/laporan/*) ──

export type LabaRugiData = {
  dari: string
  sampai: string
  pendapatan: AkunSaldo[]
  beban: AkunSaldo[]
  total_pendapatan: number
  total_beban: number
  laba_bersih: number
}

export type NeracaData = {
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

export type NeracaSaldoRow = { akun: Akun; debit: number; kredit: number }
export type NeracaSaldoData = { sampai: string; rows: NeracaSaldoRow[]; total_debit: number; total_kredit: number }

export type BukuBesarRow = {
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

export type BukuBesarAkun = {
  akun: Akun
  saldo_awal: number
  rows: BukuBesarRow[]
  total_debit: number
  total_kredit: number
  saldo_akhir: number
}

export type BukuBesarSemuaData = {
  dari: string
  sampai: string
  akuns: BukuBesarAkun[]
  total_debit: number
  total_kredit: number
  jumlah_transaksi: number
  akun_bermutasi: number
}

export type HighlightsRingkasan = {
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

export type HighlightsPosisi = {
  per: string
  total_aset: number
  total_kewajiban: number
  total_ekuitas: number
  kas_bank: number
  utang_deposit_pasien: number
  utang_usaha: number
}

// GET /finance/laporan/highlights
export type HighlightsData = {
  periode: HighlightsRingkasan
  pembanding: HighlightsRingkasan
  tahun_lalu: HighlightsRingkasan
  posisi: HighlightsPosisi
  posisi_pembanding: HighlightsPosisi
  tren: { bulan: string; pendapatan: number; beban: number; laba_bersih: number }[]
  komposisi_pendapatan: AkunSaldo[]
  beban_terbesar: AkunSaldo[]
}
