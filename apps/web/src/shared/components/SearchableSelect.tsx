import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/shared/lib/cn'

export type SearchableSelectOption = {
  value: string
  label: string
  description?: string
  keywords?: string
}

type SearchableSelectProps = {
  value: string
  onChange: (value: string) => void
  options: SearchableSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  loading?: boolean
  required?: boolean
  className?: string
  id?: string
}

type Coords = {
  top?: number
  bottom?: number
  left: number
  width: number
  maxHeight: number
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Pilih...',
  searchPlaceholder = 'Cari...',
  emptyText = 'Tidak ada data',
  disabled,
  loading,
  required,
  className,
  id,
}: SearchableSelectProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const portalRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [coords, setCoords] = useState<Coords | null>(null)

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => {
      const hay = `${o.label} ${o.description ?? ''} ${o.keywords ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [options, query])

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top

    const PREFERRED_HEIGHT = 280

    let top: number | undefined = rect.bottom + 4
    let bottom: number | undefined = undefined
    let maxHeight = Math.min(260, Math.max(120, spaceBelow - 12))

    if (spaceBelow < PREFERRED_HEIGHT && spaceAbove > spaceBelow) {
      top = undefined
      bottom = window.innerHeight - rect.top + 4
      maxHeight = Math.min(260, Math.max(120, spaceAbove - 12))
    }

    setCoords({
      top,
      bottom,
      left: Math.max(8, rect.left),
      width: Math.max(160, rect.width),
      maxHeight,
    })
  }, [])

  useLayoutEffect(() => {
    if (open) {
      updatePosition()
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return

    const handleScrollOrResize = () => {
      updatePosition()
    }

    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        buttonRef.current?.contains(target) ||
        portalRef.current?.contains(target)
      ) {
        return
      }
      setOpen(false)
      setQuery('')
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setQuery('')
      }
    }

    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    document.addEventListener('mousedown', onDocMouseDown)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
      document.removeEventListener('mousedown', onDocMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => searchRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [open])

  function pick(next: string) {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {/* hidden required input for native form validation */}
      {required ? (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value={value}
          onChange={() => undefined}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
        />
      ) : null}

      <button
        ref={buttonRef}
        type="button"
        id={inputId}
        disabled={disabled || loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-xs font-medium transition-colors',
          'hover:border-slate-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none',
          'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60',
          !selected && 'text-slate-400',
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {loading ? 'Memuat...' : selected ? selected.label : placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-slate-400">
          {value ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Hapus pilihan"
              className="rounded p-0.5 hover:bg-slate-100 hover:text-slate-700"
              onClick={(e) => {
                e.stopPropagation()
                onChange('')
              }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : null}
          <ChevronsUpDown className="h-3.5 w-3.5" />
        </span>
      </button>

      {open && coords
        ? createPortal(
            <div
              ref={portalRef}
              style={{
                position: 'fixed',
                top: coords.top !== undefined ? `${coords.top}px` : undefined,
                bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
                left: `${coords.left}px`,
                width: `${coords.width}px`,
                zIndex: 99999,
              }}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl animate-in fade-in-50 zoom-in-95 duration-100"
            >
              <div className="relative border-b border-slate-100 p-2 bg-white">
                <Search className="absolute top-1/2 left-4 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-xs font-medium focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
                />
              </div>
              <ul
                role="listbox"
                style={{ maxHeight: `${coords.maxHeight}px` }}
                className="overflow-y-auto p-1 bg-white"
              >
                {filtered.length === 0 ? (
                  <li className="px-3 py-6 text-center text-xs text-slate-400">{emptyText}</li>
                ) : (
                  filtered.map((opt) => {
                    const active = opt.value === value
                    return (
                      <li key={opt.value}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => pick(opt.value)}
                          className={cn(
                            'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                            active ? 'bg-rose-50 text-rose-900' : 'hover:bg-slate-50',
                          )}
                        >
                          <Check
                            className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', active ? 'text-rose-600 opacity-100' : 'opacity-0')}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-bold text-slate-900">{opt.label}</span>
                            {opt.description ? (
                              <span className="mt-0.5 block truncate text-[11px] text-slate-500">{opt.description}</span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

