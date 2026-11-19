import { useRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'

type RupiahInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  /** The raw amount: a number, or a digits-only string ('' when empty). */
  value: number | string | null | undefined
  /** Receives the digits only ('' when cleared), e.g. "1250000" for "1.250.000". */
  onValueChange: (raw: string) => void
}

const digits = (s: string) => s.replace(/\D/g, '').replace(/^0+(?=\d)/, '')

function formatRupiahInput(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return ''
  // Numbers and numeric strings from the API ("1500.5") are values; anything else is typed text.
  const s = String(value)
  const n = typeof value === 'number' || /^\d+(\.\d+)?$/.test(s) ? Number(s) : Number(digits(s))
  return Number.isFinite(n) ? Math.round(n).toLocaleString('id-ID') : ''
}

/**
 * Money input with thousand separators ("1.250.000") that hands back plain digits.
 * The caret keeps its place among the digits while separators are inserted or removed.
 */
export function RupiahInput({ value, onValueChange, className, ...rest }: RupiahInputProps) {
  const ref = useRef<HTMLInputElement>(null)

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={formatRupiahInput(value)}
      onChange={(e) => {
        const el = e.target
        const caret = el.selectionStart ?? el.value.length
        const digitsAfterCaret = el.value.slice(caret).replace(/\D/g, '').length
        onValueChange(digits(el.value))
        requestAnimationFrame(() => {
          const input = ref.current
          if (!input || document.activeElement !== input) return
          const text = input.value
          let pos = text.length
          for (let seen = 0; pos > 0 && seen < digitsAfterCaret; ) {
            pos--
            if (/\d/.test(text[pos])) seen++
          }
          input.setSelectionRange(pos, pos)
        })
      }}
      className={cn('tabular-nums', className)}
    />
  )
}
