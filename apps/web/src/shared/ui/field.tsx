import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { useFieldError } from '@/shared/lib/validation'
import { Label } from '@/shared/ui/label'

type FieldProps = {
  label: string
  /** Id of the control; also the key its validation error is stored under. */
  htmlFor?: string
  required?: boolean
  /** Overrides the error from the surrounding form, e.g. a custom rule. */
  error?: string
  hint?: string
  className?: string
  children: ReactNode
}

/** Label (with red * when required) + control + inline error or hint. */
export function Field({ label, htmlFor, required, error, hint, className, children }: FieldProps) {
  const formError = useFieldError(htmlFor)
  const message = error ?? formError
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} required={required} className="block">
        {label}
      </Label>
      {children}
      {message ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} role="alert" className="text-[11px] font-medium text-red-600">
          {message}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-slate-500">{hint}</p>
      ) : null}
    </div>
  )
}

/** Form-level error (e.g. the API rejected the submit), shown above the buttons. */
export function FormAlert({ children }: { children?: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      {children}
    </p>
  )
}
