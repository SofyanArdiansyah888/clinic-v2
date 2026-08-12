import { cn } from '@/shared/lib/cn'

type PembayaranToastProps = {
  message: string
  tone: 'success' | 'error'
}

export function PembayaranToast({ message, tone }: PembayaranToastProps) {
  return (
    <div className="pointer-events-none fixed top-5 right-5 z-[110] max-w-sm">
      <div
        className={cn(
          'pointer-events-auto flex items-center gap-3 rounded-2xl border p-3.5 text-xs font-semibold text-white shadow-xl',
          tone === 'error' ? 'border-rose-800 bg-rose-950' : 'border-emerald-700 bg-slate-950',
        )}
      >
        <span className="flex-1">{message}</span>
      </div>
    </div>
  )
}
