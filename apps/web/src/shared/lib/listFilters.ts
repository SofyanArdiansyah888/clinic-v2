import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/shared/api/client'

export type Periode = { dari: string; sampai: string }

export const EMPTY_PERIODE: Periode = { dari: '', sampai: '' }

/** Drops empty values so they are not sent as query params. */
export function cleanParams(params: Record<string, string | number | undefined>) {
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') out[k] = v
  }
  return out
}

/**
 * Loads `${endpoint}/summary` for the list's filters. The key starts with the list's
 * query key so invalidating the list after a change refreshes the cards too.
 */
export function useListSummary<T>(endpoint: string, queryKey: string, params: Record<string, string | number | undefined>) {
  const clean = cleanParams(params)
  return useQuery({
    queryKey: [queryKey, 'summary', clean],
    queryFn: async () => (await apiGet<T>(`${endpoint}/summary`, clean)).data,
  })
}
