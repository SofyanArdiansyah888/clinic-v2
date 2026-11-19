import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/shared/api/client'

type CabangLite = { id: number; nama: string; singkatan?: string; is_utama?: boolean; is_active?: boolean }

/**
 * Checkbox list of branches for forms. The value is a comma-separated id list ("1,3"),
 * which buildFormBody turns into cabang_ids.
 */
export function CabangChecklist({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['cabang', 'select'],
    queryFn: () => apiGet<CabangLite[]>('/cabang', { per_page: 100, page: 1 }),
  })
  const selected = new Set(value.split(',').filter(Boolean))
  const list = (data?.data ?? []).filter((c) => c.is_active !== false || selected.has(String(c.id)))

  if (isLoading) return <p className="text-xs text-slate-400">Memuat cabang...</p>
  if (!list.length) return <p className="text-xs text-slate-400">Belum ada cabang.</p>

  return (
    <div id={id} role="group" className="flex flex-wrap gap-2">
      {list.map((c) => {
        const key = String(c.id)
        const checked = selected.has(key)
        return (
          <label
            key={c.id}
            htmlFor={`${id}-${c.id}`}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
              checked ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <input
              id={`${id}-${c.id}`}
              type="checkbox"
              checked={checked}
              onChange={(e) => {
                const next = new Set(selected)
                if (e.target.checked) next.add(key)
                else next.delete(key)
                onChange([...next].join(','))
              }}
              className="rounded border-slate-300 text-rose-600"
            />
            {c.nama}
            {c.singkatan ? <span className="font-mono text-[10px] text-slate-400">{c.singkatan}</span> : null}
          </label>
        )
      })}
    </div>
  )
}
