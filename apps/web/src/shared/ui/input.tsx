import type { InputHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export function Input({ className, type = 'text', ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs transition-colors placeholder:text-slate-400 focus-visible:border-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
