import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Check, ChevronsUpDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { apiGet } from '@/shared/api/client'
import { useCabangStore, type CabangAkses } from '@/shared/branch/store'
import { cn } from '@/shared/lib/cn'

/**
 * Sidebar picker for the active branch. Lists only the branches this account may open;
 * switching reloads every query so all pages show that branch's data.
 */
export function CabangSwitcher({ collapsed }: { collapsed: boolean }) {
  const qc = useQueryClient()
  const cabang = useCabangStore((s) => s.cabang)
  const setCabang = useCabangStore((s) => s.setCabang)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const akses = useQuery({
    queryKey: ['cabang', 'akses', cabang],
    queryFn: () => apiGet<CabangAkses>('/cabang/akses'),
    retry: false,
    staleTime: 5 * 60_000,
  })
  const data = akses.data?.data

  // A stored branch this account may no longer open (403) falls back to the default one.
  useEffect(() => {
    if (akses.isError && cabang) setCabang(null)
  }, [akses.isError, cabang, setCabang])

  // Pin the server's default so later requests and the UI agree on it.
  useEffect(() => {
    if (data && !cabang && data.aktif_id) setCabang(String(data.aktif_id))
  }, [data, cabang, setCabang])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  if (!data || data.cabangs.length === 0) return null
  const aktif = data.cabangs.find((c) => c.id === data.aktif_id)
  const label = data.semua ? 'Semua cabang' : (aktif?.nama ?? 'Pilih cabang')
  const canSwitch = data.cabangs.length > 1

  function pick(value: string) {
    setOpen(false)
    if (value === cabang) return
    setCabang(value)
    // Everything on screen belongs to the previous branch.
    void qc.invalidateQueries()
  }

  return (
    <div ref={rootRef} className={cn('relative border-b border-slate-800/80', collapsed ? 'px-2 py-3' : 'px-3 py-3')}>
      <button
        type="button"
        disabled={!canSwitch}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Cabang aktif: ${label}`}
        title={collapsed ? label : undefined}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/70 text-left transition-colors',
          collapsed ? 'justify-center p-2' : 'px-3 py-2',
          canSwitch ? 'hover:border-slate-700 hover:bg-slate-900' : 'cursor-default',
        )}
      >
        <Building2 className="h-4 w-4 shrink-0 text-rose-300" />
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase">Cabang aktif</span>
              <span className="block truncate text-xs font-semibold text-white">{label}</span>
            </span>
            {canSwitch ? <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-500" /> : null}
          </>
        ) : null}
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label="Pilih cabang"
          className={cn(
            'absolute z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl',
            collapsed ? 'left-2 w-60' : 'inset-x-3',
          )}
        >
          {data.cabangs.map((c) => {
            const active = !data.semua && c.id === data.aktif_id
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pick(String(c.id))}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs',
                    active ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/70 hover:text-white',
                  )}
                >
                  <span className="w-9 shrink-0 font-mono text-[10px] font-bold text-rose-300">{c.singkatan}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{c.nama}</span>
                  {c.is_utama ? <span className="text-[10px] text-slate-500">Utama</span> : null}
                  {active ? <Check className="h-3.5 w-3.5 shrink-0 text-rose-300" /> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
