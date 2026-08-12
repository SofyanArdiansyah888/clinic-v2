import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiGet } from '@/shared/api/client'
import { SearchableSelect } from '@/shared/components/SearchableSelect'

type BankLite = {
  id: number
  kode?: string
  nama?: string
  no_rekening?: string
}

type BankSelectProps = {
  value: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  className?: string
  id?: string
}

export function BankSelect({ value, onChange, required, disabled, className, id }: BankSelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['bank', 'select'],
    queryFn: () => apiGet<BankLite[]>('/bank', { per_page: 100, page: 1 }),
  })

  const options = useMemo(
    () =>
      (data?.data ?? []).map((b) => ({
        value: String(b.id),
        label: b.nama || `Bank #${b.id}`,
        description: [b.kode, b.no_rekening].filter(Boolean).join(' · ') || undefined,
        keywords: `${b.nama ?? ''} ${b.kode ?? ''}`,
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
      placeholder="Pilih rekening tujuan..."
      searchPlaceholder="Cari bank..."
      emptyText="Bank tidak ditemukan"
    />
  )
}
