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
