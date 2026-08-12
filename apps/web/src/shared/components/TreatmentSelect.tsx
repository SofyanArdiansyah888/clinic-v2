import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiGet } from '@/shared/api/client'
import { SearchableSelect } from '@/shared/components/SearchableSelect'
import { formatCurrency } from '@/shared/lib/formatters'

export type TreatmentLite = {
  id: number
  kode?: string
  nama?: string
  harga?: number
  durasi?: number
  kategori?: string
  is_active?: boolean
}

type TreatmentSelectProps = {
  value: string
  onChange: (value: string, selected?: TreatmentLite) => void
  required?: boolean
  disabled?: boolean
  className?: string
  id?: string
  placeholder?: string
}

export function TreatmentSelect({
  value,
  onChange,
  required,
  disabled,
  className,
  id,
  placeholder = 'Cari & pilih treatment...',
}: TreatmentSelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['treatment', 'select'],
    queryFn: () => apiGet<TreatmentLite[]>('/treatment', { per_page: 200, page: 1 }),
  })

  const treatmentMap = useMemo(() => {
    const map = new Map<string, TreatmentLite>()
    for (const t of data?.data ?? []) {
      map.set(String(t.id), t)
    }
    return map
  }, [data?.data])

  const options = useMemo(
    () =>
      (data?.data ?? [])
        .filter((t) => t.is_active !== false)
        .map((t) => ({
          value: String(t.id),
          label: t.nama || `Treatment #${t.id}`,
          description:
            [t.kode, t.kategori, formatCurrency(t.harga ?? 0)].filter(Boolean).join(' · ') || undefined,
          keywords: `${t.nama ?? ''} ${t.kode ?? ''} ${t.kategori ?? ''}`,
        })),
    [data?.data],
  )

  function handleChange(val: string) {
    const found = treatmentMap.get(val)
    onChange(val, found)
  }

  return (
    <SearchableSelect
      id={id}
      value={value}
      onChange={handleChange}
      options={options}
      loading={isLoading}
      disabled={disabled}
      required={required}
      className={className}
      placeholder={placeholder}
      searchPlaceholder="Cari nama atau kode treatment..."
      emptyText="Treatment tidak ditemukan"
    />
  )
}
