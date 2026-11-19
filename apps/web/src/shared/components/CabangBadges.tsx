import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/shared/api/client'

type CabangLite = { id: number; nama: string; singkatan?: string }

/** Branch abbreviations for a list of cabang ids (table cells); full names on hover. */
export function CabangBadges({ ids, emptyText = '—' }: { ids?: number[] | null; emptyText?: string }) {
  const { data } = useQuery({
    queryKey: ['cabang', 'select'],
    queryFn: () => apiGet<CabangLite[]>('/cabang', { per_page: 100, page: 1 }),
  })
  if (!ids?.length) return <span className="text-[11px] text-slate-400">{emptyText}</span>
  const byId = new Map((data?.data ?? []).map((c) => [c.id, c]))
  return (
    <span className="flex flex-wrap gap-1">
      {ids.map((id) => {
        const c = byId.get(id)
        return (
          <span key={id} title={c?.nama} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600">
            {c?.singkatan || c?.nama || `#${id}`}
          </span>
        )
      })}
    </span>
  )
}
