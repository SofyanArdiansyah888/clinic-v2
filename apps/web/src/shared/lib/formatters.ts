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
