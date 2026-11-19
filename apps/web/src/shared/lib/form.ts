import { todayISO } from '@/shared/lib/formatters'

export type FormField = {
  name: string
  label: string
  /** currency: rupiah with thousand separators; staff: pick a staff record (sent as id, 0 = none). */
  type?: 'text' | 'email' | 'number' | 'currency' | 'staff' | 'boolean' | 'cabang-multi' | 'tel' | 'date' | 'password' | 'select' | 'textarea'
  placeholder?: string
  required?: boolean
  options?: { label: string; value: string }[]
}

export type FormValues = Record<string, string>

// The API decodes dates into time.Time, which only accepts RFC3339; a plain
// <input type="date"> value (YYYY-MM-DD) is sent as midnight UTC of that day.
function toApiDate(raw: string): string | null {
  if (raw === '') return null
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw
}

/** Empty form values for a create form; `defaults` wins over the field defaults. */
export function initialFormValues(fields: FormField[], defaults?: FormValues): FormValues {
  const values: FormValues = {}
  for (const field of fields) {
    // Only required dates start at today; optional ones (tanggal lahir, masa berlaku) stay empty.
    if (field.type === 'boolean') {
      values[field.name] = 'false'
    } else if (field.type === 'date' && field.required && !field.placeholder) {
      values[field.name] = todayISO()
    } else {
      values[field.name] = field.options?.[0]?.value ?? ''
    }
  }
  return { ...values, ...defaults }
}

/** Form values → API body: numbers as numbers, dates as RFC3339. */
export function buildFormBody(fields: FormField[], values: FormValues) {
  return Object.fromEntries(
    fields.map((field) => {
      const raw = values[field.name] ?? ''
      if (field.type === 'number' || field.type === 'currency' || field.type === 'staff') return [field.name, raw === '' ? 0 : Number(raw)]
      if (field.type === 'date') return [field.name, toApiDate(raw)]
      if (field.type === 'boolean') return [field.name, raw === 'true']
      // No branch ticked: omit, so the server keeps the current branches (or uses the main one).
      if (field.type === 'cabang-multi') return [field.name, raw ? raw.split(',').map(Number).filter(Boolean) : undefined]
      return [field.name, raw]
    }),
  )
}

export function apiErrorMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
}

/** Forms with more fields than this render in two columns inside a wider dialog. */
export const WIDE_FORM = 5

export function dialogWidth(fields?: FormField[]) {
  return (fields?.length ?? 0) > WIDE_FORM ? 'max-w-2xl' : undefined
}
