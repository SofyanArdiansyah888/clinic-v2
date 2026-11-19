import { format, parseISO, isValid } from 'date-fns'
import { id as localeId } from 'date-fns/locale'

export function formatCurrency(value: number | null | undefined) {
  const amount = value ?? 0
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat('id-ID').format(value ?? 0)
}

export function formatDate(value?: string | Date | null, pattern = 'dd MMM yyyy') {
  if (!value) return '-'
  const date = typeof value === 'string' ? parseISO(value) : value
  if (!isValid(date)) return '-'
  return format(date, pattern, { locale: localeId })
}

export function formatDateTime(value?: string | Date | null) {
  return formatDate(value, 'dd MMM yyyy HH:mm')
}

// Today's date as yyyy-MM-dd in the browser's local time zone. toISOString() would
// give the UTC date, which is still yesterday in the early morning in Indonesia.
export function todayISO() {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Compact axis label: 1.200.000 → "1,2 jt", 15.000 → "15 rb". */
export function formatCompact(value: number) {
  return new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas']

function terbilangBulat(n: number): string {
  if (n < 12) return SATUAN[n]
  if (n < 20) return `${SATUAN[n - 10]} belas`
  if (n < 100) return `${SATUAN[Math.floor(n / 10)]} puluh ${terbilangBulat(n % 10)}`
  if (n < 200) return `seratus ${terbilangBulat(n - 100)}`
  if (n < 1000) return `${SATUAN[Math.floor(n / 100)]} ratus ${terbilangBulat(n % 100)}`
  if (n < 2000) return `seribu ${terbilangBulat(n - 1000)}`
  const skala: [number, string][] = [
    [1e12, 'triliun'],
    [1e9, 'miliar'],
    [1e6, 'juta'],
    [1e3, 'ribu'],
  ]
  for (const [nilai, nama] of skala) {
    if (n >= nilai) return `${terbilangBulat(Math.floor(n / nilai))} ${nama} ${terbilangBulat(n % nilai)}`
  }
  return ''
}

/** Amount in Indonesian words for receipts: 265000 → "Dua ratus enam puluh lima ribu rupiah". */
export function terbilang(value: number | null | undefined) {
  const n = Math.round(Math.abs(value ?? 0))
  const words = n === 0 ? 'nol' : terbilangBulat(n).replace(/\s+/g, ' ').trim()
  const text = `${value != null && value < 0 ? 'minus ' : ''}${words} rupiah`
  return text.charAt(0).toUpperCase() + text.slice(1)
}
