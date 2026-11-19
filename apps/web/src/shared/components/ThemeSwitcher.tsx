import { Check, Palette } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/shared/lib/cn'
import { useThemeStore } from '@/shared/theme/store'
import { THEMES } from '@/shared/theme/themes'
import { Button } from '@/shared/ui/button'

/** Header button + popover to pick the app theme (saved per browser). */
export function ThemeSwitcher() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    // Focus the current theme so arrow keys start from it.
    const idx = Math.max(0, THEMES.findIndex((t) => t.id === theme))
    optionRefs.current[idx]?.focus()
    return () => document.removeEventListener('pointerdown', onPointer)
    // Only on open: re-focusing on every theme change would fight the arrow keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const idx = THEMES.findIndex((t) => t.id === theme)
    if (e.key === 'Escape') {
      setOpen(false)
      rootRef.current?.querySelector<HTMLButtonElement>('[data-theme-trigger]')?.focus()
      return
    }
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (idx + step + THEMES.length) % THEMES.length
    setTheme(THEMES[next].id)
    optionRefs.current[next]?.focus()
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        data-theme-trigger
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Ganti tema tampilan"
        title="Ganti tema"
        onClick={() => setOpen((v) => !v)}
      >
        <Palette />
      </Button>

      {open ? (
        <div className="ui-card absolute top-full right-0 z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          <p id="theme-picker-label" className="px-2 pt-1 pb-2 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Tema tampilan
          </p>
          <div role="radiogroup" aria-labelledby="theme-picker-label" onKeyDown={onKeyDown} className="space-y-1">
            {THEMES.map((t, i) => {
              const active = t.id === theme
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    optionRefs.current[i] = el
                  }}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setTheme(t.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-slate-50',
                    active && 'bg-rose-50',
                  )}
                >
                  <ThemePreview swatch={t.swatch} brutal={t.id === 'brutal'} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-900">{t.label}</span>
                    <span className="block truncate text-[11px] text-slate-500">{t.description}</span>
                  </span>
                  {active ? <Check className="h-4 w-4 shrink-0 text-rose-600" /> : null}
                </button>
              )
            })}
          </div>
          <p className="px-2 pt-2 text-[11px] text-slate-400">Disimpan di browser ini.</p>
        </div>
      ) : null}
    </div>
  )
}

// A tiny fixed-colour mockup (background, card, brand bar, text line) so each option
// shows its own palette regardless of the active theme.
function ThemePreview({ swatch, brutal }: { swatch: [string, string, string, string]; brutal: boolean }) {
  const [bg, card, brand, text] = swatch
  const edge = brutal ? '2px solid #000' : '1px solid rgb(0 0 0 / 0.08)'
  return (
    <span
      aria-hidden
      className="relative block h-10 w-14 shrink-0 overflow-hidden"
      style={{ background: bg, border: edge, borderRadius: brutal ? 0 : 8 }}
    >
      <span
        className="absolute top-1.5 left-1.5 h-6 w-9"
        style={{ background: card, border: edge, borderRadius: brutal ? 0 : 4, boxShadow: brutal ? '2px 2px 0 #000' : 'none' }}
      />
      <span className="absolute top-2.5 left-2.5 h-1 w-6" style={{ background: text, borderRadius: 2 }} />
      <span className="absolute top-4.5 left-2.5 h-2 w-4" style={{ background: brand, borderRadius: brutal ? 0 : 2 }} />
    </span>
  )
}
