import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { create } from 'zustand'
import { cn } from '@/shared/lib/cn'

export type ToastTone = 'success' | 'error' | 'info'

type ToastItem = { id: number; message: string; tone: ToastTone }

type ToastStore = {
  items: ToastItem[]
  push: (message: string, tone: ToastTone) => void
  dismiss: (id: number) => void
}

let nextId = 1
const DURATION_MS = 3500

const useToastStore = create<ToastStore>((set, get) => ({
  items: [],
  push: (message, tone) => {
    const id = nextId++
    // Keep at most 3 on screen; each toast owns its own timer.
    set({ items: [...get().items.slice(-2), { id, message, tone }] })
    window.setTimeout(() => get().dismiss(id), tone === 'error' ? DURATION_MS * 2 : DURATION_MS)
  },
  dismiss: (id) => set({ items: get().items.filter((t) => t.id !== id) }),
}))

/** Show a toast from anywhere (components, mutation callbacks). */
export function toast(message: string, tone: ToastTone = 'success') {
  useToastStore.getState().push(message, tone)
}

const TONE: Record<ToastTone, { box: string; icon: typeof Info; iconClass: string }> = {
  success: { box: 'border-emerald-700 bg-slate-950', icon: CheckCircle2, iconClass: 'text-emerald-400' },
  error: { box: 'border-rose-800 bg-rose-950', icon: XCircle, iconClass: 'text-rose-300' },
  info: { box: 'border-slate-700 bg-slate-900', icon: Info, iconClass: 'text-sky-300' },
}

/** Mounted once in the app layout. */
export function Toaster() {
  const items = useToastStore((s) => s.items)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed top-5 right-4 left-4 z-[110] flex flex-col items-end gap-2 sm:left-auto sm:max-w-sm"
    >
      {items.map((t) => {
        const tone = TONE[t.tone]
        const Icon = tone.icon
        return (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'animate-fade-in-up pointer-events-auto flex w-full items-center gap-3 rounded-2xl border p-3.5 text-xs font-semibold text-white shadow-xl',
              tone.box,
            )}
          >
            <Icon className={cn('h-4 w-4 shrink-0', tone.iconClass)} />
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              aria-label="Tutup notifikasi"
              className="text-slate-400 hover:text-white"
              onClick={() => dismiss(t.id)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
