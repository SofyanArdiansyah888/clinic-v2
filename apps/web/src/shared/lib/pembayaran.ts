export const JENIS_PEMBAYARAN = [
  { value: 'e_money', label: 'E-Money' },
  { value: 'kartu_debit', label: 'Kartu Debit' },
  { value: 'kartu_kredit', label: 'Kartu Kredit' },
  { value: 'transfer', label: 'Transfer Bank' },
  { value: 'tunai', label: 'Tunai' },
]

export function jenisPembayaranLabel(value: string) {
  return JENIS_PEMBAYARAN.find((o) => o.value === value)?.label ?? (value === '-' || !value ? 'Lainnya' : value)
}
