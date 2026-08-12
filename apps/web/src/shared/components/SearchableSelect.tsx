import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
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
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => {
      const hay = `${o.label} ${o.description ?? ''} ${o.keywords ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      window.setTimeout(() => searchRef.current?.focus(), 0)
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

      {open ? (
        <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="relative border-b border-slate-100 p-2">
            <Search className="absolute top-1/2 left-4 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-xs font-medium focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
            />
          </div>
          <ul role="listbox" className="max-h-56 overflow-y-auto p-1">
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
        </div>
      ) : null}
    </div>
  )
}
