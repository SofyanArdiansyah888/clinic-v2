import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/shared/api/client'

export type KasirShift = {
  id: number
  kode: string
  user_id: number
  staff_id: number | null
  kasir_nama: string
  saldo_awal: number
  opened_at: string
  catatan_buka: string
  status: 'open' | 'closed'
  closed_at: string | null
  closed_by_user_id: number | null
  closed_by_nama: string
  saldo_akhir_fisik: number | null
  expected_tunai: number | null
  selisih: number | null
  catatan_tutup: string
}

export type KasirMutasi = {
  id: number
  shift_id: number
  waktu: string
  source_type: 'penjualan' | 'deposit' | 'paket_refund' | 'void' | string
  source_id: number
  referensi: string
  jenis_pembayaran: string
  bank_id: number | null
  bank_nama: string
  masuk: number
  keluar: number
  keterangan: string
}

export type KasirRingkasan = {
  jenis_pembayaran: string
  jumlah: number
  masuk: number
  keluar: number
  net: number
}

export type KasirShiftDetail = {
  shift: KasirShift
  ringkasan: KasirRingkasan[]
  total_masuk: number
  total_keluar: number
  tunai_masuk: number
  tunai_keluar: number
  /** Live for an open shift; the value fixed at close for a closed one. */
  expected_tunai: number
  mutasi: KasirMutasi[]
}

export const SHIFT_AKTIF_KEY = ['kasir-shift-aktif'] as const

export const SUMBER_MUTASI: Record<string, string> = {
  penjualan: 'Pembayaran',
  deposit: 'Deposit & Member',
  paket_refund: 'Refund Paket',
  void: 'Void Transaksi',
}

/** The signed-in account's open cashier shift; data is null while the cashier is closed. */
export function useShiftAktif(enabled = true) {
  const query = useQuery({
    queryKey: SHIFT_AKTIF_KEY,
    queryFn: () => apiGet<KasirShiftDetail | null>('/kasir/shift/aktif'),
    enabled,
  })
  const shift = query.data?.data ?? null
  return { ...query, shift, isOpen: Boolean(shift), checked: query.isSuccess }
}

/** Counted cash minus expected: 0 is exact, negative is short, positive is over. */
export function selisihInfo(selisih: number) {
  const v = Math.round(selisih * 100) / 100
  if (v === 0) return { label: 'Pas', tone: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' }
  if (v < 0) return { label: 'Kurang', tone: 'text-red-700', bg: 'bg-red-50 border-red-200' }
  return { label: 'Lebih', tone: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' }
}
