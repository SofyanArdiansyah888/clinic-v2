import type { LabelHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  /** Adds the red asterisk. Keep the `required` attribute on the control too. */
  required?: boolean
}

export function Label({ className, required, children, ...props }: LabelProps) {
  return (
    <label
      className={cn('text-xs font-semibold leading-none text-slate-700 peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)}
      {...props}
    >
      {children}
      {required ? (
        <span className="ml-0.5 text-red-600" aria-hidden>
          *
        </span>
      ) : null}
    </label>
  )
}
