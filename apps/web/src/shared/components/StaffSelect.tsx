import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiGet } from '@/shared/api/client'
import { SearchableSelect } from '@/shared/components/SearchableSelect'

type StaffLite = {
  id: number
  kode?: string
  nama?: string
  jabatan?: string
}

type StaffSelectProps = {
  value: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  className?: string
  id?: string
  placeholder?: string
}

export function StaffSelect({
  value,
  onChange,
  required,
  disabled,
  className,
  id,
  placeholder = 'Pilih staff kasir...',
}: StaffSelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['staff', 'select'],
    queryFn: () => apiGet<StaffLite[]>('/staff', { per_page: 200, page: 1 }),
  })

  const options = useMemo(
    () =>
      (data?.data ?? []).map((s) => ({
        value: String(s.id),
        label: s.nama || `Staff #${s.id}`,
        description: [s.kode, s.jabatan].filter(Boolean).join(' · ') || undefined,
        keywords: `${s.nama ?? ''} ${s.kode ?? ''} ${s.jabatan ?? ''}`,
      })),
    [data?.data],
  )

  return (
    <SearchableSelect
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      loading={isLoading}
      disabled={disabled}
      required={required}
      className={className}
      placeholder={placeholder}
      searchPlaceholder="Cari nama staff..."
      emptyText="Staff tidak ditemukan"
    />
  )
}
