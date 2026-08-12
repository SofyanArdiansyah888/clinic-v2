import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiGet } from '@/shared/api/client'
import { SearchableSelect } from '@/shared/components/SearchableSelect'

type StaffLite = {
  id: number
  kode?: string
  nama?: string
  jabatan?: string
  is_active?: boolean
}

type DokterSelectProps = {
  value: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  className?: string
  id?: string
  placeholder?: string
}

function isDokter(jabatan?: string) {
  const j = (jabatan ?? '').toLowerCase()
  return j.includes('dokter') || j.includes('dpjp')
}

export function DokterSelect({
  value,
  onChange,
  required,
  disabled,
  className,
  id,
  placeholder = 'Cari & pilih dokter...',
}: DokterSelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['staff', 'dokter-select'],
    queryFn: () => apiGet<StaffLite[]>('/staff', { per_page: 200, page: 1 }),
  })

  const options = useMemo(
    () =>
      (data?.data ?? [])
        .filter((s) => s.is_active !== false && isDokter(s.jabatan))
        .map((s) => ({
          value: String(s.id),
          label: s.nama || `Dokter #${s.id}`,
          description: [s.jabatan, s.kode].filter(Boolean).join(' · ') || undefined,
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
      searchPlaceholder="Cari nama atau kode dokter..."
      emptyText="Dokter tidak ditemukan"
    />
  )
}
