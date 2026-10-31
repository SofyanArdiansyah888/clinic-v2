import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiGet } from '@/shared/api/client'
import { SearchableSelect } from '@/shared/components/SearchableSelect'

type SupplierLite = {
  id: number
  kode?: string
  nama?: string
  pic?: string
  is_active?: boolean
}

type SupplierSelectProps = {
  value: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  className?: string
  id?: string
  placeholder?: string
}

export function SupplierSelect({
  value,
  onChange,
  required,
  disabled,
  className,
  id,
  placeholder = 'Pilih supplier...',
}: SupplierSelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['supplier', 'select'],
    queryFn: () => apiGet<SupplierLite[]>('/supplier', { per_page: 100, page: 1 }),
  })

  const options = useMemo(
    () =>
      (data?.data ?? [])
        .filter((s) => s.is_active !== false)
        .map((s) => ({
          value: String(s.id),
          label: s.nama || `Supplier #${s.id}`,
          description: [s.kode, s.pic ? `PIC: ${s.pic}` : undefined].filter(Boolean).join(' · ') || undefined,
          keywords: `${s.nama ?? ''} ${s.kode ?? ''} ${s.pic ?? ''}`,
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
      searchPlaceholder="Cari nama supplier..."
      emptyText="Supplier tidak ditemukan"
    />
  )
}
