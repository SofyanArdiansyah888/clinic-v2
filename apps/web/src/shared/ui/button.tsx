import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'

const buttonVariants = cva(
  // Icons inside a button are sized by the button itself so every icon in a
  // given button size matches, whatever className the icon carries.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-lg shadow-rose-600/25 hover:from-rose-700 hover:to-rose-600',
        secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200',
        outline: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
        ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        // Plain red, no brand gradient/glow, so it never reads as the primary CTA.
        destructive: 'bg-red-600 text-white shadow-sm ring-1 ring-red-700/20 hover:bg-red-700',
        // Row-level delete/cancel icon action: quiet until hovered.
        'ghost-danger': 'text-slate-500 hover:bg-red-50 hover:text-red-600',
      },
      size: {
        default: 'h-10 rounded-xl px-4 py-2',
        sm: 'h-8 gap-1.5 rounded-lg px-3 text-[11px] [&_svg]:size-3.5',
        lg: 'h-11 rounded-xl px-6',
        icon: 'h-10 w-10 rounded-xl',
        // Table row icon actions (edit, delete, print...).
        'icon-sm': 'h-8 w-8 rounded-lg [&_svg]:size-3.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { buttonVariants }
