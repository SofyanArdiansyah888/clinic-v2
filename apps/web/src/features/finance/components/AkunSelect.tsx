import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiGet } from '@/shared/api/client'
import { SearchableSelect } from '@/shared/components/SearchableSelect'
import { TIPE_LABEL, type Akun } from '@/features/finance/types'

type AkunSelectProps = {
  value: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  className?: string
  id?: string
  placeholder?: string
}

// Picks an account that can be posted to: active and not a header.
export function AkunSelect({ value, onChange, required, disabled, className, id, placeholder }: AkunSelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'akun', 'postable'],
    queryFn: () => apiGet<Akun[]>('/finance/akun', { postable: 1 }),
    staleTime: 60_000,
  })

  const options = useMemo(
    () =>
      (data?.data ?? []).map((a) => ({
        value: String(a.id),
        label: `${a.kode} · ${a.nama}`,
        description: TIPE_LABEL[a.tipe],
        keywords: `${a.kode} ${a.nama} ${a.tipe}`,
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
      placeholder={placeholder ?? 'Pilih akun...'}
      searchPlaceholder="Cari kode atau nama akun..."
      emptyText="Akun tidak ditemukan"
    />
  )
}
