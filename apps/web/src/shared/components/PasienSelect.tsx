import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiGet } from '@/shared/api/client'
import { SearchableSelect } from '@/shared/components/SearchableSelect'

type PasienLite = {
  id: number
  kode?: string
  nama?: string
  no_telp?: string
}

type PasienSelectProps = {
  value: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  className?: string
  id?: string
  placeholder?: string
}

export function PasienSelect({
  value,
  onChange,
  required,
  disabled,
  className,
  id,
  placeholder = 'Cari & pilih pasien...',
}: PasienSelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['pasien', 'select'],
    queryFn: () => apiGet<PasienLite[]>('/pasien', { per_page: 200, page: 1 }),
  })

  const options = useMemo(
    () =>
      (data?.data ?? []).map((p) => ({
        value: String(p.id),
        label: p.nama || `Pasien #${p.id}`,
        description: [p.kode, p.no_telp].filter(Boolean).join(' · ') || undefined,
        keywords: `${p.nama ?? ''} ${p.kode ?? ''} ${p.no_telp ?? ''}`,
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
      searchPlaceholder="Cari nama, kode RM, atau no. telp..."
      emptyText="Pasien tidak ditemukan"
    />
  )
}
